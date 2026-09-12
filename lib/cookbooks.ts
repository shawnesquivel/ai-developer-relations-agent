import { randomUUID } from "crypto";
import { env, llmProvider, neo4jLive } from "./env";
import type { BrokenCookbook, Cookbook, CodeBlock, PlanResult, RunRecord } from "./graph-types";
import { extractCodeBlocks, extractTitle } from "./markdown";
import { getMockGraph, runCypher, toNumber, upsertNodes, upsertRelationships } from "./neo4j";
import {
  CONCEPTS,
  DOCUMENTED_PREREQ_IDS,
  LEGACY_CONCEPT_IDS,
  SEED_COOKBOOKS,
  SEED_LINKS,
  SIMPLE_CONCEPT_IDS,
} from "./sdk-concepts";
import { TOOLKITS, TOOLS } from "./seed";

export const PLAN_CYPHER = `MATCH (c:Concept)
WHERE c.id IN $conceptIds
  AND coalesce(c.documented, false) = false
  AND NOT EXISTS { (:Cookbook)-[:TEACHES]->(c) }
  AND NOT EXISTS {
    (pre:Concept)-[:PREREQ_OF]->(c)
    WHERE coalesce(pre.documented, false) = false
  }
OPTIONAL MATCH (c)-[:PREREQ_OF*1..3]->(blocked:Concept)
WITH c, collect(DISTINCT blocked.name) AS unlockedNames
RETURN DISTINCT c.id AS conceptId,
       c.name AS conceptName,
       size(unlockedNames) AS unlocks,
       unlockedNames
ORDER BY unlocks DESC, c.name
LIMIT 15`;

const CORE_CONCEPT_IDS = uniqueIds(CONCEPTS.map((c) => c.id));
const SEED_COOKBOOK_IDS = SEED_COOKBOOKS.map((cb) => cb.id);

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function simpleRank(conceptId: string): number {
  const i = (SIMPLE_CONCEPT_IDS as readonly string[]).indexOf(conceptId);
  return i === -1 ? 50 : i;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function coverIds(cb: (typeof SEED_COOKBOOKS)[number]): string[] {
  return uniqueBy([cb.conceptId, ...(cb.covers ?? [])], (id) => id);
}

type GlobalSeed = typeof globalThis & { __cookbookSeedGen?: string };

const SEED_GEN = [
  CONCEPTS.map((c) => `${c.id}:${c.documented}`).join(","),
  SEED_COOKBOOKS.map((cb) => `${cb.id}:${cb.title}:${cb.documented}:${cb.blocks.map((b) => b.code.length).join("-")}`).join(","),
].join("|");

function seededFlag(): GlobalSeed {
  return globalThis as GlobalSeed;
}

export async function ensureSeeded(): Promise<void> {
  if (!neo4jLive()) {
    seedIntoMock();
    retireLegacyMock();
    stripStaleSeedCoversMock();
    dedupeMockCookbooks();
    return;
  }
  if (seededFlag().__cookbookSeedGen === SEED_GEN) return;
  await seedIntoNeo4j();
  await stripStaleSeedCovers();
  await dedupeNeo4jCookbooks();
  await retireLegacyNeo4j();
  seededFlag().__cookbookSeedGen = SEED_GEN;
}

function seedIntoMock() {
  const g = getMockGraph();
  g.upsertNodes(CONCEPTS.map((c) => ({ id: c.id, label: "Concept", props: { name: c.name, documented: c.documented } })));
  g.upsertNodes(TOOLKITS.map((t) => ({ id: t.id, label: "Toolkit", props: { name: t.name, slug: t.slug } })));
  g.upsertNodes(TOOLS.map((t) => ({ id: t.id, label: "Tool", props: { name: t.name, description: t.description } })));
  for (const cb of SEED_COOKBOOKS) {
    g.upsertNodes([
      {
        id: cb.id,
        label: "Cookbook",
        props: {
          name: cb.name,
          title: cb.title,
          markdown: cb.markdown,
          documented: cb.documented,
          createdAt: cb.createdAt,
          provider: cb.provider,
          verifiedAt: cb.verifiedAt ?? null,
        },
      },
    ]);
    for (const block of cb.blocks) {
      g.upsertNodes([{ id: block.id, label: "CodeBlock", props: { name: block.id, index: block.index, lang: block.lang, code: block.code } }]);
    }
    for (const run of cb.runs) {
      g.upsertNodes([
        {
          id: run.id,
          label: "Run",
          props: {
            name: run.id,
            status: run.status,
            exitCode: run.exitCode,
            stdout: run.stdout,
            sandboxId: run.sandboxId,
            at: run.at,
            mode: run.mode,
          },
        },
      ]);
    }
  }
  g.upsertRelationships(SEED_LINKS);
  for (const cb of SEED_COOKBOOKS) {
    for (const conceptId of coverIds(cb)) {
      g.upsertRelationships([{ from: cb.id, to: conceptId, type: "COVERS" }]);
      if (cb.documented) g.upsertRelationships([{ from: cb.id, to: conceptId, type: "TEACHES" }]);
    }
    for (const block of cb.blocks) {
      g.upsertRelationships([{ from: cb.id, to: block.id, type: "CONTAINS" }]);
    }
    for (const block of cb.blocks) {
      for (const rel of g.outgoing(block.id, "VERIFIED_BY")) {
        g.nodes.delete(rel.to);
      }
      g.deleteRelationships(block.id, "VERIFIED_BY");
    }
    for (const run of cb.runs) {
      g.upsertRelationships([{ from: run.blockId, to: run.id, type: "VERIFIED_BY" }]);
    }
  }
}

async function existingCookbookId(cb: (typeof SEED_COOKBOOKS)[number]): Promise<string | null> {
  const byId = await runCypher<{ id: string }>(
    `MATCH (cb:Cookbook {id: $id}) RETURN cb.id AS id LIMIT 1`,
    { id: cb.id },
  );
  if (byId[0]?.id) return byId[0].id;
  const byTitleConcept = await runCypher<{ id: string }>(
    `MATCH (cb:Cookbook {title: $title})-[:COVERS]->(c:Concept {id: $conceptId})
     RETURN cb.id AS id
     ORDER BY cb.createdAt
     LIMIT 1`,
    { title: cb.title, conceptId: cb.conceptId },
  );
  return byTitleConcept[0]?.id ?? null;
}

async function persistSeedCookbook(cb: (typeof SEED_COOKBOOKS)[number], withBlocks: boolean) {
  const existing = await existingCookbookId(cb);
  const id = existing ?? cb.id;
  await upsertNodes([
    {
      id,
      label: "Cookbook",
      props: {
        name: cb.name,
        title: cb.title,
        markdown: cb.markdown,
        documented: cb.documented,
        createdAt: cb.createdAt,
        provider: cb.provider,
        verifiedAt: cb.verifiedAt ?? null,
      },
    },
  ]);
  for (const conceptId of coverIds(cb)) {
    await upsertRelationships([{ from: id, to: conceptId, type: "COVERS" }]);
    if (cb.documented) await upsertRelationships([{ from: id, to: conceptId, type: "TEACHES" }]);
  }
  if (!withBlocks) return;
  for (const block of cb.blocks) {
    await upsertNodes([
      { id: block.id, label: "CodeBlock", props: { name: block.id, index: block.index, lang: block.lang, code: block.code } },
    ]);
    await upsertRelationships([{ from: id, to: block.id, type: "CONTAINS" }]);
    if (neo4jLive()) {
      await runCypher(
        `MATCH (b:CodeBlock {id: $id})-[:VERIFIED_BY]->(r:Run)
         DETACH DELETE r`,
        { id: block.id },
      );
    }
  }
  for (const run of cb.runs) {
    await upsertNodes([
      {
        id: run.id,
        label: "Run",
        props: {
          name: run.id,
          status: run.status,
          exitCode: run.exitCode,
          stdout: run.stdout,
          sandboxId: run.sandboxId,
          at: run.at,
          mode: run.mode,
        },
      },
    ]);
    await upsertRelationships([{ from: run.blockId, to: run.id, type: "VERIFIED_BY" }]);
  }
}

async function seedIntoNeo4j() {
  await upsertNodes(CONCEPTS.map((c) => ({ id: c.id, label: "Concept", props: { name: c.name, documented: c.documented } })));
  await upsertNodes(TOOLKITS.map((t) => ({ id: t.id, label: "Toolkit", props: { name: t.name, slug: t.slug } })));
  await upsertNodes(TOOLS.map((t) => ({ id: t.id, label: "Tool", props: { name: t.name, description: t.description } })));
  await upsertRelationships(SEED_LINKS);
  for (const cb of SEED_COOKBOOKS) {
    await persistSeedCookbook(cb, true);
  }
}

function keepSeedCookbook<T extends { id: string; createdAt?: string }>(books: T[]): T {
  return [...books].sort((a, b) => {
    const as = SEED_COOKBOOK_IDS.includes(a.id) ? 0 : 1;
    const bs = SEED_COOKBOOK_IDS.includes(b.id) ? 0 : 1;
    if (as !== bs) return as - bs;
    return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
  })[0];
}

function stripStaleSeedCoversMock() {
  const g = getMockGraph();
  const seedIds = new Set(SEED_COOKBOOK_IDS);
  for (const book of g.nodesByLabel("Cookbook")) {
    if (book.props.provider === "seed" && !seedIds.has(book.id)) {
      g.nodes.delete(book.id);
      g.rels = g.rels.filter((r) => r.from !== book.id && r.to !== book.id);
    }
  }
  for (const cb of SEED_COOKBOOKS) {
    const keep = new Set(coverIds(cb));
    g.rels = g.rels.filter((r) => {
      if (r.from !== cb.id || (r.type !== "COVERS" && r.type !== "TEACHES")) return true;
      return keep.has(r.to);
    });
  }
}

function dedupeMockCookbooks() {
  const g = getMockGraph();
  const byTitle = new Map<string, { id: string; createdAt: string }[]>();
  for (const book of g.nodesByLabel("Cookbook")) {
    const title = String(book.props.title ?? book.id);
    const list = byTitle.get(title) ?? [];
    list.push({ id: book.id, createdAt: String(book.props.createdAt ?? "") });
    byTitle.set(title, list);
  }
  for (const books of byTitle.values()) {
    if (books.length < 2) continue;
    const keep = keepSeedCookbook(books);
    for (const extra of books.filter((b) => b.id !== keep.id)) {
      g.nodes.delete(extra.id);
      g.rels = g.rels.filter((r) => r.from !== extra.id && r.to !== extra.id);
    }
  }
}

async function stripStaleSeedCovers() {
  for (const cb of SEED_COOKBOOKS) {
    await runCypher(
      `MATCH (cb:Cookbook {id: $id})-[r:COVERS|TEACHES]->(c:Concept)
       WHERE NOT c.id IN $keepIds
       DELETE r`,
      { id: cb.id, keepIds: coverIds(cb) },
    );
  }
  await runCypher(
    `MATCH (cb:Cookbook)
     WHERE cb.provider = 'seed' AND NOT cb.id IN $seedIds
     DETACH DELETE cb`,
    { seedIds: SEED_COOKBOOK_IDS },
  );
}

async function dedupeNeo4jCookbooks() {
  await runCypher(
    `MATCH (cb:Cookbook)
     WHERE cb.id IS NOT NULL
     WITH cb.id AS cid, collect(cb) AS nodes
     WHERE size(nodes) > 1
     UNWIND nodes AS n
     WITH cid, n
     ORDER BY n.createdAt ASC, elementId(n) ASC
     WITH cid, collect(n) AS ordered
     WITH ordered[0] AS keep, tail(ordered) AS extras
     UNWIND extras AS extra
     OPTIONAL MATCH (extra)-[:CONTAINS]->(b:CodeBlock)
     OPTIONAL MATCH (b)-[:VERIFIED_BY]->(r:Run)
     DETACH DELETE extra, b, r`,
  );
  await runCypher(
    `MATCH (cb:Cookbook)
     WITH coalesce(cb.title, cb.id) AS title, collect(cb) AS nodes
     WHERE size(nodes) > 1 AND title <> ''
     UNWIND nodes AS n
     WITH title, n
     ORDER BY CASE WHEN n.id IN $seedIds THEN 0 ELSE 1 END, n.createdAt ASC, elementId(n) ASC
     WITH title, collect(n) AS ordered
     WITH ordered[0] AS keep, tail(ordered) AS extras
     UNWIND extras AS extra
     OPTIONAL MATCH (extra)-[:CONTAINS]->(b:CodeBlock)
     OPTIONAL MATCH (b)-[:VERIFIED_BY]->(r:Run)
     DETACH DELETE extra, b, r`,
    { seedIds: SEED_COOKBOOK_IDS },
  );
}

function retireLegacyMock() {
  const g = getMockGraph();
  const currentIds = new Set(CONCEPTS.map((c) => c.id));
  const undocumentedIds = new Set(CONCEPTS.filter((c) => !c.documented).map((c) => c.id));
  for (const node of g.nodesByLabel("Concept")) {
    if (!currentIds.has(node.id)) node.props.documented = true;
  }
  g.rels = g.rels.filter((rel) => !(rel.type === "TEACHES" && undocumentedIds.has(rel.to)));
  for (const id of LEGACY_CONCEPT_IDS) {
    for (const rel of g.incoming(id, "COVERS")) {
      const keep = g.outgoing(rel.from, "COVERS").some((r) => currentIds.has(r.to) && r.to !== id);
      if (!keep) {
        g.nodes.delete(rel.from);
        g.rels = g.rels.filter((r) => r.from !== rel.from && r.to !== rel.from);
      }
    }
    g.rels = g.rels.filter((rel) => !(rel.to === id && (rel.type === "COVERS" || rel.type === "TEACHES")));
    g.nodes.delete(id);
    g.rels = g.rels.filter((rel) => rel.from !== id && rel.to !== id);
  }
}

async function retireLegacyNeo4j() {
  const currentIds = CONCEPTS.map((c) => c.id);
  const undocumentedIds = CONCEPTS.filter((c) => !c.documented).map((c) => c.id);
  const legacyIds = [...LEGACY_CONCEPT_IDS];

  await runCypher(
    `MATCH (c:Concept)
     WHERE NOT c.id IN $currentIds
     SET c.documented = true`,
    { currentIds },
  );
  await runCypher(
    `MATCH (cb:Cookbook)-[r:COVERS|TEACHES]->(c:Concept)
     WHERE c.id IN $legacyIds
     DELETE r`,
    { legacyIds },
  );
  await runCypher(
    `MATCH (cb:Cookbook)-[:COVERS]->(c:Concept)
     WHERE c.id IN $legacyIds
       AND NOT cb.id IN $seedIds
       AND NOT EXISTS { (cb)-[:COVERS]->(keep:Concept) WHERE keep.id IN $currentIds }
     DETACH DELETE cb`,
    { legacyIds, currentIds, seedIds: SEED_COOKBOOK_IDS },
  );
  await runCypher(
    `MATCH (c:Concept)
     WHERE c.id IN $legacyIds
     DETACH DELETE c`,
    { legacyIds },
  );
  if (undocumentedIds.length) {
    await runCypher(
      `MATCH (c:Concept)
       WHERE c.id IN $undocumentedIds
       OPTIONAL MATCH (:Cookbook)-[t:TEACHES]->(c)
       DELETE t
       SET c.documented = false`,
      { undocumentedIds },
    );
  }
}

function walkUnlocks(conceptId: string): string[] {
  const g = getMockGraph();
  const names = new Set<string>();
  const queue: { id: string; depth: number }[] = [{ id: conceptId, depth: 0 }];
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur.id) || cur.depth >= 3) continue;
    seen.add(cur.id);
    for (const rel of g.outgoing(cur.id, "PREREQ_OF")) {
      const node = g.nodes.get(rel.to);
      if (!node?.labels.includes("Concept")) continue;
      names.add(String(node.props.name));
      queue.push({ id: rel.to, depth: cur.depth + 1 });
    }
  }
  return [...names];
}

export async function planNext(): Promise<PlanResult | null> {
  await ensureSeeded();
  if (neo4jLive()) {
    const rows = await runCypher<{
      conceptId: string;
      conceptName: string;
      unlocks: unknown;
      unlockedNames: string[];
    }>(PLAN_CYPHER, { conceptIds: CORE_CONCEPT_IDS });
    if (!rows.length) return null;
    const candidates = uniqueBy(
      rows.map((r) => ({
        conceptId: r.conceptId,
        conceptName: r.conceptName,
        unlocks: toNumber(r.unlocks),
      })),
      (c) => c.conceptId,
    )
      .sort((a, b) => simpleRank(a.conceptId) - simpleRank(b.conceptId) || a.unlocks - b.unlocks)
      .slice(0, 5);
    const top = candidates[0];
    const full = rows.find((r) => r.conceptId === top.conceptId) ?? rows[0];
    return {
      conceptId: top.conceptId,
      conceptName: top.conceptName,
      unlocks: top.unlocks,
      unlockedNames: (full.unlockedNames ?? []).filter(Boolean),
      candidates,
      mode: "live",
      cypher: PLAN_CYPHER,
    };
  }

  const g = getMockGraph();
  const taught = new Set(g.rels.filter((r) => r.type === "TEACHES").map((r) => r.to));
  const candidates = g
    .nodesByLabel("Concept")
    .filter((c) => CORE_CONCEPT_IDS.includes(c.id) && c.props.documented !== true && !taught.has(c.id))
    .filter((c) => {
      const prereqs = g.rels.filter((r) => r.type === "PREREQ_OF" && r.to === c.id);
      return !prereqs.some((r) => {
        const pre = g.nodes.get(r.from);
        return pre?.labels.includes("Concept") && pre.props.documented !== true;
      });
    })
    .map((c) => {
      const unlockedNames = walkUnlocks(c.id);
      return {
        conceptId: c.id,
        conceptName: String(c.props.name),
        unlocks: unlockedNames.length,
        unlockedNames,
      };
    })
    .sort((a, b) => simpleRank(a.conceptId) - simpleRank(b.conceptId) || a.unlocks - b.unlocks || a.conceptName.localeCompare(b.conceptName));
  const unique = uniqueBy(candidates, (c) => c.conceptId).slice(0, 5);

  if (!unique.length) return null;
  const top = unique[0];
  return {
    conceptId: top.conceptId,
    conceptName: top.conceptName,
    unlocks: top.unlocks,
    unlockedNames: top.unlockedNames,
    candidates: unique.map(({ conceptId, conceptName, unlocks }) => ({ conceptId, conceptName, unlocks })),
    mode: "mock",
    cypher: PLAN_CYPHER,
  };
}

export async function toolsForConcept(conceptId: string): Promise<string[]> {
  await ensureSeeded();
  if (neo4jLive()) {
    const rows = await runCypher<{ name: string }>(
      `MATCH (t:Tool)-[:DEMONSTRATES]->(c:Concept {id: $id}) RETURN t.name AS name`,
      { id: conceptId },
    );
    const names = rows.map((r) => r.name).filter(Boolean);
    return names.length ? names : TOOLS.map((t) => t.name);
  }
  const g = getMockGraph();
  const names = g
    .incoming(conceptId, "DEMONSTRATES")
    .map((r) => g.nodes.get(r.from))
    .filter((n) => n?.labels.includes("Tool"))
    .map((n) => String(n!.props.name));
  return names.length ? names : TOOLS.map((t) => t.name);
}

function latestRunFor(blockId: string): RunRecord | null {
  const g = getMockGraph();
  const runs = g
    .outgoing(blockId, "VERIFIED_BY")
    .map((r) => g.nodes.get(r.to))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .map((n) => ({
      id: n.id,
      status: n.props.status as RunRecord["status"],
      exitCode: Number(n.props.exitCode ?? 0),
      stdout: String(n.props.stdout ?? ""),
      sandboxId: String(n.props.sandboxId ?? ""),
      at: String(n.props.at ?? ""),
      mode: (n.props.mode as RunRecord["mode"]) ?? "mock",
    }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return runs[0] ?? null;
}

function cookbookStatus(blocks: CodeBlock[]): { documented: boolean; broken: boolean } {
  if (!blocks.length) return { documented: false, broken: false };
  const latest = blocks.map((b) => b.latestRun);
  const broken = latest.some((r) => r?.status === "fail");
  const documented = latest.every((r) => r?.status === "pass");
  return { documented, broken };
}

function shapeFromMock(id: string): Cookbook | null {
  const g = getMockGraph();
  const node = g.nodes.get(id);
  if (!node?.labels.includes("Cookbook")) return null;
  const covers = g.outgoing(id, "COVERS")[0];
  const concept = covers ? g.nodes.get(covers.to) : undefined;
  const blocks = g
    .outgoing(id, "CONTAINS")
    .map((r) => g.nodes.get(r.to))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .map((n) => ({
      id: n.id,
      index: Number(n.props.index ?? 0),
      lang: String(n.props.lang ?? "typescript"),
      code: String(n.props.code ?? ""),
      latestRun: latestRunFor(n.id),
    }))
    .sort((a, b) => a.index - b.index);
  const { documented } = cookbookStatus(blocks);
  return {
    id,
    title: String(node.props.title ?? node.props.name ?? id),
    conceptId: concept?.id ?? "",
    conceptName: String(concept?.props.name ?? ""),
    markdown: String(node.props.markdown ?? ""),
    documented,
    createdAt: String(node.props.createdAt ?? ""),
    provider: String(node.props.provider ?? "seed"),
    verifiedAt: node.props.verifiedAt ? String(node.props.verifiedAt) : undefined,
    blocks,
  };
}

async function shapeFromNeo4j(id: string): Promise<Cookbook | null> {
  const rows = await runCypher<{
    id: string;
    title: string;
    markdown: string;
    documented: boolean;
    createdAt: string;
    provider: string;
    verifiedAt: string | null;
    conceptId: string;
    conceptName: string;
    blockId: string;
    blockIndex: unknown;
    lang: string;
    code: string;
    runId: string | null;
    status: string | null;
    exitCode: unknown;
    stdout: string | null;
    sandboxId: string | null;
    at: string | null;
    mode: string | null;
  }>(
    `MATCH (cb:Cookbook {id: $id})
     OPTIONAL MATCH (cb)-[:COVERS]->(c:Concept)
     OPTIONAL MATCH (cb)-[:CONTAINS]->(b:CodeBlock)
     OPTIONAL MATCH (b)-[:VERIFIED_BY]->(r:Run)
     WITH cb, c, b, r
     ORDER BY r.at DESC
     WITH cb, c, b, collect(r)[0] AS latest
     RETURN cb.id AS id, cb.title AS title, cb.markdown AS markdown, cb.documented AS documented,
            cb.createdAt AS createdAt, cb.provider AS provider, cb.verifiedAt AS verifiedAt,
            c.id AS conceptId, c.name AS conceptName,
            b.id AS blockId, b.index AS blockIndex, b.lang AS lang, b.code AS code,
            latest.id AS runId, latest.status AS status, latest.exitCode AS exitCode,
            latest.stdout AS stdout, latest.sandboxId AS sandboxId, latest.at AS at, latest.mode AS mode`,
    { id },
  );
  if (!rows.length) return null;
  const head = rows[0];
  const blocks: CodeBlock[] = rows
    .filter((r) => r.blockId)
    .map((r) => ({
      id: r.blockId,
      index: toNumber(r.blockIndex),
      lang: r.lang ?? "typescript",
      code: r.code ?? "",
      latestRun: r.runId
        ? {
            id: r.runId,
            status: (r.status === "fail" ? "fail" : "pass") as RunRecord["status"],
            exitCode: toNumber(r.exitCode),
            stdout: r.stdout ?? "",
            sandboxId: r.sandboxId ?? "",
            at: r.at ?? "",
            mode: (r.mode === "live" ? "live" : "mock") as RunRecord["mode"],
            }
        : null,
    }))
    .filter((block, index, all) => all.findIndex((item) => item.id === block.id) === index)
    .sort((a, b) => a.index - b.index);
  const { documented } = cookbookStatus(blocks);
  return {
    id: head.id,
    title: head.title,
    conceptId: head.conceptId ?? "",
    conceptName: head.conceptName ?? "",
    markdown: head.markdown,
    documented,
    createdAt: head.createdAt,
    provider: head.provider,
    verifiedAt: head.verifiedAt ?? undefined,
    blocks,
  };
}

export async function getCookbook(id: string): Promise<Cookbook | null> {
  await ensureSeeded();
  return neo4jLive() ? shapeFromNeo4j(id) : shapeFromMock(id);
}

function uniqueCookbooks(books: Cookbook[]): Cookbook[] {
  return uniqueBy(uniqueBy(books, (b) => b.id), (b) => b.title);
}

export async function listCookbooks(): Promise<Cookbook[]> {
  await ensureSeeded();
  if (neo4jLive()) {
    const rows = uniqueBy(
      await runCypher<{ id: string }>("MATCH (cb:Cookbook) RETURN DISTINCT cb.id AS id, min(cb.createdAt) AS createdAt ORDER BY createdAt"),
      (r) => r.id,
    );
    const books = await Promise.all(rows.map((r) => getCookbook(r.id)));
    return uniqueCookbooks(books.filter((b): b is Cookbook => Boolean(b)));
  }
  return uniqueCookbooks(
    getMockGraph()
      .nodesByLabel("Cookbook")
      .map((n) => shapeFromMock(n.id))
      .filter((b): b is Cookbook => Boolean(b))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  );
}

export async function brokenCookbooks(): Promise<BrokenCookbook[]> {
  const books = await listCookbooks();
  const broken: BrokenCookbook[] = [];
  for (const book of books) {
    for (const block of book.blocks) {
      if (block.latestRun?.status === "fail") {
        broken.push({
          id: book.id,
          title: book.title,
          blockIndex: block.index,
          stdout: block.latestRun.stdout,
        });
      }
    }
  }
  return uniqueBy(broken, (b) => `${b.id}:${b.blockIndex}`);
}

export async function createCookbook(input: {
  conceptId: string;
  conceptName: string;
  markdown: string;
  provider: string;
}): Promise<Cookbook> {
  await ensureSeeded();
  let markdown = input.markdown;
  let blocks = extractCodeBlocks(markdown);
  if (!blocks.length) {
    const { mockCookbook } = await import("./generate");
    const { resolveGithubToolSlugs } = await import("./composio");
    markdown = mockCookbook(
      input.conceptName,
      await resolveGithubToolSlugs(await toolsForConcept(input.conceptId)),
    );
    blocks = extractCodeBlocks(markdown);
  }
  const title = extractTitle(markdown, input.conceptName);
  const id = `cb-${input.conceptId}-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  await upsertNodes([
    {
      id,
      label: "Cookbook",
      props: {
        name: id,
        title,
        markdown,
        documented: false,
        createdAt,
        provider: input.provider,
      },
    },
  ]);
  const blockIds: string[] = [];
  for (const block of blocks) {
    const blockId = `${id}-b${block.index}`;
    blockIds.push(blockId);
    await upsertNodes([
      {
        id: blockId,
        label: "CodeBlock",
        props: { name: blockId, index: block.index, lang: block.lang, code: block.code },
      },
    ]);
  }
  await upsertRelationships([
    { from: id, to: input.conceptId, type: "COVERS" },
    ...blockIds.map((blockId) => ({ from: id, to: blockId, type: "CONTAINS" })),
  ]);
  const created = await getCookbook(id);
  if (!created) throw new Error("Failed to persist cookbook");
  return created;
}

export async function recordRun(blockId: string, run: Omit<RunRecord, "id"> & { id?: string }): Promise<RunRecord> {
  await ensureSeeded();
  const id = run.id ?? `run-${randomUUID()}`;
  const record: RunRecord = { ...run, id };
  await upsertNodes([
    {
      id,
      label: "Run",
      props: {
        name: id,
        status: record.status,
        exitCode: record.exitCode,
        stdout: record.stdout,
        sandboxId: record.sandboxId,
        at: record.at,
        mode: record.mode,
      },
    },
  ]);
  await upsertRelationships([{ from: blockId, to: id, type: "VERIFIED_BY" }]);
  return record;
}

export async function syncVerification(cookbookId: string): Promise<Cookbook> {
  const book = await getCookbook(cookbookId);
  if (!book) throw new Error("Cookbook not found");
  const { documented } = cookbookStatus(book.blocks);
  const verifiedAt = documented ? new Date().toISOString() : null;

  if (neo4jLive()) {
    await runCypher(
      `MATCH (cb:Cookbook {id: $id})
       OPTIONAL MATCH (cb)-[:COVERS]->(c:Concept)
       SET cb.documented = $documented, cb.verifiedAt = $verifiedAt
       WITH cb, c, $documented AS documented
       FOREACH (_ IN CASE WHEN documented AND c IS NOT NULL THEN [1] ELSE [] END |
         SET c.documented = true
         MERGE (cb)-[:TEACHES]->(c)
       )
       FOREACH (_ IN CASE WHEN NOT documented AND c IS NOT NULL THEN [1] ELSE [] END |
         SET cb.documented = false
       )
       WITH cb, c, documented
       OPTIONAL MATCH (cb)-[t:TEACHES]->(c)
       WHERE documented = false
       DELETE t`,
      { id: cookbookId, documented, verifiedAt },
    );
    if (!documented && book.conceptId) {
      const stillTaught = await runCypher<{ n: number }>(
        `MATCH (:Cookbook)-[:TEACHES]->(c:Concept {id: $id}) RETURN count(*) AS n`,
        { id: book.conceptId },
      );
      if (toNumber(stillTaught[0]?.n) === 0 && !DOCUMENTED_PREREQ_IDS.includes(book.conceptId)) {
        await runCypher(`MATCH (c:Concept {id: $id}) SET c.documented = false`, { id: book.conceptId });
      }
    }
  } else {
    const g = getMockGraph();
    const node = g.nodes.get(cookbookId);
    if (node) {
      node.props.documented = documented;
      node.props.verifiedAt = verifiedAt;
    }
    if (documented && book.conceptId) {
      g.upsertRelationships([{ from: cookbookId, to: book.conceptId, type: "TEACHES" }]);
      const concept = g.nodes.get(book.conceptId);
      if (concept) concept.props.documented = true;
    } else if (book.conceptId) {
      g.deleteRelationships(cookbookId, "TEACHES", book.conceptId);
      const stillTaught = g.incoming(book.conceptId, "TEACHES").length > 0;
      const concept = g.nodes.get(book.conceptId);
      if (concept && !stillTaught && !DOCUMENTED_PREREQ_IDS.includes(book.conceptId)) {
        concept.props.documented = false;
      }
    }
  }

  const updated = await getCookbook(cookbookId);
  if (!updated) throw new Error("Cookbook not found after verification sync");
  return updated;
}

export function getBlockCode(cookbook: Cookbook, blockId: string): CodeBlock | undefined {
  return cookbook.blocks.find((b) => b.id === blockId);
}

export function sandboxEnvVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  if (env.COMPOSIO_API_KEY) vars.COMPOSIO_API_KEY = env.COMPOSIO_API_KEY;
  if (env.GITHUB_PAT) vars.GITHUB_PAT = env.GITHUB_PAT;
  if (env.OPENAI_API_KEY) vars.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.OPENAI_MODEL) vars.OPENAI_MODEL = env.OPENAI_MODEL;
  if (llmProvider() === "nosana" && env.NOSANA_ENDPOINT) {
    vars.OPENAI_BASE_URL = env.NOSANA_ENDPOINT.replace(/\/$/, "").replace(/\/v1$/, "") + "/v1";
    vars.OPENAI_MODEL = env.NOSANA_MODEL;
  }
  if (env.COMPOSIO_USER_ID) vars.COMPOSIO_USER_ID = env.COMPOSIO_USER_ID;
  if (env.DAYTONA_API_KEY) vars.DAYTONA_API_KEY = env.DAYTONA_API_KEY;
  if (env.DAYTONA_TARGET) vars.DAYTONA_TARGET = env.DAYTONA_TARGET;
  return vars;
}
