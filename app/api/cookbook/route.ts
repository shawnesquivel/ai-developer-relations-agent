import { NextResponse } from "next/server";
import { brokenCookbooks, listCookbooks } from "@/lib/cookbooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cookbook → all cookbooks (with blocks + latest runs) and the currently-broken list. */
export async function GET() {
  try {
    const [cookbooks, broken] = await Promise.all([listCookbooks(), brokenCookbooks()]);
    return NextResponse.json({ cookbooks, broken });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
