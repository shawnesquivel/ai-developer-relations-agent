import { ensureSeeded } from "@/lib/cookbooks";
import { getMockGraph, runCypher, upsertNodes, upsertRelationships } from "@/lib/neo4j";
import { neo4jLive } from "@/lib/env";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJson<{
    cypher?: string;
    params?: Record<string, unknown>;
    nodes?: { id: string; label: string; props?: Record<string, unknown> }[];
    relationships?: { from: string; to: string; type: string; props?: Record<string, unknown> }[];
  }>(request);
  if (!parsed.ok) return parsed.response;
  const { cypher, params, nodes, relationships } = parsed.body;
  if (!cypher && !nodes && !relationships) {
    return jsonError("neither Cypher nor upserts supplied", 400);
  }
  try {
    await ensureSeeded();
    if (nodes || relationships) {
      if (nodes) await upsertNodes(nodes);
      if (relationships) await upsertRelationships(relationships);
      return Response.json({
        ok: true,
        upserted: { nodes: nodes?.length ?? 0, relationships: relationships?.length ?? 0 },
      });
    }
    if (neo4jLive()) {
      const records = await runCypher(cypher!, params ?? {});
      return Response.json({ records, mode: "live" });
    }
    const g = getMockGraph();
    return Response.json({
      records: [...g.nodes.values()].slice(0, 25).map((n) => ({ id: n.id, labels: n.labels, props: n.props })),
      mode: "mock",
      note: "Mock graph accepts only a tiny Cypher subset; returning sample nodes.",
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Neo4j error", 502);
  }
}
