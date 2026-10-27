import { Pool } from "pg";
import type { Investigation, InvestigationMeta, Project, ProjectMeta, Store } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS aftermath_projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  source      JSONB NOT NULL,
  stats       JSONB NOT NULL,
  graph       JSONB NOT NULL,
  files       JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS aftermath_investigations (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES aftermath_projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  target      JSONB NOT NULL,
  change      TEXT NOT NULL,
  mode        TEXT NOT NULL,
  stats       JSONB NOT NULL,
  report      JSONB NOT NULL,
  explanation JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aftermath_investigations_project_idx ON aftermath_investigations(project_id, created_at DESC);
`;

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

export class PgStore implements Store {
  readonly kind = "postgres" as const;
  private pool: Pool;
  private ready: Promise<void>;

  constructor(connectionString: string, opts: { max?: number } = {}) {
    this.pool = new Pool({ connectionString, max: opts.max ?? 5 });
    this.ready = this.pool.query(SCHEMA).then(() => undefined);
  }

  async close() {
    await this.pool.end();
  }

  private async q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.ready;
    return (await this.pool.query(sql, params)).rows as T[];
  }

  async saveProject(p: Project) {
    await this.q(
      `INSERT INTO aftermath_projects (id, name, source, stats, graph, files, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, source=EXCLUDED.source, stats=EXCLUDED.stats, graph=EXCLUDED.graph, files=EXCLUDED.files`,
      [p.id, p.name, p.source, p.stats, p.graph, p.files, p.createdAt],
    );
  }

  async getProject(id: string): Promise<Project | null> {
    const [r] = await this.q(`SELECT * FROM aftermath_projects WHERE id=$1`, [id]);
    if (!r) return null;
    return { id: r.id as string, name: r.name as string, source: r.source as Project["source"], stats: r.stats as Project["stats"], graph: r.graph as Project["graph"], files: r.files as Project["files"], createdAt: iso(r.created_at) };
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const rows = await this.q(`SELECT id, name, source, stats, created_at FROM aftermath_projects ORDER BY created_at DESC LIMIT 100`);
    return rows.map((r) => ({ id: r.id as string, name: r.name as string, source: r.source as ProjectMeta["source"], stats: r.stats as ProjectMeta["stats"], createdAt: iso(r.created_at) }));
  }

  async saveInvestigation(i: Investigation) {
    await this.q(
      `INSERT INTO aftermath_investigations (id, project_id, title, target, change, mode, stats, report, explanation, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [i.id, i.projectId, i.title, i.target, i.change, i.mode, i.stats, i.report, i.explanation, i.createdAt],
    );
  }

  private toMeta(r: Row): InvestigationMeta {
    return { id: r.id as string, projectId: r.project_id as string, title: r.title as string, target: r.target as InvestigationMeta["target"], change: r.change as string, mode: r.mode as InvestigationMeta["mode"], stats: r.stats as InvestigationMeta["stats"], createdAt: iso(r.created_at) };
  }

  async getInvestigation(id: string): Promise<Investigation | null> {
    const [r] = await this.q(`SELECT * FROM aftermath_investigations WHERE id=$1`, [id]);
    if (!r) return null;
    return { ...this.toMeta(r), report: r.report as Investigation["report"], explanation: r.explanation as Investigation["explanation"] };
  }

  async listInvestigations(projectId: string) {
    const rows = await this.q(
      `SELECT id, project_id, title, target, change, mode, stats, created_at FROM aftermath_investigations WHERE project_id=$1 ORDER BY created_at DESC`,
      [projectId],
    );
    return rows.map((r) => this.toMeta(r));
  }

  async deleteInvestigation(id: string) {
    await this.q(`DELETE FROM aftermath_investigations WHERE id=$1`, [id]);
  }
}
