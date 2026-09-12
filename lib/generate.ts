import {
  articleForKind,
  articleForPrompt,
  articleKindFromText,
  ensureFullArticle,
  type ArticleKind,
} from "./articles";
import { chat } from "./llm";
import { extractTitle } from "./markdown";
import { llmProvider } from "./env";

export const SYSTEM = `You write practical @composio/core TypeScript cookbook ARTICLES from the SDK surface, not docs.composio.dev product examples.

A cookbook is a short Markdown article in this exact order:
1. One H1 title (# Title)
2. A concise why / explanation paragraph
3. A Prerequisites (or Setup) section with bullets
4. 2–4 independently runnable fenced \`\`\`typescript blocks
5. Prose between every block explaining that step
6. A final "What this proved" section

Concepts, in order:
1. new Composio({ apiKey, toolkitVersions: { github: "latest" } })
2. composio.tools.get(userId, { tools })
3. authConfigs.create + connectedAccounts.initiate with AuthScheme.BearerToken PAT
4. tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER", { userId, arguments, dangerouslySkipVersionCheck: true })

Hard rules:
- Never emit a single snippet. Never persist a one-block article.
- Every block is complete and independently runnable: own imports, no hidden state.
- Credentials come only from process.env (COMPOSIO_API_KEY, GITHUB_PAT, COMPOSIO_USER_ID, DAYTONA_API_KEY).
- Every block prints something to stdout.
- GitHub auth uses a PAT via custom auth. Never instruct browser OAuth. Never Slack OAuth.
- Only these Composio APIs:
  new Composio({ apiKey, toolkitVersions: { github: "latest" } })
  composio.tools.get(userId, { tools })
  composio.tools.execute(slug, { userId, arguments, dangerouslySkipVersionCheck: true })
  composio.authConfigs.create("github", { type: "use_custom_auth", authScheme: "BEARER_TOKEN", credentials: {} })
  composio.connectedAccounts.initiate(userId, authConfig.id, { allowMultiple: true, config: AuthScheme.BearerToken({ token }) })
- Prefer GITHUB_GET_THE_AUTHENTICATED_USER as the proof call.
- If the requested title mentions Slack or another product example, still emit the GitHub PAT who-am-I article.
- Keep prose concise. No JSON wrapper.`;

export type CookbookKind = ArticleKind;

const KIND_PROMPT: Record<ArticleKind, string> = {
  client: "Full article on client boot. Two typescript blocks. Title: new Composio({ apiKey }).",
  toolsGet: "Full Eve-shaped article: inspect schemas with tools.get, then one read-only execute. 2–3 blocks. No Eve SDK import.",
  auth: "Full article on PAT custom auth. 2–3 blocks. Never Slack OAuth.",
  execute: "Full Pi-shaped who-am-I article: client, PAT, tools.execute. 2–3 blocks. Include dangerouslySkipVersionCheck: true.",
  bind: "Full LangChain-shaped article: fetch one schema, adapt to { name, invoke }, invoke once. 2–3 blocks. No extra @langchain install.",
  daytona: "Full Eve + Daytona article: construct client, then create sandbox / run a five-line program / delete in finally. 2 blocks.",
};

function listedSlugs(toolSlugs: string[]): string[] {
  return toolSlugs.length
    ? toolSlugs
    : ["GITHUB_GET_THE_AUTHENTICATED_USER", "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER"];
}

export function conceptKind(conceptName: string): CookbookKind {
  return articleKindFromText(conceptName);
}

export function mockCookbook(conceptName: string, toolSlugs: string[]): string {
  return articleForKind(conceptKind(conceptName), listedSlugs(toolSlugs));
}

export function mockCookbookFromPrompt(prompt: string, toolSlugs: string[]): string {
  return articleForPrompt(prompt, listedSlugs(toolSlugs));
}

export async function generateCookbook(conceptName: string, toolSlugs: string[]) {
  return generateArticle(conceptName, listedSlugs(toolSlugs), conceptKind(conceptName));
}

export async function generateCookbookFromPrompt(prompt: string, toolSlugs: string[]) {
  return generateArticle(prompt, listedSlugs(toolSlugs), articleKindFromText(prompt));
}

async function generateArticle(hint: string, slugs: string[], kind: ArticleKind) {
  const provider = llmProvider();
  if (provider === "mock") {
    return { markdown: ensureFullArticle("", hint, slugs), provider, model: "mock" };
  }

  const user = [
    `Write a Composio TypeScript cookbook ARTICLE for: ${hint}.`,
    `Real GitHub tool slugs from Composio: ${slugs.join(", ")}.`,
    KIND_PROMPT[kind],
    "Emit 2–4 typescript fences with prose between them. Never a single snippet.",
    "Never generate Slack OAuth or browser OAuth. GitHub PAT only.",
  ].join("\n");

  try {
    const result = await chat({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      maxTokens: 8192,
    });
    const markdown = ensureFullArticle(result.content, hint, slugs);
    const titled = extractTitle(markdown, "") ? markdown : `# ${hint}\n\n${markdown}`;
    return { markdown: ensureFullArticle(titled, hint, slugs), provider: result.provider, model: result.model };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "llm failed";
    console.warn("LLM article generation failed — using deterministic article", reason.split(":")[0]);
    return { markdown: ensureFullArticle("", hint, slugs), provider: "mock", model: "fallback" };
  }
}
