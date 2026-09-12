import { getCookbook, recordRun, syncVerification } from "@/lib/cookbooks";
import { runCodeBlock } from "@/lib/daytona";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const parsed = await readJson<{ cookbookId?: string; blockId?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const { cookbookId, blockId } = parsed.body;
  if (!cookbookId || !blockId) {
    return jsonError("missing cookbookId or blockId", 400);
  }
  try {
    const cookbook = await getCookbook(cookbookId);
    if (!cookbook) return jsonError("cookbook not found", 404);
    const block = cookbook.blocks.find((b) => b.id === blockId);
    if (!block) return jsonError("block not found", 404);

    const result = await runCodeBlock(block.code);
    const run = await recordRun(blockId, {
      status: result.status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      sandboxId: result.sandboxId,
      at: new Date().toISOString(),
      mode: result.mode,
    });
    const updated = await syncVerification(cookbookId);
    return Response.json({ run, cookbook: updated, durationMs: result.durationMs });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Daytona or graph write failure", 502);
  }
}
