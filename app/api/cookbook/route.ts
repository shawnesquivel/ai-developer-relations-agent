import { listCookbooks } from "@/lib/cookbooks";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookbooks = await listCookbooks();
    const broken = cookbooks.flatMap((book) =>
      book.blocks
        .filter((block) => block.latestRun?.status === "fail")
        .map((block) => ({
          id: book.id,
          title: book.title,
          blockIndex: block.index,
          stdout: block.latestRun?.stdout ?? "",
        })),
    );
    return Response.json({ cookbooks, broken });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "graph/list failure", 502);
  }
}
