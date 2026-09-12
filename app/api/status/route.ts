import { integrationStatuses } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ integrations: integrationStatuses() });
}
