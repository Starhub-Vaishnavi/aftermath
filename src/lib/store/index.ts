import { FileStore } from "./file-store";
import { PgStore } from "./pg-store";
import type { Project, Store } from "./types";

const g = globalThis as unknown as { __aftermathStore?: Store; __aftermathProjects?: Map<string, Project> };

export function getStore(): Store {
  if (!g.__aftermathStore) {
    g.__aftermathStore = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  }
  return g.__aftermathStore;
}

/** Projects are immutable once imported, so a small in-process cache is safe. */
export async function loadProject(id: string): Promise<Project | null> {
  g.__aftermathProjects ??= new Map();
  const cache = g.__aftermathProjects;
  const hit = cache.get(id);
  if (hit) return hit;
  const p = await getStore().getProject(id);
  if (p) {
    cache.set(id, p);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
  }
  return p;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export type * from "./types";
