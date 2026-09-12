import { NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/cookbooks";
import { fetchSubgraph } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/graph/subgraph?label=Sponsor&limit=200 → { nodes, links, mode } for react-force-graph-3d */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const label = url.searchParams.get("label") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  try {
    await ensureSeeded();
    const graph = await fetchSubgraph({ label, limit: Number.isFinite(limit) ? limit : undefined });
    return NextResponse.json(graph);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
