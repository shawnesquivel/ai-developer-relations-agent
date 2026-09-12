import {
  eveComposioArticle,
  eveDaytonaArticle,
  inferUsedTools,
  langChainComposioArticle,
  piComposioArticle,
} from "./articles";
import { extractCodeBlocks } from "./markdown";
import type { SeedConcept, SeedCookbook, SeedLink } from "./seed";

/**
 * @composio/core public surface — used by ensureSeeded / Plan.
 * Slack/docs product titles stay in LEGACY so they cannot win Plan.
 */
export const CONCEPTS: SeedConcept[] = [
  { id: "c-client", name: "new Composio({ apiKey })", documented: true },
  { id: "c-tools-get", name: "composio.tools.get", documented: true },
  { id: "c-auth-pat", name: "authConfigs + PAT", documented: true },
  { id: "c-execute", name: "tools.execute", documented: false },
  { id: "c-tool-bind", name: "bind tool descriptor", documented: false },
  { id: "c-daytona-exec", name: "Daytona sandbox exec", documented: false },
];

export const DOCUMENTED_PREREQ_IDS = CONCEPTS.filter((c) => c.documented).map((c) => c.id);

export const SIMPLE_CONCEPT_IDS = [
  "c-client",
  "c-tools-get",
  "c-auth-pat",
  "c-execute",
  "c-tool-bind",
  "c-daytona-exec",
] as const;

export const LEGACY_CONCEPT_IDS = [
  "c-install",
  "c-connected",
  "c-connected-accounts",
  "c-auth-scheme",
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
  { from: "c-tools-get", to: "c-auth-pat", type: "PREREQ_OF" },
  { from: "c-auth-pat", to: "c-execute", type: "PREREQ_OF" },
  { from: "c-tools-get", to: "c-tool-bind", type: "PREREQ_OF" },
  { from: "c-client", to: "c-daytona-exec", type: "PREREQ_OF" },
  { from: "tk-github", to: "GITHUB_GET_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_CREATE_AN_ISSUE", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-tools-get", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-auth-pat", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-execute", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-tool-bind", type: "DEMONSTRATES" },
];

const SEED_AT = "2026-09-12T00:00:00.000Z";

function seedFromArticle(input: {
  id: string;
  title: string;
  conceptId: string;
  covers?: string[];
  markdown: string;
  documented: boolean;
  verifiedAt?: string;
}): SeedCookbook {
  const blocks = extractCodeBlocks(input.markdown).map((block, index) => ({
    id: `${input.id}-b${index}`,
    index: block.index,
    lang: block.lang || "typescript",
    code: block.code,
  }));
  if (blocks.length < 2) {
    throw new Error(`Seed ${input.id} must have 2+ TypeScript fences`);
  }
  const uses = blocks.flatMap((block) =>
    inferUsedTools(block.code).map((slug) => ({ blockId: block.id, slug })),
  );
  const runs = input.documented
    ? blocks.map((block) => ({
        blockId: block.id,
        id: `run-${block.id}`,
        status: "pass" as const,
        exitCode: 0,
        stdout: `seed mock pass · ${input.title} · block ${block.index + 1}\n`,
        sandboxId: "seed",
        at: SEED_AT,
        mode: "mock" as const,
      }))
    : [];
  return {
    id: input.id,
    name: input.title,
    title: input.title,
    conceptId: input.conceptId,
    covers: input.covers,
    markdown: input.markdown,
    documented: input.documented,
    provider: "seed",
    createdAt: SEED_AT,
    verifiedAt: input.verifiedAt,
    blocks,
    runs,
    uses,
  };
}

export const SEED_COOKBOOKS: SeedCookbook[] = [
  seedFromArticle({
    id: "cb-eve-composio",
    title: "Eve + Composio",
    conceptId: "c-tools-get",
    markdown: eveComposioArticle(),
    documented: true,
    verifiedAt: SEED_AT,
  }),
  seedFromArticle({
    id: "cb-pi-composio",
    title: "Pi + Composio",
    conceptId: "c-execute",
    covers: ["c-auth-pat"],
    markdown: piComposioArticle(),
    documented: false,
  }),
  seedFromArticle({
    id: "cb-langchain-composio",
    title: "LangChain + Composio",
    conceptId: "c-tool-bind",
    markdown: langChainComposioArticle(),
    documented: false,
  }),
  seedFromArticle({
    id: "cb-eve-daytona",
    title: "Eve + Daytona",
    conceptId: "c-daytona-exec",
    markdown: eveDaytonaArticle(),
    documented: false,
  }),
];
