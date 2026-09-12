export type RunStatus = "pass" | "fail";
export type RunMode = "live" | "mock";

export type RunRecord = {
  id: string;
  status: RunStatus;
  exitCode: number;
  stdout: string;
  sandboxId: string;
  at: string;
  mode: RunMode;
};

export type CodeBlock = {
  id: string;
  index: number;
  lang: string;
  code: string;
  latestRun: RunRecord | null;
};

export type Cookbook = {
  id: string;
  title: string;
  conceptId: string;
  conceptName: string;
  markdown: string;
  documented: boolean;
  createdAt: string;
  provider: string;
  verifiedAt?: string;
  blocks: CodeBlock[];
};

export type BrokenCookbook = {
  id: string;
  title: string;
  blockIndex: number;
  stdout: string;
};

export type PlanCandidate = {
  conceptId: string;
  conceptName: string;
  unlocks: number;
};

export type PlanResult = {
  conceptId: string;
  conceptName: string;
  unlocks: number;
  unlockedNames: string[];
  candidates: PlanCandidate[];
  mode: RunMode;
  cypher: string;
};

export type GraphNode = {
  id: string;
  label: string;
  name: string;
  documented?: boolean;
  status?: RunStatus;
};

export type GraphLink = {
  source: string;
  target: string;
  type: string;
};

export type IntegrationMode = "live" | "mock";
