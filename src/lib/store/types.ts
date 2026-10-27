import type { DependencyGraph, ImpactMode, ImpactReport } from "../analysis/types";
import type { Explanation } from "../llm/schema";

export interface ProjectSource {
  type: "sample" | "github" | "zip";
  label: string;
  url?: string;
  ref?: string;
}

export interface ProjectMeta {
  id: string;
  name: string;
  source: ProjectSource;
  createdAt: string;
  stats: DependencyGraph["stats"];
  /** Signed-in user who imported it; null for the shared sample or when sign-in is off. */
  ownerId?: string | null;
}

export interface Project extends ProjectMeta {
  graph: DependencyGraph;
  files: Record<string, string>;
}

export interface InvestigationMeta {
  id: string;
  projectId: string;
  title: string;
  target: { file: string; symbol: string | null };
  change: string;
  mode: ImpactMode;
  createdAt: string;
  stats: ImpactReport["stats"];
  ownerId?: string | null;
}

export interface Investigation extends InvestigationMeta {
  report: ImpactReport;
  explanation: Explanation;
}

export interface Store {
  readonly kind: "postgres" | "file";
  saveProject(p: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  /** `ownerId` undefined lists everything; otherwise only that owner's records. */
  listProjects(ownerId?: string): Promise<ProjectMeta[]>;
  saveInvestigation(i: Investigation): Promise<void>;
  getInvestigation(id: string): Promise<Investigation | null>;
  listInvestigations(projectId: string, ownerId?: string): Promise<InvestigationMeta[]>;
  deleteInvestigation(id: string): Promise<void>;
}
