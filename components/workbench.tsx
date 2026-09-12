"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { CookbookView, cookbookState } from "@/components/cookbook-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BUILD_STARTERS } from "@/lib/articles";
import type { BrokenCookbook, Cookbook, PlanResult } from "@/lib/graph-types";
import { cn } from "@/lib/utils";

const GraphCanvas = dynamic(() => import("@/components/graph-canvas").then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <div className="min-h-[440px] rounded border border-border bg-bone" />,
});

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new Error(msg === "Failed to fetch" ? `Network error calling ${url} — is the server running?` : msg);
  }
  const json = (await res.json().catch(() => ({ error: res.statusText || `HTTP ${res.status}` }))) as {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

type StreamEvent<T> =
  | { type: "progress"; step: string; detail: string }
  | ({ type: "result" } & T)
  | { type: "error"; error: string };

async function streamApi<T>(
  url: string,
  body: Record<string, unknown>,
  onProgress: (step: string, detail: string) => void,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamEvent<T>;
      if (event.type === "progress") onProgress(event.step, event.detail);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "result") result = event;
    }
    if (done) break;
  }
  if (!result) throw new Error("The operation ended without a result");
  return result;
}

type StepStatus = "pending" | "active" | "complete" | "failed";
type PipelineStep = { id: string; label: string; status: StepStatus; detail?: string };

const BUILD_PIPELINE: PipelineStep[] = [
  { id: "source", label: "Read SDK source graph", status: "pending" },
  { id: "context", label: "Load Composio tool context", status: "pending" },
  { id: "writing", label: "Write cookbook article", status: "pending" },
  { id: "persisting", label: "Persist article and code blocks", status: "pending" },
  { id: "sandbox", label: "Run blocks in fresh Daytona sandboxes", status: "pending" },
  { id: "proof", label: "Record Neo4j proof", status: "pending" },
];

function ProgressPanel({ title, steps }: { title: string; steps: PipelineStep[] }) {
  return (
    <div className="rounded border border-stone bg-parchment p-3" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        <span className="font-mono text-[11px] tabular-nums text-ash">
          {steps.filter((step) => step.status === "complete").length}/{steps.length}
        </span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.id} className="flex min-h-8 items-start gap-2">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
                step.status === "complete" && "border-forest bg-forest text-parchment",
                step.status === "active" && "animate-spin border-ink border-t-transparent text-transparent",
                step.status === "failed" && "border-crimson bg-crimson text-parchment",
                step.status === "pending" && "border-stone text-mist",
              )}
            >
              {step.status === "complete" ? "✓" : step.status === "failed" ? "!" : "·"}
            </span>
            <div className="min-w-0">
              <p className={cn("text-[12px]", step.status === "pending" ? "text-mist" : "text-ink")}>
                {step.label}
              </p>
              {step.detail ? <p className="font-mono text-[11px] leading-4 text-ash">{step.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Workbench() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [broken, setBroken] = useState<BrokenCookbook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "planning" | "generating" | "building">("idle");
  const [buildStatus, setBuildStatus] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineStep[] | null>(null);
  const [pipelineTitle, setPipelineTitle] = useState("Build progress");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runningBlockId, setRunningBlockId] = useState<string | null>(null);
  const [graphKey, setGraphKey] = useState(0);
  const [showCypher, setShowCypher] = useState(false);
  const [generated, setGenerated] = useState(false);

  function beginPipeline(title: string, steps = BUILD_PIPELINE) {
    setPipelineTitle(title);
    setPipeline(steps.map((step, index) => ({ ...step, status: index === 0 ? "active" : "pending" })));
  }

  function advancePipeline(stepId: string, detail: string) {
    const mapped = ["creating", "uploading", "installing", "executing", "deleting"].includes(stepId)
      ? "sandbox"
      : ["recording", "finalizing"].includes(stepId)
        ? "proof"
        : stepId;
    setPipeline((current) => {
      if (!current) return current;
      const target = current.findIndex((step) => step.id === mapped);
      if (target < 0) return current;
      return current.map((step, index) => ({
        ...step,
        status: index < target ? "complete" : index === target ? "active" : "pending",
        detail: index === target ? detail : index > target ? undefined : step.detail,
      }));
    });
  }

  function completePipeline(detail: string) {
    setPipeline((current) =>
      current?.map((step, index) => ({
        ...step,
        status: "complete",
        detail: index === current.length - 1 ? detail : step.detail,
      })) ?? null,
    );
  }

  function failPipeline(message: string) {
    setPipeline((current) => {
      if (!current) return current;
      const active = current.findIndex((step) => step.status === "active");
      return current.map((step, index) =>
        index === Math.max(active, 0) ? { ...step, status: "failed", detail: message } : step,
      );
    });
  }

  const refreshCookbooks = useCallback(async () => {
    const data = await api<{ cookbooks: Cookbook[]; broken?: BrokenCookbook[] }>("/api/cookbook");
    setCookbooks(data.cookbooks);
    setBroken(data.broken ?? []);
    return data.cookbooks;
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ cookbooks: Cookbook[]; broken?: BrokenCookbook[] }>("/api/cookbook")
      .then((data) => {
        if (!cancelled) {
          setCookbooks(data.cookbooks);
          setBroken(data.broken ?? []);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load cookbooks");
          setCookbooks([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = cookbooks?.find((c) => c.id === selectedId) ?? null;

  async function doPlan() {
    setPhase("planning");
    beginPipeline("Neo4j planner", [
      { id: "source", label: "Query source-backed prerequisite graph", status: "pending" },
    ]);
    setError(null);
    setGenerated(false);
    try {
      const next = await api<PlanResult>("/api/cookbook/plan", { method: "POST" });
      setPlan(next);
      completePipeline(`Picked ${next.conceptName} · unlocks ${next.unlocks}`);
    } catch (err) {
      setPlan(null);
      const message = err instanceof Error ? err.message : "plan failed";
      setError(message);
      failPipeline(message);
    } finally {
      setPhase("idle");
    }
  }

  async function doGenerate() {
    if (!plan) return;
    setPhase("generating");
    beginPipeline("Write planned cookbook", [
      { id: "writing", label: "Write source-grounded cookbook article", status: "pending" },
      { id: "persisting", label: "Persist article and blocks in Neo4j", status: "pending" },
    ]);
    setError(null);
    try {
      const result = await api<{ cookbook: Cookbook }>("/api/cookbook/generate", {
        method: "POST",
        body: JSON.stringify({ conceptId: plan.conceptId, conceptName: plan.conceptName }),
      });
      const list = await refreshCookbooks();
      setSelectedId(result.cookbook.id);
      if (!list.find((c) => c.id === result.cookbook.id)) {
        setCookbooks([...(list ?? []), result.cookbook]);
      }
      setGenerated(true);
      setGraphKey((k) => k + 1);
      completePipeline("Cookbook persisted and ready to verify");
    } catch (err) {
      const message = err instanceof Error ? err.message : "generate failed";
      setError(message);
      failPipeline(message);
    } finally {
      setPhase("idle");
    }
  }

  async function runBlockOn(cookbookId: string, blockId: string, blockLabel?: string) {
    setRunningBlockId(blockId);
    setError(null);
    try {
      const result = await streamApi<{ cookbook: Cookbook }>("/api/cookbook/run", { cookbookId, blockId }, (step, detail) => {
        advancePipeline(step, blockLabel ? `${blockLabel} · ${detail}` : detail);
      });
      setCookbooks((prev) => (prev ?? []).map((c) => (c.id === result.cookbook.id ? result.cookbook : c)));
      setGraphKey((k) => k + 1);
      return result.cookbook;
    } catch (err) {
      const message = err instanceof Error ? err.message : "run failed";
      setError(message);
      failPipeline(message);
      return null;
    } finally {
      setRunningBlockId(null);
    }
  }

  async function runBlock(blockId: string) {
    if (!selected) return;
    const block = selected.blocks.find((item) => item.id === blockId);
    beginPipeline("Daytona verification", [
      { id: "sandbox", label: "Run block in a fresh Daytona sandbox", status: "pending" },
      { id: "proof", label: "Record Neo4j proof", status: "pending" },
    ]);
    const updated = await runBlockOn(
      selected.id,
      blockId,
      block ? `Block ${block.index + 1}/${selected.blocks.length}` : undefined,
    );
    if (updated) completePipeline(updated.documented ? "Cookbook verified" : "Latest run recorded");
  }

  async function runAll() {
    if (!selected) return;
    beginPipeline("Verify all blocks", [
      { id: "sandbox", label: "Run every block in a fresh Daytona sandbox", status: "pending" },
      { id: "proof", label: "Record Neo4j proof and recompute status", status: "pending" },
    ]);
    let latest: Cookbook | null = selected;
    for (let i = 0; i < selected.blocks.length; i++) {
      latest = await runBlockOn(
        selected.id,
        selected.blocks[i].id,
        `Block ${i + 1}/${selected.blocks.length}`,
      );
    }
    if (latest) completePipeline(latest.documented ? "Every latest block passed" : "Runs recorded; cookbook is not verified");
    setGraphKey((k) => k + 1);
  }

  async function doBuild() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    setPhase("building");
    setBuildStatus("writing article");
    beginPipeline("Build cookbook from scratch");
    setError(null);
    try {
      const result = await streamApi<{ cookbook: Cookbook; provider: string; model: string }>(
        "/api/cookbook/build",
        { prompt: nextPrompt },
        (step, detail) => {
          setBuildStatus(detail);
          advancePipeline(step, detail);
        },
      );
      let book = result.cookbook;
      advancePipeline(
        "persisting",
        result.provider === "mock"
          ? "Article persisted from deterministic fallback (LLM unavailable)"
          : `Article persisted · ${result.provider}/${result.model}`,
      );
      setSelectedId(book.id);
      setCookbooks((prev) => {
        const rest = (prev ?? []).filter((c) => c.id !== book.id);
        return [...rest, book];
      });
      setGraphKey((k) => k + 1);
      const total = book.blocks.length;
      for (let i = 0; i < book.blocks.length; i++) {
        setBuildStatus(`verifying block ${i + 1}/${total}`);
        advancePipeline("sandbox", `Block ${i + 1}/${total} · waiting for Daytona`);
        const updated = await runBlockOn(book.id, book.blocks[i].id, `Block ${i + 1}/${total}`);
        if (updated) book = updated;
      }
      advancePipeline("proof", "Refreshing latest Run nodes and cookbook status");
      const list = await refreshCookbooks();
      const latest = list.find((c) => c.id === book.id) ?? book;
      const state = cookbookState(latest);
      setBuildStatus(state === "broken" ? "broken" : state === "verified" ? "verified" : "unverified");
      completePipeline(
        state === "verified"
          ? "Verified — every latest block passed"
          : state === "broken"
            ? "Complete with failures — inspect the failed block"
            : "Complete — more verification is required",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "build failed";
      setError(message);
      failPipeline(message);
      setBuildStatus(null);
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle" || Boolean(runningBlockId);
  const graphFocus = selectedId ?? plan?.conceptId ?? null;

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Build from scratch</CardTitle>
            <p className="text-sm text-muted-foreground">
              One button writes a full article, persists it, then verifies every block in Daytona.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {BUILD_STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setPrompt(starter.prompt)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-left text-[11px] leading-4 transition-colors",
                    prompt === starter.prompt
                      ? "border-ink bg-secondary"
                      : "border-border bg-bone hover:bg-secondary/50",
                  )}
                >
                  {starter.prompt}
                </button>
              ))}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Or type a custom prompt…"
              rows={2}
              disabled={busy}
              className="w-full resize-none rounded-md border border-border bg-bone px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void doBuild()} disabled={busy || !prompt.trim()}>
                {phase === "building" ? "Building…" : "Build cookbook"}
              </Button>
              {buildStatus ? (
                <span className="font-mono text-[12px] text-ash">{buildStatus}</span>
              ) : null}
            </div>
            {pipeline ? <ProgressPanel title={pipelineTitle} steps={pipeline} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planner</CardTitle>
            <p className="text-sm text-muted-foreground">
              Neo4j picks the simplest remaining core SDK lesson whose prereqs are already documented.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void doPlan()} disabled={busy}>
                {phase === "planning" ? "Querying graph…" : "Plan next cookbook"}
              </Button>
              <Button variant="secondary" onClick={() => void doGenerate()} disabled={busy || !plan || generated}>
                {generated ? "Generated" : plan ? `2 · Write “${plan.conceptName}”` : "2 · Write"}
              </Button>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {plan ? (
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-ember" />
                  <span className="text-sm font-medium">{plan.conceptName}</span>
                  <Badge>unblocks {plan.unlocks}</Badge>
                  <Badge variant={plan.mode === "live" ? "live" : "mock"}>{plan.mode}</Badge>
                </div>
                {plan.unlockedNames.length ? (
                  <p className="text-[12px] text-muted-foreground">Unlocks: {plan.unlockedNames.join(", ")}</p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">No downstream concepts within 3 hops.</p>
                )}
                {plan.candidates.length > 1 ? (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {plan.candidates.slice(1).map((c, i) => (
                      <li key={`${c.conceptId}-${i}`}>
                        {c.conceptName} ({c.unlocks})
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  className="mt-2 font-mono text-[12px] text-ember underline"
                  onClick={() => setShowCypher((v) => !v)}
                  type="button"
                >
                  {showCypher ? "Hide Cypher" : "Show Cypher"}
                </button>
                {showCypher ? (
                  <pre className="mt-2 overflow-auto rounded bg-linen p-2 font-mono text-[12px] text-ash">
                    {plan.cypher}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <GraphCanvas highlightId={plan?.conceptId} focusId={graphFocus} refreshKey={graphKey} />

        <Card>
          <CardHeader>
            <CardTitle>Cookbooks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cookbooks === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : cookbooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cookbooks yet</p>
            ) : (
              cookbooks.map((book) => {
                const state = cookbookState(book);
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => setSelectedId(book.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                      selectedId === book.id ? "border-ink bg-secondary" : "border-border hover:bg-secondary/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{book.title}</span>
                      <Badge variant={state}>
                        {state === "broken" ? "Broken" : state === "verified" ? "Verified" : "Unverified"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {book.conceptName} · {book.blocks.length} blocks
                    </p>
                  </button>
                );
              })
            )}
            {broken.length ? (
              <div className="mt-3 space-y-1">
                <p className="text-[11px] font-medium text-crimson">Broken</p>
                {broken.map((item, index) => (
                  <p key={`${item.id}-${item.blockIndex}-${index}`} className="text-[11px] text-crimson">
                    {item.title} · block {item.blockIndex + 1}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 min-h-[600px] xl:min-w-[600px]">
        {phase === "generating" ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded border border-border bg-card">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              {`Writing “${plan?.conceptName}”…`}
            </p>
          </div>
        ) : (
          <CookbookView
            cookbook={selected}
            runningBlockId={runningBlockId}
            onRun={(id) => void runBlock(id)}
            onRunAll={() => void runAll()}
          />
        )}
      </div>
    </div>
  );
}
