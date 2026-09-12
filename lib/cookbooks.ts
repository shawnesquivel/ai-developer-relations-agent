import "server-only";
import type { CodeBlock, Cookbook, PlanResult, RunRecord, RunStatus } from "./graph-types";
import { extractCodeBlocks } from "./markdown";
import { isLive, mockStore, runCypher, upsertNodes, upsertRelationships } from "./neo4j";
import { CONCEPTS, SEED_COOKBOOKS, SEED_LINKS, TOOLKITS, TOOLS } from "./seed";

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- Seeding ----------------------------------------------------------------------------------

let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  const existing = isLive()
    ? ((await runCypher(`MATCH (c:Concept) RETURN count(c) AS n`)).records[0]?.n as number) ?? 0
    : mockStore.byLabel("Concept").length;
  if (existing > 0) {
    seeded = true;
    return;
  }
  await upsertNodes([...CONCEPTS, ...TOOLKITS, ...TOOLS]);
  await upsertRelationships(SEED_LINKS);
  for (const s of SEED_COOKBOOKS) {
    const cb = await createCookbook({ id: s.id, title: s.title, conceptId: s.conceptId, markdown: s.markdown, provider: "seed" });
    for (const [i, block] of cb.blocks.entries()) {
      const r = s.runs[i] ?? { status: "pass", stdout: "" };
      await recordRun(block.id, {
        status: r.status,
        exitCode: r.status === "pass" ? 0 : 1,
        stdout: r.stdout,
        sandboxId: "seed",
        mode: "mock",
      });
    }
    if (s.runs.every((r) => r.status === "pass")) await markVerified(cb.id);
  }
  seeded = true;
}

// ---- Planner: Neo4j picks the next cookbook -----------------------------------------------------

export const PLAN_CYPHER = `
MATCH (c:Concept)
WHERE coalesce(c.documented, false) = false
  AND NOT EXISTS { (:Cookbook)-[:TEACHES]->(c) }
OPTIONAL MATCH (c)-[:PREREQ_OF*1..3]->(blocked:Concept)
WITH c, collect(DISTINCT blocked.name) AS unlockedNames
RETURN c.id AS conceptId, c.name AS conceptName, size(unlockedNames) AS unlocks, unlockedNames
ORDER BY unlocks DESC, c.name
LIMIT 5`;

export async function planNext(): Promise<PlanResult | null> {
  await ensureSeeded();
  type Row = { conceptId: string; conceptName: string; unlocks: number; unlockedNames: string[] };
  let rows: Row[];
  if (isLive()) {
    rows = (await runCypher(PLAN_CYPHER)).records as unknown as Row[];
  } else {
    const taught = new Set(mockStore.links.filter((l) => l.type === "TEACHES").map((l) => l.target));
    rows = mockStore
      .byLabel("Concept")
      .filter((c) => !c.documented && !taught.has(c.id))
      .map((c) => {
        const seen = new Set<string>();
        let frontier = [c.id];
        for (let depth = 0; depth < 3 && frontier.length; depth++) {
          frontier = frontier.flatMap((id) => mockStore.outgoing(id, "PREREQ_OF").map((l) => l.target)).filter((t) => !seen.has(t) && seen.add(t));
        }
        const unlockedNames = [...seen].map((id) => mockStore.nodes.get(id)?.name ?? id);
        return { conceptId: c.id, conceptName: c.name, unlocks: unlockedNames.length, unlockedNames };
      })
      .sort((a, b) => b.unlocks - a.unlocks || a.conceptName.localeCompare(b.conceptName))
      .slice(0, 5);
  }
  const top = rows[0];
  if (!top) return null;
  return {
    conceptId: top.conceptId,
    conceptName: top.conceptName,
    unlocks: top.unlocks,
    unlockedNames: top.unlockedNames,
    candidates: rows.map((r) => ({ conceptId: r.conceptId, conceptName: r.conceptName, unlocks: r.unlocks })),
    mode: isLive() ? "live" : "mock",
  };
}

// ---- Cookbooks ---------------------------------------------------------------------------------

export async function createCookbook(input: {
  id?: string;
  title: string;
  conceptId: string;
  markdown: string;
  provider?: string;
}): Promise<Cookbook> {
  const id = input.id ?? uid("cb");
  const createdAt = new Date().toISOString();
  const blocks = extractCodeBlocks(input.markdown).map((b) => ({ ...b, id: `${id}-b${b.index}` }));

  await upsertNodes([
    { id, label: "Cookbook", props: { title: input.title, name: input.title, markdown: input.markdown, documented: false, createdAt, provider: input.provider ?? "llm" } },
    ...blocks.map((b) => ({ id: b.id, label: "CodeBlock", props: { name: `Block ${b.index + 1}`, index: b.index, lang: b.lang, code: b.code } })),
  ]);
  await upsertRelationships([
    { from: id, to: input.conceptId, type: "COVERS" },
    ...blocks.map((b) => ({ from: id, to: b.id, type: "CONTAINS" })),
  ]);
  return (await getCookbook(id))!;
}

export async function recordRun(
  blockId: string,
  run: { status: RunStatus; exitCode: number; stdout: string; sandboxId: string; mode: "live" | "mock" },
): Promise<RunRecord> {
  const rec: RunRecord = { id: uid("run"), at: new Date().toISOString(), ...run };
  await upsertNodes([{ id: rec.id, label: "Run", props: { name: `${rec.status} ${rec.at.slice(11, 19)}`, ...rec } }]);
  await upsertRelationships([{ from: blockId, to: rec.id, type: "VERIFIED_BY" }]);
  return rec;
}

/** Cookbook passes when every block's latest run is a pass. Flips documented flags and adds TEACHES. */
export async function markVerified(cookbookId: string): Promise<Cookbook | null> {
  const cb = await getCookbook(cookbookId);
  if (!cb) return null;
  const allPass = cb.blocks.length > 0 && cb.blocks.every((b) => b.latestRun?.status === "pass");
  if (!allPass) return cb;
  await upsertNodes([
    { id: cb.id, label: "Cookbook", props: { documented: true, verifiedAt: new Date().toISOString() } },
    { id: cb.conceptId, label: "Concept", props: { documented: true } },
  ]);
  await upsertRelationships([{ from: cb.id, to: cb.conceptId, type: "TEACHES" }]);
  return getCookbook(cookbookId);
}

export async function getCookbook(id: string): Promise<Cookbook | null> {
  await ensureSeeded();
  if (!isLive()) return mockCookbook(id);
  const { records } = await runCypher(
    `MATCH (cb:Cookbook {id: $id})-[:COVERS]->(c:Concept)
     OPTIONAL MATCH (cb)-[:CONTAINS]->(b:CodeBlock)
     OPTIONAL MATCH (b)-[:VERIFIED_BY]->(r:Run)
     WITH cb, c, b, r ORDER BY r.at DESC
     WITH cb, c, b, head(collect(r)) AS latest
     RETURN cb, c, collect({ b: b, r: latest }) AS blocks`,
    { id },
  );
  const row = records[0];
  if (!row) return null;
  return rowToCookbook(row as { cb: Record<string, unknown>; c: Record<string, unknown>; blocks: { b: Record<string, unknown> | null; r: Record<string, unknown> | null }[] });
}

export async function listCookbooks(): Promise<Cookbook[]> {
  await ensureSeeded();
  if (!isLive()) {
    return mockStore
      .byLabel("Cookbook")
      .map((n) => mockCookbook(n.id)!)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const { records } = await runCypher(`MATCH (cb:Cookbook) RETURN cb.id AS id ORDER BY cb.createdAt`);
  const out: Cookbook[] = [];
  for (const r of records) {
    const cb = await getCookbook(r.id as string);
    if (cb) out.push(cb);
  }
  return out;
}

/** Self-verifying docs payoff: which published cookbooks are broken right now. */
export async function brokenCookbooks(): Promise<{ id: string; title: string; blockIndex: number; stdout: string }[]> {
  const all = await listCookbooks();
  return all.flatMap((cb) =>
    cb.blocks
      .filter((b) => b.latestRun?.status === "fail")
      .map((b) => ({ id: cb.id, title: cb.title, blockIndex: b.index, stdout: b.latestRun!.stdout })),
  );
}

// ---- helpers ------------------------------------------------------------------------------------

function rowToCookbook(row: {
  cb: Record<string, unknown>;
  c: Record<string, unknown>;
  blocks: { b: Record<string, unknown> | null; r: Record<string, unknown> | null }[];
}): Cookbook {
  const blocks: CodeBlock[] = row.blocks
    .filter((x) => x.b)
    .map((x) => ({
      id: x.b!.id as string,
      index: x.b!.index as number,
      lang: x.b!.lang as string,
      code: x.b!.code as string,
      latestRun: x.r ? (x.r as unknown as RunRecord) : null,
    }))
    .sort((a, b) => a.index - b.index);
  return {
    id: row.cb.id as string,
    title: row.cb.title as string,
    conceptId: row.c.id as string,
    conceptName: row.c.name as string,
    markdown: row.cb.markdown as string,
    documented: Boolean(row.cb.documented),
    createdAt: row.cb.createdAt as string,
    provider: row.cb.provider as string | undefined,
    blocks,
  };
}

function mockCookbook(id: string): Cookbook | null {
  const cb = mockStore.nodes.get(id);
  if (!cb || cb.label !== "Cookbook") return null;
  const conceptId = mockStore.outgoing(id, "COVERS")[0]?.target ?? "";
  const concept = mockStore.nodes.get(conceptId);
  const blocks: CodeBlock[] = mockStore
    .outgoing(id, "CONTAINS")
    .map((l) => mockStore.nodes.get(l.target)!)
    .filter(Boolean)
    .map((b) => {
      const runs = mockStore
        .outgoing(b.id, "VERIFIED_BY")
        .map((l) => mockStore.nodes.get(l.target) as unknown as RunRecord)
        .sort((a, c) => c.at.localeCompare(a.at));
      return { id: b.id, index: b.index as number, lang: b.lang as string, code: b.code as string, latestRun: runs[0] ?? null };
    })
    .sort((a, b) => a.index - b.index);
  return {
    id,
    title: cb.title as string,
    conceptId,
    conceptName: concept?.name ?? conceptId,
    markdown: cb.markdown as string,
    documented: Boolean(cb.documented),
    createdAt: cb.createdAt as string,
    provider: cb.provider as string | undefined,
    blocks,
  };
}
