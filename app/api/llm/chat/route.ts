import { chat, chatStream, type ChatMessage } from "@/lib/llm";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJson<{
    messages?: ChatMessage[];
    prompt?: string;
    model?: string;
    temperature?: number;
    stream?: boolean;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const messages =
    parsed.body.messages ??
    (parsed.body.prompt ? [{ role: "user" as const, content: parsed.body.prompt }] : []);
  if (!messages.length) return jsonError("no messages/prompt", 400);

  if (parsed.body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await chatStream(
            { messages, model: parsed.body.model, temperature: parsed.body.temperature },
            (chunk) => controller.enqueue(encoder.encode(chunk)),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "provider failure";
          controller.enqueue(encoder.encode(`\n[error] ${message}`));
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const result = await chat({
      messages,
      model: parsed.body.model,
      temperature: parsed.body.temperature,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "provider failure", 502);
  }
}
