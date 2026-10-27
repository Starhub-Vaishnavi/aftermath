"use client";

import type { DependencyGraph, ImpactMode, ImpactReport } from "../analysis/types";
import type { Investigation, InvestigationMeta, ProjectMeta } from "../store/types";

export type PublicGraph = Omit<DependencyGraph, "modules">;

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Could not reach the AFTERMATH server.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  listProjects: () => call<{ projects: ProjectMeta[]; store: string }>("/api/projects"),
  importSample: () => call<{ id: string }>("/api/projects", json({ type: "sample" })),
  importGitHub: (url: string) => call<{ id: string }>("/api/projects", json({ type: "github", url })),
  importZip: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return call<{ id: string }>("/api/projects", { method: "POST", body: form });
  },
  getProject: (id: string) => call<{ project: ProjectMeta; graph: PublicGraph }>(`/api/projects/${id}`),
  getFile: (id: string, path: string) => call<{ path: string; content: string }>(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`),
  impact: (id: string, body: { file: string; symbol: string | null; mode: ImpactMode; includeTypeOnly: boolean }) =>
    call<{ report: ImpactReport }>(`/api/projects/${id}/impact`, json(body)),
  investigate: (id: string, body: { file: string; symbol: string | null; mode: ImpactMode; includeTypeOnly: boolean; change: string }) =>
    call<{ investigation: Investigation }>(`/api/projects/${id}/investigations`, json(body)),
  listInvestigations: (id: string) => call<{ investigations: InvestigationMeta[] }>(`/api/projects/${id}/investigations`),
  getInvestigation: (id: string) => call<{ investigation: Investigation }>(`/api/investigations/${id}`),
  deleteInvestigation: (id: string) => call<{ ok: true }>(`/api/investigations/${id}`, { method: "DELETE" }),
};
