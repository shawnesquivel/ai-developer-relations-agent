import { NextResponse } from "next/server";
import { PLAN_CYPHER, planNext } from "@/lib/cookbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/cookbook/plan → Neo4j picks the undocumented concept that unblocks the most others. */
export async function POST() {
  try {
    const plan = await planNext();
    if (!plan) return NextResponse.json({ error: "Every concept is documented — nothing left to write." }, { status: 404 });
    return NextResponse.json({ ...plan, cypher: PLAN_CYPHER.trim() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
