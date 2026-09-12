"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GraphLink, GraphNode } from "@/lib/graph-types";

// react-force-graph-3d touches window/WebGL at import time; never render it on the server.
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), { ssr: false });

interface SubgraphResponse {
  nodes: GraphNode[];
  links: GraphLink[];
  mode: "live" | "mock";
  error?: string;
}

async function fetchSubgraph(): Promise<SubgraphResponse> {
  const res = await fetch("/api/graph/subgraph?limit=500", { cache: "no-store" });
  const json = (await res.json()) as SubgraphResponse;
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

// Warm brand palette (matches the CSS tokens in globals.css; WebGL needs literal values).
export const PALETTE = {
  background: "#14120b",
  foreground: "#edecec",
  muted: "#a8a69e",
  highlight: "#f08a6e",
  success: "#8fc79a",
  destructive: "#e0685a",
  info: "#8fb4e3",
  warning: "#e0b96a",
  undocumented: "#43413c",
  accent: "#c9b8e8",
  accentSoft: "#8f8aa3",
} as const;

export const LABEL_COLORS: Record<string, string> = {
  Concept: PALETTE.info,
  Toolkit: PALETTE.warning,
  Tool: "#c9a15a",
  Cookbook: PALETTE.accent,
  CodeBlock: PALETTE.accentSoft,
  Run: PALETTE.success,
};

interface Props {
  /** Node id to highlight (the concept the planner picked). */
  highlightId?: string | null;
  /** Bump to force a refetch (e.g. after a verification writes back to Neo4j). */
  refreshKey?: number;
}

export function GraphCanvas({ highlightId, refreshKey = 0 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 600, height: 480 });
  const [data, setData] = useState<SubgraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    fetchSubgraph()
      .then((json) => {
        setData(json);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));

  const reload = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  useEffect(() => {
    void load();
     
  }, [refreshKey]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodeColor = (n: GraphNode) => {
    if (n.id === highlightId) return PALETTE.highlight;
    if (n.label === "Concept") return n.documented ? PALETTE.info : PALETTE.undocumented;
    if (n.label === "Run") return n.status === "fail" ? PALETTE.destructive : PALETTE.success;
    return LABEL_COLORS[n.label] ?? PALETTE.foreground;
  };

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Concept graph</span>
          {data && (
            <>
              <Badge variant={data.mode === "live" ? "default" : "secondary"} className="uppercase">
                neo4j {data.mode}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {data.nodes.length} nodes · {data.links.length} links
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Legend />
          <Button size="sm" variant="outline" onClick={reload} disabled={loading}>
            {loading ? "Loading…" : "Reload"}
          </Button>
        </div>
      </div>
      <div ref={wrapRef} className="relative min-h-[380px] flex-1 overflow-hidden rounded-b-xl">
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-destructive">
            Failed to load graph: {error}
          </div>
        )}
        {!error && data && data.nodes.length === 0 && (
          <div className="text-muted-foreground absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm">
            Graph is empty. POST nodes to /api/graph/query to populate it.
          </div>
        )}
        {data && (
          <ForceGraph3D
            width={size.width}
            height={size.height}
            graphData={{ nodes: data.nodes, links: data.links }}
            backgroundColor={PALETTE.background}
            nodeLabel={(n) => `${(n as GraphNode).label}: ${(n as GraphNode).name}`}
            nodeColor={(n) => nodeColor(n as GraphNode)}
            nodeVal={(n) => ((n as GraphNode).id === highlightId ? 14 : (n as GraphNode).label === "Concept" ? 5 : 2)}
            nodeRelSize={4}
            nodeOpacity={0.95}
            linkLabel={(l) => (l as GraphLink).type}
            linkColor={(l) => ((l as GraphLink).type === "TEACHES" ? "rgba(143,199,154,0.9)" : "rgba(237,236,236,0.22)")}
            linkWidth={(l) => ((l as GraphLink).type === "TEACHES" ? 2 : 0.5)}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkDirectionalParticles={(l) => ((l as GraphLink).type === "PREREQ_OF" || (l as GraphLink).type === "TEACHES" ? 2 : 0)}
            linkDirectionalParticleWidth={1.5}
          />
        )}
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["picked", PALETTE.highlight],
    ["documented", PALETTE.info],
    ["undocumented", PALETTE.undocumented],
    ["cookbook", LABEL_COLORS.Cookbook],
    ["tool", LABEL_COLORS.Tool],
    ["run", LABEL_COLORS.Run],
  ];
  return (
    <div className="text-muted-foreground hidden flex-wrap items-center gap-2 text-[11px] md:flex">
      {items.map(([name, color]) => (
        <span key={name} className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full" style={{ background: color }} />
          {name}
        </span>
      ))}
    </div>
  );
}
