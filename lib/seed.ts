// Concept graph for the Composio SDK. Real toolkit/tool slugs from Composio's GitHub toolkit.

export interface SeedNode {
  id: string;
  label: "Concept" | "Toolkit" | "Tool";
  props: Record<string, unknown>;
}

export interface SeedLink {
  from: string;
  to: string;
  type: "PREREQ_OF" | "EXPOSES" | "DEMONSTRATES";
}

export const CONCEPTS: SeedNode[] = [
  { id: "c-install", label: "Concept", props: { name: "Install & API key", documented: true } },
  { id: "c-toolkits", label: "Concept", props: { name: "Toolkits & tool schemas", documented: true } },
  { id: "c-connected", label: "Concept", props: { name: "Connected accounts (PAT)", documented: false } },
  { id: "c-tool-calling", label: "Concept", props: { name: "Tool calling with an LLM", documented: false } },
  { id: "c-execute", label: "Concept", props: { name: "Executing a tool directly", documented: false } },
  { id: "c-agent-loop", label: "Concept", props: { name: "Multi-step agent loop", documented: false } },
  { id: "c-triggers", label: "Concept", props: { name: "Triggers & webhooks", documented: false } },
  { id: "c-custom-tools", label: "Concept", props: { name: "Custom tools", documented: false } },
  { id: "c-modifiers", label: "Concept", props: { name: "Schema & response modifiers", documented: false } },
  { id: "c-sandboxed", label: "Concept", props: { name: "Sandboxed tool execution", documented: false } },
];

export const TOOLKITS: SeedNode[] = [{ id: "tk-github", label: "Toolkit", props: { name: "GITHUB", slug: "github" } }];

export const TOOLS: SeedNode[] = [
  { id: "t-github-list-repos", label: "Tool", props: { name: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER" } },
  { id: "t-github-create-issue", label: "Tool", props: { name: "GITHUB_CREATE_AN_ISSUE" } },
  { id: "t-github-get-user", label: "Tool", props: { name: "GITHUB_GET_THE_AUTHENTICATED_USER" } },
  { id: "t-github-star", label: "Tool", props: { name: "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER" } },
];

export const SEED_LINKS: SeedLink[] = [
  { from: "c-install", to: "c-toolkits", type: "PREREQ_OF" },
  { from: "c-install", to: "c-connected", type: "PREREQ_OF" },
  { from: "c-toolkits", to: "c-tool-calling", type: "PREREQ_OF" },
  { from: "c-connected", to: "c-tool-calling", type: "PREREQ_OF" },
  { from: "c-connected", to: "c-execute", type: "PREREQ_OF" },
  { from: "c-tool-calling", to: "c-agent-loop", type: "PREREQ_OF" },
  { from: "c-tool-calling", to: "c-modifiers", type: "PREREQ_OF" },
  { from: "c-execute", to: "c-triggers", type: "PREREQ_OF" },
  { from: "c-agent-loop", to: "c-sandboxed", type: "PREREQ_OF" },
  { from: "c-toolkits", to: "c-custom-tools", type: "PREREQ_OF" },
  { from: "tk-github", to: "t-github-list-repos", type: "EXPOSES" },
  { from: "tk-github", to: "t-github-create-issue", type: "EXPOSES" },
  { from: "tk-github", to: "t-github-get-user", type: "EXPOSES" },
  { from: "tk-github", to: "t-github-star", type: "EXPOSES" },
  { from: "t-github-list-repos", to: "c-tool-calling", type: "DEMONSTRATES" },
  { from: "t-github-create-issue", to: "c-tool-calling", type: "DEMONSTRATES" },
  { from: "t-github-get-user", to: "c-execute", type: "DEMONSTRATES" },
  { from: "t-github-star", to: "c-execute", type: "DEMONSTRATES" },
];

export interface SeedCookbook {
  id: string;
  title: string;
  conceptId: string;
  markdown: string;
  /** Simulated verification outcome for each code block, in order. */
  runs: { status: "pass" | "fail"; stdout: string }[];
}

export const SEED_COOKBOOKS: SeedCookbook[] = [
  {
    id: "cb-install",
    title: "Install Composio and make your first call",
    conceptId: "c-install",
    markdown: `# Install Composio and make your first call

Composio gives your agent authenticated access to 500+ apps through one SDK. Install it, set an API key, and check the client boots.

\`\`\`typescript
import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
console.log("Composio client ready:", typeof composio.tools.get === "function");
\`\`\`

That is the whole setup. Every other cookbook starts from this line.
`,
    runs: [{ status: "pass", stdout: "Composio client ready: true" }],
  },
  {
    id: "cb-connected",
    title: "Connect GitHub with a personal access token",
    conceptId: "c-connected",
    markdown: `# Connect GitHub with a personal access token

Tool execution needs a **connected account**. For servers, CI and demos you do not want a browser OAuth redirect — a bearer-token auth config plus a PAT gives you an ACTIVE account in one call.

\`\`\`typescript
import { AuthScheme, Composio } from "@composio/core";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const authConfig = await composio.authConfigs.create("github", {
  type: "use_custom_auth",
  authScheme: "BEARER_TOKEN",
  credentials: {},
  name: "github-pat",
});
const conn = await composio.connectedAccounts.initiate("demo-user", authConfig.id, {
  config: AuthScheme.BearerToken({ token: process.env.GITHUB_PAT! }),
});
console.log("connected:", conn.id, conn.status);
\`\`\`

Store the connected account id if you need to reuse it; \`initiate\` is idempotent enough for demos.
`,
    runs: [{ status: "pass", stdout: "connected: ca_8f3k2 ACTIVE" }],
  },
  {
    id: "cb-toolkits",
    title: "Browse toolkits and read a tool schema",
    conceptId: "c-toolkits",
    markdown: `# Browse toolkits and read a tool schema

A **toolkit** is an app (GitHub, Slack, Notion). Each exposes **tools** with JSON schemas an LLM can call. Fetch the GitHub toolkit's tools and print one schema.

\`\`\`typescript
import { Composio } from "@composio/core";

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
const tools = await composio.tools.get("demo-user", { toolkits: ["github"], limit: 5 });
console.log(\`GitHub exposes \${tools.length} tools; first:\`);
console.log(JSON.stringify(tools[0], null, 2).slice(0, 400));
\`\`\`

Tool schemas are OpenAI function-calling compatible, so they drop straight into any chat completion request.

\`\`\`typescript
const names = ["GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", "GITHUB_CREATE_AN_ISSUE"];
console.log("Tools this cookbook relies on:", names.join(", "));
\`\`\`
`,
    runs: [
      { status: "pass", stdout: "GitHub exposes 5 tools; first:\n{\n  \"type\": \"function\",\n  \"function\": {\n    \"name\": \"GITHUB_CREATE_AN_ISSUE\", …" },
      { status: "fail", stdout: "ReferenceError: names is not defined\n    at block.ts:1:12\n[exit 1] — block 1 and 2 no longer share scope after the SDK 0.18 example refactor" },
    ],
  },
];
