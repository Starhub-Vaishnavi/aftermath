import { describe, expect, it } from "vitest";
import { parseModule } from "@/lib/analysis/parser";

describe("parseModule", () => {
  it("extracts named, default, namespace and type-only imports", () => {
    const mod = parseModule(
      "a.ts",
      [
        `import def, { a, b as c } from "./x";`,
        `import * as ns from "./y";`,
        `import type { T } from "./t";`,
        `import { type U, v } from "./u";`,
        `import "./side";`,
      ].join("\n"),
    );
    expect(mod.imports.map((i) => [i.specifier, i.kind, i.typeOnly])).toEqual([
      ["./x", "static", false],
      ["./y", "static", false],
      ["./t", "static", true],
      ["./u", "static", false],
      ["./side", "side-effect", false],
    ]);
    expect(mod.imports[0].bindings).toEqual([
      { imported: "default", local: "def", typeOnly: false },
      { imported: "a", local: "a", typeOnly: false },
      { imported: "b", local: "c", typeOnly: false },
    ]);
    expect(mod.imports[1].bindings[0]).toMatchObject({ imported: "*", local: "ns" });
    expect(mod.imports[3].bindings).toEqual([
      { imported: "U", local: "U", typeOnly: true },
      { imported: "v", local: "v", typeOnly: false },
    ]);
  });

  it("extracts exports including re-exports and defaults", () => {
    const mod = parseModule(
      "b.ts",
      [
        `export function f() {}`,
        `export const x = 1, y = 2;`,
        `export interface I {}`,
        `export type T = string;`,
        `export default class Widget {}`,
        `const hidden = 1; export { hidden as visible };`,
        `export { g as h } from "./g";`,
        `export * from "./all";`,
        `export * as nsx from "./ns";`,
      ].join("\n"),
    );
    const names = mod.exports.map((e) => `${e.name}:${e.kind}`);
    expect(names).toEqual([
      "f:function",
      "x:variable",
      "y:variable",
      "I:interface",
      "T:type",
      "default:default",
      "visible:variable",
      "h:re-export",
      "nsx:namespace",
    ]);
    expect(mod.exports.find((e) => e.name === "visible")?.local).toBe("hidden");
    expect(mod.exports.find((e) => e.name === "h")?.from).toEqual({ specifier: "./g", imported: "g" });
    expect(mod.starReexports.map((s) => s.specifier)).toEqual(["./all"]);
  });

  it("finds dynamic imports and CommonJS require, and flags non-literal specifiers", () => {
    const mod = parseModule(
      "c.js",
      [
        `const { formatPrice: fp, other } = require("./currency");`,
        `const whole = require("./whole");`,
        `async function load() { return import("./lazy"); }`,
        `function bad(name) { return require(name); }`,
        `module.exports = { load, fp };`,
        `exports.extra = 1;`,
      ].join("\n"),
    );
    const req = mod.imports.find((i) => i.specifier === "./currency")!;
    expect(req.kind).toBe("require");
    expect(req.bindings).toEqual([
      { imported: "formatPrice", local: "fp", typeOnly: false },
      { imported: "other", local: "other", typeOnly: false },
    ]);
    expect(mod.imports.find((i) => i.specifier === "./whole")?.bindings[0]).toMatchObject({ imported: "*", local: "whole" });
    expect(mod.imports.find((i) => i.specifier === "./lazy")?.kind).toBe("dynamic");
    // each require is recorded once, not twice
    expect(mod.imports.filter((i) => i.specifier === "./currency")).toHaveLength(1);
    expect(mod.nonLiteralImports).toHaveLength(1);
    expect(mod.exports.map((e) => e.name).sort()).toEqual(["default", "extra", "fp", "load"]);
  });

  it("records references per top-level declaration, with namespace members as dotted names", () => {
    const mod = parseModule(
      "d.tsx",
      [
        `import * as currency from "./currency";`,
        `import { a } from "./a";`,
        `export function useIt() { return currency.parseAmount("1") + a(); }`,
        `export const View = () => <Widget value={a()} />;`,
      ].join("\n"),
    );
    const useIt = mod.declarations.find((d) => d.name === "useIt")!;
    expect(useIt.refs.map((r) => r.name)).toContain("currency.parseAmount");
    expect(useIt.refs.map((r) => r.name)).not.toContain("currency");
    const view = mod.declarations.find((d) => d.name === "View")!;
    expect(view.refs.map((r) => r.name)).toEqual(expect.arrayContaining(["Widget", "a"]));
  });

  it("never throws on syntax errors and reports them", () => {
    const mod = parseModule("broken.ts", `import { a } from "./a";\nexport function (`);
    expect(mod.imports).toHaveLength(1);
    expect(mod.syntaxErrors).toBeGreaterThan(0);
  });
});
