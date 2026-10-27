import { auth, authEnabled } from "@/auth";
import type { InvestigationMeta, ProjectMeta } from "../store/types";
import { IngestError } from "../ingest/zip";

/** The signed-in user's id, or null when sign-in is off or nobody is signed in. */
export async function currentUserId(): Promise<string | null> {
  if (!authEnabled) return null;
  return (await auth())?.user?.id ?? null;
}

/** Throws a 401 when sign-in is on and nobody is signed in. Returns the owner to stamp on new records. */
export async function requireUser(): Promise<string | null> {
  const uid = await currentUserId();
  if (authEnabled && !uid) throw new IngestError("Sign in to use AFTERMATH.", 401);
  return uid;
}

/** The owner filter for list queries: everything when sign-in is off, otherwise just this user's. */
export const ownerFilter = (uid: string | null) => (authEnabled ? (uid ?? "") : undefined);

/** Projects with no owner (the sample, or imports from before sign-in) stay viewable by link. */
export const canViewProject = (p: Pick<ProjectMeta, "ownerId">, uid: string | null) => !authEnabled || !p.ownerId || p.ownerId === uid;

/** Investigations are private to whoever ran them. */
export const canViewInvestigation = (i: Pick<InvestigationMeta, "ownerId">, uid: string | null) => !authEnabled || (!!uid && i.ownerId === uid);
