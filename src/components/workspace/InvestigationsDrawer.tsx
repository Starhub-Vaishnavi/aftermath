"use client";

import { GitCompare, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { InvestigationMeta } from "@/lib/store/types";
import { Badge, Button, Spinner, cx } from "@/components/ui";

export function InvestigationsDrawer({
  projectId,
  items,
  loading,
  activeId,
  onOpen,
  onDelete,
  onClose,
}: {
  projectId: string;
  items: InvestigationMeta[] | null;
  loading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));

  return (
    <div className="animate-fade-in fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <aside className="animate-rise flex h-full w-[min(440px,100%)] flex-col border-l border-ink-700 bg-ink-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Saved investigations</h2>
            <p className="text-xs text-ink-400">Select two to compare their aftermath.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && !items && (
            <div className="flex items-center gap-2 p-3 text-sm text-ink-400">
              <Spinner /> Loading…
            </div>
          )}
          {items?.length === 0 && <div className="p-4 text-sm text-ink-400">No investigations yet. Run a simulation and it is saved automatically.</div>}
          <ul className="space-y-1.5">
            {items?.map((it) => (
              <li
                key={it.id}
                className={cx(
                  "group rounded-xl border px-3 py-2.5 transition-colors",
                  it.id === activeId ? "border-ember-500/40 bg-ember-500/[0.05]" : "border-ink-800 hover:border-ink-600",
                )}
              >
                <div className="flex items-start gap-2.5">
                  <input type="checkbox" checked={picked.includes(it.id)} onChange={() => toggle(it.id)} className="mt-1 accent-ember-500" aria-label="Select for comparison" />
                  <button onClick={() => onOpen(it.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-[13px] text-ink-100">{it.change}</div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-ink-400">
                      {it.target.file}
                      {it.target.symbol && ` › ${it.target.symbol}`}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Badge tone="amber">{it.stats.direct + it.stats.transitive} dependents</Badge>
                      <Badge>{it.mode}</Badge>
                      <span className="text-[10.5px] text-ink-500">{new Date(it.createdAt).toLocaleString()}</span>
                    </div>
                  </button>
                  <button onClick={() => onDelete(it.id)} className="rounded p-1 text-ink-500 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300" aria-label="Delete investigation">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-ink-800 p-3">
          {picked.length === 2 ? (
            <Link href={`/p/${projectId}/compare?a=${picked[0]}&b=${picked[1]}`}>
              <Button variant="primary" className="w-full">
                <GitCompare className="size-4" /> Compare selected
              </Button>
            </Link>
          ) : (
            <Button className="w-full" disabled>
              <GitCompare className="size-4" /> Select {2 - picked.length} more to compare
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
