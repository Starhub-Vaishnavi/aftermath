import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Investigation, InvestigationMeta, Project, ProjectMeta, Store } from "./types";

const ID = /^[a-z0-9-]{6,64}$/;

/** Serverless platforms only allow writes to the OS temp dir (and it is per-instance, so use PostgreSQL there). */
function defaultRoot(): string {
  if (process.env.AFTERMATH_DATA_DIR) return process.env.AFTERMATH_DATA_DIR;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return path.join(os.tmpdir(), "aftermath-data");
  return path.join(process.cwd(), ".data");
}

/** Zero-config local persistence: one JSON file per record under `.data/`. */
export class FileStore implements Store {
  readonly kind = "file" as const;
  constructor(private readonly root = defaultRoot()) {}

  private file(kind: "projects" | "investigations", id: string) {
    if (!ID.test(id)) throw new Error("Invalid id");
    return path.join(this.root, kind, `${id}.json`);
  }

  private async readJson<T>(p: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(p, "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async writeJson(p: string, data: unknown) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, p);
  }

  private async listDir<T>(kind: "projects" | "investigations", metaOf: (x: T) => unknown): Promise<unknown[]> {
    const dir = path.join(this.root, kind, "_meta");
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out = await Promise.all(names.filter((n) => n.endsWith(".json")).map((n) => this.readJson<T>(path.join(dir, n))));
    return out.filter(Boolean).map((x) => metaOf(x as T));
  }

  async saveProject(p: Project) {
    await this.writeJson(this.file("projects", p.id), p);
    const meta: ProjectMeta = { id: p.id, name: p.name, source: p.source, createdAt: p.createdAt, stats: p.stats };
    await this.writeJson(path.join(this.root, "projects", "_meta", `${p.id}.json`), meta);
  }

  getProject(id: string) {
    return this.readJson<Project>(this.file("projects", id));
  }

  async listProjects() {
    const metas = (await this.listDir<ProjectMeta>("projects", (m) => m)) as ProjectMeta[];
    return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveInvestigation(i: Investigation) {
    await this.writeJson(this.file("investigations", i.id), i);
    const { report: _r, explanation: _e, ...meta } = i;
    await this.writeJson(path.join(this.root, "investigations", "_meta", `${i.id}.json`), meta);
  }

  getInvestigation(id: string) {
    return this.readJson<Investigation>(this.file("investigations", id));
  }

  async listInvestigations(projectId: string) {
    const metas = (await this.listDir<InvestigationMeta>("investigations", (m) => m)) as InvestigationMeta[];
    return metas.filter((m) => m.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteInvestigation(id: string) {
    await fs.rm(this.file("investigations", id), { force: true });
    await fs.rm(path.join(this.root, "investigations", "_meta", `${id}.json`), { force: true });
  }
}
