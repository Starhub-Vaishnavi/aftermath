"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import type { Investigation } from "@/lib/store/types";
import { Badge, Button, Logo, Spinner, cx } from "@/components/ui";

type Row = { file: string; a: Investigation["report"]["impacted"][number] | null; b: Investigation["report"]["impacted"][number] | null };

export function Compare({ projectId }: { projectId: string }) {
  const search = useSearchParams();
  const ids = [search.get("a"), search.get("b")];
  const [items, setItems] = useState<[Investigation, Investigation] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ids[0] || !ids[1]) {
      setError("Pick two investigations to compare.");
      return;
    }
    Promise.all([api.getInvestigation(ids[0]), api.getInvestigation(ids[1])])
      .then(([a, b]) => setItems([a.investigation, b.investigation]))
      .catch((e) => setError((e as Error).message));
  }, [ids[0], ids[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<Row[]>(() => {
    if (!items) return [];
    const [a, b] = items;
    const files = new Set([...a.report.impacted.map((n) => n.file), ...b.report.impacted.map((n) => n.file)]);
    return [...files]
      .map((file) => ({ file, a: a.report.impacted.find((n) => n.file === file) ?? null, b: b.report.impacted.find((n) => n.file === file) ?? null }))
      .sort((x, y) => Number(!!y.a && !!y.b) - Number(!!x.a && !!x.b) || Math.min(x.a?.depth ?? 99, x.b?.depth ?? 99) - Math.min(y.a?.depth ?? 99, y.b?.depth ?? 99) || x.file.localeCompare(y.file));
  }, [items]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm text-ink-300">{error}</p>
          <Link href={`/p/${projectId}`} className="mt-4 inline-block">
            <Button>Back to project</Button>
          </Link>
        </div>
      </div>
    );
  }
  if (!items) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-ink-400">
        <Spinner /> Loading investigations…
      </div>
    );
  }

  const [a, b] = items;
  const shared = rows.filter((r) => r.a && r.b).length;
  const onlyA = rows.filter((r) => r.a && !r.b).length;
  const onlyB = rows.filter((r) => !r.a && r.b).length;
  const highRisks = (inv: Investigation) => inv.explanation.risks.filter((r) => r.severity === "high").length;

  return (
    <div className="grid-bg min-h-screen">
      <header className="flex h-12 items-center gap-4 border-b border-ink-800 bg-ink-950/90 px-4 backdrop-blur">
        <Link href="/">
          <Logo />
        </Link>
        <span className="h-4 w-px bg-ink-700" />
        <Link href={`/p/${projectId}`} className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
          <ArrowLeft className="size-3.5" /> Back to graph
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold tracking-tight">Compare proposed changes</h1>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {[a, b].map((inv, i) => (
            <Link key={inv.id} href={`/p/${projectId}?inv=${inv.id}`} className="group animate-rise rounded-2xl border border-ink-700 bg-ink-900 p-5 transition-colors hover:border-ink-500" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-2">
                <span className={cx("flex size-6 items-center justify-center rounded-md text-xs font-bold", i === 0 ? "bg-ember-500 text-white" : "bg-calm-400 text-ink-950")}>{i === 0 ? "A" : "B"}</span>
                <span className="truncate font-mono text-[12px] text-ink-400">
                  {inv.target.file}
                  {inv.target.symbol && ` › ${inv.target.symbol}`}
                </span>
                <ArrowRight className="ml-auto size-4 text-ink-500 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 text-[14px] leading-snug text-ink-100">“{inv.change}”</p>
              <div className="mt-4 grid grid-cols-4 gap-2 text-center tabular-nums">
                {[
                  ["Dependents", inv.report.impacted.length],
                  ["Direct", inv.stats.direct],
                  ["Max depth", inv.stats.maxDepth],
                  ["High risks", highRisks(inv)],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-ink-800 py-2">
                    <div className="text-lg font-semibold">{value}</div>
                    <div className="text-[10.5px] text-ink-400">{label}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 line-clamp-3 text-[12.5px] leading-relaxed text-ink-300">{inv.explanation.summary}</p>
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <Badge tone="amber">{shared} shared</Badge>
          <Badge tone="ember">{onlyA} only in A</Badge>
          <Badge tone="calm">{onlyB} only in B</Badge>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/80">
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-ink-800 text-[11px] tracking-wider text-ink-400 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="w-40 px-4 py-2.5 font-medium">A</th>
                <th className="w-40 px-4 py-2.5 font-medium">B</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-400">
                    Neither change reaches any dependent.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.file} className="hover:bg-ink-850">
                  <td className="truncate px-4 py-2 font-mono text-ink-200">{r.file}</td>
                  {[r.a, r.b].map((n, i) => (
                    <td key={i} className="px-4 py-2">
                      {n ? (
                        <span className="flex items-center gap-1.5">
                          <Badge tone={n.confidence === "confirmed" ? "ok" : "dashed"}>{n.confidence}</Badge>
                          <span className="text-[11px] text-ink-400">depth {n.depth}</span>
                        </span>
                      ) : (
                        <span className="text-ink-600">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
