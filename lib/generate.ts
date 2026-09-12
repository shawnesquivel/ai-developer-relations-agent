import { chat } from "./llm";
import { extractCodeBlocks, extractTitle } from "./markdown";
import { llmProvider } from "./env";

export const SYSTEM = `You write practical @composio/core TypeScript cookbooks from the SDK surface, not docs.composio.dev product examples.

Concepts, in order:
1. new Composio({ apiKey, toolkitVersions: { github: "latest" } })
2. composio.tools.get(userId, { tools })
3. authConfigs.create + connectedAccounts.initiate with AuthScheme.BearerToken PAT
4. tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER", { userId, arguments, dangerouslySkipVersionCheck: true })

Hard rules:
- Start with one Markdown H1 title (# Title) matching the concept name.
- Include 1–2 fenced \`\`\`typescript blocks.
- Every block is complete and independently runnable: own imports, no hidden state.
- Credentials come only from process.env (COMPOSIO_API_KEY, GITHUB_PAT, COMPOSIO_USER_ID).
- Every block prints something to stdout.
- GitHub auth uses a PAT via custom auth. Never instruct browser OAuth. Never Slack OAuth.
- Only these Composio APIs:
  new Composio({ apiKey, toolkitVersions: { github: "latest" } })
  composio.tools.get(userId, { tools })
  composio.tools.execute(slug, { userId, arguments, dangerouslySkipVersionCheck: true })
  composio.authConfigs.create("github", { type: "use_custom_auth", authScheme: "BEARER_TOKEN", credentials: {} })
  composio.connectedAccounts.initiate(userId, authConfig.id, { allowMultiple: true, config: AuthScheme.BearerToken({ token }) })
- Prefer GITHUB_GET_THE_AUTHENTICATED_USER as the proof call.
- If the requested title mentions Slack or another product example, still emit the GitHub PAT who-am-I proof.
- Keep prose concise. No JSON wrapper.`;

export type CookbookKind = "client" | "toolsGet" | "auth" | "execute";

function listedSlugs(toolSlugs: string[]): string[] {
  return toolSlugs.length
    ? toolSlugs
    : ["GITHUB_GET_THE_AUTHENTICATED_USER", "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER"];
}

function primarySlug(slugs: string[]): string {
  return slugs.includes("GITHUB_GET_THE_AUTHENTICATED_USER")
    ? "GITHUB_GET_THE_AUTHENTICATED_USER"
    : slugs[0];
}

function quoteList(slugs: string[]): string {
  return slugs.map((s) => `"${s}"`).join(", ");
}

export function conceptKind(conceptName: string): CookbookKind {
  if (/client|install|api key|new Composio/i.test(conceptName)) return "client";
  if (/tools\.get|schemas/i.test(conceptName)) return "toolsGet";
  if (/execute|who-am-i|who am i/i.test(conceptName)) return "execute";
  if (/authconfig|connected|\bpat\b|BearerToken/i.test(conceptName)) return "auth";
  // Slack / featured examples still emit the PAT who-am-I proof.
  return "auth";
}

function clientCookbook(): string {
  return `# new Composio({ apiKey })

Create a \`Composio\` client from \`COMPOSIO_API_KEY\`. Independently runnable.

\`\`\`typescript
import { Composio } from "@composio/core";

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.log("COMPOSIO_API_KEY missing — mock-safe boot check");
  process.exit(0);
}

const composio = new Composio({
  apiKey,
  toolkitVersions: { github: "latest" },
});
console.log("Composio client ready", Boolean(composio.tools && composio.toolkits));
\`\`\`
`;
}

function toolsGetCookbook(listed: string): string {
  return `# composio.tools.get

Fetch tool schemas. No OAuth.

\`\`\`typescript
import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  const slugs = [${listed}];
  if (!apiKey) {
    console.log("schemas (mock)", slugs.join(", "));
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  const tools = await composio.tools.get(userId, { tools: slugs });
  console.log("fetched schemas", Array.isArray(tools) ? tools.length : Object.keys(tools ?? {}).length);
}

main();
\`\`\`
`;
}

function authCookbook(primary: string): string {
  return `# authConfigs + connectedAccounts PAT

Connect GitHub with a fine-grained PAT — never browser OAuth.

\`\`\`typescript
import { AuthScheme, Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const pat = process.env.GITHUB_PAT;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("No COMPOSIO_API_KEY — skipping PAT connect");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  const authConfig = await composio.authConfigs.create("github", {
    type: "use_custom_auth",
    authScheme: "BEARER_TOKEN",
    credentials: {},
  });
  console.log("authConfig", authConfig.id);
  if (!pat) {
    console.log("No GITHUB_PAT — auth config only");
    return;
  }

  await composio.connectedAccounts.initiate(userId, authConfig.id, {
    allowMultiple: true,
    config: AuthScheme.BearerToken({ token: pat }),
  });
  const result = await composio.tools.execute("${primary}", {
    userId,
    arguments: {},
    dangerouslySkipVersionCheck: true,
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 800));
}

main();
\`\`\`
`;
}

function executeCookbook(primary: string): string {
  return `# tools.execute who-am-I

Call \`GITHUB_GET_THE_AUTHENTICATED_USER\` with \`dangerouslySkipVersionCheck: true\`.

\`\`\`typescript
import { AuthScheme, Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const pat = process.env.GITHUB_PAT;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("who-am-I (mock) ${primary}");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  if (pat) {
    const authConfig = await composio.authConfigs.create("github", {
      type: "use_custom_auth",
      authScheme: "BEARER_TOKEN",
      credentials: {},
    });
    await composio.connectedAccounts.initiate(userId, authConfig.id, {
      allowMultiple: true,
      config: AuthScheme.BearerToken({ token: pat }),
    });
  }
  const result = await composio.tools.execute("${primary}", {
    userId,
    arguments: {},
    dangerouslySkipVersionCheck: true,
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 800));
}

main();
\`\`\`
`;
}

const KIND_PROMPT: Record<CookbookKind, string> = {
  client: "Stay on client boot only. Print a confirmation. Title: new Composio({ apiKey }).",
  toolsGet: "Stay on composio.tools.get schemas only. No OAuth.",
  auth: "Stay on PAT custom auth + one tools.execute who-am-I. Include dangerouslySkipVersionCheck: true. Never Slack OAuth.",
  execute: "Stay on tools.execute GITHUB_GET_THE_AUTHENTICATED_USER with dangerouslySkipVersionCheck: true.",
};

export function mockCookbook(conceptName: string, toolSlugs: string[]): string {
  const slugs = listedSlugs(toolSlugs);
  const primary = primarySlug(slugs);
  const listed = quoteList(slugs);
  switch (conceptKind(conceptName)) {
    case "client":
      return clientCookbook();
    case "toolsGet":
      return toolsGetCookbook(listed);
    case "execute":
      return executeCookbook(primary);
    default:
      return authCookbook(primary);
  }
}

export async function generateCookbook(conceptName: string, toolSlugs: string[]) {
  const provider = llmProvider();
  if (provider === "mock") {
    const markdown = mockCookbook(conceptName, toolSlugs);
    return { markdown, provider, model: "mock" };
  }

  const kind = conceptKind(conceptName);
  const slugs = listedSlugs(toolSlugs);
  const user = [
    `Write a Composio TypeScript cookbook for: ${conceptName}.`,
    `Real GitHub tool slugs from Composio: ${toolSlugs.join(", ") || "GITHUB_GET_THE_AUTHENTICATED_USER"}.`,
    KIND_PROMPT[kind],
    `If OPENAI_API_KEY is missing, execute ${primarySlug(slugs)} directly with dangerouslySkipVersionCheck: true.`,
    "Never generate Slack OAuth or browser OAuth. GitHub PAT only.",
  ].join("\n");

  const result = await chat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    maxTokens: 8192,
  });
  let markdown = result.content;
  if (extractCodeBlocks(markdown).length === 0) {
    markdown = mockCookbook(conceptName, toolSlugs);
  }
  if (!extractTitle(markdown, "")) {
    markdown = `# ${conceptName}\n\n${markdown}`;
  }
  return { markdown, provider: result.provider, model: result.model };
}
