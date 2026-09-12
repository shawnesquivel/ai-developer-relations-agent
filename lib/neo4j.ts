import neo4j, { type Driver, type Integer } from "neo4j-driver";
import { env, neo4jLive } from "./env";
import type { GraphLink, GraphNode } from "./graph-types";

type NodeRecord = {
  id: string;
  labels: string[];
  props: Record<string, unknown>;
};

type RelRecord = {
  from: string;
  to: string;
  type: string;
  props: Record<string, unknown>;
};

export class MockGraph {
  nodes = new Map<string, NodeRecord>();
  rels: RelRecord[] = [];

  upsertNodes(nodes: { id: string; label: string; props?: Record<string, unknown> }[]) {
    for (const node of nodes) {
      const existing = this.nodes.get(node.id);
      const labels = new Set(existing?.labels ?? []);
      labels.add(node.label);
      this.nodes.set(node.id, {
        id: node.id,
        labels: [...labels],
        props: { ...(existing?.props ?? {}), ...(node.props ?? {}), id: node.id },
      });
    }
  }

  upsertRelationships(rels: { from: string; to: string; type: string; props?: Record<string, unknown> }[]) {
    for (const rel of rels) {
      const exists = this.rels.some((r) => r.from === rel.from && r.to === rel.to && r.type === rel.type);
      if (exists) continue;
      this.rels.push({ from: rel.from, to: rel.to, type: rel.type, props: rel.props ?? {} });
    }
  }

  deleteRelationships(from: string, type: string, to?: string) {
    this.rels = this.rels.filter((r) => !(r.from === from && r.type === type && (to ? r.to === to : true)));
  }

  nodesByLabel(label: string): NodeRecord[] {
    return [...this.nodes.values()].filter((n) => n.labels.includes(label));
  }

  outgoing(id: string, type: string): RelRecord[] {
    return this.rels.filter((r) => r.from === id && r.type === type);
  }

  incoming(id: string, type: string): RelRecord[] {
    return this.rels.filter((r) => r.to === id && r.type === type);
  }

  subgraph(label?: string, limit = 200): { nodes: GraphNode[]; links: GraphLink[] } {
    let nodes = [...this.nodes.values()];
    if (label) nodes = nodes.filter((n) => n.labels.includes(label));
    const ids = new Set(nodes.slice(0, limit).map((n) => n.id));
    const sliced = nodes.slice(0, limit);
    const links = this.rels
      .filter((r) => ids.has(r.from) && ids.has(r.to))
      .map((r) => ({ source: r.from, target: r.to, type: r.type }));
    return {
      nodes: sliced.map((n) => ({
        id: n.id,
        label: n.labels[0] ?? "Node",
        name: String(n.props.title ?? n.props.name ?? n.id),
        documented: typeof n.props.documented === "boolean" ? n.props.documented : undefined,
        status: n.props.status === "pass" || n.props.status === "fail" ? n.props.status : undefined,
      })),
      links,
    };
  }
}

type GlobalGraph = typeof globalThis & { __cookbookGraph?: MockGraph; __neo4jDriver?: Driver };

function globals(): GlobalGraph {
  return globalThis as GlobalGraph;
}

export function getMockGraph(): MockGraph {
  const g = globals();
  if (!g.__cookbookGraph) g.__cookbookGraph = new MockGraph();
  return g.__cookbookGraph;
}

export function getDriver(): Driver | null {
  if (!neo4jLive()) return null;
  const g = globals();
  if (!g.__neo4jDriver) {
    g.__neo4jDriver = neo4j.driver(env.NEO4J_URI!, neo4j.auth.basic(env.NEO4J_USERNAME, env.NEO4J_PASSWORD!), {
      connectionTimeout: 8_000,
      connectionAcquisitionTimeout: 10_000,
      maxConnectionPoolSize: 15,
    });
  }
  return g.__neo4jDriver;
}

export function toNumber(value: unknown): number {
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as Integer).toNumber();
  }
  return Number(value ?? 0);
}

function safeLabel(label: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
    throw new Error(`Invalid label: ${label}`);
  }
  return label;
}

function safeType(type: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(type)) {
    throw new Error(`Invalid relationship type: ${type}`);
  }
  return type;
}

export async function runCypher<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<T[]> {
  const driver = getDriver();
  if (!driver) {
    throw new Error("Neo4j is not configured");
  }
  const session = driver.session({ database: env.NEO4J_DATABASE });
  try {
    const result = await session.run(cypher, params, { timeout: 20_000 });
    return result.records.map((record) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

export async function upsertNodes(nodes: { id: string; label: string; props?: Record<string, unknown> }[]) {
  if (!nodes.length) return;
  if (!neo4jLive()) {
    getMockGraph().upsertNodes(nodes);
    return;
  }
  const byLabel = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const label = safeLabel(node.label);
    const group = byLabel.get(label) ?? [];
    group.push(node);
    byLabel.set(label, group);
  }
  for (const [label, group] of byLabel) {
    await runCypher(
      `UNWIND $rows AS row
       MERGE (n:${label} {id: row.id})
       SET n += row.props`,
      {
        rows: group.map((node) => ({
          id: node.id,
          props: { ...(node.props ?? {}), id: node.id },
        })),
      },
    );
  }
}

export async function upsertRelationships(
  rels: { from: string; to: string; type: string; props?: Record<string, unknown> }[],
) {
  if (!rels.length) return;
  if (!neo4jLive()) {
    getMockGraph().upsertRelationships(rels);
    return;
  }
  const byType = new Map<string, typeof rels>();
  for (const rel of rels) {
    const type = safeType(rel.type);
    const group = byType.get(type) ?? [];
    group.push(rel);
    byType.set(type, group);
  }
  for (const [type, group] of byType) {
    await runCypher(
      `UNWIND $rows AS row
       MATCH (a {id: row.from}), (b {id: row.to})
       MERGE (a)-[r:${type}]->(b)
       SET r += row.props`,
      {
        rows: group.map((rel) => ({
          from: rel.from,
          to: rel.to,
          props: rel.props ?? {},
        })),
      },
    );
  }
}

export async function fetchSubgraph(label?: string, limit = 200): Promise<{
  nodes: GraphNode[];
  links: GraphLink[];
  mode: "live" | "mock";
}> {
  const capped = Math.min(Math.max(limit, 1), 2000);
  if (!neo4jLive()) {
    return { ...getMockGraph().subgraph(label, capped), mode: "mock" };
  }
  const filter = label ? `:${safeLabel(label)}` : "";
  const records = await runCypher<{
    id: string;
    labels: string[];
    name: string;
    documented: boolean | null;
    status: string | null;
    source: string;
    target: string;
    type: string;
  }>(
    `MATCH (n${filter})
     WITH n LIMIT $limit
     OPTIONAL MATCH (n)-[r]->(m)
     WHERE m IS NULL OR id(m) IS NOT NULL
     RETURN n.id AS id, labels(n) AS labels,
            coalesce(n.title, n.name, n.id) AS name,
            n.documented AS documented, n.status AS status,
            startNode(r).id AS source, endNode(r).id AS target, type(r) AS type`,
    { limit: neo4j.int(capped) },
  );

  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const row of records) {
    if (row.id && !nodes.has(row.id)) {
      nodes.set(row.id, {
        id: row.id,
        label: row.labels?.[0] ?? "Node",
        name: row.name,
        documented: typeof row.documented === "boolean" ? row.documented : undefined,
        status: row.status === "pass" || row.status === "fail" ? row.status : undefined,
      });
    }
    if (row.source && row.target && row.type) {
      const key = `${row.source}->${row.target}:${row.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ source: row.source, target: row.target, type: row.type });
      }
    }
  }
  return { nodes: [...nodes.values()], links, mode: "live" };
}
