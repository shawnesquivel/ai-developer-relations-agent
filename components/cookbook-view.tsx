"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { draftComposioIssue } from "@/lib/articles";
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

function IssueDraft({ cookbookTitle, block }: { cookbookTitle: string; block: CodeBlock }) {
  const run = block.latestRun;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (run?.status !== "fail") return null;
  const draft = draftComposioIssue({
    cookbookTitle,
    blockIndex: block.index,
    stdout: run.stdout,
    sandboxId: run.sandboxId,
    mode: run.mode,
    exitCode: run.exitCode,
  });
  return (
    <div className="border-t border-crimson/30 bg-linen px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          Draft Composio issue
        </Button>
        <Badge variant="mock">MOCK / DRAFT</Badge>
        <span className="text-[11px] text-muted-foreground">Does not call GitHub</span>
      </div>
      {open ? (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Intent: Composio <code className="font-mono">GITHUB_CREATE_AN_ISSUE</code>. This control only fills a
            draft.
          </p>
          <input
            readOnly
            value={draft.title}
            className="w-full rounded border border-border bg-bone px-2 py-1 font-mono text-[11px]"
          />
          <textarea
            readOnly
            value={draft.body}
            rows={10}
            className="w-full rounded border border-border bg-bone px-2 py-1 font-mono text-[11px]"
          />
          <Button
            size="sm"
            onClick={async () => {
              await navigator.clipboard.writeText(`${draft.title}\n\n${draft.body}`);
              setCopied(true);
            }}
          >
            {copied ? "Copied draft (still mock)" : "Copy draft"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BlockCard({
  block,
  cookbookTitle,
  running,
  disabled,
  onRun,
}: {
  block: CodeBlock;
  cookbookTitle: string;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const run = block.latestRun;
  const border = running ? "border-ink" : run?.status === "pass" ? "border-forest" : run?.status === "fail" ? "border-crimson" : "border-stone";
  const badge = running
    ? "running in sandbox…"
    : run
      ? `${run.status === "pass" ? "passed" : "failed"} ${fmt(run.at)} · exit ${run.exitCode}${run.mode === "mock" ? " (mock sandbox)" : " (live sandbox)"}`
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
        <pre
          className={cn(
            "max-h-40 overflow-auto border-t border-stone px-3 py-2 font-mono text-[12px]",
            run.status === "fail" ? "bg-linen text-crimson" : "bg-linen text-ash",
          )}
        >
          {run.stdout}
        </pre>
      ) : null}
      <IssueDraft cookbookTitle={cookbookTitle} block={block} />
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
        Select a cookbook from the list, build one from scratch, or let the graph choose the next concept.
      </div>
    );
  }
  const state = cookbookState(cookbook);
  const passing = cookbook.blocks.filter((b) => b.latestRun?.status === "pass").length;
  const failing = cookbook.blocks.filter((b) => b.latestRun?.status === "fail").length;
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
              {cookbook.blocks.some((b) => b.latestRun?.mode === "mock") ? " · mock runs are not live proof" : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={Boolean(runningBlockId)} onClick={onRunAll}>
            Verify all blocks
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
            cookbookTitle={cookbook.title}
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
