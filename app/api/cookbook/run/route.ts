import { NextResponse } from "next/server";
import { getCookbook, markVerified, recordRun } from "@/lib/cookbooks";
import { runCodeBlock } from "@/lib/daytona";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST { cookbookId, blockId } → runs that block in a fresh Daytona sandbox, records a :Run, re-checks verification. */
export async function POST(req: Request) {
  let body: { cookbookId?: string; blockId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.cookbookId || !body.blockId) return NextResponse.json({ error: "cookbookId and blockId required" }, { status: 400 });

  try {
    const cookbook = await getCookbook(body.cookbookId);
    const block = cookbook?.blocks.find((b) => b.id === body.blockId);
    if (!cookbook || !block) return NextResponse.json({ error: "Block not found" }, { status: 404 });

    const result = await runCodeBlock(block.code);
    const run = await recordRun(block.id, {
      status: result.exitCode === 0 ? "pass" : "fail",
      exitCode: result.exitCode,
      stdout: result.stdout,
      sandboxId: result.sandboxId,
      mode: result.mode,
    });
    const updated = await markVerified(cookbook.id);
    return NextResponse.json({ run, cookbook: updated, durationMs: result.durationMs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
