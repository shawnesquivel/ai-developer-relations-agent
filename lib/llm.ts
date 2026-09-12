import "server-only";
import OpenAI from "openai";
import { env, llmProvider } from "./env";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Override the model; defaults to NOSANA_MODEL / OPENAI_MODEL. */
  model?: string;
}

export interface ChatResult {
  content: string;
  model: string;
  provider: "nosana" | "openai" | "mock";
  usage?: { promptTokens: number; completionTokens: number };
}

let client: OpenAI | null = null;
let clientProvider: "nosana" | "openai" | null = null;

/**
 * OpenAI-compatible client. Nosana's deepseek-r1-qwen-1-5b template runs vLLM's OpenAI server on
 * port 9000 — paste the deployment URL from deploy.nosana.com into NOSANA_ENDPOINT (with or without /v1).
 */
export function getLlmClient(): OpenAI | null {
  const provider = llmProvider();
  if (provider === "mock") return null;
  if (client && clientProvider === provider) return client;

  if (provider === "nosana") {
    const base = env.nosana.endpoint!.replace(/\/+$/, "");
    client = new OpenAI({
      baseURL: base.endsWith("/v1") ? base : `${base}/v1`,
      apiKey: env.nosana.apiKey ?? "not-used",
    });
  } else {
    client = new OpenAI({ apiKey: env.openai.apiKey });
  }
  clientProvider = provider;
  return client;
}

export function defaultModel(): string {
  const provider = llmProvider();
  return provider === "openai" ? env.openai.model : env.nosana.model;
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const provider = llmProvider();
  const model = opts.model ?? defaultModel();
  const llm = getLlmClient();
  if (!llm) return mockChat(opts, model);

  const res = await llm.chat.completions.create({
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 512,
  });
  const choice = res.choices[0];
  return {
    content: stripReasoning(choice?.message?.content ?? ""),
    model: res.model ?? model,
    provider,
    usage: res.usage
      ? { promptTokens: res.usage.prompt_tokens, completionTokens: res.usage.completion_tokens }
      : undefined,
  };
}

/** Streams content deltas; returns the full text. Mock mode yields a single chunk. */
export async function chatStream(opts: ChatOptions, onDelta: (delta: string) => void): Promise<ChatResult> {
  const provider = llmProvider();
  const model = opts.model ?? defaultModel();
  const llm = getLlmClient();
  if (!llm) {
    const r = mockChat(opts, model);
    onDelta(r.content);
    return r;
  }
  const stream = await llm.chat.completions.create({
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 512,
    stream: true,
  });
  let content = "";
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content ?? "";
    if (delta) {
      content += delta;
      onDelta(delta);
    }
  }
  return { content: stripReasoning(content), model, provider };
}

/** DeepSeek-R1 distills emit <think>…</think> before the answer; drop it for display. */
function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

function mockChat(opts: ChatOptions, model: string): ChatResult {
  const last = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const words = last.trim().split(/\s+/).filter(Boolean);
  const content =
    `[mock:${model}] Received ${words.length} word(s). ` +
    (words.length ? `Echo: "${words.slice(0, 12).join(" ")}${words.length > 12 ? " …" : ""}"` : "Say something.") +
    " Set NOSANA_ENDPOINT or OPENAI_API_KEY for real inference.";
  return {
    content,
    model,
    provider: "mock",
    usage: { promptTokens: words.length, completionTokens: content.split(/\s+/).length },
  };
}
