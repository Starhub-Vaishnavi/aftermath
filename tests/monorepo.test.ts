import { describe, expect, it } from "vitest";
import { buildGraph } from "@/lib/analysis/graph";
import { analyzeImpact } from "@/lib/analysis/impact";

const g = (files: Record<string, string>) => buildGraph(Object.entries(files).map(([path, content]) => ({ path, content })));
const edges = (graph: ReturnType<typeof g>) => graph.edges.map((e) => `${e.source} -> ${e.target} [${e.resolution}]`);

describe("workspace packages", () => {
  const repo = {
    "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["packages/*", "apps/**"] }),
    "packages/core/package.json": JSON.stringify({
      name: "@acme/core",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" }, "./money": "./dist/money.js", "./utils/*": "./src/utils/*.ts" },
    }),
    "packages/core/src/index.ts": `export { format } from "./money";`,
    "packages/core/src/money.ts": `export function format(n: number) { return String(n); }`,
    "packages/core/src/utils/slug.ts": `export const slug = (s: string) => s;`,
    "packages/core/src/internal.ts": `export const secret = 1;`,
    "packages/legacy/package.json": JSON.stringify({ name: "legacy", main: "lib/main.js" }),
    "packages/legacy/src/main.ts": `export const old = 1;`,
    "apps/web/site/package.json": JSON.stringify({ name: "web" }),
    "apps/web/site/page.ts": [
      `import { format } from "@acme/core";`,
      `import { format as f2 } from "@acme/core/money";`,
      `import { slug } from "@acme/core/utils/slug";`,
      `import { secret } from "@acme/core/internal";`,
      `import { old } from "legacy";`,
      `import React from "react";`,
      `export const page = () => format(1) + f2(2) + slug("x") + old;`,
    ].join("\n"),
    "unlisted/package.json": JSON.stringify({ name: "not-a-workspace" }),
    "unlisted/index.ts": `export const x = 1;`,
    "other.ts": `import { x } from "not-a-workspace";`,
  };

  it("resolves exports maps (mirroring dist/ to src/), patterns, and main fields", () => {
    const graph = g(repo);
    expect(edges(graph).filter((e) => e.startsWith("apps/"))).toEqual([
      "apps/web/site/page.ts -> packages/core/src/index.ts [workspace-package]",
      "apps/web/site/page.ts -> packages/core/src/money.ts [workspace-package]",
      "apps/web/site/page.ts -> packages/core/src/utils/slug.ts [workspace-package]",
      "apps/web/site/page.ts -> packages/legacy/src/main.ts [workspace-package]",
    ]);
  });

  it("treats exports as authoritative and ignores packages outside the workspace globs", () => {
    const graph = g(repo);
    const reasons = graph.unresolved.map((u) => `${u.specifier}:${u.reason}`);
    expect(reasons).toContain("@acme/core/internal:not-found");
    expect(reasons).toContain("react:external-package");
    expect(reasons).toContain("not-a-workspace:external-package");
  });

  it("traces impact across package boundaries", () => {
    const report = analyzeImpact(g(repo), { file: "packages/core/src/money.ts", symbol: "format" });
    expect(report.impacted.map((n) => n.file)).toEqual(["apps/web/site/page.ts", "packages/core/src/index.ts"]);
  });

  it("reads pnpm-workspace.yaml and lerna.json", () => {
    const pnpm = g({
      "pnpm-workspace.yaml": `packages:\n  - 'libs/*'\n  - "!libs/skip"\n# comment\n`,
      "libs/a/package.json": JSON.stringify({ name: "a", source: "src/index.ts" }),
      "libs/a/src/index.ts": `export const a = 1;`,
      "main.ts": `import { a } from "a";`,
    });
    expect(edges(pnpm)).toEqual(["main.ts -> libs/a/src/index.ts [workspace-package]"]);
    const lerna = g({
      "lerna.json": JSON.stringify({ packages: ["mods/*"] }),
      "mods/b/package.json": JSON.stringify({ name: "b" }),
      "mods/b/index.js": `module.exports = { b: 1 };`,
      "main.ts": `const { b } = require("b");`,
    });
    expect(edges(lerna)).toEqual(["main.ts -> mods/b/index.js [workspace-package]"]);
  });
});

describe("nested tsconfig", () => {
  it("uses the nearest tsconfig and follows relative extends", () => {
    const graph = g({
      "tsconfig.base.json": `{ "compilerOptions": { "baseUrl": ".", "paths": { "#shared/*": ["shared/*"] } } }`,
      "tsconfig.json": `{ "extends": "./tsconfig.base.json" }`,
      "shared/log.ts": `export const log = 1;`,
      "app/tsconfig.json": `{ "extends": "../tsconfig.base", "compilerOptions": { "baseUrl": ".", "paths": { "~/*": ["./src/*"] } } }`,
      "app/src/util.ts": `export const u = 1;`,
      "app/src/main.ts": `import { u } from "~/util"; import { log } from "#shared/log";`,
      "root.ts": `import { log } from "#shared/log"; import { u } from "~/util";`,
    });
    // app/tsconfig overrides paths and baseUrl (TS semantics: paths are replaced, not merged).
    expect(edges(graph)).toEqual(["app/src/main.ts -> app/src/util.ts [tsconfig-paths]", "root.ts -> shared/log.ts [tsconfig-paths]"]);
    expect(graph.unresolved.map((u) => `${u.from}:${u.specifier}:${u.reason}`)).toEqual([
      "app/src/main.ts:#shared/log:external-package",
      "root.ts:~/util:external-package",
    ]);
  });
});
