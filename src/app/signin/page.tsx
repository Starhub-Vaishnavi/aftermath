import { Github, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, authEnabled, signIn } from "@/auth";
import { Logo } from "@/components/ui";

export const metadata = { title: "Sign in — AFTERMATH" };

/** Only same-site paths are honoured, so the callback can't become an open redirect. */
const safePath = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/");

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  const next = safePath(callbackUrl);
  if (!authEnabled || (await auth())?.user) redirect(next);

  return (
    <main className="grid-bg relative flex min-h-screen items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(255,106,61,0.14),transparent_70%)]" />
      <div className="animate-rise relative w-full max-w-sm rounded-2xl border border-ink-800 bg-ink-900/80 p-8 shadow-2xl backdrop-blur">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          See what a code change touches before you write it. Your imported projects and saved investigations stay private to your account.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: next });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-ink-950 transition hover:bg-ink-100"
          >
            <Github className="size-4" /> Continue with GitHub
          </button>
        </form>
        <p className="mt-5 flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-400">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-ember-400" />
          AFTERMATH only reads your basic GitHub profile (name, avatar and email). It never asks for repository access.
        </p>
      </div>
    </main>
  );
}
