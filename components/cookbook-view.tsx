"use client";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CodeBlock, Cookbook } from "@/lib/graph-types";
import { splitMarkdown } from "@/lib/markdown";

interface Props {
  cookbook: Cookbook;
  runningBlockId: string | null;
  onRun: (block: CodeBlock) => void;
  onRunAll: () => void;
}

export function CookbookView({ cookbook, runningBlockId, onRun, onRunAll }: Props) {
  const segments = splitMarkdown(cookbook.markdown);
  const passed = cookbook.blocks.filter((b) => b.latestRun?.status === "pass").length;
  const failed = cookbook.blocks.filter((b) => b.latestRun?.status === "fail").length;
  const shareText = `"${cookbook.title}" — a self-verifying Composio cookbook. Every code block ran in a Daytona sandbox, written on Nosana, planned by Neo4j. #DaytonaHackSprint`;
  const shareUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}`;

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {cookbook.documented ? (
            <Badge className="bg-success text-success-foreground hover:bg-success">Verified</Badge>
          ) : failed ? (
            <Badge variant="destructive">Broken · {failed} failing</Badge>
          ) : (
            <Badge variant="secondary">Unverified</Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {passed}/{cookbook.blocks.length} blocks passing · covers <b>{cookbook.conceptName}</b>
            {cookbook.provider && cookbook.provider !== "seed" ? ` · written by ${cookbook.provider}` : ""}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onRunAll} disabled={runningBlockId !== null}>
            {runningBlockId ? "Running…" : "Verify all blocks"}
          </Button>
          <a href={shareUrl} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Share on X
          </a>
        </div>
      </header>

      {segments.map((seg, i) =>
        seg.kind === "prose" ? (
          <Prose key={i} text={seg.text} />
        ) : (
          <BlockCard
            key={i}
            block={cookbook.blocks.find((b) => b.index === seg.index) ?? { id: `tmp-${seg.index}`, index: seg.index, lang: seg.lang, code: seg.code }}
            running={runningBlockId === cookbook.blocks.find((b) => b.index === seg.index)?.id}
            disabled={runningBlockId !== null}
            onRun={onRun}
          />
        ),
      )}
    </article>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="grid gap-2 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => {
        const h = para.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          const level = h[1].length;
          const cls = level === 1 ? "text-xl font-semibold tracking-tight" : "mt-2 text-base font-semibold";
          return (
            <div key={i} className={cls}>
              {inline(h[2])}
            </div>
          );
        }
        if (/^[-*]\s/m.test(para)) {
          return (
            <ul key={i} className="list-disc pl-5">
              {para.split("\n").map((l, j) => (
                <li key={j}>{inline(l.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-foreground/90">
            {inline(para.replace(/\n/g, " "))}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("`")) return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    return part;
  });
}

function BlockCard({ block, running, disabled, onRun }: { block: CodeBlock; running: boolean; disabled: boolean; onRun: (b: CodeBlock) => void }) {
  const status = block.latestRun?.status;
  const border = running ? "border-info" : status === "pass" ? "border-success" : status === "fail" ? "border-destructive" : "border-border";
  return (
    <div className={`overflow-hidden rounded-lg border-2 ${border} bg-code text-code-foreground transition-colors`}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            block {block.index + 1} · {block.lang}
          </span>
          {running ? (
            <Badge variant="outline" className="border-info text-info">
              running in sandbox…
            </Badge>
          ) : status === "pass" ? (
            <Badge variant="outline" className="border-success text-success">
              passed {fmt(block.latestRun!.at)} · exit 0
            </Badge>
          ) : status === "fail" ? (
            <Badge variant="outline" className="border-destructive text-destructive">
              failed {fmt(block.latestRun!.at)} · exit {block.latestRun!.exitCode}
            </Badge>
          ) : (
            <Badge variant="outline">not yet run</Badge>
          )}
          {block.latestRun && block.latestRun.mode === "mock" && <span className="text-muted-foreground">(mock sandbox)</span>}
        </div>
        <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" disabled={disabled} onClick={() => onRun(block)}>
          {running ? "…" : "Run"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-code-foreground">
        <code>{block.code}</code>
      </pre>
      {block.latestRun && (
        <pre
          className={`max-h-48 overflow-auto border-t border-border px-3 py-2 font-mono text-xs ${
            status === "pass" ? "text-success" : "text-destructive"
          }`}
        >
          {block.latestRun.stdout || "(no output)"}
        </pre>
      )}
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
