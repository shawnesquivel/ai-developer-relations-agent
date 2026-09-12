import { NextResponse } from "next/server";
import { createCookbook, ensureSeeded } from "@/lib/cookbooks";
import { generateCookbook } from "@/lib/generate";
import { isLive, mockStore, runCypher } from "@/lib/neo4j";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST { conceptId, conceptName } → generates the cookbook with the LLM and stores it in the graph. */
export async function POST(req: Request) {
  let body: { conceptId?: string; conceptName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.conceptId || !body.conceptName) return NextResponse.json({ error: "conceptId and conceptName required" }, { status: 400 });

  try {
    await ensureSeeded();
    const toolNames = await toolsDemonstrating(body.conceptId);
    const gen = await generateCookbook(body.conceptName, { toolNames });
    const cookbook = await createCookbook({ title: gen.title, conceptId: body.conceptId, markdown: gen.markdown, provider: gen.provider });
    return NextResponse.json({ cookbook, provider: gen.provider, model: gen.model });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

async function toolsDemonstrating(conceptId: string): Promise<string[]> {
  if (!isLive()) return mockStore.incoming(conceptId, "DEMONSTRATES").map((l) => mockStore.nodes.get(l.source)?.name as string).filter(Boolean);
  const { records } = await runCypher(`MATCH (t:Tool)-[:DEMONSTRATES]->(c:Concept {id: $id}) RETURN t.name AS name`, { id: conceptId });
  return records.map((r) => r.name as string);
}
