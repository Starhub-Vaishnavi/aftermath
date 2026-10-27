"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950",
        "disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-ember-500 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_24px_-8px_rgba(255,106,61,0.6)] hover:bg-ember-400",
        variant === "secondary" && "border border-ink-700 bg-ink-800 text-ink-100 hover:border-ink-600 hover:bg-ink-750",
        variant === "ghost" && "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
        variant === "danger" && "text-red-300 hover:bg-red-500/10",
        className,
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const TONES = {
  neutral: "border-ink-700 bg-ink-800 text-ink-300",
  ember: "border-ember-500/40 bg-ember-500/10 text-ember-400",
  amber: "border-amber-impact/40 bg-amber-impact/10 text-amber-impact",
  calm: "border-calm-400/30 bg-calm-400/10 text-calm-400",
  ok: "border-ok-400/30 bg-ok-400/10 text-ok-400",
  dashed: "border-dashed border-amber-impact/50 bg-transparent text-amber-impact",
} as const;

export function Badge({ tone = "neutral", children, className, title }: { tone?: keyof typeof TONES; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide uppercase", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin text-ink-400", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-600 bg-ink-800 px-1 font-mono text-[10px] text-ink-300">{children}</kbd>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-400 uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <circle cx="12" cy="12" r="3" fill="#ff6a3d" />
        <circle cx="12" cy="12" r="7" fill="none" stroke="#ff6a3d" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="11" fill="none" stroke="#ff6a3d" strokeOpacity="0.22" strokeWidth="1.5" />
      </svg>
      <span className="text-[13px] font-semibold tracking-[0.22em]">AFTERMATH</span>
    </div>
  );
}

export function basename(p: string) {
  return p.split("/").pop() ?? p;
}

export function dirOf(p: string) {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}
