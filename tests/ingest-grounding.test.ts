import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractZip } from "@/lib/ingest/zip";
import { parseGitHubUrl } from "@/lib/ingest/github";
import { safeRelativePath } from "@/lib/ingest/limits";
import { buildGraph } from "@/lib/analysis/graph";
import { analyzeImpact } from "@/lib/analysis/impact";
import { deterministicExplanation, groundModelOutput } from "@/lib/llm/explain";

describe("ZIP ingestion", () => {
  it("keeps only JS/TS sources, strips a shared root folder, and skips vendored code", () => {
    const zip = zipSync({
      "repo-main/src/a.ts": strToU8(`export const a = 1;`),
      "repo-main/src/b.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "repo-main/node_modules/x/index.js": strToU8(`module.exports = 1;`),
      "repo-main/tsconfig.json": strToU8(`{}`),
      "repo-main/README.md": strToU8(`# hi`),
    });
    const { files, rootPrefix } = extractZip(zip);
    expect(rootPrefix).toBe("repo-main");
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "tsconfig.json"]);
  });

  it("rejects path traversal entries and non-zip input", () => {
    expect(safeRelativePath("../../etc/passwd")).toBeNull();
    expect(safeRelativePath("/abs/path.ts")).toBeNull();
    expect(safeRelativePath("C:/x.ts")).toBeNull();
    expect(safeRelativePath("a/./b/c.ts")).toBe("a/b/c.ts");
    expect(() => extractZip(strToU8("not a zip"))).toThrow(/not a ZIP/);
    const evil = zipSync({ "../evil.ts": strToU8(`x`), "ok/a.ts": strToU8(`export {}`) });
    expect(extractZip(evil).files.map((f) => f.path)).toEqual(["a.ts"]);
  });

  it("fails clearly when there is nothing to analyze", () => {
    expect(() => extractZip(zipSync({ "README.md": strToU8("hi") }))).toThrow(/No JavaScript or TypeScript/);
  });
});

describe("GitHub URL parsing", () => {
  it("accepts common forms and rejects other hosts", () => {
    expect(parseGitHubUrl("vercel/ms")).toMatchObject({ owner: "vercel", repo: "ms", ref: null });
    expect(parseGitHubUrl("https://github.com/vercel/ms.git")).toMatchObject({ owner: "vercel", repo: "ms" });
    expect(parseGitHubUrl("https://github.com/a/b/tree/dev/packages/core")).toEqual({ owner: "a", repo: "b", ref: "dev", subdir: "packages/core" });
    expect(() => parseGitHubUrl("https://gitlab.com/a/b")).toThrow(/github\.com/);
    expect(() => parseGitHubUrl("https://github.com/only-owner")).toThrow();
  });
});

describe("LLM grounding", () => {
  const graph = buildGraph([
    { path: "core.ts", content: `export function f() { return "x"; }` },
    { path: "use.ts", content: `import { f } from "./core"; export const label = () => "v=" + f();` },
    { path: "lazy.ts", content: `export const load = () => import("./core");` },
  ]);
  const report = analyzeImpact(graph, { file: "core.ts", symbol: "f" });

  it("drops claims about files outside the evidence and takes dependency status from the analyzer", () => {
    const out = groundModelOutput(
      {
        summary: "s",
        risks: [
          { file: "use.ts", title: "concat", hypothesis: "may print [object Object]", likelihood: "likely", severity: "high" },
          { file: "lazy.ts", title: "lazy", hypothesis: "unknown", likelihood: "plausible", severity: "low" },
          { file: "invented.ts", title: "made up", hypothesis: "x", likelihood: "likely", severity: "high" },
        ],
        checklist: [{ step: "a", file: "invented.ts" }],
        tests: [],
        assumptions: [],
      },
      report,
      "test-model",
    );
    expect(out.risks.map((r) => [r.file, r.dependency])).toEqual([
      ["use.ts", "confirmed"],
      ["lazy.ts", "possible"],
    ]);
    expect(out.risks[0].evidence[0]).toMatchObject({ file: "use.ts", line: 1 });
    expect(out.discarded).toEqual([{ file: "invented.ts", title: "made up", reason: "file is not in the static impact set" }]);
    expect(out.checklist[0].file).toBeNull();
  });

  it("produces a graph-only explanation without an LLM", () => {
    const out = deterministicExplanation(report, "return an object", "no key");
    expect(out.source).toBe("deterministic");
    expect(out.risks.map((r) => r.file).sort()).toEqual(["lazy.ts", "use.ts"]);
    expect(out.checklist[0].file).toBe("core.ts");
  });
});
