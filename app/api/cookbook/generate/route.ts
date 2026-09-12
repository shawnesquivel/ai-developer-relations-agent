import { buildCookbook } from "@/lib/builder";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJson<{ conceptId?: string; conceptName?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { conceptId, conceptName } = parsed.body;
  if (!conceptId || !conceptName) {
    return jsonError("missing conceptId or conceptName", 400);
  }
  try {
    const built = await buildCookbook(conceptId, conceptName);
    return Response.json({
      cookbook: built.cookbook,
      provider: built.provider,
      model: built.model,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "generation failed", 502);
  }
}
