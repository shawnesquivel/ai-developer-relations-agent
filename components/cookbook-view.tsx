"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { splitMarkdown } from "@/lib/markdown";
import type { CodeBlock, Cookbook } from "@/lib/graph-types";
import { cn } from "@/lib/utils";

function fmt(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function cookbookState(book: Cookbook): "verified" | "broken" | "unverified" {
  if (book.blocks.some((b) => b.latestRun?.status === "fail")) return "broken";
  if (book.blocks.length && book.blocks.every((b) => b.latestRun?.status === "pass")) return "verified";
  return "unverified";
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-linen px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function Prose({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="my-2 list-disc space-y-1 pl-5 text-sm">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={nodes.length} className="mt-3 font-serif text-sm font-normal">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={nodes.length} className="mt-3 font-serif text-base font-normal">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={nodes.length} className="font-serif text-[22px] font-normal tracking-[-0.005em]">
          {line.slice(2)}
        </h1>,
      );
    } else {
      nodes.push(
        <p key={nodes.length} className="my-2 font-serif text-[17px] leading-[1.5] text-driftwood">
          {renderInline(line)}
        </p>,
      );
    }
  }
  flush();
  return <div>{nodes}</div>;
}

function BlockCard({
  block,
  running,
  disabled,
  onRun,
}: {
  block: CodeBlock;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const run = block.latestRun;
  const border = running ? "border-ink" : run?.status === "pass" ? "border-forest" : run?.status === "fail" ? "border-crimson" : "border-stone";
  const badge = running
    ? "running in sandbox…"
    : run
      ? `${run.status === "pass" ? "passed" : "failed"} ${fmt(run.at)} · exit ${run.exitCode}${run.mode === "mock" ? " (mock sandbox)" : ""}`
      : "not yet run";
  return (
    <div className={cn("overflow-hidden rounded border-2 bg-bone", border)}>
      <div className="flex items-center justify-between gap-2 border-b border-stone px-3 py-2">
        <div className="text-[11px] text-muted-foreground">
          Block {block.index + 1} · {block.lang}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("font-mono text-[12px]", run?.status === "fail" ? "text-crimson" : run?.status === "pass" ? "text-verdant" : "text-ember")}>
            {badge}
          </span>
          <Button size="sm" variant="outline" disabled={disabled} onClick={onRun}>
            Run
          </Button>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs leading-5">{block.code}</pre>
      {run?.stdout ? (
        <pre className="max-h-40 overflow-auto border-t border-stone bg-linen px-3 py-2 font-mono text-[12px] text-ash">
          {run.stdout}
        </pre>
      ) : null}
    </div>
  );
}

export function CookbookView({
  cookbook,
  runningBlockId,
  onRun,
  onRunAll,
}: {
  cookbook: Cookbook | null;
  runningBlockId: string | null;
  onRun: (blockId: string) => void;
  onRunAll: () => void;
}) {
  if (!cookbook) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-6 font-serif text-sm text-muted-foreground">
        Select a cookbook from the list, or let the graph choose the next concept.
      </div>
    );
  }
  const state = cookbookState(cookbook);
  const passing = cookbook.blocks.filter((b) => b.latestRun?.status === "pass").length;
  const failing = cookbook.blocks.filter((b) => b.latestRun?.status === "fail").length;
  const share = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    `Verified cookbook: ${cookbook.title} — Docs that Test Themselves`,
  )}`;
  const segments = splitMarkdown(cookbook.markdown);
  let nextBlock = 0;

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={state}>{state === "broken" ? `Broken · ${failing} failing` : state === "verified" ? "Verified" : "Unverified"}</Badge>
            <span className="text-[11px] text-muted-foreground">
              {passing}/{cookbook.blocks.length} passing · {cookbook.conceptName}
              {cookbook.provider !== "seed" ? ` · ${cookbook.provider}` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={Boolean(runningBlockId)} onClick={onRunAll}>
            Verify all blocks
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(share, "_blank")}>
            Share on X
          </Button>
        </div>
      </header>
      {segments.map((seg, i) => {
        if (seg.type === "prose") return <Prose key={i} markdown={seg.text} />;
        const block = cookbook.blocks[nextBlock++] ?? cookbook.blocks.find((b) => b.index === seg.index);
        if (!block) return null;
        return (
          <BlockCard
            key={`${block.id}-${i}`}
            block={block}
            running={runningBlockId === block.id}
            disabled={Boolean(runningBlockId)}
            onRun={() => onRun(block.id)}
          />
        );
      })}
    </article>
  );
}

export { cookbookState, fmt };
