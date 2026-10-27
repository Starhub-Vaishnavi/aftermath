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
import { Folder } from "lucide-react";
import { memo, useEffect, useMemo } from "react";
import type { ImpactReport } from "@/lib/analysis/types";
import type { PublicGraph } from "@/lib/client/api";
import { basename, cx, dirOf } from "@/components/ui";

const NODE_W = 210;
const NODE_H = 46;
const FOLDER_PREFIX = "dir:";

type NodeState = "idle" | "target" | "confirmed" | "possible" | "excluded" | "dim";
const STATE_RANK: Record<NodeState, number> = { target: 5, confirmed: 4, possible: 3, excluded: 2, idle: 1, dim: 0 };

export type Grouping = "files" | "folders";

interface BaseNodeData {
  label: string;
  sublabel: string;
  ext: string;
  state: NodeState;
  depth: number | null;
  isTest: boolean;
  /** Folder nodes only: number of files, and how many are impacted. */
  folder: { files: number; impacted: number } | null;
}

interface NodeData extends BaseNodeData, Record<string, unknown> {
  selected: boolean;
  emphasized: boolean;
}

const EXT_COLOR: Record<string, string> = { ts: "#4f8dff", tsx: "#5ec8ff", js: "#f4d35e", jsx: "#f7b955", mjs: "#f4d35e", cjs: "#e8c547", mts: "#4f8dff", cts: "#4f8dff" };

const GraphNode = memo(function GraphNode({ data }: NodeProps<Node<NodeData>>) {
  const s = data.state;
  return (
    <div
      className={cx(
        "group relative flex h-[46px] w-[210px] items-center gap-2.5 rounded-[10px] border px-3 transition-all duration-200",
        data.folder && "border-2",
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
      {data.folder ? (
        <Folder className="size-3.5 shrink-0 text-ink-400" />
      ) : (
        <span className="size-2 shrink-0 rounded-[3px]" style={{ background: EXT_COLOR[data.ext] ?? "#8a8f98" }} />
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className={cx("truncate font-mono text-[12px] font-medium", s === "dim" ? "text-ink-400" : "text-ink-100")}>{data.label}</div>
        <div className="truncate text-[10px] text-ink-400">{data.sublabel}</div>
      </div>
      {data.isTest && <span className="rounded bg-ink-700 px-1 text-[9px] font-semibold tracking-wide text-ink-300">TEST</span>}
      {data.folder && data.folder.impacted > 0 && s !== "target" && (
        <span className="rounded-full bg-amber-impact px-1.5 text-[10px] font-semibold text-ink-950 tabular-nums" title="Impacted files in this folder">
          {data.folder.impacted}
        </span>
      )}
      {!data.folder && data.depth !== null && data.depth > 0 && (
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

const nodeTypes = { item: GraphNode };

/** A file- or folder-level view of the dependency graph that shares layout and rendering. */
interface Projection {
  nodes: { id: string; data: BaseNodeData }[];
  /** key = "<from>-><to>" in impact direction (imported module -> importer) */
  edges: Map<string, { from: string; to: string; typeOnly: boolean; dynamic: boolean; count: number; underlying: Set<string> }>;
  /** file path -> projected node id */
  owner: Map<string, string>;
}

function layout(nodeIds: string[], edges: Projection["edges"]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 14, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of nodeIds) g.setNode(id, { width: NODE_W, height: NODE_H });
  for (const e of edges.values()) g.setEdge(e.from, e.to);
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
  grouping: Grouping;
  /** When set (files view), only files in this folder and their direct neighbors are shown. */
  folderFocus: string | null;
  onSelectFile: (path: string) => void;
  onOpenFolder: (dir: string) => void;
}

function Canvas({ graph, selectedFile, report, emphasizeFile, focusImpact, hideTests, grouping, folderFocus, onSelectFile, onOpenFolder }: GraphCanvasProps) {
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

  /** Files that pass the filters. */
  const visibleFiles = useMemo(() => {
    let files = graph.nodes.filter((n) => !(hideTests && n.isTest) && !(focusImpact && impactState && !impactState.state.has(n.id)));
    if (grouping === "files" && folderFocus !== null) {
      const inFolder = new Set(files.filter((n) => n.dir === folderFocus).map((n) => n.id));
      const keep = new Set(inFolder);
      for (const e of graph.edges) {
        if (inFolder.has(e.source)) keep.add(e.target);
        if (inFolder.has(e.target)) keep.add(e.source);
      }
      files = files.filter((n) => keep.has(n.id));
    }
    return files;
  }, [graph, hideTests, focusImpact, impactState, grouping, folderFocus]);

  const projection = useMemo<Projection>(() => {
    const owner = new Map<string, string>();
    const nodes: Projection["nodes"] = [];
    const stateOf = (file: string): NodeState => (impactState ? (impactState.state.get(file)?.s ?? "dim") : "idle");

    if (grouping === "files") {
      for (const n of visibleFiles) {
        owner.set(n.id, n.id);
        const st = impactState?.state.get(n.id);
        nodes.push({
          id: n.id,
          data: { label: basename(n.path), sublabel: dirOf(n.path) || "/", ext: n.path.split(".").pop() ?? "", state: stateOf(n.id), depth: st && st.depth > 0 ? st.depth : null, isTest: n.isTest, folder: null },
        });
      }
    } else {
      const byDir = new Map<string, typeof visibleFiles>();
      for (const n of visibleFiles) {
        const d = n.dir || "/";
        if (!byDir.has(d)) byDir.set(d, []);
        byDir.get(d)!.push(n);
        owner.set(n.id, FOLDER_PREFIX + d);
      }
      for (const [dir, files] of byDir) {
        let best: NodeState = impactState ? "dim" : "idle";
        let impacted = 0;
        for (const f of files) {
          const s = stateOf(f.id);
          if (STATE_RANK[s] > STATE_RANK[best]) best = s;
          if (s === "confirmed" || s === "possible") impacted++;
        }
        const segs = dir.split("/");
        nodes.push({
          id: FOLDER_PREFIX + dir,
          data: {
            label: `${segs[segs.length - 1]}/`,
            sublabel: `${files.length} file${files.length === 1 ? "" : "s"}${segs.length > 1 ? ` · ${segs.slice(0, -1).join("/")}` : ""}`,
            ext: "",
            state: best,
            depth: null,
            isTest: files.every((f) => f.isTest),
            folder: { files: files.length, impacted },
          },
        });
      }
    }

    const edges: Projection["edges"] = new Map();
    for (const e of graph.edges) {
      const from = owner.get(e.target);
      const to = owner.get(e.source);
      if (!from || !to || from === to) continue;
      const key = `${from}->${to}`;
      const cur = edges.get(key);
      if (cur) {
        cur.count++;
        cur.typeOnly &&= e.typeOnly;
        cur.dynamic &&= e.kind === "dynamic";
        cur.underlying.add(`${e.target}->${e.source}`);
      } else edges.set(key, { from, to, typeOnly: e.typeOnly, dynamic: e.kind === "dynamic", count: 1, underlying: new Set([`${e.target}->${e.source}`]) });
    }
    return { nodes, edges, owner };
  }, [graph, visibleFiles, grouping, impactState]);

  const positions = useMemo(() => layout(projection.nodes.map((n) => n.id), projection.edges), [projection]);

  const selectedId = selectedFile ? projection.owner.get(selectedFile) : null;
  const emphasizedId = emphasizeFile ? projection.owner.get(emphasizeFile) : null;

  const nodes: Node<NodeData>[] = useMemo(
    () =>
      projection.nodes.map((n) => ({
        id: n.id,
        type: "item",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: { ...n.data, selected: n.id === selectedId, emphasized: n.id === emphasizedId },
        // Explicit size + handles let React Flow render nodes and edges before DOM measurement.
        width: NODE_W,
        height: NODE_H,
        handles: [
          { type: "target" as const, position: Position.Left, x: 0, y: NODE_H / 2 - 3, width: 6, height: 6 },
          { type: "source" as const, position: Position.Right, x: NODE_W - 6, y: NODE_H / 2 - 3, width: 6, height: 6 },
        ],
        draggable: true,
        connectable: false,
      })),
    [projection, positions, selectedId, emphasizedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      [...projection.edges.entries()].map(([key, a]) => {
        const under = [...a.underlying];
        const onPath = !!impactState && under.some((k) => impactState.pathEdges.has(k));
        const onChain = !!impactState && under.some((k) => impactState.chain.has(k));
        const color = onChain ? "#ff8a5c" : onPath ? "#f5b14a" : impactState ? "#2d323a" : "#3a404a";
        return {
          id: key,
          source: a.from,
          target: a.to,
          animated: onPath,
          zIndex: onPath ? 10 : 0,
          label: grouping === "folders" && a.count > 1 ? String(a.count) : undefined,
          labelStyle: { fill: "#949ba6", fontSize: 10, fontFamily: "var(--font-mono)" },
          labelBgStyle: { fill: "#0c0d10" },
          labelBgPadding: [3, 1] as [number, number],
          style: {
            stroke: color,
            strokeWidth: onChain ? 2.6 : onPath ? 1.8 : grouping === "folders" ? Math.min(1 + Math.log2(a.count), 4) : 1,
            strokeOpacity: impactState && !onPath ? 0.45 : 1,
            strokeDasharray: a.typeOnly ? "4 4" : a.dynamic ? "1 4" : undefined,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        } satisfies Edge;
      }),
    [projection, impactState, grouping],
  );

  // Frame the impact area whenever a new report arrives.
  useEffect(() => {
    if (!report) return;
    const ids = new Set<string>();
    for (const f of [report.target.file, ...report.impacted.map((n) => n.file)]) {
      const id = projection.owner.get(f);
      if (id) ids.add(id);
    }
    const t = setTimeout(() => rf.fitView({ nodes: [...ids].map((id) => ({ id })), duration: 650, padding: 0.25, maxZoom: 1.1 }), 60);
    return () => clearTimeout(t);
  }, [report, rf]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ duration: 400, padding: 0.15 }), 60);
    return () => clearTimeout(t);
  }, [hideTests, focusImpact, grouping, folderFocus, rf]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => (n.id.startsWith(FOLDER_PREFIX) ? onOpenFolder(n.id.slice(FOLDER_PREFIX.length)) : onSelectFile(n.id))}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.05}
      maxZoom={2}
      onlyRenderVisibleElements={nodes.length > 300}
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
          const s = (n.data as NodeData).state;
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
