import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { env } from "./env";
import { sandboxEnvVars } from "./cookbooks";
import type { RunMode, RunRecord } from "./graph-types";

let client: Daytona | null = null;

export function getDaytona(): Daytona {
  if (!env.DAYTONA_API_KEY) throw new Error("DAYTONA_API_KEY is not set");
  if (!client) {
    client = new Daytona({
      apiKey: env.DAYTONA_API_KEY,
      target: env.DAYTONA_TARGET,
    });
  }
  return client;
}

export async function createSandbox(envVars: Record<string, string>) {
  return getDaytona().create({
    language: "typescript",
    envVars,
    autoStopInterval: 10,
  });
}

export async function deleteSandbox(sandbox: Sandbox | null) {
  if (!sandbox) return;
  try {
    await sandbox.delete();
  } catch {
    // Best-effort cleanup — leftover sandboxes still cost money.
  }
}

const COMMAND_TIMEOUT = 240;

export async function runInSandbox(opts: {
  command?: string;
  code?: string;
  language?: "python" | "typescript" | "javascript";
}): Promise<{ sandboxId: string; exitCode: number; stdout: string; durationMs: number; mode: RunMode }> {
  if (!opts.command && !opts.code) {
    throw new Error("command or code is required");
  }
  if (!env.DAYTONA_API_KEY) {
    return mockSandboxRun(opts);
  }

  const language = opts.language ?? "typescript";
  const started = Date.now();
  let sandbox: Sandbox | null = null;
  try {
    sandbox = await getDaytona().create({
      language,
      envVars: sandboxEnvVars(),
      autoStopInterval: 10,
    });
    if (opts.code) {
      const filename = language === "python" ? "block.py" : "block.ts";
      await uploadSource(sandbox, opts.code, filename);
    }
    const command =
      opts.command ??
      (language === "python"
        ? "python block.py"
        : "npm init -y >/dev/null 2>&1 && npm i --silent --no-audit --no-fund && npx --yes tsx block.ts");
    const result = await sandbox.process.executeCommand(command, undefined, undefined, COMMAND_TIMEOUT);
    return {
      sandboxId: sandbox.id,
      exitCode: result.exitCode ?? 0,
      stdout: String(result.result ?? ""),
      durationMs: Date.now() - started,
      mode: "live",
    };
  } finally {
    await deleteSandbox(sandbox);
  }
}

async function uploadSource(sandbox: Sandbox, code: string, filename: string) {
  const fs = sandbox.fs as {
    uploadFile?: (src: Buffer | string, dest: string) => Promise<void>;
    uploadFiles?: (files: { source: Buffer; destination: string }[]) => Promise<void>;
  };
  const buf = Buffer.from(code, "utf8");
  if (typeof fs.uploadFile === "function") {
    await fs.uploadFile(buf, filename);
    return;
  }
  if (typeof fs.uploadFiles === "function") {
    await fs.uploadFiles([{ source: buf, destination: filename }]);
  }
}

export function mockRunBlock(code: string): Omit<RunRecord, "id" | "at"> {
  const undeclared = findUndeclared(code);
  if (undeclared.length) {
    return {
      status: "fail",
      exitCode: 1,
      stdout: `ReferenceError: ${undeclared[0]} is not defined (mock sandbox)`,
      sandboxId: "mock",
      mode: "mock",
    };
  }
  const prints = [...code.matchAll(/console\.log\((.+)\)/g)].map((m) => m[1].replace(/^["'`]|["'`]$/g, ""));
  return {
    status: "pass",
    exitCode: 0,
    stdout: (prints.length ? prints.join("\n") : "ok") + " (mock sandbox)\n",
    sandboxId: "mock",
    mode: "mock",
  };
}

function findUndeclared(code: string): string[] {
  const declared = new Set<string>();
  const decl = /(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = decl.exec(code))) declared.add(match[1]);
  if (/\bnames\b/.test(code) && !declared.has("names")) return ["names"];
  return [];
}

function mockSandboxRun(opts: { command?: string; code?: string }) {
  if (opts.code) {
    const result = mockRunBlock(opts.code);
    return {
      sandboxId: "mock",
      exitCode: result.exitCode,
      stdout: result.stdout,
      durationMs: 12,
      mode: "mock" as const,
    };
  }
  return {
    sandboxId: "mock",
    exitCode: 0,
    stdout: `$ ${opts.command}\n(mock sandbox)\n`,
    durationMs: 8,
    mode: "mock" as const,
  };
}

export async function runCodeBlock(code: string): Promise<{
  status: RunRecord["status"];
  exitCode: number;
  stdout: string;
  sandboxId: string;
  mode: RunMode;
  durationMs: number;
}> {
  if (!env.DAYTONA_API_KEY) {
    const result = mockRunBlock(code);
    return { ...result, durationMs: 18 };
  }

  const started = Date.now();
  let sandbox: Sandbox | null = null;
  try {
    sandbox = await createSandbox(sandboxEnvVars());
    await uploadSource(sandbox, code, "block.ts");
    const result = await sandbox.process.executeCommand(
      "npm init -y >/dev/null 2>&1 && npm i --silent --no-audit --no-fund @composio/core @daytonaio/sdk openai tsx >/dev/null 2>&1 && npx tsx block.ts",
      undefined,
      undefined,
      COMMAND_TIMEOUT,
    );
    const exitCode = result.exitCode ?? 0;
    const stdout = String(result.result ?? "");
    return {
      status: exitCode === 0 ? "pass" : "fail",
      exitCode,
      stdout,
      sandboxId: sandbox.id,
      mode: "live",
      durationMs: Date.now() - started,
    };
  } finally {
    await deleteSandbox(sandbox);
  }
}
