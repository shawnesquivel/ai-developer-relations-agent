import type { GraphLink, GraphNode } from "./graph-types";

const PROOF_TYPES = new Set(["COVERS", "CONTAINS", "VERIFIED_BY", "TEACHES", "USES", "PREREQ_OF"]);

function nodeDetail(node: GraphNode): string {
  if (node.detail) return node.detail;
  if (node.label === "Concept") {
    const state = node.documented ? "Documented SDK lesson" : "Undocumented — planner can pick this";
    const source = node.sourcePath
      ? `${node.sourcePath}${node.sourceSymbol ? ` · ${node.sourceSymbol}` : ""}${node.sourceVersion ? ` · v${node.sourceVersion}` : ""}`
      : "source metadata unavailable";
    return `${state}\n${source}`;
  }
  if (node.label === "Cookbook") return "Markdown article that COVERS a concept";
  if (node.label === "CodeBlock") return "Independent TypeScript fence";
  if (node.label === "Run") {
    return `${node.status === "fail" ? "Failed" : "Passed"} sandbox proof (${node.status ?? "unknown"})`;
  }
  if (node.label === "Tool") return "Composio GitHub tool";
  if (node.label === "Toolkit") return "Composio toolkit";
  return node.label;
}

function hopIds(focusId: string, links: GraphLink[]): Set<string> {
  const keep = new Set<string>([focusId]);
  const add = (id: string) => keep.add(id);
  const around = (id: string) => {
    for (const link of links) {
      if (!PROOF_TYPES.has(link.type)) continue;
      if (link.source === id) add(link.target);
      if (link.target === id) add(link.source);
    }
  };
  around(focusId);
  for (const id of [...keep]) around(id);
  return keep;
}

export function focusSubgraph(
  graph: { nodes: GraphNode[]; links: GraphLink[] },
  focusId?: string | null,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes = graph.nodes.map((n) => ({ ...n, detail: nodeDetail(n) }));
  const links = graph.links.filter((l) => PROOF_TYPES.has(l.type) || l.type === "DEMONSTRATES");

  if (!focusId) {
    const planning = new Set(
      nodes.filter((n) => n.label === "Concept" || n.label === "Cookbook").map((n) => n.id),
    );
    return clip(nodes, links, planning);
  }

  const keep = hopIds(focusId, links);
  for (const node of nodes) {
    if (node.label === "Concept" && node.documented) keep.add(node.id);
  }
  return clip(nodes, links, keep);
}

function clip(
  nodes: GraphNode[],
  links: GraphLink[],
  keep: Set<string>,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const filteredNodes = nodes.filter((n) => keep.has(n.id));
  const ids = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = links.filter((l) => ids.has(l.source) && ids.has(l.target));
  return { nodes: filteredNodes, links: filteredLinks };
}
