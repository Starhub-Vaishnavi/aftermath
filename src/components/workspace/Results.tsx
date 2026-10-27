"use client";

import { AlertTriangle, ArrowLeft, Bot, Check, ChevronDown, CircleSlash, Copy, GitCommitHorizontal, ListChecks, Route, ShieldAlert, TestTube2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { EvidenceHop, ImpactedNode } from "@/lib/analysis/types";
import type { Investigation } from "@/lib/store/types";
import { Badge, SectionTitle, basename, cx } from "@/components/ui";

type Tab = "overview" | "paths" | "risks" | "checklist" | "tests" | "excluded";

const VIA_LABEL: Record<EvidenceHop["via"], string> = {
  symbol: "named import",
  "namespace-member": "namespace member",
  "re-export": "re-export",
  "namespace-opaque": "namespace passed whole",
  dynamic: "dynamic import / require",
  file: "file-level",
};

export function Results({
  investigation,
  onBack,
  onHover,
  onViewCode,
  onSelectFile,
}: {
  investigation: Investigation;
  onBack: () => void;
  onHover: (file: string | null) => void;
  onViewCode: (path: string, line: number) => void;
  onSelectFile: (file: string) => void;
}) {
  const { report, explanation } = investigation;
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => setTab("overview"), [investigation.id]);

  const tabs: { id: Tab; label: string; count?: number; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <GitCommitHorizontal className="size-3.5" /> },
    { id: "paths", label: "Paths", count: report.impacted.length, icon: <Route className="size-3.5" /> },
    { id: "risks", label: "Risks", count: explanation.risks.length, icon: <ShieldAlert className="size-3.5" /> },
    { id: "checklist", label: "Checklist", count: explanation.checklist.length, icon: <ListChecks className="size-3.5" /> },
    { id: "tests", label: "Tests", count: explanation.tests.length, icon: <TestTube2 className="size-3.5" /> },
    { id: "excluded", label: "Excluded", count: report.excluded.length, icon: <CircleSlash className="size-3.5" /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-800 px-5 pt-4 pb-0">
        <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
          <ArrowLeft className="size-3.5" /> Edit proposal
        </button>
        <div className="font-mono text-[12px] text-ink-400">
          {report.target.file}
          {report.target.symbol && <span className="text-ember-400"> › {report.target.symbol}</span>}
        </div>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-100">“{investigation.change}”</p>
        <div className="-mx-1 mt-3 flex gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative flex shrink-0 items-center gap-1.5 px-2.5 py-2 text-xs transition-colors",
                tab === t.id ? "text-ink-100" : "text-ink-400 hover:text-ink-200",
              )}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && <span className="rounded bg-ink-800 px-1 text-[10px] tabular-nums text-ink-300">{t.count}</span>}
              {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-ember-500" />}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="animate-fade-in min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "overview" && <Overview investigation={investigation} goto={setTab} />}
        {tab === "paths" && <Paths nodes={report.impacted} onHover={onHover} onViewCode={onViewCode} onSelectFile={onSelectFile} />}
        {tab === "risks" && <Risks investigation={investigation} onHover={onHover} onViewCode={onViewCode} />}
        {tab === "checklist" && <Checklist investigation={investigation} onSelectFile={onSelectFile} />}
        {tab === "tests" && <Tests investigation={investigation} />}
        {tab === "excluded" && (
          <ul className="space-y-2">
            {report.excluded.length === 0 && <li className="text-sm text-ink-400">No importer was ruled out.</li>}
            {report.excluded.map((e) => (
              <li key={e.file} className="rounded-xl border border-calm-400/20 bg-calm-400/[0.04] px-3.5 py-3">
                <button onClick={() => onSelectFile(e.file)} className="font-mono text-[12px] text-ink-100 hover:text-calm-400">
                  {e.file}
                </button>
                <div className="mt-1 text-xs text-ink-300">{e.reason}</div>
                <button onClick={() => onViewCode(e.file, e.line)} className="mt-2 block w-full truncate rounded bg-ink-950 px-2 py-1 text-left font-mono text-[11px] text-ink-400 hover:text-ink-200">
                  L{e.line} {e.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Overview({ investigation, goto }: { investigation: Investigation; goto: (t: Tab) => void }) {
  const { report, explanation } = investigation;
  const s = report.stats;
  return (
    <div className="space-y-5">
      {explanation.notice && (
        <div className="flex gap-2.5 rounded-xl border border-amber-impact/25 bg-amber-impact/[0.06] px-3.5 py-3 text-xs leading-relaxed text-amber-impact">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {explanation.notice}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <StatCard value={report.impacted.length} label="Dependents" accent onClick={() => goto("paths")} />
        <StatCard value={s.direct} label="Direct" onClick={() => goto("paths")} />
        <StatCard value={s.transitive} label="Transitive" onClick={() => goto("paths")} />
        <StatCard value={s.confirmed} label="Confirmed" onClick={() => goto("paths")} />
        <StatCard value={s.possible} label="Possible" onClick={() => goto("paths")} />
        <StatCard value={s.tests} label="Tests reached" onClick={() => goto("tests")} />
      </div>

      <div className="rounded-xl border border-ink-800 bg-ink-900 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Bot className="size-3.5 text-ink-400" />
          <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">Assessment</span>
          {explanation.source === "llm" ? <Badge tone="ember">AI · {explanation.model}</Badge> : <Badge>graph-only</Badge>}
        </div>
        <p className="text-[13.5px] leading-relaxed text-ink-200">{explanation.summary}</p>
        {explanation.assumptions.length > 0 && (
          <details className="mt-3 text-xs text-ink-400">
            <summary className="cursor-pointer select-none hover:text-ink-200">Assumptions ({explanation.assumptions.length})</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {explanation.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="rounded-xl border border-ink-800 p-4 text-xs leading-relaxed text-ink-300">
        <SectionTitle>How to read this</SectionTitle>
        <ul className="space-y-2">
          <li className="flex items-start gap-2">
            <Badge tone="ok" className="mt-px shrink-0">confirmed</Badge>
            <span>dependency proven by the parser: the file references the changed symbol, with the line cited.</span>
          </li>
          <li className="flex items-start gap-2">
            <Badge tone="dashed" className="mt-px shrink-0">possible</Badge>
            <span>a real import exists, but usage could not be narrowed to the symbol (dynamic import, namespace passed whole).</span>
          </li>
          <li className="flex items-start gap-2">
            <Badge tone="amber" className="mt-px shrink-0">hypothesis</Badge>
            <span>behavioral risk suggested by the AI. Plausible, not proven — verify before acting.</span>
          </li>
        </ul>
      </div>
      {explanation.discarded.length > 0 && (
        <div className="text-xs text-ink-500">
          {explanation.discarded.length} AI claim{explanation.discarded.length > 1 ? "s were" : " was"} discarded for referencing files outside the static evidence.
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, accent, onClick }: { value: number; label: string; accent?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-left transition-colors hover:border-ink-600">
      <div className={cx("text-xl font-semibold tabular-nums", accent ? "text-amber-impact" : "text-ink-100")}>{value}</div>
      <div className="text-[11px] text-ink-400">{label}</div>
    </button>
  );
}

function ConfidenceBadge({ c }: { c: "confirmed" | "possible" }) {
  return c === "confirmed" ? (
    <Badge tone="ok" title="Proven by a symbol reference">
      confirmed
    </Badge>
  ) : (
    <Badge tone="dashed" title="Import exists; symbol usage could not be narrowed">
      possible
    </Badge>
  );
}

function Paths({ nodes, onHover, onViewCode, onSelectFile }: { nodes: ImpactedNode[]; onHover: (f: string | null) => void; onViewCode: (p: string, l: number) => void; onSelectFile: (f: string) => void }) {
  const [open, setOpen] = useState<string | null>(nodes[0]?.file ?? null);
  if (!nodes.length) return <div className="text-sm text-ink-400">Nothing in this repository depends on the selected target.</div>;
  return (
    <ul className="space-y-2">
      {nodes.map((n, i) => {
        const isOpen = open === n.file;
        return (
          <li
            key={n.file}
            onMouseEnter={() => onHover(n.file)}
            onMouseLeave={() => onHover(null)}
            className="animate-rise rounded-xl border border-ink-800 bg-ink-900 transition-colors hover:border-ink-600"
            style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
          >
            <button onClick={() => setOpen(isOpen ? null : n.file)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left">
              <span
                className={cx(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  n.confidence === "confirmed" ? "bg-amber-impact text-ink-950" : "border border-dashed border-amber-impact text-amber-impact",
                )}
              >
                {n.depth}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-100">{n.file}</span>
              {n.isTest && <Badge tone="calm">test</Badge>}
              <ConfidenceBadge c={n.confidence} />
              <ChevronDown className={cx("size-3.5 text-ink-500 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="animate-fade-in border-t border-ink-800 px-3.5 py-3">
                <ol className="relative space-y-3 border-l border-ink-700 pl-4">
                  {n.path.map((h) => (
                    <li key={h.edgeId} className="relative">
                      <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-ink-900 bg-amber-impact" />
                      <div className="text-[11.5px] text-ink-300">
                        <button onClick={() => onSelectFile(h.from)} className="font-mono text-ink-100 hover:text-ember-400">
                          {basename(h.from)}
                        </button>{" "}
                        uses <span className="font-mono text-amber-impact">{h.symbols.join(", ")}</span> from{" "}
                        <span className="font-mono text-ink-200">{basename(h.to)}</span>
                        <span className="ml-1.5 text-[10px] text-ink-500 uppercase">{VIA_LABEL[h.via]}</span>
                      </div>
                      <button onClick={() => onViewCode(h.from, h.line)} className="mt-1 block w-full truncate rounded-md bg-ink-950 px-2 py-1 text-left font-mono text-[11px] text-ink-300 hover:text-ink-100">
                        <span className="text-ink-500">L{h.line}</span> {h.text}
                      </button>
                      {h.usages.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {h.usages.slice(0, 6).map((u) => (
                            <button
                              key={`${u.declaration}:${u.line}:${u.ref}`}
                              onClick={() => onViewCode(h.from, u.line)}
                              className="rounded border border-ink-700 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-300 hover:border-ink-500 hover:text-ink-100"
                            >
                              {u.declaration} · L{u.line}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="mt-3 text-[11px] text-ink-400">
                  Propagates via exports:{" "}
                  <span className="font-mono text-ink-200">{n.affectedExports.length ? n.affectedExports.join(", ") : "none — impact stops here"}</span>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const LIKELIHOOD_TONE = { likely: "ember", plausible: "amber", unlikely: "neutral" } as const;

function Risks({ investigation, onHover, onViewCode }: { investigation: Investigation; onHover: (f: string | null) => void; onViewCode: (p: string, l: number) => void }) {
  const { explanation } = investigation;
  return (
    <div className="space-y-2.5">
      {explanation.risks.length === 0 && <div className="text-sm text-ink-400">No behavioral risks were identified.</div>}
      {explanation.risks.map((r, i) => (
        <article
          key={`${r.file}:${i}`}
          onMouseEnter={() => onHover(r.file)}
          onMouseLeave={() => onHover(null)}
          className="animate-rise rounded-xl border border-ink-800 bg-ink-900 p-3.5"
          style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
        >
          <div className="flex items-start justify-between gap-3">
            <h4 className="text-[13px] font-medium text-ink-100">{r.title}</h4>
            <span className={cx("shrink-0 text-[10px] font-semibold tracking-wider uppercase", r.severity === "high" ? "text-red-300" : r.severity === "medium" ? "text-amber-impact" : "text-ink-400")}>
              {r.severity}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-ink-400">{r.file}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <ConfidenceBadge c={r.dependency} />
            <Badge tone={LIKELIHOOD_TONE[r.likelihood]}>hypothesis · {r.likelihood}</Badge>
            <Badge>depth {r.depth}</Badge>
          </div>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-300">{r.hypothesis}</p>
          <div className="mt-2.5 space-y-1">
            {r.evidence.map((e) => (
              <button key={`${e.line}:${e.text}`} onClick={() => onViewCode(e.file, e.line)} className="block w-full truncate rounded-md bg-ink-950 px-2 py-1 text-left font-mono text-[10.5px] text-ink-400 hover:text-ink-100">
                <span className="text-ink-500">L{e.line}</span> {e.text}
              </button>
            ))}
          </div>
        </article>
      ))}
      {explanation.discarded.length > 0 && (
        <details className="rounded-xl border border-ink-800 px-3.5 py-3 text-xs text-ink-400">
          <summary className="cursor-pointer select-none">Discarded AI claims ({explanation.discarded.length})</summary>
          <ul className="mt-2 space-y-1">
            {explanation.discarded.map((d) => (
              <li key={d.file + d.title}>
                <span className="font-mono text-ink-300">{d.file}</span> — {d.title} <span className="text-ink-500">({d.reason})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Checklist({ investigation, onSelectFile }: { investigation: Investigation; onSelectFile: (f: string) => void }) {
  const key = `aftermath:checklist:${investigation.id}`;
  const [done, setDone] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      setDone(new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as number[]));
    } catch {
      setDone(new Set());
    }
  }, [key]);
  const toggle = (i: number) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      /* storage unavailable */
    }
  };
  const items = investigation.explanation.checklist;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded bg-ink-800">
          <div className="h-full bg-ok-400 transition-all duration-300" style={{ width: `${items.length ? (done.size / items.length) * 100 : 0}%` }} />
        </div>
        <span className="text-[11px] text-ink-400 tabular-nums">
          {done.size}/{items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((c, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-ink-900">
            <button
              onClick={() => toggle(i)}
              aria-pressed={done.has(i)}
              className={cx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors", done.has(i) ? "border-ok-400 bg-ok-400 text-ink-950" : "border-ink-600 hover:border-ink-400")}
            >
              {done.has(i) && <Check className="size-3" strokeWidth={3} />}
            </button>
            <div className="min-w-0">
              <div className={cx("text-[12.5px] leading-relaxed", done.has(i) ? "text-ink-500 line-through" : "text-ink-200")}>{c.step}</div>
              {c.file && (
                <button onClick={() => onSelectFile(c.file!)} className="font-mono text-[10.5px] text-ink-500 hover:text-ember-400">
                  {c.file}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tests({ investigation }: { investigation: Investigation }) {
  const [copied, setCopied] = useState<number | null>(null);
  const reached = investigation.report.impacted.filter((n) => n.isTest);
  return (
    <div className="space-y-4">
      {reached.length > 0 && (
        <div>
          <SectionTitle>Existing tests on the impact path</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {reached.map((t) => (
              <Badge key={t.file} tone="calm" className="normal-case">
                {t.file}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <SectionTitle>Suggested regression tests</SectionTitle>
      {investigation.explanation.tests.map((t, i) => (
        <div key={i} className="rounded-xl border border-ink-800 bg-ink-900">
          <div className="px-3.5 pt-3">
            <div className="text-[13px] font-medium text-ink-100">{t.name}</div>
            <div className="font-mono text-[11px] text-ink-400">{t.file}</div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">{t.rationale}</p>
          </div>
          <div className="relative mt-2.5">
            <pre className="max-h-64 overflow-auto rounded-b-xl border-t border-ink-800 bg-ink-950 px-3.5 py-3 font-mono text-[11px] leading-relaxed text-ink-200">{t.sketch}</pre>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(t.sketch).then(() => {
                  setCopied(i);
                  setTimeout(() => setCopied(null), 1200);
                });
              }}
              className="absolute top-2 right-2 rounded-md border border-ink-700 bg-ink-850 p-1 text-ink-400 hover:text-ink-100"
              aria-label="Copy test sketch"
            >
              {copied === i ? <Check className="size-3.5 text-ok-400" /> : <Copy className="size-3.5" />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
