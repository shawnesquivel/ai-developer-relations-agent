export type MarkdownSegment =
  | { type: "prose"; text: string }
  | { type: "code"; lang: string; code: string; index: number };

const FENCE = /```(\w*)\n([\s\S]*?)```/g;

export function extractCodeBlocks(markdown: string): { lang: string; code: string; index: number }[] {
  const blocks: { lang: string; code: string; index: number }[] = [];
  const re = new RegExp(FENCE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    blocks.push({
      lang: match[1] || "typescript",
      code: match[2].replace(/\s+$/, ""),
      index: blocks.length,
    });
  }
  return blocks;
}

export function splitMarkdown(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  const re = new RegExp(FENCE.source, "g");
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    const prose = markdown.slice(last, match.index).trim();
    if (prose) segments.push({ type: "prose", text: prose });
    segments.push({
      type: "code",
      lang: match[1] || "typescript",
      code: match[2].replace(/\s+$/, ""),
      index,
    });
    index += 1;
    last = match.index + match[0].length;
  }
  const trailing = markdown.slice(last).trim();
  if (trailing) segments.push({ type: "prose", text: trailing });
  return segments;
}

export function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || fallback;
}
