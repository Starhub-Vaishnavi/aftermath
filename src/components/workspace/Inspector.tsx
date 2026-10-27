"use client";

import { ArrowDownLeft, ArrowUpRight, FileCode2, Layers, Wand2 } from "lucide-react";
import { useMemo } from "react";
import type { ImpactMode, ImpactReport } from "@/lib/analysis/types";
import type { PublicGraph } from "@/lib/client/api";
import { Badge, Button, Kbd, SectionTitle, Spinner, basename, cx, dirOf } from "@/components/ui";

const EXAMPLES = [
  "Return a structured { amount, currency, display } object instead of a string.",
  "Make the currency parameter required and remove the USD default.",
  "Rename this export and keep a deprecated alias for one release.",
  "Throw instead of returning a fallback value on invalid input.",
];

export interface ProposalState {
  change: string;
  mode: ImpactMode;
  includeTypeOnly: boolean;
}

export function Inspector({
  graph,
  file,
  symbol,
  onSymbol,
  onNavigate,
  onViewCode,
  preview,
  previewLoading,
  previewError,
  proposal,
  setProposal,
  onAnalyze,
  analyzing,
  analyzeError,
}: {
  graph: PublicGraph;
  file: string;
  symbol: string | null;
  onSymbol: (s: string | null) => void;
  onNavigate: (path: string) => void;
  onViewCode: (path: string, line: number) => void;
  preview: ImpactReport | null;
  previewLoading: boolean;
  previewError: string | null;
  proposal: ProposalState;
  setProposal: (p: ProposalState) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  analyzeError: string | null;
}) {
  const node = graph.nodes.find((n) => n.id === file);
  const outgoing = useMemo(() => graph.edges.filter((e) => e.source === file), [graph, file]);
  const incoming = useMemo(() => graph.edges.filter((e) => e.target === file), [graph, file]);
  const unresolved = useMemo(() => graph.unresolved.filter((u) => u.from === file && u.reason !== "external-package" && u.reason !== "builtin"), [graph, file]);
  const exports = node?.exports ?? [];
  const canAnalyze = proposal.change.trim().length >= 8 && !analyzing;

  if (!node) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-800 px-5 py-4">
        <div className="flex items-start gap-3">
          <FileCode2 className="mt-0.5 size-4 shrink-0 text-ink-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[13px] font-medium text-ink-100">{basename(file)}</div>
            <div className="truncate font-mono text-[11px] text-ink-400">{dirOf(file) || "/"}</div>
          </div>
          <button onClick={() => onViewCode(file, 1)} className="text-xs text-ink-400 underline-offset-2 hover:text-ink-100 hover:underline">
            View source
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge>{node.loc} lines</Badge>
          <Badge>{exports.length} exports</Badge>
          <Badge>{incoming.length} importers</Badge>
          {node.isTest && <Badge tone="calm">test</Badge>}
          {node.syntaxErrors > 0 && <Badge tone="amber">{node.syntaxErrors} syntax errors</Badge>}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <SectionTitle>1 · What changes?</SectionTitle>
        <div className="space-y-1">
          <SymbolRow active={symbol === null} onClick={() => onSymbol(null)} name="Entire module" kind="file" line={null} muted />
          {exports.map((e) => (
            <SymbolRow key={`${e.name}:${e.line}`} active={symbol === e.name} onClick={() => onSymbol(e.name)} name={e.name} kind={e.kind} line={e.line} typeOnly={e.typeOnly} />
          ))}
          {exports.length === 0 && <div className="px-2 py-1 text-xs text-ink-500">This file has no exports.</div>}
        </div>

        <div className="mt-4 rounded-xl border border-ink-800 bg-ink-900 px-3.5 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-300">
              <Layers className="size-3.5" /> Static preview
            </span>
            {previewLoading && <Spinner className="size-3.5" />}
          </div>
          {previewError ? (
            <div className="mt-1.5 text-xs text-red-300">{previewError}</div>
          ) : preview ? (
            <div className="mt-2 flex items-baseline gap-4 tabular-nums">
              <Stat value={preview.impacted.length} label="dependents" strong />
              <Stat value={preview.stats.direct} label="direct" />
              <Stat value={preview.stats.transitive} label="transitive" />
              <Stat value={preview.excluded.length} label="excluded" />
            </div>
          ) : (
            <div className="skeleton mt-2 h-6 rounded" />
          )}
        </div>

        <div className="mt-6">
          <SectionTitle>2 · Describe the proposed change</SectionTitle>
          <textarea
            value={proposal.change}
            onChange={(e) => setProposal({ ...proposal, change: e.target.value })}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canAnalyze) onAnalyze();
            }}
            rows={4}
            placeholder={`e.g. ${EXAMPLES[0]}`}
            className="w-full resize-none rounded-xl border border-ink-700 bg-ink-950 px-3.5 py-3 text-[13px] leading-relaxed text-ink-100 placeholder:text-ink-500 focus:border-ember-500/60 focus:ring-2 focus:ring-ember-500/15 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setProposal({ ...proposal, change: ex })}
                className="max-w-full truncate rounded-full border border-ink-700 px-2.5 py-1 text-[11px] text-ink-300 transition-colors hover:border-ink-500 hover:text-ink-100"
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-0.5 text-xs" role="radiogroup" aria-label="Analysis mode">
              {(["symbol", "file"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={proposal.mode === m}
                  onClick={() => setProposal({ ...proposal, mode: m })}
                  className={cx("rounded-md px-2.5 py-1 transition-colors", proposal.mode === m ? "bg-ink-750 text-ink-100" : "text-ink-400 hover:text-ink-200")}
                  title={m === "symbol" ? "Follow only code that references the changed export" : "Every importer of every reached file (conservative)"}
                >
                  {m === "symbol" ? "Symbol-precise" : "File-level"}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-300">
              <input
                type="checkbox"
                checked={proposal.includeTypeOnly}
                onChange={(e) => setProposal({ ...proposal, includeTypeOnly: e.target.checked })}
                className="accent-ember-500"
              />
              Include type-only
            </label>
          </div>

          <Button variant="primary" className="mt-4 h-10 w-full" onClick={onAnalyze} disabled={!canAnalyze} loading={analyzing}>
            {!analyzing && <Wand2 className="size-4" />}
            {analyzing ? "Analyzing impact…" : "Simulate aftermath"}
            {!analyzing && (
              <span className="ml-1 opacity-70">
                <Kbd>⌘</Kbd> <Kbd>↵</Kbd>
              </span>
            )}
          </Button>
          {analyzeError && (
            <div role="alert" className="animate-rise mt-3 rounded-lg border border-red-500/30 bg-red-500/[0.07] px-3 py-2 text-xs text-red-200">
              {analyzeError}
            </div>
          )}
        </div>

        <div className="mt-8 space-y-5">
          <EdgeList title="Imports" icon={<ArrowUpRight className="size-3" />} items={outgoing.map((e) => ({ path: e.target, symbols: e.symbols, line: e.line, kind: e.kind, typeOnly: e.typeOnly }))} onNavigate={onNavigate} onLine={(l) => onViewCode(file, l)} />
          <EdgeList title="Imported by" icon={<ArrowDownLeft className="size-3" />} items={incoming.map((e) => ({ path: e.source, symbols: e.symbols, line: e.line, kind: e.kind, typeOnly: e.typeOnly }))} onNavigate={onNavigate} onLine={null} />
          {unresolved.length > 0 && (
            <div>
              <SectionTitle>Unresolved</SectionTitle>
              <ul className="space-y-1">
                {unresolved.map((u) => (
                  <li key={`${u.line}:${u.specifier}`} className="font-mono text-[11px] text-ink-400">
                    L{u.line} <span className="text-ink-300">{u.specifier}</span> · {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label, strong }: { value: number; label: string; strong?: boolean }) {
  return (
    <div>
      <span className={cx("text-lg font-semibold", strong ? "text-amber-impact" : "text-ink-100")}>{value}</span>
      <span className="ml-1 text-[11px] text-ink-400">{label}</span>
    </div>
  );
}

function SymbolRow({ active, onClick, name, kind, line, typeOnly, muted }: { active: boolean; onClick: () => void; name: string; kind: string; line: number | null; typeOnly?: boolean; muted?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all",
        active ? "border-ember-500/60 bg-ember-500/[0.08]" : "border-transparent hover:bg-ink-800",
      )}
    >
      <span className={cx("size-3 shrink-0 rounded-full border-2", active ? "border-ember-500 bg-ember-500/40" : "border-ink-600")} />
      <span className={cx("flex-1 truncate font-mono text-[12.5px]", muted ? "text-ink-300 italic" : "text-ink-100")}>{name}</span>
      <span className="text-[10px] tracking-wide text-ink-500 uppercase">
        {typeOnly ? "type" : kind}
        {line !== null && ` · L${line}`}
      </span>
    </button>
  );
}

function EdgeList({
  title,
  icon,
  items,
  onNavigate,
  onLine,
}: {
  title: string;
  icon: React.ReactNode;
  items: { path: string; symbols: string[]; line: number; kind: string; typeOnly: boolean }[];
  onNavigate: (p: string) => void;
  onLine: ((line: number) => void) | null;
}) {
  return (
    <div>
      <SectionTitle right={<span className="text-[11px] text-ink-500 tabular-nums">{items.length}</span>}>
        <span className="inline-flex items-center gap-1">
          {icon} {title}
        </span>
      </SectionTitle>
      {items.length === 0 ? (
        <div className="text-xs text-ink-500">None in this repository.</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it, i) => (
            <li key={`${it.path}:${it.line}:${i}`} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-ink-800">
              <button onClick={() => onNavigate(it.path)} className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px] text-ink-200 hover:text-ember-400">
                {it.path}
              </button>
              <span className="max-w-[40%] shrink-0 truncate font-mono text-[10.5px] text-ink-500">
                {it.kind === "side-effect" ? "side-effect" : it.symbols.map((s) => (s === "*" ? "*" : s)).join(", ")}
                {it.typeOnly && " (type)"}
              </span>
              {onLine && (
                <button onClick={() => onLine(it.line)} className="shrink-0 font-mono text-[10.5px] text-ink-500 hover:text-ink-100">
                  L{it.line}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
