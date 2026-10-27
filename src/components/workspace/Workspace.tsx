"use client";

import { AlertTriangle, Eye, EyeOff, FlaskConical, History, MousePointerClick, Network, TestTube2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImpactReport } from "@/lib/analysis/types";
import { api, type PublicGraph } from "@/lib/client/api";
import type { Investigation, InvestigationMeta, ProjectMeta } from "@/lib/store/types";
import { Badge, Button, Logo, Spinner, cx } from "@/components/ui";
import { CodeViewer } from "./CodeViewer";
import { FileList } from "./FileList";
import { GraphCanvas } from "./GraphCanvas";
import { Inspector, type ProposalState } from "./Inspector";
import { InvestigationsDrawer } from "./InvestigationsDrawer";
import { Results } from "./Results";

type Loaded = { project: ProjectMeta; graph: PublicGraph };

export function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<string | null>(null);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalState>({ change: "", mode: "symbol", includeTypeOnly: true });

  const [preview, setPreview] = useState<ImpactReport | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [hover, setHover] = useState<string | null>(null);
  const [code, setCode] = useState<{ path: string; line: number } | null>(null);
  const [focusImpact, setFocusImpact] = useState(false);
  const [hideTests, setHideTests] = useState(false);

  const [drawer, setDrawer] = useState(false);
  const [saved, setSaved] = useState<InvestigationMeta[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);

  useEffect(() => {
    api
      .getProject(id)
      .then(setData)
      .catch((e) => setLoadError((e as Error).message));
  }, [id]);

  const refreshSaved = useCallback(() => {
    setSavedLoading(true);
    api
      .listInvestigations(id)
      .then((r) => setSaved(r.investigations))
      .catch(() => setSaved([]))
      .finally(() => setSavedLoading(false));
  }, [id]);
  useEffect(refreshSaved, [refreshSaved]);

  const openInvestigation = useCallback(
    async (invId: string) => {
      try {
        const { investigation: inv } = await api.getInvestigation(invId);
        setInvestigation(inv);
        setFile(inv.target.file);
        setSymbol(inv.target.symbol);
        setProposal({ change: inv.change, mode: inv.mode, includeTypeOnly: inv.report.includeTypeOnly });
        setPreview(inv.report);
        setDrawer(false);
      } catch (e) {
        setAnalyzeError((e as Error).message);
      }
    },
    [],
  );

  // Deep link: /p/<id>?inv=<investigation>
  const invParam = search.get("inv");
  useEffect(() => {
    if (data && invParam) openInvestigation(invParam);
  }, [data, invParam, openInvestigation]);

  // Pick an interesting starting file: the most imported module.
  useEffect(() => {
    if (!data || file || invParam) return;
    const fanIn = new Map<string, number>();
    for (const e of data.graph.edges) fanIn.set(e.target, (fanIn.get(e.target) ?? 0) + 1);
    const top = [...fanIn.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (data.project.id.startsWith("sample-")) {
      setFile("src/utils/currency.ts");
      setSymbol("formatPrice");
    } else if (top) setFile(top);
  }, [data, file, invParam]);

  // Live deterministic preview whenever the target changes.
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!data || !file || investigation) return;
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);
    const t = setTimeout(() => {
      api
        .impact(id, { file, symbol, mode: proposal.mode, includeTypeOnly: proposal.includeTypeOnly })
        .then((r) => seq === previewSeq.current && setPreview(r.report))
        .catch((e) => seq === previewSeq.current && setPreviewError((e as Error).message))
        .finally(() => seq === previewSeq.current && setPreviewLoading(false));
    }, 120);
    return () => clearTimeout(t);
  }, [id, data, file, symbol, proposal.mode, proposal.includeTypeOnly, investigation]);

  const selectFile = (path: string) => {
    if (investigation) {
      // Clicking around while viewing results keeps the result; just inspect code.
      setCode({ path, line: 1 });
      return;
    }
    if (path !== file) {
      setFile(path);
      setSymbol(null);
    }
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const { investigation: inv } = await api.investigate(id, { file, symbol, change: proposal.change, mode: proposal.mode, includeTypeOnly: proposal.includeTypeOnly });
      setInvestigation(inv);
      setPreview(inv.report);
      refreshSaved();
    } catch (e) {
      setAnalyzeError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loadError) {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center">
          <AlertTriangle className="mx-auto size-6 text-amber-impact" />
          <h1 className="mt-3 font-medium">Could not open this project</h1>
          <p className="mt-1 text-sm text-ink-400">{loadError}</p>
          <Link href="/" className="mt-5 inline-block">
            <Button>Back to import</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col">
        <div className="flex h-12 items-center border-b border-ink-800 px-4">
          <Logo />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_420px]">
          <div className="space-y-2 border-r border-ink-800 p-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton h-5 rounded" style={{ width: `${60 + ((i * 37) % 35)}%` }} />
            ))}
          </div>
          <div className="grid-bg flex items-center justify-center gap-3 text-sm text-ink-400">
            <Spinner /> Building dependency graph…
          </div>
          <div className="space-y-3 border-l border-ink-800 p-5">
            <div className="skeleton h-6 w-2/3 rounded" />
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-32 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const { project, graph } = data;
  const report = investigation?.report ?? preview;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-ink-800 bg-ink-950 px-4">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>
        <span className="h-4 w-px bg-ink-700" />
        <div className="flex min-w-0 items-center gap-2">
          {project.source.type === "sample" && <FlaskConical className="size-3.5 shrink-0 text-ember-400" />}
          <span className="truncate font-mono text-[13px] text-ink-100">{project.name}</span>
          {project.source.ref && <Badge>{project.source.ref}</Badge>}
        </div>
        <div className="ml-auto hidden items-center gap-3 text-[11.5px] text-ink-400 tabular-nums lg:flex">
          <span>{project.stats.files} files</span>
          <span>{project.stats.edges} edges</span>
          <span>{project.stats.externalPackages} packages</span>
          {project.stats.unresolved > 0 && (
            <span className="text-amber-impact" title="Relative imports that did not resolve, or non-literal specifiers">
              {project.stats.unresolved} unresolved
            </span>
          )}
          {project.stats.skippedFiles > 0 && <span title="Files skipped by size/count limits">{project.stats.skippedFiles} skipped</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setDrawer(true)} className="ml-auto lg:ml-0">
          <History className="size-3.5" /> Investigations
          {saved && saved.length > 0 && <span className="rounded bg-ink-700 px-1 text-[10px]">{saved.length}</span>}
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr_440px]">
        <aside className="hidden min-h-0 border-r border-ink-800 bg-ink-950 md:block">
          <FileList graph={graph} selected={file} report={report} onSelect={selectFile} />
        </aside>

        <section className="relative min-h-[50vh] min-w-0 bg-ink-950">
          {graph.nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-ink-400">No analyzable files.</div>
          ) : (
            <GraphCanvas graph={graph} selectedFile={file} report={report} emphasizeFile={hover} focusImpact={focusImpact} hideTests={hideTests} onSelectFile={selectFile} />
          )}

          <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-ink-700 bg-ink-900/90 p-1 backdrop-blur">
              <ToggleChip on={focusImpact} onClick={() => setFocusImpact((v) => !v)} disabled={!report} icon={focusImpact ? <Eye className="size-3.5" /> : <Network className="size-3.5" />}>
                {focusImpact ? "Impact only" : "Full graph"}
              </ToggleChip>
              <ToggleChip on={hideTests} onClick={() => setHideTests((v) => !v)} icon={hideTests ? <EyeOff className="size-3.5" /> : <TestTube2 className="size-3.5" />}>
                {hideTests ? "Tests hidden" : "Tests shown"}
              </ToggleChip>
            </div>
            <Legend />
          </div>

          {graph.nodes.length > 600 && (
            <div className="absolute top-14 left-3 rounded-lg border border-amber-impact/30 bg-ink-900/90 px-3 py-1.5 text-[11px] text-amber-impact">
              Large graph ({graph.nodes.length} files). Use “Impact only” to focus.
            </div>
          )}

          {code && <CodeViewer projectId={id} path={code.path} line={code.line} onClose={() => setCode(null)} />}
        </section>

        <aside className="min-h-0 border-t border-ink-800 bg-ink-900/40 md:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l">
          {investigation ? (
            <Results
              investigation={investigation}
              onBack={() => {
                setInvestigation(null);
                if (invParam) router.replace(`/p/${id}`);
              }}
              onHover={setHover}
              onViewCode={(path, line) => setCode({ path, line })}
              onSelectFile={(f) => setCode({ path: f, line: 1 })}
            />
          ) : file ? (
            <Inspector
              graph={graph}
              file={file}
              symbol={symbol}
              onSymbol={setSymbol}
              onNavigate={selectFile}
              onViewCode={(path, line) => setCode({ path, line })}
              preview={preview && preview.target.file === file ? preview : null}
              previewLoading={previewLoading}
              previewError={previewError}
              proposal={proposal}
              setProposal={setProposal}
              onAnalyze={analyze}
              analyzing={analyzing}
              analyzeError={analyzeError}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-ink-400">
              <MousePointerClick className="size-5" />
              Select a file in the graph or the sidebar to start.
            </div>
          )}
        </aside>
      </div>

      {drawer && (
        <InvestigationsDrawer
          projectId={id}
          items={saved}
          loading={savedLoading}
          activeId={investigation?.id ?? null}
          onOpen={openInvestigation}
          onDelete={async (invId) => {
            await api.deleteInvestigation(invId).catch(() => undefined);
            if (investigation?.id === invId) setInvestigation(null);
            refreshSaved();
          }}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  );
}

function ToggleChip({ on, onClick, icon, children, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] transition-colors disabled:opacity-40",
        on ? "bg-ink-700 text-ink-100" : "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Legend() {
  const item = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={cx("size-2.5 rounded-[3px] border", cls)} />
      {label}
    </span>
  );
  return (
    <div className="pointer-events-auto hidden items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-1.5 text-[11px] text-ink-300 backdrop-blur sm:flex">
      {item("border-ember-500 bg-ember-500/40", "Changed")}
      {item("border-amber-impact bg-amber-impact/30", "Confirmed")}
      {item("border-dashed border-amber-impact", "Possible")}
      {item("border-calm-400/60 bg-calm-400/20", "Checked, unaffected")}
      <span className="text-ink-500" title="Edges point from a module to the files that import it">
        A → B = B imports A
      </span>
    </div>
  );
}
