import { buildCookbookFromPrompt } from "@/lib/builder";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const parsed = await readJson<{ prompt?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const prompt = parsed.body.prompt?.trim();
  if (!prompt) return jsonError("missing prompt", 400);
  try {
    const built = await buildCookbookFromPrompt(prompt);
    return Response.json({
      cookbook: built.cookbook,
      provider: built.provider,
      model: built.model,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "build failed", 502);
  }
}
