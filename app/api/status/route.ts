import { NextResponse } from "next/server";
import { integrationStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

/** GET /api/status → which integrations are live vs mocked (never leaks secrets). */
export function GET() {
  return NextResponse.json({ integrations: integrationStatuses() });
}
