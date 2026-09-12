import OpenAI from "openai";
import { env, llmProvider, nosanaBaseUrl } from "./env";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatResult = {
  content: string;
  model: string;
  provider: "nosana" | "openai" | "mock";
  usage: { promptTokens: number; completionTokens: number };
};

export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export function getLlmClient(): { client: OpenAI; model: string; provider: "nosana" | "openai" } | null {
  const provider = llmProvider();
  if (provider === "mock") return null;
  if (provider === "nosana") {
    return {
      client: new OpenAI({
        apiKey: env.NOSANA_API_KEY || "not-used",
        baseURL: nosanaBaseUrl(),
      }),
      model: env.NOSANA_MODEL,
      provider,
    };
  }
  return {
    client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    model: env.OPENAI_MODEL,
    provider,
  };
}

export function mockChat(messages: ChatMessage[]): ChatResult {
  const last = messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  return {
    content: `# Mock answer\n\nYou asked: ${last.slice(0, 200)}\n\n\`\`\`typescript\nconsole.log("mock");\n\`\`\`\n`,
    model: "mock",
    provider: "mock",
    usage: { promptTokens: 0, completionTokens: 8 },
  };
}

export async function chat(opts: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatResult> {
  const resolved = getLlmClient();
  if (!resolved) return mockChat(opts.messages);
  const model = opts.model ?? resolved.model;
  const maxTokens = opts.maxTokens ?? 8192;
  const completion = await resolved.client.chat.completions.create({
    model,
    messages: opts.messages,
    ...(resolved.provider === "openai"
      ? { max_completion_tokens: maxTokens }
      : { temperature: opts.temperature ?? 0.3, max_tokens: maxTokens }),
  });
  const content = stripReasoning(completion.choices[0]?.message?.content ?? "");
  return {
    content,
    model: completion.model ?? resolved.model,
    provider: resolved.provider,
    usage: {
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}

export async function chatStream(
  opts: { messages: ChatMessage[]; model?: string; temperature?: number },
  write: (chunk: string) => void,
): Promise<void> {
  const resolved = getLlmClient();
  if (!resolved) {
    write(mockChat(opts.messages).content);
    return;
  }
  const stream = await resolved.client.chat.completions.create({
    model: opts.model ?? resolved.model,
    messages: opts.messages,
    stream: true,
    ...(resolved.provider === "openai"
      ? {}
      : { temperature: opts.temperature ?? 0.2 }),
  });
  for await (const part of stream) {
    const token = part.choices[0]?.delta?.content;
    if (token) write(token);
  }
}
