"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { Spinner, cx } from "@/components/ui";

export function CodeViewer({ projectId, path, line, onClose }: { projectId: string; path: string; line: number; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setContent(null);
    setError(null);
    api
      .getFile(projectId, path)
      .then((r) => live && setContent(r.content))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [projectId, path]);

  useEffect(() => {
    target.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [content, line]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lines = content?.split("\n") ?? [];
  return (
    <div className="animate-rise absolute inset-y-3 right-3 z-20 flex w-[min(640px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/95 shadow-2xl shadow-black/60 backdrop-blur">
      <div className="flex items-center justify-between border-b border-ink-800 px-4 py-2.5">
        <div className="truncate font-mono text-[12px] text-ink-200">
          {path}
          <span className="text-ink-500">:{line}</span>
        </div>
        <button onClick={onClose} className="rounded p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100" aria-label="Close source view">
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-[12px] leading-[1.6]">
        {error && <div className="px-4 text-red-300">{error}</div>}
        {!content && !error && (
          <div className="flex items-center gap-2 px-4 text-ink-400">
            <Spinner /> Loading source…
          </div>
        )}
        {lines.map((l, i) => {
          const n = i + 1;
          const hit = n === line;
          return (
            <div key={i} ref={hit ? target : undefined} className={cx("flex pr-4", hit && "bg-ember-500/[0.12]")}>
              <span className={cx("w-12 shrink-0 pr-3 text-right select-none", hit ? "text-ember-400" : "text-ink-600")}>{n}</span>
              <span className={cx("whitespace-pre", hit ? "text-ink-100" : "text-ink-300")}>{l || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
