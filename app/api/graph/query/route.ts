import { NextResponse } from "next/server";
import { runCypher, upsertNodes, upsertRelationships, type UpsertNode, type UpsertRelationship } from "@/lib/neo4j";

export const runtime = "nodejs";

interface Body {
  cypher?: string;
  params?: Record<string, unknown>;
  nodes?: UpsertNode[];
  relationships?: UpsertRelationship[];
}

/**
 * POST { cypher, params? }                      → run parameterised Cypher
 * POST { nodes?: [...], relationships?: [...] } → upsert into the graph
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    if (body.nodes || body.relationships) {
      if (body.nodes?.length) await upsertNodes(body.nodes);
      if (body.relationships?.length) await upsertRelationships(body.relationships);
      return NextResponse.json({
        ok: true,
        upserted: { nodes: body.nodes?.length ?? 0, relationships: body.relationships?.length ?? 0 },
      });
    }
    if (!body.cypher) return NextResponse.json({ error: "Provide `cypher` or `nodes`/`relationships`" }, { status: 400 });
    const result = await runCypher(body.cypher, body.params ?? {});
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
