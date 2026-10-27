"use client";

import { ArrowRight, FileArchive, FlaskConical, Github, GitBranch, ShieldCheck, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import type { ProjectMeta } from "@/lib/store/types";
import { Badge, Button, Logo, cx } from "@/components/ui";
import { UserMenu } from "@/components/UserMenu";

type Busy = null | { kind: "sample" | "github" | "zip"; step: string };

const STEPS: Record<NonNullable<Busy>["kind"], string[]> = {
  sample: ["Loading bundled sample…", "Parsing modules with the TypeScript parser…", "Resolving imports…"],
  github: ["Contacting GitHub…", "Downloading archive…", "Filtering JS/TS sources…", "Parsing modules with the TypeScript parser…", "Resolving imports…"],
  zip: ["Uploading archive…", "Extracting JS/TS sources in memory…", "Parsing modules with the TypeScript parser…", "Resolving imports…"],
};

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [drag, setDrag] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listProjects().then((r) => setProjects(r.projects)).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!busy) return;
    const steps = STEPS[busy.kind];
    let i = 0;
    const t = setInterval(() => {
      i = Math.min(i + 1, steps.length - 1);
      setBusy((b) => (b ? { ...b, step: steps[i] } : b));
    }, 1400);
    return () => clearInterval(t);
  }, [busy?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(kind: NonNullable<Busy>["kind"], fn: () => Promise<{ id: string }>) {
    setError(null);
    setBusy({ kind, step: STEPS[kind][0] });
    try {
      const { id } = await fn();
      router.push(`/p/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  const onZip = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please choose a .zip file.");
      return;
    }
    run("zip", () => api.importZip(file));
  };

  return (
    <main className="grid-bg relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(255,106,61,0.14),transparent_70%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-ink-400 sm:inline">JavaScript &amp; TypeScript · static analysis + AI explanations</span>
          <UserMenu />
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pt-14 pb-10">
        <div className="animate-rise max-w-3xl">
          <Badge tone="ember" className="mb-5">
            <Sparkles className="size-3" /> Change-impact simulator
          </Badge>
          <h1 className="text-[44px] leading-[1.05] font-semibold tracking-tight text-balance sm:text-[56px]">
            See what a change touches <span className="text-ember-500">before</span> you write it.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-300">
            Import a repository, pick a file or export, and describe the change. AFTERMATH traces every dependent through real
            import statements, then explains the risk — keeping proven dependencies and speculative behavior strictly apart.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {/* Sample */}
          <div className="animate-rise group relative flex flex-col rounded-2xl border border-ember-500/30 bg-gradient-to-b from-ember-500/[0.08] to-ink-900 p-5 [animation-delay:60ms]">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FlaskConical className="size-4 text-ember-400" /> Bundled sample
            </div>
            <p className="flex-1 text-sm leading-relaxed text-ink-300">
              <span className="font-mono text-ink-200">acme-storefront</span> — a small store with a deliberate price-formatting chain
              through barrels, path aliases, CommonJS and dynamic imports.
            </p>
            <Button variant="primary" className="mt-5 w-full" loading={busy?.kind === "sample"} disabled={!!busy} onClick={() => run("sample", api.importSample)}>
              Open sample <ArrowRight className="size-4" />
            </Button>
          </div>

          {/* GitHub */}
          <form
            className="animate-rise flex flex-col rounded-2xl border border-ink-700 bg-ink-900/80 p-5 backdrop-blur [animation-delay:120ms]"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) run("github", () => api.importGitHub(url.trim()));
            }}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Github className="size-4 text-ink-200" /> Public GitHub repo
            </div>
            <p className="text-sm leading-relaxed text-ink-300">Downloaded as an archive and parsed in memory. Supports <span className="font-mono text-xs">/tree/branch/subdir</span>.</p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/owner/repo"
              spellCheck={false}
              disabled={!!busy}
              className="mt-4 h-9 rounded-lg border border-ink-700 bg-ink-950 px-3 font-mono text-[13px] text-ink-100 placeholder:text-ink-500 focus:border-ember-500/60 focus:ring-2 focus:ring-ember-500/20 focus:outline-none"
            />
            <Button type="submit" className="mt-3 w-full" loading={busy?.kind === "github"} disabled={!!busy || !url.trim()}>
              <GitBranch className="size-4" /> Import repository
            </Button>
          </form>

          {/* ZIP */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) onZip(e.dataTransfer.files[0]);
            }}
            className={cx(
              "animate-rise flex flex-col rounded-2xl border border-dashed p-5 transition-colors [animation-delay:180ms]",
              drag ? "border-ember-500 bg-ember-500/[0.06]" : "border-ink-600 bg-ink-900/60",
            )}
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FileArchive className="size-4 text-ink-200" /> Upload a ZIP
            </div>
            <p className="flex-1 text-sm leading-relaxed text-ink-300">Drop an archive of your source. Only JS/TS files are read; nothing is executed or written to disk.</p>
            <input ref={fileInput} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => onZip(e.target.files?.[0])} />
            <Button className="mt-5 w-full" loading={busy?.kind === "zip"} disabled={!!busy} onClick={() => fileInput.current?.click()}>
              <Upload className="size-4" /> Choose file
            </Button>
          </div>
        </div>

        <div className="mt-5 min-h-[52px]">
          {busy && (
            <div className="animate-fade-in flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-ink-200">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-ember-500 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-ember-500" />
              </span>
              {busy.step}
            </div>
          )}
          {error && (
            <div role="alert" className="animate-rise rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
              <span className="font-medium">Import failed.</span> {error}
            </div>
          )}
        </div>
      </section>

      <section className="relative mx-auto grid max-w-6xl gap-8 px-6 pb-20 md:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-3 text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">Recent projects</h2>
          {projects === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-ink-800 px-4 py-6 text-sm text-ink-400">No projects yet. Start with the sample to see the full workflow.</div>
          ) : (
            <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/p/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-ink-850">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13px] text-ink-100">{p.name}</div>
                      <div className="text-xs text-ink-400">
                        {p.source.label} · {new Date(p.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-3 text-xs text-ink-400 tabular-nums">
                      <span>{p.stats.files} files</span>
                      <span>{p.stats.edges} edges</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <aside className="rounded-xl border border-ink-800 bg-ink-900/60 p-5 text-sm text-ink-300">
          <div className="mb-3 flex items-center gap-2 font-medium text-ink-100">
            <ShieldCheck className="size-4 text-ok-400" /> Evidence first
          </div>
          <ul className="space-y-2.5 leading-relaxed">
            <li>Edges come only from import/export statements parsed by the TypeScript compiler.</li>
            <li>Unresolvable imports are reported, never guessed.</li>
            <li>The AI explains and hypothesizes; it cannot add files or dependencies to the result.</li>
            <li>Uploaded code is treated as untrusted text and never executed.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}
