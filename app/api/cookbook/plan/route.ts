import { planNext } from "@/lib/cookbooks";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function planResponse() {
  const plan = await planNext();
  if (!plan) {
    return jsonError("Every concept is documented — nothing left to write.", 404);
  }
  return Response.json(plan);
}

export async function GET() {
  try {
    return await planResponse();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "seed/query failure", 502);
  }
}

export async function POST() {
  try {
    return await planResponse();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "seed/query failure", 502);
  }
}
