import "server-only";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { env } from "./env";

export type SandboxLanguage = "python" | "typescript" | "javascript";

export interface RunResult {
  sandboxId: string;
  exitCode: number;
  stdout: string;
  durationMs: number;
  mode: "live" | "mock";
}

export interface RunOptions {
  /** Shell command to exec inside the sandbox. */
  command?: string;
  /** Code snippet to run with the sandbox's language runtime (stateless). */
  code?: string;
  language?: SandboxLanguage;
  /** Minutes idle before auto-stop; sandboxes are billed while running. */
  autoStopInterval?: number;
  /** Optional callback for streamed stdout chunks (live mode only). */
  onStdout?: (chunk: string) => void;
}

let client: Daytona | null = null;

export function getDaytona(): Daytona | null {
  if (!env.daytona.live()) return null;
  if (!client) {
    // Reads DAYTONA_API_KEY / DAYTONA_TARGET from the environment.
    client = new Daytona();
  }
  return client;
}

export async function createSandbox(
  language: SandboxLanguage = "python",
  autoStopInterval = 15,
): Promise<Sandbox> {
  const daytona = getDaytona();
  if (!daytona) throw new Error("Daytona is not configured (DAYTONA_API_KEY missing)");
  return daytona.create({ language, autoStopInterval });
}

export async function deleteSandbox(sandbox: Sandbox): Promise<void> {
  await sandbox.delete();
}

/**
 * Create a sandbox, run a command and/or code snippet, return stdout, delete the sandbox.
 * Falls back to a deterministic mock when DAYTONA_API_KEY is not set.
 */
export async function runInSandbox(opts: RunOptions): Promise<RunResult> {
  const started = Date.now();
  if (!opts.command && !opts.code) throw new Error("Provide `command` or `code`");

  if (!env.daytona.live()) return mockRun(opts, started);

  const sandbox = await createSandbox(opts.language ?? "python", opts.autoStopInterval ?? 15);
  try {
    const chunks: string[] = [];
    let exitCode = 0;

    if (opts.command) {
      const res = await sandbox.process.executeCommand(opts.command);
      exitCode = res.exitCode;
      chunks.push(res.result);
      opts.onStdout?.(res.result);
    }
    if (opts.code) {
      const res = await sandbox.process.codeRun(opts.code);
      exitCode = res.exitCode || exitCode;
      chunks.push(res.result);
      opts.onStdout?.(res.result);
    }

    return {
      sandboxId: sandbox.id,
      exitCode,
      stdout: chunks.join("\n"),
      durationMs: Date.now() - started,
      mode: "live",
    };
  } finally {
    // Always clean up: sandboxes bill while started, stopped ones still bill for disk.
    await sandbox.delete().catch(() => undefined);
  }
}

/**
 * Verify one cookbook code block: fresh sandbox, upload as block.ts, install deps, run with tsx.
 * Credentials are passed as sandbox env vars — the LLM-generated code never runs in this process.
 */
export async function runCodeBlock(code: string, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  const started = Date.now();
  if (!env.daytona.live()) return mockBlockRun(code, started);

  const daytona = getDaytona()!;
  const envVars: Record<string, string> = { ...extraEnv };
  for (const k of ["COMPOSIO_API_KEY", "GITHUB_PAT", "OPENAI_API_KEY", "OPENAI_MODEL"]) {
    if (process.env[k]) envVars[k] = process.env[k]!;
  }
  if (env.nosana.live()) {
    const base = env.nosana.endpoint!.replace(/\/+$/, "");
    envVars.OPENAI_BASE_URL = base.endsWith("/v1") ? base : `${base}/v1`;
    envVars.OPENAI_MODEL ??= env.nosana.model;
  }

  const sandbox = await daytona.create({ language: "typescript", envVars, autoStopInterval: 10 });
  try {
    await sandbox.fs.uploadFile(Buffer.from(code, "utf8"), "block.ts");
    const res = await sandbox.process.executeCommand(
      "npm init -y >/dev/null 2>&1; npm i --silent --no-audit --no-fund @composio/core openai tsx >/dev/null 2>&1 && npx tsx block.ts",
      undefined,
      envVars,
      240,
    );
    return { sandboxId: sandbox.id, exitCode: res.exitCode, stdout: res.result, durationMs: Date.now() - started, mode: "live" };
  } finally {
    await sandbox.delete().catch(() => undefined);
  }
}

function mockBlockRun(code: string, started: number): RunResult {
  // Deterministic: a block fails only if it references an identifier it never declares/imports.
  const declared = new Set<string>();
  for (const m of code.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of code.matchAll(/import\s*\{([^}]+)\}/g)) m[1].split(",").forEach((s) => declared.add(s.trim().split(/\s+as\s+/).pop()!));
  for (const m of code.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from/g)) declared.add(m[1]);
  const used = [...code.matchAll(/^\s*(?:console\.log\(|await\s+)?([A-Za-z_$][\w$]*)\./gm)].map((m) => m[1]);
  const builtins = new Set(["console", "process", "JSON", "Object", "Array", "Math", "Promise", "String", "Number", "Date", "Buffer"]);
  const missing = used.find((u) => !declared.has(u) && !builtins.has(u));

  const printed = [...code.matchAll(/console\.log\(([^\n]*)\);?\s*$/gm)].map((m) => {
    const literals = [...m[1].matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((l) => (l[1] ?? l[2] ?? l[3]).replace(/\$\{[^}]*\}/g, "<value>"));
    const hasExpr = /[A-Za-z_$][\w$]*\.[A-Za-z_$]/.test(m[1].replace(/"[^"]*"|'[^']*'|`[^`]*`/g, ""));
    return `${literals.join(" ")}${hasExpr ? " <value>" : ""}`.trim();
  });
  const stdout = missing
    ? `ReferenceError: ${missing} is not defined\n    at block.ts\n[mock sandbox exited 1]`
    : `[mock sandbox: DAYTONA_API_KEY not set]\n$ npm i @composio/core openai tsx && npx tsx block.ts\n${printed.join("\n") || "(no output)"}`;
  return {
    sandboxId: `mock-${Math.random().toString(36).slice(2, 10)}`,
    exitCode: missing ? 1 : 0,
    stdout,
    durationMs: Date.now() - started + 400,
    mode: "mock",
  };
}

function mockRun(opts: RunOptions, started: number): RunResult {
  const lines: string[] = [];
  if (opts.command) lines.push(`$ ${opts.command}`, `[mock] command accepted (no DAYTONA_API_KEY)`);
  if (opts.code) {
    const printed = [...opts.code.matchAll(/(?:print|console\.log)\((["'`])(.*?)\1\)/g)].map((m) => m[2]);
    lines.push(...(printed.length ? printed : [`[mock] ran ${opts.code.split("\n").length} line(s) of ${opts.language ?? "python"}`]));
  }
  const stdout = lines.join("\n");
  opts.onStdout?.(stdout);
  return {
    sandboxId: `mock-${Math.random().toString(36).slice(2, 10)}`,
    exitCode: 0,
    stdout,
    durationMs: Date.now() - started,
    mode: "mock",
  };
}
