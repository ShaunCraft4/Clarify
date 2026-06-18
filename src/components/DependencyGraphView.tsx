"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

export interface GraphNode {
  id: string;
  label: string;
  mastery: number | null;
}
export interface GraphEdge {
  from: string;
  to: string;
}

function color(mastery: number | null): string {
  if (mastery == null) return "#e2e8f0";
  if (mastery >= 0.8) return "#bbf7d0";
  if (mastery >= 0.6) return "#fde68a";
  return "#fecaca";
}

/**
 * Layered layout: a node's column = longest prerequisite chain leading to it.
 */
function layout(nodes: GraphNode[], edges: GraphEdge[]) {
  const incoming = new Map<string, string[]>();
  for (const n of nodes) incoming.set(n.id, []);
  for (const e of edges) incoming.get(e.to)?.push(e.from);

  const depthCache = new Map<string, number>();
  const visiting = new Set<string>();
  function depth(id: string): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (visiting.has(id)) return 0; // break cycles
    visiting.add(id);
    const preds = incoming.get(id) ?? [];
    const d = preds.length ? Math.max(...preds.map(depth)) + 1 : 0;
    visiting.delete(id);
    depthCache.set(id, d);
    return d;
  }

  const byCol = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const d = depth(n.id);
    if (!byCol.has(d)) byCol.set(d, []);
    byCol.get(d)!.push(n);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, colNodes] of byCol) {
    colNodes.forEach((n, i) => {
      positions.set(n.id, { x: col * 240, y: i * 110 });
    });
  }
  return positions;
}

export default function DependencyGraphView({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const positions = layout(nodes, edges);
    const rfNodes: Node[] = nodes.map((n) => ({
      id: n.id,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label:
          n.mastery == null
            ? n.label
            : `${n.label}\n${Math.round(n.mastery * 100)}%`,
      },
      style: {
        background: color(n.mastery),
        border: "1px solid #94a3b8",
        borderRadius: 10,
        padding: 8,
        fontSize: 12,
        width: 160,
        whiteSpace: "pre-line",
        textAlign: "center",
      },
    }));
    const rfEdges: Edge[] = edges.map((e, i) => ({
      id: `e${i}`,
      source: e.from,
      target: e.to,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: "#94a3b8" },
    }));
    return { rfNodes, rfEdges };
  }, [nodes, edges]);

  return (
    <div className="h-[480px] rounded-xl border border-slate-200 bg-white">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable
      >
        <Background color="#e2e8f0" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
