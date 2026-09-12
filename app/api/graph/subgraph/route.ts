import { ensureSeeded } from "@/lib/cookbooks";
import { fetchSubgraph } from "@/lib/neo4j";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const label = url.searchParams.get("label") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 200);
  try {
    await ensureSeeded();
    const graph = await fetchSubgraph(label, Number.isFinite(limit) ? limit : 200);
    return Response.json(graph);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "seed/query failure", 502);
  }
}
