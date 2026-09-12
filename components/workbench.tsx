"use client";

import { useCallback, useEffect, useState } from "react";
import { CookbookView } from "@/components/cookbook-view";
import { GraphCanvas } from "@/components/graph-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CodeBlock, Cookbook, PlanResult } from "@/lib/graph-types";

type Phase = "idle" | "planning" | "planned" | "generating" | "ready";

interface ListResponse {
  cookbooks: Cookbook[];
  broken: { id: string; title: string; blockIndex: number; stdout: string }[];
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function Workbench() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<(PlanResult & { cypher: string }) | null>(null);
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [broken, setBroken] = useState<ListResponse["broken"]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runningBlockId, setRunningBlockId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphKey, setGraphKey] = useState(0);
  const [showCypher, setShowCypher] = useState(false);

  const refreshList = useCallback(
    () =>
      api<ListResponse>("/api/cookbook")
        .then((r) => {
          setCookbooks(r.cookbooks);
          setBroken(r.broken);
        })
        .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e))),
    [],
  );

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const selected = cookbooks.find((c) => c.id === selectedId) ?? null;

  const doPlan = async () => {
    setError(null);
    setPhase("planning");
    try {
      const p = await api<PlanResult & { cypher: string }>("/api/cookbook/plan", { method: "POST" });
      setPlan(p);
      setSelectedId(null);
      setPhase("planned");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  const doGenerate = async () => {
    if (!plan) return;
    setError(null);
    setPhase("generating");
    try {
      const r = await api<{ cookbook: Cookbook }>("/api/cookbook/generate", {
        method: "POST",
        body: JSON.stringify({ conceptId: plan.conceptId, conceptName: plan.conceptName }),
      });
      setCookbooks((prev) => [...prev, r.cookbook]);
      setSelectedId(r.cookbook.id);
      setGraphKey((k) => k + 1);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("planned");
    }
  };

  const runBlock = async (cookbook: Cookbook, block: CodeBlock): Promise<Cookbook | null> => {
    setRunningBlockId(block.id);
    try {
      const r = await api<{ cookbook: Cookbook }>("/api/cookbook/run", {
        method: "POST",
        body: JSON.stringify({ cookbookId: cookbook.id, blockId: block.id }),
      });
      setCookbooks((prev) => prev.map((c) => (c.id === r.cookbook.id ? r.cookbook : c)));
      setGraphKey((k) => k + 1);
      return r.cookbook;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setRunningBlockId(null);
    }
  };

  const runAll = async (cookbook: Cookbook) => {
    let current: Cookbook | null = cookbook;
    for (const block of cookbook.blocks) {
      if (!current) break;
      current = await runBlock(current, block);
    }
    if (current?.documented) {
      setPlan(null);
      setPhase("idle");
    }
    void refreshList();
  };

  const busy = phase === "planning" || phase === "generating";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1 · Neo4j picks the next cookbook</CardTitle>
            <CardDescription>
              One Cypher traversal over <code>PREREQ_OF</code> edges finds the undocumented concept that unblocks the most others.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Button onClick={doPlan} disabled={busy || runningBlockId !== null}>
                {phase === "planning" ? "Querying graph…" : plan ? "Re-plan" : "Plan next cookbook"}
              </Button>
              {plan && (
                <Button onClick={doGenerate} disabled={busy || phase === "ready"} variant={phase === "planned" ? "default" : "secondary"}>
                  {phase === "generating" ? "Nosana is writing…" : phase === "ready" ? "Generated" : `2 · Write "${plan.conceptName}"`}
                </Button>
              )}
              {plan && (
                <Button variant="ghost" size="sm" onClick={() => setShowCypher((s) => !s)}>
                  {showCypher ? "Hide Cypher" : "Show Cypher"}
                </Button>
              )}
            </div>
            {plan && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block size-2.5 rounded-full bg-highlight" />
                  <b>{plan.conceptName}</b>
                  <Badge variant="outline">unblocks {plan.unlocks}</Badge>
                  <Badge variant="secondary" className="uppercase">
                    {plan.mode}
                  </Badge>
                </div>
                {plan.unlockedNames.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-xs">Unlocks: {plan.unlockedNames.join(" · ")}</p>
                )}
                {plan.candidates.length > 1 && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    Runners-up: {plan.candidates.slice(1).map((c) => `${c.conceptName} (${c.unlocks})`).join(", ")}
                  </p>
                )}
                {showCypher && <pre className="mt-2 overflow-x-auto rounded bg-code p-2 font-mono text-[11px] text-code-foreground">{plan.cypher}</pre>}
              </div>
            )}
            {error && <p className="text-destructive text-sm">{error}</p>}
          </CardContent>
        </Card>

        <div className="min-h-[440px]">
          <GraphCanvas highlightId={plan?.conceptId ?? selected?.conceptId ?? null} refreshKey={graphKey} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cookbooks</CardTitle>
            <CardDescription>
              {cookbooks.filter((c) => c.documented).length} verified · {broken.length} broken right now
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {cookbooks.length === 0 && <p className="text-muted-foreground text-sm">Loading…</p>}
            {cookbooks.map((c) => {
              const isBroken = broken.some((b) => b.id === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setPhase("ready");
                  }}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted/60 ${
                    selectedId === c.id ? "border-primary" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.title}</span>
                    <span className="text-muted-foreground block text-xs">{c.conceptName}</span>
                  </span>
                  {c.documented ? (
                    <Badge className="shrink-0 bg-success text-success-foreground hover:bg-success">Verified</Badge>
                  ) : isBroken ? (
                    <Badge variant="destructive" className="shrink-0">
                      Broken
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      Unverified
                    </Badge>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="min-h-[600px] rounded-xl border bg-card p-4 sm:p-6">
        {selected ? (
          <CookbookView
            cookbook={selected}
            runningBlockId={runningBlockId}
            onRun={(b) => void runBlock(selected, b).then(() => refreshList())}
            onRunAll={() => void runAll(selected)}
          />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 text-center text-sm">
            {phase === "generating" ? (
              <>
                <span className="size-6 animate-spin rounded-full border-2 border-info border-t-transparent" />
                <p>Writing “{plan?.conceptName}” with the Nosana model…</p>
              </>
            ) : (
              <>
                <p className="max-w-sm">
                  Pick a cookbook on the left, or let the graph choose what to write next. Every code block gets its own Daytona sandbox; a
                  cookbook is verified only when all of them pass.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
