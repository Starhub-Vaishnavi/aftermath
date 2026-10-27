import { buildGraph } from "../analysis/graph";
import type { DependencyGraph, SourceFile } from "../analysis/types";
import { getStore, loadProject, newId } from "../store";
import type { Project, ProjectSource } from "../store/types";
import { SAMPLE_NAME, loadSampleRepo } from "../ingest/sample";

export const SAMPLE_PROJECT_ID = "sample-acme-storefront";

export async function createProject(name: string, source: ProjectSource, files: SourceFile[], skipped = 0, id = newId("p")): Promise<Project> {
  const graph = buildGraph(files, { skippedFiles: skipped });
  const project: Project = {
    id,
    name,
    source,
    createdAt: new Date().toISOString(),
    stats: graph.stats,
    graph,
    files: Object.fromEntries(files.map((f) => [f.path, f.content])),
  };
  await getStore().saveProject(project);
  return project;
}

export async function ensureSampleProject(): Promise<Project> {
  const existing = await loadProject(SAMPLE_PROJECT_ID);
  if (existing) return existing;
  const files = await loadSampleRepo();
  return createProject(SAMPLE_NAME, { type: "sample", label: "Bundled sample" }, files, 0, SAMPLE_PROJECT_ID);
}

/** Loads a project; the bundled sample is rebuilt on demand so it survives ephemeral storage. */
export async function getProject(id: string): Promise<Project | null> {
  if (id === SAMPLE_PROJECT_ID) return ensureSampleProject();
  return loadProject(id).catch(() => null);
}

/** The graph as sent to the browser: per-declaration reference tables stay on the server. */
export function publicGraph(graph: DependencyGraph) {
  const { modules: _modules, ...rest } = graph;
  return rest;
}
