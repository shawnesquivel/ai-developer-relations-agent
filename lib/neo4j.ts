import "server-only";
import neo4j, { type Driver, type QueryResult, type RecordShape } from "neo4j-driver";
import { env } from "./env";

import type { GraphLink, GraphNode } from "./graph-types";

export type { GraphLink, GraphNode };

export interface Subgraph {
  nodes: GraphNode[];
  links: GraphLink[];
  mode: "live" | "mock";
}

export interface UpsertNode {
  id: string;
  label: string;
  props?: Record<string, unknown>;
}

export interface UpsertRelationship {
  from: string;
  to: string;
  type: string;
  props?: Record<string, unknown>;
}

// ---- Driver -----------------------------------------------------------------------------------

let driver: Driver | null = null;

export function getDriver(): Driver | null {
  if (!env.neo4j.live()) return null;
  if (!driver) {
    driver = neo4j.driver(env.neo4j.uri!, neo4j.auth.basic(env.neo4j.username, env.neo4j.password!));
  }
  return driver;
}

export async function verifyConnectivity(): Promise<boolean> {
  const d = getDriver();
  if (!d) return false;
  await d.verifyConnectivity();
  return true;
}

/** Run parameterised Cypher. Never string-concatenate user input into the query. */
export async function runCypher<T extends RecordShape = RecordShape>(
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<{ records: Record<string, unknown>[]; mode: "live" | "mock" }> {
  const d = getDriver();
  if (!d) return { records: mockStore.query(cypher), mode: "mock" };
  const res: QueryResult<T> = await d.executeQuery(cypher, params, { database: env.neo4j.database });
  return { records: res.records.map((r) => plain(r.toObject())), mode: "live" };
}

const LABEL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
function assertIdentifier(s: string, what: string) {
  if (!LABEL_RE.test(s)) throw new Error(`Invalid ${what}: ${s}`);
}

export async function upsertNodes(nodes: UpsertNode[]): Promise<void> {
  const d = getDriver();
  if (!d) {
    nodes.forEach((n) => mockStore.upsertNode(n));
    return;
  }
  for (const n of nodes) {
    assertIdentifier(n.label, "label");
    await d.executeQuery(
      `MERGE (n:${n.label} {id: $id}) SET n += $props`,
      { id: n.id, props: n.props ?? {} },
      { database: env.neo4j.database },
    );
  }
}

export async function upsertRelationships(rels: UpsertRelationship[]): Promise<void> {
  const d = getDriver();
  if (!d) {
    rels.forEach((r) => mockStore.upsertRel(r));
    return;
  }
  for (const r of rels) {
    assertIdentifier(r.type, "relationship type");
    await d.executeQuery(
      `MATCH (a {id: $from}), (b {id: $to}) MERGE (a)-[rel:${r.type}]->(b) SET rel += $props`,
      { from: r.from, to: r.to, props: r.props ?? {} },
      { database: env.neo4j.database },
    );
  }
}

/**
 * Fetch up to `limit` relationships (plus their endpoint nodes) as {nodes, links}.
 * Optionally scope to nodes carrying a given label.
 */
export async function fetchSubgraph(opts: { label?: string; limit?: number } = {}): Promise<Subgraph> {
  const limit = Math.min(opts.limit ?? 200, 2000);
  const d = getDriver();
  if (!d) return { ...mockStore.subgraph(), mode: "mock" };

  if (opts.label) assertIdentifier(opts.label, "label");
  const match = opts.label ? `MATCH (a:${opts.label})-[r]-(b)` : `MATCH (a)-[r]->(b)`;
  const res = await d.executeQuery(
    `${match} RETURN a, r, b LIMIT $limit`,
    { limit: neo4j.int(limit) },
    { database: env.neo4j.database },
  );

  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  for (const rec of res.records) {
    const a = toGraphNode(rec.get("a"));
    const b = toGraphNode(rec.get("b"));
    nodes.set(a.id, a);
    nodes.set(b.id, b);
    const r = rec.get("r");
    links.push({
      source: a.id,
      target: b.id,
      type: r.type,
      ...plain(r.properties),
    });
  }
  if (nodes.size === 0) {
    // Include isolated nodes so an empty-relationship DB still renders something.
    const lone = await d.executeQuery(
      opts.label ? `MATCH (n:${opts.label}) RETURN n LIMIT $limit` : `MATCH (n) RETURN n LIMIT $limit`,
      { limit: neo4j.int(limit) },
      { database: env.neo4j.database },
    );
    for (const rec of lone.records) {
      const n = toGraphNode(rec.get("n"));
      nodes.set(n.id, n);
    }
  }
  return { nodes: [...nodes.values()], links, mode: "live" };
}

/** Create a cosine vector index (idempotent). Index builds in the background — check SHOW INDEXES for ONLINE. */
export async function ensureVectorIndex(opts: {
  name: string;
  label: string;
  property?: string;
  dimensions?: number;
}): Promise<void> {
  const d = getDriver();
  if (!d) return;
  assertIdentifier(opts.name, "index name");
  assertIdentifier(opts.label, "label");
  const prop = opts.property ?? "embedding";
  assertIdentifier(prop, "property");
  await d.executeQuery(
    `CREATE VECTOR INDEX ${opts.name} IF NOT EXISTS
     FOR (n:${opts.label}) ON n.${prop}
     OPTIONS { indexConfig: {
       \`vector.dimensions\`: $dims,
       \`vector.similarity_function\`: 'cosine'
     }}`,
    { dims: neo4j.int(opts.dimensions ?? 1536) },
    { database: env.neo4j.database },
  );
}

export async function vectorSearch(indexName: string, embedding: number[], k = 5) {
  assertIdentifier(indexName, "index name");
  return runCypher(
    `CALL db.index.vector.queryNodes($index, $k, $q) YIELD node, score RETURN node, score`,
    { index: indexName, k: neo4j.int(k), q: embedding },
  );
}

// ---- helpers ----------------------------------------------------------------------------------

function toGraphNode(n: { elementId: string; labels: string[]; properties: Record<string, unknown> }): GraphNode {
  const props = plain(n.properties);
  const id = typeof props.id === "string" ? props.id : n.elementId;
  const label = n.labels[0] ?? "Node";
  const name = (props.name as string) ?? (props.title as string) ?? id;
  return { ...props, id, label, name };
}

/** Convert neo4j Integer / Node / Relationship values into JSON-safe plain values. */
function plain<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (neo4j.isInt(value)) return (value as unknown as { toNumber(): number }).toNumber() as unknown as T;
  if (Array.isArray(value)) return value.map(plain) as unknown as T;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("labels" in v && "properties" in v) return { labels: v.labels, ...plain(v.properties as object) } as unknown as T;
    if ("type" in v && "properties" in v && "start" in v) return { type: v.type, ...plain(v.properties as object) } as unknown as T;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) as unknown as T;
  }
  return value;
}

// ---- In-memory mock graph (used when NEO4J_* is not set) --------------------------------------

class MockGraph {
  nodes = new Map<string, GraphNode>();
  links: GraphLink[] = [];

  outgoing(id: string, type?: string): GraphLink[] {
    return this.links.filter((l) => l.source === id && (!type || l.type === type));
  }

  incoming(id: string, type?: string): GraphLink[] {
    return this.links.filter((l) => l.target === id && (!type || l.type === type));
  }

  byLabel(label: string): GraphNode[] {
    return [...this.nodes.values()].filter((n) => n.label === label);
  }

  upsertNode(n: UpsertNode) {
    const existing = this.nodes.get(n.id);
    this.nodes.set(n.id, {
      ...(existing ?? {}),
      ...(n.props ?? {}),
      id: n.id,
      label: n.label,
      name: (n.props?.name as string) ?? existing?.name ?? n.id,
    });
  }

  upsertRel(r: UpsertRelationship) {
    const idx = this.links.findIndex((l) => l.source === r.from && l.target === r.to && l.type === r.type);
    const link: GraphLink = { ...(r.props ?? {}), source: r.from, target: r.to, type: r.type };
    if (idx >= 0) this.links[idx] = link;
    else this.links.push(link);
  }

  subgraph(): { nodes: GraphNode[]; links: GraphLink[] } {
    return { nodes: [...this.nodes.values()], links: [...this.links] };
  }

  /** Very small Cypher stand-in: MATCH (n) / MATCH (n:Label) RETURN n. Anything else returns []. */
  query(cypher: string): Record<string, unknown>[] {
    const m = cypher.match(/MATCH\s*\(\s*\w+(?::(\w+))?\s*\)/i);
    if (!m) return [];
    const label = m[1];
    return [...this.nodes.values()].filter((n) => !label || n.label === label).map((n) => ({ n }));
  }
}

const globalForMock = globalThis as unknown as { __mockGraph?: MockGraph };
export const mockStore = (globalForMock.__mockGraph ??= new MockGraph());

export function isLive(): boolean {
  return env.neo4j.live();
}
