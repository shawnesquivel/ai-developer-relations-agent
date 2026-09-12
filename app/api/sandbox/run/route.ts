import { runInSandbox } from "@/lib/daytona";
import { jsonError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = await readJson<{
    command?: string;
    code?: string;
    language?: "python" | "typescript" | "javascript";
  }>(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.body.command && !parsed.body.code) {
    return jsonError("command or code is required", 400);
  }
  try {
    const result = await runInSandbox(parsed.body);
    return Response.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Daytona failure", 502);
  }
}
