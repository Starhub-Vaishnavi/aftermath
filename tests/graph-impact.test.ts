import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { buildGraph } from "@/lib/analysis/graph";
import { analyzeImpact } from "@/lib/analysis/impact";
import type { DependencyGraph, SourceFile } from "@/lib/analysis/types";
import { loadSampleRepo } from "@/lib/ingest/sample";

const g = (files: Record<string, string>) =>
  buildGraph(Object.entries(files).map(([p, content]): SourceFile => ({ path: p, content })));

const impactedFiles = (graph: DependencyGraph, file: string, symbol: string | null, opts = {}) =>
  analyzeImpact(graph, { file, symbol }, opts).impacted.map((n) => n.file);

describe("buildGraph", () => {
  it("resolves extensions, index files, ESM .js specifiers and tsconfig paths", () => {
    const graph = g({
      "tsconfig.json": `{ /* comment */ "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["src/*"] } } }`,
      "src/a.ts": `import { b } from "./b"; import { c } from "./c"; import { d } from "./d.js"; import { e } from "~/e";`,
      "src/b.tsx": `export const b = 1;`,
      "src/c/index.ts": `export const c = 1;`,
      "src/d.ts": `export const d = 1;`,
      "src/e.ts": `export const e = 1;`,
    });
    expect(graph.edges.map((e) => `${e.target}:${e.resolution}`)).toEqual([
      "src/b.tsx:relative",
      "src/c/index.ts:relative",
      "src/d.ts:relative",
      "src/e.ts:tsconfig-paths",
    ]);
  });

  it("never invents edges: unknown specifiers are reported, not linked", () => {
    const graph = g({
      "a.ts": `import React from "react"; import fs from "node:fs"; import { x } from "./missing"; import { y } from "@scope/pkg/sub";`,
      "b.ts": `export const unrelated = 1;`,
    });
    expect(graph.edges).toHaveLength(0);
    expect(graph.unresolved.map((u) => `${u.specifier}:${u.reason}`)).toEqual([
      "react:external-package",
      "node:fs:builtin",
      "./missing:not-found",
      "@scope/pkg/sub:external-package",
    ]);
    expect(graph.externals.map((e) => e.name).sort()).toEqual(["@scope/pkg", "react"]);
  });

  it("records the import statement and line for every edge", () => {
    const graph = g({ "a.ts": `\n\nimport { b } from "./b";`, "b.ts": `export const b = 1;` });
    expect(graph.edges[0]).toMatchObject({ source: "a.ts", target: "b.ts", line: 3, symbols: ["b"], text: `import { b } from "./b";` });
  });

  it("ignores non-source files and classifies tests", () => {
    const graph = g({ "a.ts": ``, "README.md": `# hi`, "types.d.ts": `declare const x: number;`, "a.test.ts": `import "./a";` });
    expect(graph.nodes.map((n) => [n.path, n.isTest])).toEqual([
      ["a.test.ts", true],
      ["a.ts", false],
    ]);
  });
});

describe("analyzeImpact (synthetic)", () => {
  it("follows symbol usage through declarations rather than whole files", () => {
    const graph = g({
      "core.ts": `export function f() {} export function g() {}`,
      "mid.ts": `import { f, g } from "./core"; export function usesF() { return f(); } export function usesG() { return g(); }`,
      "leafF.ts": `import { usesF } from "./mid"; export const r = usesF();`,
      "leafG.ts": `import { usesG } from "./mid"; export const r = usesG();`,
    });
    expect(impactedFiles(graph, "core.ts", "f")).toEqual(["mid.ts", "leafF.ts"]);
    expect(impactedFiles(graph, "core.ts", "g")).toEqual(["mid.ts", "leafG.ts"]);
    // file mode is the conservative superset
    expect(impactedFiles(graph, "core.ts", "f", { mode: "file" })).toEqual(["mid.ts", "leafF.ts", "leafG.ts"]);
  });

  it("propagates through private helpers in the same file", () => {
    const graph = g({
      "core.ts": `export const k = 1;`,
      "mid.ts": `import { k } from "./core"; function helper() { return k; } export function api() { return helper(); } export function other() {}`,
      "leaf.ts": `import { api } from "./mid"; api();`,
      "unrelated.ts": `import { other } from "./mid"; other();`,
    });
    const report = analyzeImpact(graph, { file: "core.ts", symbol: "k" });
    expect(report.impacted.map((n) => n.file)).toEqual(["mid.ts", "leaf.ts"]);
    expect(report.impacted[0].affectedExports).toEqual(["api"]);
    expect(report.excluded.map((e) => e.file)).toEqual(["unrelated.ts"]);
  });

  it("handles barrels: named re-exports, export *, and aliasing", () => {
    const graph = g({
      "core.ts": `export function f() {} export function g() {}`,
      "barrel.ts": `export * from "./core";`,
      "renamed.ts": `export { f as renamedF } from "./core";`,
      "viaBarrel.ts": `import { f } from "./barrel"; f();`,
      "viaBarrelG.ts": `import { g } from "./barrel"; g();`,
      "viaRenamed.ts": `import { renamedF } from "./renamed"; renamedF();`,
    });
    expect(impactedFiles(graph, "core.ts", "f").sort()).toEqual(["barrel.ts", "renamed.ts", "viaBarrel.ts", "viaRenamed.ts"]);
  });

  it("narrows namespace imports by member access, and degrades to 'possible' for opaque use", () => {
    const graph = g({
      "core.ts": `export function f() {} export function g() {}`,
      "member.ts": `import * as c from "./core"; export const x = c.g();`,
      "opaque.ts": `import * as c from "./core"; export const all = Object.keys(c);`,
      "lazy.ts": `export async function load() { return import("./core"); }`,
    });
    const report = analyzeImpact(graph, { file: "core.ts", symbol: "f" });
    expect(report.impacted.map((n) => [n.file, n.confidence])).toEqual([
      ["lazy.ts", "possible"],
      ["opaque.ts", "possible"],
    ]);
    expect(report.excluded.map((e) => e.file)).toEqual(["member.ts"]);
  });

  it("terminates on cycles and reports the shortest evidence path", () => {
    const graph = g({
      "a.ts": `import { c } from "./c"; export function a() { return c(); }`,
      "b.ts": `import { a } from "./a"; export function b() { return a(); }`,
      "c.ts": `import { b } from "./b"; export function c() { return b(); }`,
    });
    const report = analyzeImpact(graph, { file: "a.ts", symbol: "a" });
    expect(report.impacted.map((n) => [n.file, n.depth])).toEqual([
      ["b.ts", 1],
      ["c.ts", 2],
    ]);
    expect(report.impacted[1].path.map((h) => `${h.from}<-${h.to}`)).toEqual(["b.ts<-a.ts", "c.ts<-b.ts"]);
  });

  it("can exclude type-only dependencies", () => {
    const graph = g({
      "types.ts": `export interface T { a: number }`,
      "user.ts": `import type { T } from "./types"; export const x: T = { a: 1 };`,
    });
    expect(impactedFiles(graph, "types.ts", "T")).toEqual(["user.ts"]);
    expect(impactedFiles(graph, "types.ts", "T", { includeTypeOnly: false })).toEqual([]);
  });

  it("rejects unknown target files", () => {
    expect(() => analyzeImpact(g({ "a.ts": "" }), { file: "nope.ts" })).toThrow(/not found/);
  });
});

describe("analyzeImpact (bundled sample repo)", () => {
  let graph: DependencyGraph;
  beforeAll(async () => {
    graph = buildGraph(await loadSampleRepo(path.join(__dirname, "..", "samples", "acme-storefront")));
  });

  it("builds the expected graph", () => {
    expect(graph.stats.files).toBe(17);
    expect(graph.edges.some((e) => e.source === "src/services/cart.ts" && e.target === "src/lib/pricing.ts" && e.resolution === "tsconfig-paths")).toBe(true);
    expect(graph.edges.some((e) => e.source === "src/emails/receipt.js" && e.kind === "require")).toBe(true);
    expect(graph.edges.some((e) => e.source === "src/pages/checkout.tsx" && e.kind === "dynamic")).toBe(true);
  });

  it("traces the formatPrice chain end to end", () => {
    const report = analyzeImpact(graph, { file: "src/utils/currency.ts", symbol: "formatPrice" });
    const files = report.impacted.map((n) => n.file);
    expect(files).toEqual([
      "src/emails/receipt.js",
      "src/lib/pricing.ts",
      "src/utils/index.ts",
      "src/services/cart.ts",
      "src/services/orders.ts",
      "tests/pricing.test.ts",
      "src/components/CartSummary.tsx",
      "src/pages/checkout.tsx",
      "tests/cart.test.ts",
    ]);
    expect(report.impacted.every((n) => n.confidence === "confirmed")).toBe(true);
    expect(report.excluded.map((e) => e.file)).toEqual(
      expect.arrayContaining(["src/lib/tax.ts", "src/pages/admin.tsx", "src/components/CartBadge.tsx"]),
    );
    const checkout = report.impacted.find((n) => n.file === "src/pages/checkout.tsx")!;
    // Shortest evidence chain goes through the barrel file.
    expect(checkout.depth).toBe(3);
    expect(checkout.path.map((h) => `${h.from}:${h.via}`)).toEqual([
      "src/utils/index.ts:re-export",
      "src/services/orders.ts:symbol",
      "src/pages/checkout.tsx:symbol",
    ]);
    const summary = report.impacted.find((n) => n.file === "src/components/CartSummary.tsx")!;
    expect(summary.path.map((h) => h.from)).toEqual(["src/lib/pricing.ts", "src/services/cart.ts", "src/components/CartSummary.tsx"]);
    expect(summary.path[0].usages[0]).toMatchObject({ declaration: "priceLabel", ref: "formatPrice" });
    expect(summary.affectedExports).toEqual(["default"]);
  });

  it("keeps unrelated symbols isolated", () => {
    const report = analyzeImpact(graph, { file: "src/utils/currency.ts", symbol: "parseAmount" });
    expect(report.impacted.map((n) => n.file)).toEqual([
      "src/lib/tax.ts",
      "src/pages/admin.tsx",
      "src/utils/index.ts",
      "tests/tax.test.ts",
    ]);
  });
});
