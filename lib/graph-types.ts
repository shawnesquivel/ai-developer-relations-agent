// Shared client-safe types (lib/neo4j.ts is server-only).

export interface GraphNode {
  id: string;
  label: string;
  name: string;
  [key: string]: unknown;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
  [key: string]: unknown;
}

export type RunStatus = "pass" | "fail";

export interface RunRecord {
  id: string;
  status: RunStatus;
  exitCode: number;
  stdout: string;
  sandboxId: string;
  at: string;
  mode: "live" | "mock";
}

export interface CodeBlock {
  id: string;
  index: number;
  lang: string;
  code: string;
  latestRun?: RunRecord | null;
}

export interface Cookbook {
  id: string;
  title: string;
  conceptId: string;
  conceptName: string;
  markdown: string;
  documented: boolean;
  createdAt: string;
  blocks: CodeBlock[];
  provider?: string;
}

export interface PlanResult {
  conceptId: string;
  conceptName: string;
  unlocks: number;
  unlockedNames: string[];
  candidates: { conceptId: string; conceptName: string; unlocks: number }[];
  mode: "live" | "mock";
}
