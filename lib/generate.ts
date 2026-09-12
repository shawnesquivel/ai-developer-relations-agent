import "server-only";
import { llmProvider } from "./env";
import { chat } from "./llm";
import { extractCodeBlocks, extractTitle } from "./markdown";

const SYSTEM = `You write cookbooks for the Composio TypeScript SDK (@composio/core) in the style of the OpenAI and Anthropic cookbooks: a short, practical article with runnable TypeScript code blocks.

Rules:
- Start with a single "# Title" line.
- 2 to 4 TypeScript code blocks fenced with \`\`\`typescript. Each block must be a complete, independently runnable script (its own imports). Blocks do NOT share scope.
- Read credentials from process.env.COMPOSIO_API_KEY, process.env.GITHUB_PAT, and optionally process.env.OPENAI_BASE_URL / process.env.OPENAI_API_KEY / process.env.OPENAI_MODEL.
- Every block prints something to stdout so a test harness can see it ran.
- Use a GitHub personal access token via a bearer-token auth config and composio.connectedAccounts.initiate(...) — never a browser OAuth redirect.
- Use only these Composio APIs: new Composio({ apiKey }), composio.tools.get(userId, { toolkits, limit }), composio.tools.execute(slug, { userId, arguments, dangerouslySkipVersionCheck: true }), composio.authConfigs.create(toolkit, {...}), composio.connectedAccounts.initiate(userId, authConfigId, { config: AuthScheme.BearerToken({ token }) }).
- Keep prose tight: what, why, then code. No filler.`;

export interface GeneratedCookbook {
  title: string;
  markdown: string;
  provider: "nosana" | "openai" | "mock";
  model: string;
}

export async function generateCookbook(conceptName: string, opts: { toolNames?: string[] } = {}): Promise<GeneratedCookbook> {
  if (llmProvider() === "mock") return { ...mockCookbook(conceptName), provider: "mock", model: "mock" };

  const prompt = `Write the cookbook "${conceptName}" for the Composio SDK.
${opts.toolNames?.length ? `Prefer these real GitHub tool slugs: ${opts.toolNames.join(", ")}.` : ""}
If the concept is about tool calling, the cookbook is "Give an agent GitHub tools in 20 lines": fetch the GitHub tool schemas, hand them to an OpenAI-compatible chat completion, and execute the tool call the model returns.`;

  const res = await chat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    maxTokens: 1800,
  });
  let markdown = res.content.trim();
  if (extractCodeBlocks(markdown).length === 0) {
    // Model ignored the fence rule — fall back so the page always has runnable blocks.
    markdown = mockCookbook(conceptName).markdown;
  }
  return { title: extractTitle(markdown, conceptName), markdown, provider: res.provider, model: res.model };
}

function mockCookbook(conceptName: string): { title: string; markdown: string } {
  const title = /tool calling/i.test(conceptName) ? "Give an agent GitHub tools in 20 lines" : conceptName;
  const markdown = `# ${title}

Composio hands your model **real, authenticated tools**. This cookbook connects GitHub with a personal access token (no OAuth redirect), gives the tool schemas to an OpenAI-compatible model, and executes whatever the model decides to call.

## 1. Connect GitHub with a PAT

A bearer-token auth config plus one \`initiate\` call gives you an ACTIVE connected account without a browser.

\`\`\`typescript
import { AuthScheme, Composio } from "@composio/core";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const authConfig = await composio.authConfigs.create("github", {
  type: "use_custom_auth",
  authScheme: "BEARER_TOKEN",
  credentials: {},
  name: "cookbook-github-pat",
});
const conn = await composio.connectedAccounts.initiate("cookbook-user", authConfig.id, {
  config: AuthScheme.BearerToken({ token: process.env.GITHUB_PAT! }),
});
console.log("connected account", conn.id, conn.status);
\`\`\`

## 2. Let the model pick a tool

Tool schemas from \`tools.get\` are already in OpenAI function-calling format, so they go straight into \`tools\`.

\`\`\`typescript
import { Composio } from "@composio/core";
import OpenAI from "openai";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const llm = new OpenAI({ baseURL: process.env.OPENAI_BASE_URL, apiKey: process.env.OPENAI_API_KEY ?? "not-used" });

const tools = await composio.tools.get("cookbook-user", {
  tools: ["GITHUB_GET_THE_AUTHENTICATED_USER", "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER"],
});
const res = await llm.chat.completions.create({
  model: process.env.OPENAI_MODEL ?? "DeepSeek-R1-Distill-Qwen-1.5B",
  messages: [{ role: "user", content: "Who am I on GitHub?" }],
  tools,
});
const call = res.choices[0].message.tool_calls?.[0];
console.log("model chose:", call?.function.name ?? "(no tool call)");
\`\`\`

## 3. Execute the call for real

\`\`\`typescript
import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const result = await composio.tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER", {
  userId: "cookbook-user",
  arguments: {},
  dangerouslySkipVersionCheck: true,
});
console.log(result.successful ? "OK" : "FAILED", JSON.stringify(result.data).slice(0, 200));
\`\`\`

That is the whole loop: **auth → schemas → model decides → Composio executes**. Swap the tool list and the same twenty lines drive Slack, Notion, or Linear.
`;
  return { title, markdown };
}
