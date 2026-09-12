import {
  eveComposioArticle,
  eveDaytonaArticle,
  inferUsedTools,
  langChainComposioArticle,
  piComposioArticle,
} from "./articles";
import { extractCodeBlocks } from "./markdown";
import { SDK_SOURCE } from "./sdk-source.generated";
import type { SeedConcept, SeedCookbook, SeedLink } from "./seed";

const DOCUMENTED_SOURCE_IDS = new Set([
  "c-client",
  "c-tools-get",
  "c-auth-configs",
  "c-connected-accounts",
]);

/**
 * Generated from the newest available @composio/core source by
 * scripts/sync-sdk-source.ts. Cookbook fences add COVERS/USES proof below.
 */
export const CONCEPTS: SeedConcept[] = [
  ...SDK_SOURCE.concepts.map((concept) => ({
    ...concept,
    documented: DOCUMENTED_SOURCE_IDS.has(concept.id),
    sourcePackage: SDK_SOURCE.packageName,
    sourceVersion: SDK_SOURCE.packageVersion,
    sourceKind: SDK_SOURCE.sourceKind,
  })),
  {
    id: "c-daytona-exec",
    name: "Daytona sandbox verification",
    documented: false,
    sourcePackage: "@daytonaio/sdk",
    sourceVersion: "0.211.2",
    sourcePath: "lib/daytona.ts",
    sourceSymbol: "runCodeBlock",
    sourceKind: "verification-boundary",
    evidence: "fresh sandbox per block",
  },
];

export const DOCUMENTED_PREREQ_IDS = CONCEPTS.filter((c) => c.documented).map((c) => c.id);

export const SIMPLE_CONCEPT_IDS = [
  "c-client",
  "c-toolkits",
  "c-tools-get",
  "c-auth-configs",
  "c-connected-accounts",
  "c-execute",
  "c-sessions",
  "c-triggers",
  "c-tool-bind",
  "c-daytona-exec",
] as const;

export const LEGACY_CONCEPT_IDS = [
  "c-install",
  "c-auth-pat",
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
  { from: "c-client", to: "c-toolkits", type: "PREREQ_OF" },
  { from: "c-toolkits", to: "c-tools-get", type: "PREREQ_OF" },
  { from: "c-client", to: "c-auth-configs", type: "PREREQ_OF" },
  { from: "c-auth-configs", to: "c-connected-accounts", type: "PREREQ_OF" },
  { from: "c-tools-get", to: "c-execute", type: "PREREQ_OF" },
  { from: "c-connected-accounts", to: "c-execute", type: "PREREQ_OF" },
  { from: "c-connected-accounts", to: "c-sessions", type: "PREREQ_OF" },
  { from: "c-sessions", to: "c-triggers", type: "PREREQ_OF" },
  { from: "c-tools-get", to: "c-tool-bind", type: "PREREQ_OF" },
  { from: "c-client", to: "c-daytona-exec", type: "PREREQ_OF" },
  { from: "tk-github", to: "GITHUB_GET_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_CREATE_AN_ISSUE", type: "EXPOSES" },
  { from: "tk-github", to: "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER", type: "EXPOSES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-tools-get", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-auth-configs", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-connected-accounts", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-execute", type: "DEMONSTRATES" },
  { from: "GITHUB_GET_THE_AUTHENTICATED_USER", to: "c-tool-bind", type: "DEMONSTRATES" },
];

const CONTENT_SIGNALS: { id: string; pattern: RegExp }[] = [
  { id: "c-client", pattern: /new\s+Composio\s*\(/ },
  { id: "c-toolkits", pattern: /composio\.toolkits\./ },
  { id: "c-tools-get", pattern: /composio\.tools\.get\s*\(/ },
  { id: "c-auth-configs", pattern: /authConfigs\.create\s*\(/ },
  { id: "c-connected-accounts", pattern: /connectedAccounts\.initiate\s*\(/ },
  { id: "c-execute", pattern: /tools\.execute\s*\(/ },
  { id: "c-sessions", pattern: /(?:sessions\.create|composio\.create)\s*\(/ },
  { id: "c-triggers", pattern: /triggers\.(?:create|subscribe)\s*\(/ },
  { id: "c-tool-bind", pattern: /(?:LangChain|bind tool|invoke\s*:)/i },
  { id: "c-daytona-exec", pattern: /(?:new\s+Daytona|daytona\.create)\s*\(/i },
];

/** Maps the actual article/code content back to source-derived SDK concepts. */
export function inferCoveredConceptIds(markdown: string): string[] {
  return CONTENT_SIGNALS.filter(({ pattern }) => pattern.test(markdown)).map(({ id }) => id);
}

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
    covers: ["c-auth-configs", "c-connected-accounts"],
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
