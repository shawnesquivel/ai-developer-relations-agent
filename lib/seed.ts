export type SeedConcept = { id: string; name: string; documented: boolean };
export type SeedToolkit = { id: string; name: string; slug: string };
export type SeedTool = { id: string; name: string; description: string };
export type SeedLink = { from: string; to: string; type: string };
export type SeedCookbook = {
  id: string;
  name: string;
  title: string;
  conceptId: string;
  /** Extra concepts this cookbook COVERS/TEACHES besides conceptId. */
  covers?: string[];
  markdown: string;
  documented: boolean;
  provider: string;
  createdAt: string;
  verifiedAt?: string;
  blocks: { id: string; index: number; lang: string; code: string }[];
  uses?: { blockId: string; slug: string }[];
  runs: {
    blockId: string;
    id: string;
    status: "pass" | "fail";
    exitCode: number;
    stdout: string;
    sandboxId: string;
    at: string;
    mode: "live" | "mock";
  }[];
};

export const TOOLKITS: SeedToolkit[] = [{ id: "tk-github", name: "GITHUB", slug: "github" }];

export const TOOLS: SeedTool[] = [
  {
    id: "GITHUB_GET_THE_AUTHENTICATED_USER",
    name: "GITHUB_GET_THE_AUTHENTICATED_USER",
    description: "Return the authenticated GitHub user (read-only proof).",
  },
  {
    id: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    name: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    description: "List repositories for the authenticated GitHub user.",
  },
  {
    id: "GITHUB_CREATE_AN_ISSUE",
    name: "GITHUB_CREATE_AN_ISSUE",
    description: "Create an issue. Mutating — demo only after the read-only call is green.",
  },
  {
    id: "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    name: "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER",
    description: "Star a repository for the authenticated user.",
  },
];
