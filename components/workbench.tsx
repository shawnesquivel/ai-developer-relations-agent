"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { CookbookView, cookbookState } from "@/components/cookbook-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function Workbench() {
  const [cookbooks, setCookbooks] = useState<Cookbook[] | null>(null);
  const [broken, setBroken] = useState<BrokenCookbook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "planning" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [runningBlockId, setRunningBlockId] = useState<string | null>(null);
  const [graphKey, setGraphKey] = useState(0);
  const [showCypher, setShowCypher] = useState(false);
  const [generated, setGenerated] = useState(false);

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
    setError(null);
    setGenerated(false);
    try {
      const next = await api<PlanResult>("/api/cookbook/plan", { method: "POST" });
      setPlan(next);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "plan failed");
    } finally {
      setPhase("idle");
    }
  }

  async function doGenerate() {
    if (!plan) return;
    setPhase("generating");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "generate failed");
    } finally {
      setPhase("idle");
    }
  }

  async function runBlock(blockId: string) {
    if (!selected) return;
    setRunningBlockId(blockId);
    setError(null);
    try {
      const result = await api<{ cookbook: Cookbook }>("/api/cookbook/run", {
        method: "POST",
        body: JSON.stringify({ cookbookId: selected.id, blockId }),
      });
      setCookbooks((prev) => (prev ?? []).map((c) => (c.id === result.cookbook.id ? result.cookbook : c)));
      setGraphKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "run failed");
    } finally {
      setRunningBlockId(null);
    }
  }

  async function runAll() {
    if (!selected) return;
    for (const block of selected.blocks) {
      await runBlock(block.id);
      const latest = await refreshCookbooks();
      const current = latest.find((c) => c.id === selected.id);
      if (current) setSelectedId(current.id);
    }
    setGraphKey((k) => k + 1);
  }

  const busy = phase !== "idle" || Boolean(runningBlockId);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="min-w-0 space-y-4">
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

        <GraphCanvas highlightId={plan?.conceptId} refreshKey={graphKey} />

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
                    <p className="text-[11px] text-muted-foreground">{book.conceptName}</p>
                  </button>
                );
              })
            )}
            {broken.length ? (
              <div className="mt-3 space-y-1">
                <p className="text-[11px] font-medium text-crimson">Broken</p>
                {broken.map((item, index) => (
                  <p key={`${item.id}-${item.blockIndex}-${index}`} className="text-[11px] text-crimson">
                    {item.title} · block {item.blockIndex}
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
              Writing “{plan?.conceptName}” with the {plan?.mode === "live" ? "Nosana" : "mock"} model…
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
