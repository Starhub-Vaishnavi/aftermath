"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useEffect, useMemo } from "react";
import type { ImpactReport } from "@/lib/analysis/types";
import type { PublicGraph } from "@/lib/client/api";
import { basename, cx, dirOf } from "@/components/ui";

const NODE_W = 210;
const NODE_H = 46;

type NodeState = "idle" | "target" | "confirmed" | "possible" | "excluded" | "dim";

interface FileNodeData extends Record<string, unknown> {
  path: string;
  state: NodeState;
  depth: number | null;
  selected: boolean;
  isTest: boolean;
  emphasized: boolean;
}

const EXT_COLOR: Record<string, string> = { ts: "#4f8dff", tsx: "#5ec8ff", js: "#f4d35e", jsx: "#f7b955", mjs: "#f4d35e", cjs: "#e8c547", mts: "#4f8dff", cts: "#4f8dff" };

const FileNode = memo(function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  const ext = data.path.split(".").pop() ?? "";
  const s = data.state;
  return (
    <div
      className={cx(
        "group relative flex h-[46px] w-[210px] items-center gap-2.5 rounded-[10px] border px-3 transition-all duration-200",
        s === "idle" && "border-ink-700 bg-ink-850 hover:border-ink-500",
        s === "dim" && "border-ink-800 bg-ink-900 opacity-[0.28]",
        s === "target" && "target-pulse border-ember-500 bg-[#2a1610]",
        s === "confirmed" && "border-amber-impact/80 bg-[#241c0f]",
        s === "possible" && "border-dashed border-amber-impact/70 bg-[#1b170f]",
        s === "excluded" && "border-calm-400/50 bg-[#121827]",
        data.selected && s !== "target" && "ring-2 ring-ink-100/40",
        data.emphasized && "ring-2 ring-ember-400/70 ring-offset-2 ring-offset-ink-950",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-ink-600" />
      <span className="size-2 shrink-0 rounded-[3px]" style={{ background: EXT_COLOR[ext] ?? "#8a8f98" }} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={cx("truncate font-mono text-[12px] font-medium", s === "dim" ? "text-ink-400" : "text-ink-100")}>{basename(data.path)}</div>
        <div className="truncate text-[10px] text-ink-400">{dirOf(data.path) || "/"}</div>
      </div>
      {data.isTest && <span className="rounded bg-ink-700 px-1 text-[9px] font-semibold tracking-wide text-ink-300">TEST</span>}
      {data.depth !== null && data.depth > 0 && (
        <span
          className={cx(
            "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
            s === "possible" ? "border border-dashed border-amber-impact text-amber-impact" : "bg-amber-impact text-ink-950",
          )}
          title={`Depth ${data.depth}`}
        >
          {data.depth}
        </span>
      )}
      {s === "target" && <span className="rounded bg-ember-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white">CHANGE</span>}
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-ink-600" />
    </div>
  );
});

const nodeTypes = { file: FileNode };

function layout(graph: PublicGraph, visible: Set<string>) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 14, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graph.nodes) if (visible.has(n.id)) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of graph.edges) {
    // Draw from the imported module to its importer: the direction impact travels.
    if (visible.has(e.source) && visible.has(e.target)) g.setEdge(e.target, e.source);
  }
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number }>();
  for (const id of g.nodes()) {
    const n = g.node(id);
    if (n) pos.set(id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 });
  }
  return pos;
}

export interface GraphCanvasProps {
  graph: PublicGraph;
  selectedFile: string | null;
  report: ImpactReport | null;
  emphasizeFile: string | null;
  focusImpact: boolean;
  hideTests: boolean;
  onSelectFile: (path: string) => void;
}

function Canvas({ graph, selectedFile, report, emphasizeFile, focusImpact, hideTests, onSelectFile }: GraphCanvasProps) {
  const rf = useReactFlow();

  const impactState = useMemo(() => {
    if (!report) return null;
    const state = new Map<string, { s: NodeState; depth: number }>();
    state.set(report.target.file, { s: "target", depth: 0 });
    for (const n of report.impacted) state.set(n.file, { s: n.confidence, depth: n.depth });
    for (const e of report.excluded) if (!state.has(e.file)) state.set(e.file, { s: "excluded", depth: -1 });
    const pathEdges = new Set<string>();
    for (const n of report.impacted) for (const h of n.path) pathEdges.add(`${h.to}->${h.from}`);
    const chain = new Set<string>();
    const emph = emphasizeFile ? report.impacted.find((n) => n.file === emphasizeFile) : null;
    if (emph) for (const h of emph.path) chain.add(`${h.to}->${h.from}`);
    return { state, pathEdges, chain };
  }, [report, emphasizeFile]);

  const visible = useMemo(() => {
    const set = new Set<string>();
    for (const n of graph.nodes) {
      if (hideTests && n.isTest) continue;
      if (focusImpact && impactState && !impactState.state.has(n.id)) continue;
      set.add(n.id);
    }
    return set;
  }, [graph, hideTests, focusImpact, impactState]);

  const positions = useMemo(() => layout(graph, visible), [graph, visible]);

  const nodes: Node<FileNodeData>[] = useMemo(
    () =>
      graph.nodes
        .filter((n) => visible.has(n.id))
        .map((n) => {
          const st = impactState?.state.get(n.id);
          return {
            id: n.id,
            type: "file",
            position: positions.get(n.id) ?? { x: 0, y: 0 },
            data: {
              path: n.path,
              state: impactState ? (st?.s ?? "dim") : "idle",
              depth: st && st.depth > 0 ? st.depth : null,
              selected: n.id === selectedFile,
              isTest: n.isTest,
              emphasized: n.id === emphasizeFile,
            },
            // Explicit size + handles let React Flow render nodes and edges before DOM measurement.
            width: NODE_W,
            height: NODE_H,
            handles: [
              { type: "target" as const, position: Position.Left, x: 0, y: NODE_H / 2 - 3, width: 6, height: 6 },
              { type: "source" as const, position: Position.Right, x: NODE_W - 6, y: NODE_H / 2 - 3, width: 6, height: 6 },
            ],
            draggable: true,
            connectable: false,
          };
        }),
    [graph, visible, positions, impactState, selectedFile, emphasizeFile],
  );

  const edges: Edge[] = useMemo(() => {
    const agg = new Map<string, { from: string; to: string; typeOnly: boolean; count: number; kinds: Set<string> }>();
    for (const e of graph.edges) {
      if (!visible.has(e.source) || !visible.has(e.target)) continue;
      const key = `${e.target}->${e.source}`;
      const cur = agg.get(key);
      if (cur) {
        cur.count++;
        cur.typeOnly &&= e.typeOnly;
        cur.kinds.add(e.kind);
      } else agg.set(key, { from: e.target, to: e.source, typeOnly: e.typeOnly, count: 1, kinds: new Set([e.kind]) });
    }
    return [...agg.entries()].map(([key, a]) => {
      const onPath = impactState?.pathEdges.has(key);
      const onChain = impactState?.chain.has(key);
      const color = onChain ? "#ff8a5c" : onPath ? "#f5b14a" : impactState ? "#2d323a" : "#3a404a";
      return {
        id: key,
        source: a.from,
        target: a.to,
        animated: !!onPath,
        zIndex: onPath ? 10 : 0,
        style: {
          stroke: color,
          strokeWidth: onChain ? 2.6 : onPath ? 1.8 : 1,
          strokeOpacity: impactState && !onPath ? 0.45 : 1,
          strokeDasharray: a.typeOnly ? "4 4" : a.kinds.has("dynamic") ? "1 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      } satisfies Edge;
    });
  }, [graph, visible, impactState]);

  // Frame the impact area whenever a new report arrives.
  useEffect(() => {
    if (!report) return;
    const ids = [report.target.file, ...report.impacted.map((n) => n.file)].filter((id) => visible.has(id));
    const t = setTimeout(() => rf.fitView({ nodes: ids.map((id) => ({ id })), duration: 650, padding: 0.25, maxZoom: 1.1 }), 60);
    return () => clearTimeout(t);
  }, [report, rf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ duration: 400, padding: 0.15 }), 60);
    return () => clearTimeout(t);
  }, [hideTests, focusImpact, rf]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelectFile(n.id)}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.08}
      maxZoom={2}
      onlyRenderVisibleElements={graph.nodes.length > 300}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      colorMode="dark"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.06)" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        maskColor="rgba(8,9,11,0.7)"
        nodeColor={(n) => {
          const s = (n.data as FileNodeData).state;
          return s === "target" ? "#ff6a3d" : s === "confirmed" || s === "possible" ? "#f5b14a" : s === "excluded" ? "#7c9cff" : "#2d323a";
        }}
        nodeStrokeWidth={0}
      />
    </ReactFlow>
  );
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
