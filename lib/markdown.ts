// Tiny markdown splitter shared by server (block extraction) and client (rendering).

export type Segment = { kind: "prose"; text: string } | { kind: "code"; lang: string; code: string; index: number };

export function splitMarkdown(markdown: string): Segment[] {
  const segments: Segment[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let index = 0;
  for (const m of markdown.matchAll(re)) {
    const start = m.index ?? 0;
    const prose = markdown.slice(last, start).trim();
    if (prose) segments.push({ kind: "prose", text: prose });
    segments.push({ kind: "code", lang: m[1] || "typescript", code: m[2].replace(/\s+$/, ""), index: index++ });
    last = start + m[0].length;
  }
  const tail = markdown.slice(last).trim();
  if (tail) segments.push({ kind: "prose", text: tail });
  return segments;
}

export function extractCodeBlocks(markdown: string): { lang: string; code: string; index: number }[] {
  return splitMarkdown(markdown).flatMap((s) => (s.kind === "code" ? [{ lang: s.lang, code: s.code, index: s.index }] : []));
}

export function extractTitle(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}
