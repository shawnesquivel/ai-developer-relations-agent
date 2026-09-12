"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-3d";
import { Button } from "@/components/ui/button";
import type { GraphLink, GraphNode } from "@/lib/graph-types";
import { SDK_SOURCE } from "@/lib/sdk-source.generated";

export const LABEL_COLORS: Record<string, string> = {
  Concept: "#26251e",
  Toolkit: "#c08532",
  Tool: "#c08532",
  Cookbook: "#34785c",
  CodeBlock: "#7a7974",
  Run: "#34785c",
};

const LINK_COLORS: Record<string, string> = {
  PREREQ_OF: "rgba(245,78,0,0.7)",
  TEACHES: "rgba(31,138,101,0.7)",
  VERIFIED_BY: "rgba(52,120,92,0.65)",
  CONTAINS: "rgba(38,37,30,0.35)",
  COVERS: "rgba(38,37,30,0.45)",
  USES: "rgba(192,133,50,0.55)",
};

type GraphPayload = { nodes: GraphNode[]; links: GraphLink[]; mode?: "live" | "mock" };

export function GraphCanvas({
  highlightId,
  focusId,
  refreshKey,
}: {
  highlightId?: string | null;
  focusId?: string | null;
  refreshKey?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 640, h: 440 });
  const [data, setData] = useState<GraphPayload>({ nodes: [], links: [] });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "500" });
    if (focusId) params.set("focus", focusId);
    const res = await fetch(`/api/graph/subgraph?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load graph");
    return json as GraphPayload;
  }, [focusId]);

  const fetchSubgraph = useCallback(async () => {
    try {
      const json = await load();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load()
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load graph");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, load]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(el.clientHeight, 440) });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: Math.max(el.clientHeight, 440) });
    return () => ro.disconnect();
  }, []);

  const nodeColor = (node: NodeObject) => {
    const n = node as NodeObject & GraphNode;
    if (n.id === highlightId) return "#f54e00";
    if (n.label === "Concept") return n.documented ? "#1f8a65" : "#26251e";
    if (n.label === "Run") return n.status === "fail" ? "#cf2d56" : "#34785c";
    return LABEL_COLORS[n.label] ?? "#7a7974";
  };

  return (
    <div className="relative min-h-[440px] overflow-hidden rounded border border-border bg-bone" ref={wrap}>
      <div className="absolute left-3 top-3 z-10 flex max-w-[70%] flex-col gap-1">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              void fetchSubgraph();
            }}
            disabled={loading}
          >
            {loading ? "Loading…" : "Reload"}
          </Button>
          {data.mode ? <span className="font-mono text-[12px] uppercase text-ash">{data.mode}</span> : null}
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Synced from {SDK_SOURCE.packageName} v{SDK_SOURCE.packageVersion} source. Neo4j chooses the next gap; Daytona
          runs are its proof.
        </p>
      </div>
      <Legend />
      {error ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-bone/90 p-6 text-center">
          <p className="text-sm text-crimson">Failed to load graph: {error}</p>
          <Button
            size="sm"
            onClick={() => {
              setLoading(true);
              void fetchSubgraph();
            }}
          >
            Reload
          </Button>
        </div>
      ) : null}
      {!loading && !error && data.nodes.length === 0 ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Graph is empty. Plan a concept or select a cookbook.
        </div>
      ) : (
        <ForceGraph3D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="#f2f1ed"
          nodeId="id"
          nodeLabel={(n) => {
            const node = n as NodeObject & GraphNode;
            const extra = node.detail ?? (node.documented === true ? "documented" : node.documented === false ? "undocumented" : "");
            return [`${node.label}: ${node.name}`, extra].filter(Boolean).join("\n");
          }}
          nodeColor={nodeColor}
          nodeVal={(n) => ((n as NodeObject & GraphNode).id === highlightId ? 8 : 3)}
          linkColor={(l) => LINK_COLORS[(l as GraphLink).type] ?? "rgba(38,37,30,0.28)"}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={(l) => {
            const type = (l as GraphLink).type;
            return type === "PREREQ_OF" || type === "TEACHES" || type === "VERIFIED_BY" ? 2 : 0;
          }}
          linkDirectionalParticleWidth={1.4}
          linkLabel={(l) => {
            const type = (l as GraphLink).type;
            if (type === "PREREQ_OF") return "PREREQ_OF — must be documented first";
            if (type === "VERIFIED_BY") return "VERIFIED_BY — sandbox proof";
            if (type === "TEACHES") return "TEACHES — all latest runs passed";
            if (type === "COVERS") return "COVERS — article is about this concept";
            if (type === "CONTAINS") return "CONTAINS — fence in article order";
            if (type === "USES") return "USES — inferred GitHub tool";
            return type;
          }}
          showNavInfo={false}
        />
      )}
    </div>
  );
}

function Legend() {
  const items = [
    ["Documented concept", "#1f8a65"],
    ["Undocumented concept", "#26251e"],
    ["Cookbook article", "#34785c"],
    ["Code block", "#7a7974"],
    ["Passing run", "#34785c"],
    ["Failed run", "#cf2d56"],
    ["Planner pick", "#f54e00"],
  ] as const;
  return (
    <div className="absolute bottom-3 right-3 z-10 hidden rounded border border-stone bg-bone/90 p-2 md:block">
      {items.map(([label, color]) => (
        <div key={label} className="flex items-center gap-2 font-mono text-[12px] text-ash">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </div>
      ))}
    </div>
  );
}
