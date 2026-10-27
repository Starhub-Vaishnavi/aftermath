"use client";

import { ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ImpactReport } from "@/lib/analysis/types";
import type { PublicGraph } from "@/lib/client/api";
import { basename, cx } from "@/components/ui";

export function FileList({
  graph,
  selected,
  report,
  onSelect,
}: {
  graph: PublicGraph;
  selected: string | null;
  report: ImpactReport | null;
  onSelect: (path: string) => void;
}) {
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fanIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of graph.edges) m.set(e.target, (m.get(e.target) ?? 0) + 1);
    return m;
  }, [graph]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, string[]>();
    for (const n of graph.nodes) {
      if (needle && !n.path.toLowerCase().includes(needle)) continue;
      const d = n.dir || "/";
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(n.path);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [graph, q]);

  const status = useMemo(() => {
    const m = new Map<string, string>();
    if (!report) return m;
    m.set(report.target.file, "target");
    for (const n of report.impacted) m.set(n.file, n.confidence);
    return m;
  }, [report]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-3">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-2.5 focus-within:border-ember-500/50">
          <Search className="size-3.5 text-ink-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${graph.nodes.length} files`}
            className="w-full bg-transparent text-[12.5px] text-ink-100 placeholder:text-ink-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        {groups.length === 0 && <div className="px-3 py-6 text-center text-xs text-ink-500">No files match “{q}”.</div>}
        {groups.map(([dir, files]) => {
          const isCollapsed = collapsed.has(dir) && !q;
          return (
            <div key={dir} className="mb-1">
              <button
                onClick={() =>
                  setCollapsed((c) => {
                    const next = new Set(c);
                    if (next.has(dir)) next.delete(dir);
                    else next.add(dir);
                    return next;
                  })
                }
                className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left font-mono text-[11px] text-ink-400 hover:text-ink-200"
              >
                <ChevronRight className={cx("size-3 transition-transform", !isCollapsed && "rotate-90")} />
                <span className="truncate">{dir}</span>
              </button>
              {!isCollapsed &&
                files.map((f) => {
                  const st = status.get(f);
                  return (
                    <button
                      key={f}
                      onClick={() => onSelect(f)}
                      className={cx(
                        "group flex w-full items-center gap-2 rounded-md py-1 pr-2 pl-6 text-left transition-colors",
                        f === selected ? "bg-ink-750 text-ink-100" : "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
                      )}
                    >
                      <span
                        className={cx(
                          "size-1.5 shrink-0 rounded-full",
                          st === "target" ? "bg-ember-500" : st === "confirmed" ? "bg-amber-impact" : st === "possible" ? "border border-amber-impact" : "bg-transparent",
                        )}
                      />
                      <span className="flex-1 truncate font-mono text-[12px]">{basename(f)}</span>
                      {(fanIn.get(f) ?? 0) > 0 && <span className="text-[10px] text-ink-500 tabular-nums" title="Imported by">{fanIn.get(f)}</span>}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
