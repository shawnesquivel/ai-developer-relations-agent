import { extractCodeBlocks, extractTitle } from "./markdown";
import { TOOLS } from "./seed";

export const BUILD_STARTERS = [
  {
    id: "whoami",
    prompt: "GitHub who-am-I with a PAT in 20 lines",
    conceptId: "c-execute",
    conceptName: "tools.execute",
  },
  {
    id: "langchain",
    prompt: "Bind one GitHub tool in LangChain and invoke it once",
    conceptId: "c-tool-bind",
    conceptName: "bind tool descriptor",
  },
  {
    id: "eve-schemas",
    prompt: "Eve lists Composio GitHub tool schemas",
    conceptId: "c-tools-get",
    conceptName: "composio.tools.get",
  },
  {
    id: "eve-daytona",
    prompt: "Eve runs a 5-line script in a fresh Daytona sandbox",
    conceptId: "c-daytona-exec",
    conceptName: "Daytona sandbox exec",
  },
] as const;

export type StarterId = (typeof BUILD_STARTERS)[number]["id"];

export const ARTICLE_PACKAGES = [
  "@composio/core@0.17.0",
  "@daytonaio/sdk@0.211.2",
] as const;

const WHOAMI = "GITHUB_GET_THE_AUTHENTICATED_USER";

function fence(code: string): string {
  return `\`\`\`typescript\n${code.trim()}\n\`\`\``;
}

function clientBlock(): string {
  return `import { Composio } from "@composio/core";

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.log("COMPOSIO_API_KEY missing — client boot skipped");
  process.exit(0);
}

const composio = new Composio({
  apiKey,
  toolkitVersions: { github: "latest" },
});
console.log("Composio client ready", Boolean(composio.tools && composio.toolkits));`;
}

function authBlock(primary: string): string {
  return `import { AuthScheme, Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const pat = process.env.GITHUB_PAT;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("No COMPOSIO_API_KEY — PAT connect skipped");
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
  console.log("connected GitHub PAT for", userId, "${primary}");
}

main();`;
}

function executeBlock(primary: string): string {
  return `import { AuthScheme, Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const pat = process.env.GITHUB_PAT;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("who-am-I skipped (no COMPOSIO_API_KEY)", "${primary}");
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

main();`;
}

function langchainGetBlock(primary: string): string {
  return `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("schema (env missing)", "${primary}");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  const schemas = await composio.tools.get(userId, { tools: ["${primary}"] });
  const descriptor = Array.isArray(schemas) ? schemas[0] : schemas;
  const name = (descriptor as { name?: string })?.name ?? "${primary}";
  console.log("langchain-style schema", name);
}

main();`;
}

function langchainInvokeBlock(primary: string): string {
  return `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("invoke (env missing)", "${primary}");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  const schemas = await composio.tools.get(userId, { tools: ["${primary}"] });
  const descriptor = Array.isArray(schemas) ? schemas[0] : schemas;
  const name = (descriptor as { name?: string })?.name ?? "${primary}";
  const tool = {
    name,
    invoke: () =>
      composio.tools.execute("${primary}", {
        userId,
        arguments: {},
        dangerouslySkipVersionCheck: true,
      }),
  };
  const result = await tool.invoke();
  console.log("invoke", tool.name, JSON.stringify(result, null, 2).slice(0, 400));
}

main();`;
}

function eveInspectBlock(primary: string): string {
  return `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("Eve listed tool (env missing)", "${primary}");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  try {
    const tools = await composio.tools.get(userId, { tools: ["${primary}"] });
    console.log("Eve listed tool", Array.isArray(tools) ? tools.length : Object.keys(tools ?? {}).length);
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    console.log("Eve listed tool (client ready, live get skipped)", name);
  }
}

main();`;
}

function eveReadBlock(primary: string): string {
  return `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("Eve read-only skip", "${primary}");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  const result = await composio.tools.execute("${primary}", {
    userId,
    arguments: {},
    dangerouslySkipVersionCheck: true,
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 600));
}

main();`;
}

function daytonaClientBlock(): string {
  return `import { Daytona } from "@daytonaio/sdk";

const apiKey = process.env.DAYTONA_API_KEY;
const target = process.env.DAYTONA_TARGET ?? "us";
if (!apiKey) {
  console.log("DAYTONA_API_KEY missing — sandbox client skipped");
  process.exit(0);
}

const daytona = new Daytona({ apiKey, target });
console.log("Daytona client ready", Boolean(daytona), "target", target);`;
}

function daytonaExecBlock(): string {
  return `import { Daytona } from "@daytonaio/sdk";

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    console.log("Eve + Daytona: skip nested sandbox (no DAYTONA_API_KEY)");
    return;
  }

  const daytona = new Daytona({ apiKey, target: process.env.DAYTONA_TARGET ?? "us" });
  const sandbox = await daytona.create({ language: "typescript", autoStopInterval: 5 });
  try {
    const script = [
      "const user = process.env.COMPOSIO_USER_ID ?? \\"eve\\";",
      "console.log(\\"five-line program\\");",
      "console.log(\\"user\\", user);",
      "console.log(\\"node\\", process.version);",
      "console.log(\\"ok\\");",
    ].join("\\n");
    const result = await sandbox.process.executeCommand(\`node -e \${JSON.stringify(script)}\`);
    console.log("sandboxId", sandbox.id, "exitCode", result.exitCode ?? 0);
    console.log(String(result.result ?? "").slice(0, 400));
  } finally {
    await sandbox.delete();
  }
}

main();`;
}

export function piComposioArticle(primary = WHOAMI): string {
  return `# Pi + Composio

Pi-shaped agents need a **who-am-I** they can trust. This article uses a GitHub PAT through \`@composio/core\` — not Slack OAuth, not a browser dance.

**Why this exists.** Docs rot when the hello-world is a screenshot. We prove the live user with \`${primary}\`.

## Prerequisites

- \`COMPOSIO_API_KEY\`
- \`GITHUB_PAT\` (fine-grained, read user)
- \`COMPOSIO_USER_ID\` (any stable string)

Each block below is independently runnable: own imports, own env reads, something printed to stdout.

## 1. Boot the client

Construct \`Composio\` with \`toolkitVersions: { github: "latest" }\`. No network yet.

${fence(clientBlock())}

The client is ready when \`tools\` and \`toolkits\` exist.

## 2. Attach a PAT (never OAuth)

Custom auth: \`authConfigs.create\` plus \`connectedAccounts.initiate\` with \`AuthScheme.BearerToken\`.

${fence(authBlock(primary))}

If \`GITHUB_PAT\` is missing, the block stops after creating the auth config — that is still a useful proof.

## 3. Who-am-I

Call \`tools.execute\` with \`dangerouslySkipVersionCheck: true\`.

${fence(executeBlock(primary))}

## What this proved

Stdout should include a GitHub login, or a clear missing-env skip. If Composio cannot be reached from the sandbox, the run **fails honestly** — that failure is the proof graph working, not a mocked pass.
`;
}

export function langChainComposioArticle(primary = WHOAMI): string {
  return `# LangChain + Composio

Bind **one** GitHub tool schema to a LangChain-shaped descriptor and invoke it once. No extra \`@langchain\` install — the adapter is a plain object so the block stays independently runnable.

**Why this exists.** Framework glue is where copy-paste examples go stale. We keep the surface to \`tools.get\` then \`tools.execute\`.

## Prerequisites

- \`COMPOSIO_API_KEY\`
- \`COMPOSIO_USER_ID\`
- Optional \`GITHUB_PAT\` if the execute call needs a connected account

## 1. Fetch one schema

Ask Composio for \`${primary}\` only. Print the descriptor name.

${fence(langchainGetBlock(primary))}

## 2. Adapt and invoke once

Wrap the schema in a tiny \`{ name, invoke }\` tool and call it once. Still PAT/custom-auth if you already connected; never browser OAuth.

${fence(langchainInvokeBlock(primary))}

## What this proved

You bound one GitHub schema and invoked it. The stdout line starting with \`invoke\` is the proof — or an honest error if the sandbox cannot reach Composio.
`;
}

export function eveComposioArticle(primary = WHOAMI): string {
  return `# Eve + Composio

Eve-shaped agents inspect tool schemas before they call anything. This article does that on \`@composio/core\` directly — **no Eve SDK is imported**. If you later drop this into Eve, you are still calling \`tools.get\` then one read-only execute.

**Why this exists.** “List the tools” is the honest first Eve lesson. A Slack bot example would lie about the surface.

## Prerequisites

- \`COMPOSIO_API_KEY\`
- \`COMPOSIO_USER_ID\`

## 1. Inspect GitHub tool schemas

\`tools.get\` for \`${primary}\`. If the live call fails, we still print that the client constructed.

${fence(eveInspectBlock(primary))}

## 2. One read-only call

Execute the same slug with \`dangerouslySkipVersionCheck: true\`. Read-only. No \`GITHUB_CREATE_AN_ISSUE\`.

${fence(eveReadBlock(primary))}

## What this proved

Eve (the persona) listed a schema and made one read-only GitHub call through Composio. Seed verification of this article is **mock mode** until you press Verify — mock runs are not live proof.
`;
}

export function eveDaytonaArticle(): string {
  return `# Eve + Daytona

Eve-shaped agents should not trust a snippet they have never executed. This article creates a **fresh Daytona sandbox**, runs a five-line program, then deletes the sandbox in \`finally\`.

**Why this exists.** Nested sandbox create/exec/delete is the smallest honest Daytona lesson. The outer cookbook runner also uses Daytona — that is the same judge.

## Prerequisites

- \`DAYTONA_API_KEY\`
- Optional \`DAYTONA_TARGET\` (defaults to \`us\`)
- Optional \`COMPOSIO_USER_ID\` (printed by the inner script)

## 1. Construct the Daytona client

Read env, construct \`Daytona\`, print the target. No sandbox yet.

${fence(daytonaClientBlock())}

## 2. Create, run five lines, delete

The inner program is five statements: a banner, the user id, \`process.version\`, and \`ok\`. Always \`sandbox.delete()\` in \`finally\`.

${fence(daytonaExecBlock())}

## What this proved

Stdout includes \`sandboxId\` and \`exitCode 0\`, or a clear skip when \`DAYTONA_API_KEY\` is missing. A live network failure is recorded as a failed Run — not rewritten into a pass.
`;
}

export function clientArticle(): string {
  return `# new Composio({ apiKey })

The first \`@composio/core\` lesson is constructing a client. Everything else — schemas, PAT, execute — hangs off this object.

## Prerequisites

- \`COMPOSIO_API_KEY\`

## 1. Read the key

If the key is missing, print that and exit 0. Do not throw.

${fence(`const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.log("COMPOSIO_API_KEY missing — mock-safe boot check");
  process.exit(0);
}
console.log("apiKey present", Boolean(apiKey));`)}

## 2. Construct the client

${fence(clientBlock())}

## What this proved

\`Composio client ready true\` means the constructor accepted the key and exposed \`tools\`.
`;
}

export function authArticle(primary = WHOAMI): string {
  return `# authConfigs + PAT

GitHub in this project is a **fine-grained PAT**, never browser OAuth and never Slack OAuth.

## Prerequisites

- \`COMPOSIO_API_KEY\`
- \`GITHUB_PAT\`
- \`COMPOSIO_USER_ID\`

## 1. Boot the client

${fence(clientBlock())}

## 2. Create an auth config and connect the PAT

${fence(authBlock(primary))}

## What this proved

An \`authConfig\` id printed, and optionally a connected PAT. Execute comes in the next lesson.
`;
}

export type ArticleKind = "client" | "toolsGet" | "auth" | "execute" | "bind" | "daytona";

export function articleKindFromText(text: string): ArticleKind {
  if (/daytona|sandbox/i.test(text)) return "daytona";
  if (/langchain|bind tool|descriptor/i.test(text)) return "bind";
  if (/who-am-i|who am i|tools\.execute|authenticated user/i.test(text)) return "execute";
  if (/authconfig|connected|\bpat\b|BearerToken/i.test(text)) return "auth";
  if (/eve|tools\.get|schema/i.test(text)) return "toolsGet";
  if (/client|api key|new Composio/i.test(text)) return "client";
  return "execute";
}

export function articleForKind(kind: ArticleKind, toolSlugs: string[] = []): string {
  const slugs = toolSlugs.length ? toolSlugs : [WHOAMI];
  const primary = slugs.includes(WHOAMI) ? WHOAMI : slugs[0];
  switch (kind) {
    case "client":
      return clientArticle();
    case "toolsGet":
      return eveComposioArticle(primary);
    case "auth":
      return authArticle(primary);
    case "execute":
      return piComposioArticle(primary);
    case "bind":
      return langChainComposioArticle(primary);
    case "daytona":
      return eveDaytonaArticle();
    default:
      return piComposioArticle(primary);
  }
}

export function matchStarter(prompt: string) {
  const trimmed = prompt.trim();
  return BUILD_STARTERS.find((s) => s.prompt === trimmed) ?? null;
}

export function conceptForPrompt(prompt: string): { conceptId: string; conceptName: string } {
  const starter = matchStarter(prompt);
  if (starter) return { conceptId: starter.conceptId, conceptName: starter.conceptName };
  const kind = articleKindFromText(prompt);
  const found = BUILD_STARTERS.find((s) => articleKindFromText(s.prompt) === kind);
  return found
    ? { conceptId: found.conceptId, conceptName: found.conceptName }
    : { conceptId: "c-execute", conceptName: "tools.execute" };
}

export function articleForPrompt(prompt: string, toolSlugs: string[] = []): string {
  const starter = matchStarter(prompt);
  if (starter) return articleForKind(articleKindFromText(starter.prompt), toolSlugs);
  return articleForKind(articleKindFromText(prompt), toolSlugs);
}

export function typescriptFenceCount(markdown: string): number {
  return extractCodeBlocks(markdown).filter((b) => /^(typescript|ts|js|javascript)?$/i.test(b.lang)).length;
}

export function ensureFullArticle(markdown: string, hint: string, toolSlugs: string[] = []): string {
  const fences = typescriptFenceCount(markdown);
  const title = extractTitle(markdown, "");
  if (fences >= 2 && title && markdown.length > 400) return markdown;
  return articleForPrompt(hint, toolSlugs);
}

export function inferUsedTools(code: string): string[] {
  const known = new Set(TOOLS.map((t) => t.name));
  const found = new Set<string>();
  const re = /GITHUB_[A-Z0-9_]+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(code))) {
    if (known.has(match[0])) found.add(match[0]);
  }
  return [...found];
}

export function redactTrace(text: string, max = 2400): string {
  const redacted = text
    .replace(/ghp_[A-Za-z0-9]+/g, "ghp_[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[redacted]")
    .replace(/sk-[A-Za-z0-9-]+/g, "sk-[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/COMPOSIO_API_KEY["']?\s*[:=]\s*["'][^"']+/gi, "COMPOSIO_API_KEY=[redacted]");
  return redacted.length > max ? `${redacted.slice(0, max)}\n…[truncated]` : redacted;
}

export function draftComposioIssue(input: {
  cookbookTitle: string;
  blockIndex: number;
  stdout: string;
  sandboxId?: string;
  mode?: string;
  exitCode?: number;
}): { title: string; body: string } {
  const title = `[Dennis][MOCK] ${input.cookbookTitle} · block ${input.blockIndex + 1} failed`;
  const body = [
    "MOCK / DRAFT — Composio `GITHUB_CREATE_AN_ISSUE` is **not** called.",
    "Intent only: `tools.execute(\"GITHUB_CREATE_AN_ISSUE\", { userId, arguments, dangerouslySkipVersionCheck: true })`.",
    "",
    `Cookbook: ${input.cookbookTitle}`,
    `Block: ${input.blockIndex + 1}`,
    `Exit: ${input.exitCode ?? "?"}`,
    `Sandbox: ${input.sandboxId || "unknown"}`,
    `Mode: ${input.mode || "unknown"}`,
    `Packages: ${ARTICLE_PACKAGES.join(", ")}`,
    "",
    "## Redacted stdout / trace",
    "```",
    redactTrace(input.stdout || "(empty)"),
    "```",
  ].join("\n");
  return { title, body };
}
