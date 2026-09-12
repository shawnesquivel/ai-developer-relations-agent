import { buildCookbookFromPrompt } from "@/lib/builder";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const parsed = await readJson<{ prompt?: string; stream?: boolean }>(request);
  if (!parsed.ok) return parsed.response;
  const prompt = parsed.body.prompt?.trim();
  if (!prompt) return jsonError("missing prompt", 400);
  if (parsed.body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) =>
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        try {
          const built = await buildCookbookFromPrompt(prompt, (step, detail) => {
            send({ type: "progress", step, detail });
          });
          send({
            type: "result",
            cookbook: built.cookbook,
            provider: built.provider,
            model: built.model,
          });
        } catch (error) {
          send({ type: "error", error: error instanceof Error ? error.message : "build failed" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
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
