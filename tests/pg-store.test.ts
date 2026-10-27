import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PgStore } from "@/lib/store/pg-store";
import { buildGraph } from "@/lib/analysis/graph";
import { analyzeImpact } from "@/lib/analysis/impact";
import { deterministicExplanation } from "@/lib/llm/explain";
import { loadSampleRepo } from "@/lib/ingest/sample";
import type { Investigation, Project } from "@/lib/store/types";

/**
 * Exercises the real PostgreSQL code path (pg driver, wire protocol, JSONB,
 * foreign keys) against PGlite — Postgres compiled to WASM — over a TCP socket.
 */
describe("PgStore against PostgreSQL (PGlite)", () => {
  let db: PGlite;
  let server: PGLiteSocketServer;
  let store: PgStore;
  const port = 54000 + Math.floor(Math.random() * 1000);

  beforeAll(async () => {
    db = await PGlite.create();
    server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 10 });
    await server.start();
    store = new PgStore(`postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`, { max: 1 });
  }, 30_000);

  afterAll(async () => {
    await store?.close();
    await server?.stop();
    await db?.close();
  });

  it("round-trips projects and investigations, including list, cascade-safe delete and ordering", async () => {
    const files = await loadSampleRepo(path.join(__dirname, "..", "samples", "acme-storefront"));
    const graph = buildGraph(files);
    const project: Project = {
      id: "p-pgtest0001",
      name: "acme",
      source: { type: "sample", label: "test" },
      createdAt: new Date("2026-01-01T00:00:00Z").toISOString(),
      stats: graph.stats,
      graph,
      files: Object.fromEntries(files.map((f) => [f.path, f.content])),
    };
    await store.saveProject(project);
    await store.saveProject({ ...project, name: "acme-renamed" }); // upsert

    const loaded = await store.getProject(project.id);
    expect(loaded?.name).toBe("acme-renamed");
    expect(loaded?.graph.edges).toHaveLength(graph.edges.length);
    expect(loaded?.files["src/utils/currency.ts"]).toContain("formatPrice");
    expect((await store.listProjects()).map((p) => p.id)).toEqual([project.id]);

    const report = analyzeImpact(loaded!.graph, { file: "src/utils/currency.ts", symbol: "formatPrice" });
    const mk = (id: string, createdAt: string): Investigation => ({
      id,
      projectId: project.id,
      title: "t",
      target: report.target,
      change: "Return an object",
      mode: "symbol",
      createdAt,
      stats: report.stats,
      report,
      explanation: deterministicExplanation(report, "Return an object", null),
    });
    await store.saveInvestigation(mk("inv-pgtest0001", "2026-01-02T00:00:00Z"));
    await store.saveInvestigation(mk("inv-pgtest0002", "2026-01-03T00:00:00Z"));

    expect((await store.listInvestigations(project.id)).map((i) => i.id)).toEqual(["inv-pgtest0002", "inv-pgtest0001"]);
    const inv = await store.getInvestigation("inv-pgtest0001");
    expect(inv?.report.impacted).toHaveLength(9);
    expect(inv?.createdAt).toBe("2026-01-02T00:00:00.000Z");

    await store.deleteInvestigation("inv-pgtest0001");
    expect(await store.getInvestigation("inv-pgtest0001")).toBeNull();
    expect(await store.getProject("p-missing00")).toBeNull();

    // Foreign key: investigations cannot reference unknown projects.
    await expect(store.saveInvestigation({ ...mk("inv-pgtest0003", "2026-01-04T00:00:00Z"), projectId: "p-missing00" })).rejects.toThrow();
  }, 30_000);
});
