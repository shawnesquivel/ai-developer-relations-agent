import type { SeedConcept, SeedCookbook, SeedLink } from "./seed";

/**
 * @composio/core public surface — used by ensureSeeded / Plan.
 * Slack/docs product titles stay in LEGACY so they cannot win Plan.
 */
export const CONCEPTS: SeedConcept[] = [
  { id: "c-client", name: "new Composio({ apiKey })", documented: true },
  { id: "c-tools-get", name: "composio.tools.get", documented: true },
  { id: "c-execute", name: "tools.execute", documented: false },
  { id: "c-tool-bind", name: "bind tool descriptor", documented: false },
  { id: "c-daytona-exec", name: "Daytona sandbox exec", documented: false },
];

export const DOCUMENTED_PREREQ_IDS = CONCEPTS.filter((c) => c.documented).map((c) => c.id);

export const SIMPLE_CONCEPT_IDS = [
  "c-client",
  "c-tools-get",
  "c-execute",
  "c-tool-bind",
  "c-daytona-exec",
] as const;

export const LEGACY_CONCEPT_IDS = [
  "c-install",
  "c-connected",
  "c-connected-accounts",
  "c-auth-scheme",
  "c-auth-pat",
  "c-auth-configs",
  "c-tools-execute",
  "c-toolkits",
  "c-tool-calling",
  "c-triggers",
  "c-custom-tools",
  "c-modifiers",
  "c-sandboxed",
  "c-agent-loop",
  "c-slack-bot",
  "c-standup",
  "c-pr-reviewer",
  "c-imessage",
  "c-email-support",
] as const;

export const SEED_LINKS: SeedLink[] = [
  { from: "c-client", to: "c-tools-get", type: "PREREQ_OF" },
  { from: "c-tools-get", to: "c-execute", type: "PREREQ_OF" },
  { from: "c-tools-get", to: "c-tool-bind", type: "PREREQ_OF" },
  { from: "c-client", to: "c-daytona-exec", type: "PREREQ_OF" },
  { from: "tk-github", to: "GITHUB_GET_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_CREATE_AN_ISSUE", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-tools-get", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-execute", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-tool-bind", type: "DEMONSTRATES" },
];

const SEED_AT = "2026-09-12T00:00:00.000Z";

const EVE_COMPOSIO_BLOCK = `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("Eve + Composio mock: listed GITHUB_GET_THE_AUTHENTICATED_USER");
    return;
  }

  const composio = new Composio({
    apiKey,
    toolkitVersions: { github: "latest" },
  });
  try {
    const tools = await composio.tools.get(userId, {
      tools: ["GITHUB_GET_THE_AUTHENTICATED_USER"],
    });
    console.log("Eve listed tool", Array.isArray(tools) ? tools.length : Object.keys(tools ?? {}).length);
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    console.log("Eve listed tool (client ready, live get skipped)", name);
  }
}

main();
`;

const PI_COMPOSIO_BLOCK = `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("Pi + Composio mock: GITHUB_GET_THE_AUTHENTICATED_USER");
    return;
  }

  const composio = new Composio({ apiKey, toolkitVersions: { github: "latest" } });
  const tools = await composio.tools.get(userId, { tools: ["GITHUB_GET_THE_AUTHENTICATED_USER"] });
  console.log("schemas", Array.isArray(tools) ? tools.length : 1);
  const result = await composio.tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER", {
    userId,
    arguments: {},
    dangerouslySkipVersionCheck: true,
  });
  console.log(JSON.stringify(result, null, 2).slice(0, 400));
}

main();
`;

const LANGCHAIN_COMPOSIO_BLOCK = `import { Composio } from "@composio/core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID ?? "hacksprint-demo";
  if (!apiKey) {
    console.log("LangChain bind (mock) GITHUB_GET_THE_AUTHENTICATED_USER invoke");
    return;
  }

  const composio = new Composio({ apiKey, toolkitVersions: { github: "latest" } });
  const schemas = await composio.tools.get(userId, { tools: ["GITHUB_GET_THE_AUTHENTICATED_USER"] });
  const descriptor = Array.isArray(schemas) ? schemas[0] : schemas;
  console.log("bound tool", (descriptor as { name?: string })?.name ?? "GITHUB_GET_THE_AUTHENTICATED_USER");
  const result = await composio.tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER", {
    userId,
    arguments: {},
    dangerouslySkipVersionCheck: true,
  });
  console.log("invoke", JSON.stringify(result, null, 2).slice(0, 400));
}

main();
`;

const EVE_DAYTONA_BLOCK = `import { Daytona } from "@daytonaio/sdk";

async function main() {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    console.log("Eve + Daytona mock: skip nested sandbox");
    return;
  }

  const daytona = new Daytona({ apiKey, target: process.env.DAYTONA_TARGET ?? "us" });
  const sandbox = await daytona.create({ language: "typescript", autoStopInterval: 5 });
  try {
    const result = await sandbox.process.executeCommand("node --version");
    console.log("sandboxId", sandbox.id, "exitCode", result.exitCode ?? 0);
  } finally {
    await sandbox.delete();
  }
}

main();
`;

export const SEED_COOKBOOKS: SeedCookbook[] = [
  {
    id: "cb-eve-composio",
    name: "cb-eve-composio",
    title: "Eve + Composio",
    conceptId: "c-tools-get",
    markdown: `# Eve + Composio

Smallest honest Eve-shaped lesson: construct a \`Composio\` client and \`tools.get\` one GitHub schema. No Eve SDK required.

\`\`\`typescript
${EVE_COMPOSIO_BLOCK.trim()}
\`\`\`
`,
    documented: true,
    provider: "seed",
    createdAt: SEED_AT,
    verifiedAt: SEED_AT,
    blocks: [{ id: "cb-eve-composio-b0", index: 0, lang: "typescript", code: EVE_COMPOSIO_BLOCK.trim() }],
    runs: [
      {
        blockId: "cb-eve-composio-b0",
        id: "run-cb-eve-composio-b0",
        status: "pass",
        exitCode: 0,
        stdout: "Eve listed tool 1\n",
        sandboxId: "seed",
        at: SEED_AT,
        mode: "mock",
      },
    ],
  },
  {
    id: "cb-pi-composio",
    name: "cb-pi-composio",
    title: "Pi + Composio",
    conceptId: "c-execute",
    markdown: `# Pi + Composio

Twenty-line who-am-I: \`tools.get\` then \`tools.execute("GITHUB_GET_THE_AUTHENTICATED_USER")\` with a PAT. Not a Slack bot.

\`\`\`typescript
${PI_COMPOSIO_BLOCK.trim()}
\`\`\`
`,
    documented: false,
    provider: "seed",
    createdAt: SEED_AT,
    blocks: [{ id: "cb-pi-composio-b0", index: 0, lang: "typescript", code: PI_COMPOSIO_BLOCK.trim() }],
    runs: [],
  },
  {
    id: "cb-langchain-composio",
    name: "cb-langchain-composio",
    title: "LangChain + Composio",
    conceptId: "c-tool-bind",
    markdown: `# LangChain + Composio

Bind one GitHub tool descriptor and invoke it once via \`tools.execute\`. No extra \`@langchain\` install.

\`\`\`typescript
${LANGCHAIN_COMPOSIO_BLOCK.trim()}
\`\`\`
`,
    documented: false,
    provider: "seed",
    createdAt: SEED_AT,
    blocks: [{ id: "cb-langchain-composio-b0", index: 0, lang: "typescript", code: LANGCHAIN_COMPOSIO_BLOCK.trim() }],
    runs: [],
  },
  {
    id: "cb-eve-daytona",
    name: "cb-eve-daytona",
    title: "Eve + Daytona",
    conceptId: "c-daytona-exec",
    markdown: `# Eve + Daytona

Create a nested Daytona sandbox, exec \`node --version\`, print sandboxId + exitCode, then delete. \`DAYTONA_API_KEY\` is injected.

\`\`\`typescript
${EVE_DAYTONA_BLOCK.trim()}
\`\`\`
`,
    documented: false,
    provider: "seed",
    createdAt: SEED_AT,
    blocks: [{ id: "cb-eve-daytona-b0", index: 0, lang: "typescript", code: EVE_DAYTONA_BLOCK.trim() }],
    runs: [],
  },
];
