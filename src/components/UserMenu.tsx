"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";

type Me = { enabled: boolean; user: { id: string; name: string | null; image: string | null } | null };

/** Renders nothing unless sign-in is configured on the server. */
export function UserMenu({ className }: { className?: string }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe(null));
  }, []);
  if (!me?.enabled || !me.user) return null;
  const { name, image } = me.user;
  return (
    <div className={cx("flex shrink-0 items-center gap-2", className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-6 rounded-full border border-ink-700" />
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-ink-700 text-[11px]">{(name ?? "?").slice(0, 1).toUpperCase()}</span>
      )}
      <span className="hidden max-w-32 truncate text-xs text-ink-300 sm:inline">{name}</span>
      <button
        type="button"
        onClick={() => signOut({ redirectTo: "/signin" })}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-100"
        title="Sign out"
      >
        <LogOut className="size-3.5" />
        <span className="sr-only">Sign out</span>
      </button>
    </div>
  );
}
