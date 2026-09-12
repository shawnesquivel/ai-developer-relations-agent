import { NextResponse } from "next/server";
import { runInSandbox, type SandboxLanguage } from "@/lib/daytona";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  command?: string;
  code?: string;
  language?: SandboxLanguage;
}

/** POST { command?: string, code?: string, language?: "python"|"typescript" } → { stdout, exitCode, sandboxId, mode } */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.command && !body.code) {
    return NextResponse.json({ error: "Provide `command` or `code`" }, { status: 400 });
  }
  try {
    const result = await runInSandbox({ command: body.command, code: body.code, language: body.language });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
