import { NextResponse } from "next/server";
import { chat, chatStream, type ChatMessage } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  messages?: ChatMessage[];
  prompt?: string;
  model?: string;
  temperature?: number;
  stream?: boolean;
}

/**
 * POST { messages: [{role, content}] } or { prompt } → { content, model, provider }
 * Add `stream: true` for a text/plain streamed body.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const messages: ChatMessage[] = body.messages ?? (body.prompt ? [{ role: "user", content: body.prompt }] : []);
  if (!messages.length) return NextResponse.json({ error: "Provide `messages` or `prompt`" }, { status: 400 });

  try {
    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            await chatStream({ messages, model: body.model, temperature: body.temperature }, (d) =>
              controller.enqueue(encoder.encode(d)),
            );
          } catch (err) {
            controller.enqueue(encoder.encode(`\n[error] ${err instanceof Error ? err.message : String(err)}`));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    const result = await chat({ messages, model: body.model, temperature: body.temperature });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
