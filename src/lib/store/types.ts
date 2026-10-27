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
}

export interface Investigation extends InvestigationMeta {
  report: ImpactReport;
  explanation: Explanation;
}

export interface Store {
  readonly kind: "postgres" | "file";
  saveProject(p: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<ProjectMeta[]>;
  saveInvestigation(i: Investigation): Promise<void>;
  getInvestigation(id: string): Promise<Investigation | null>;
  listInvestigations(projectId: string): Promise<InvestigationMeta[]>;
  deleteInvestigation(id: string): Promise<void>;
}
