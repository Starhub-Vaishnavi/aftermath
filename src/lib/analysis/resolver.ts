import ts from "typescript";
import type { GraphEdge, UnresolvedImport } from "./types";

/**
 * Resolves import specifiers to files that exist in the analyzed file set.
 *
 * Resolution is purely lexical: we only ever map a specifier to a path that is
 * present in the uploaded source. If no file matches, the import is reported as
 * unresolved rather than guessed.
 */

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

const NODE_BUILTINS = new Set([
  "assert", "async_hooks", "buffer", "child_process", "cluster", "console", "crypto", "dgram", "dns",
  "events", "fs", "http", "http2", "https", "module", "net", "os", "path", "perf_hooks", "process",
  "querystring", "readline", "stream", "string_decoder", "timers", "tls", "tty", "url", "util", "v8",
  "vm", "worker_threads", "zlib",
]);

export interface PathAliases {
  baseUrl: string | null; // repo-relative directory
  paths: { pattern: string; targets: string[] }[];
}

export function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function join(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

/** Reads `compilerOptions.baseUrl` / `paths` from a root tsconfig/jsconfig, tolerating comments. */
export function readPathAliases(files: Map<string, string>): PathAliases {
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const text = files.get(name);
    if (!text) continue;
    const parsed = ts.parseConfigFileTextToJson(name, text);
    const opts = (parsed.config?.compilerOptions ?? {}) as { baseUrl?: string; paths?: Record<string, string[]> };
    const baseUrl = typeof opts.baseUrl === "string" ? normalizePath(opts.baseUrl) : null;
    const paths = Object.entries(opts.paths ?? {})
      .filter(([, v]) => Array.isArray(v))
      .map(([pattern, targets]) => ({ pattern, targets: targets.filter((t) => typeof t === "string") }));
    return { baseUrl, paths };
  }
  return { baseUrl: null, paths: [] };
}

export class ModuleResolver {
  constructor(
    private readonly fileSet: Set<string>,
    private readonly aliases: PathAliases = { baseUrl: null, paths: [] },
  ) {}

  private probe(base: string): string | null {
    const candidates: string[] = [base];
    // ESM-style specifiers that name the emitted .js file of a .ts source.
    const jsLike = /\.(m|c)?jsx?$/.exec(base);
    if (jsLike) {
      const stem = base.slice(0, -jsLike[0].length);
      candidates.push(stem + ".ts", stem + ".tsx", stem + ".mts", stem + ".cts");
    }
    for (const ext of RESOLVE_EXTENSIONS) candidates.push(base + ext);
    for (const ext of RESOLVE_EXTENSIONS) candidates.push(join(base, "index" + ext));
    for (const c of candidates) if (this.fileSet.has(c)) return c;
    return null;
  }

  resolve(
    importer: string,
    specifier: string,
  ): { path: string; resolution: GraphEdge["resolution"] } | { path: null; reason: UnresolvedImport["reason"] } {
    if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier.split("/")[0])) {
      return { path: null, reason: "builtin" };
    }
    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..") {
      const hit = this.probe(join(dirname(importer), specifier));
      return hit ? { path: hit, resolution: "relative" } : { path: null, reason: "not-found" };
    }
    if (specifier.startsWith("/")) {
      const hit = this.probe(normalizePath(specifier));
      return hit ? { path: hit, resolution: "relative" } : { path: null, reason: "not-found" };
    }

    // tsconfig "paths"
    const base = this.aliases.baseUrl ?? "";
    let aliasMatched = false;
    for (const { pattern, targets } of this.aliases.paths) {
      const star = pattern.indexOf("*");
      let captured: string | null = null;
      if (star === -1) {
        if (pattern === specifier) captured = "";
      } else {
        const prefix = pattern.slice(0, star);
        const suffix = pattern.slice(star + 1);
        if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length) {
          captured = specifier.slice(prefix.length, specifier.length - suffix.length);
        }
      }
      if (captured === null) continue;
      aliasMatched = true;
      for (const t of targets) {
        const hit = this.probe(join(base, t.replace("*", captured)));
        if (hit) return { path: hit, resolution: "tsconfig-paths" };
      }
    }

    // baseUrl-relative bare specifiers (e.g. `import x from "components/Button"`)
    if (this.aliases.baseUrl !== null) {
      const hit = this.probe(join(base, specifier));
      if (hit) return { path: hit, resolution: "base-url" };
    }

    return { path: null, reason: aliasMatched ? "not-found" : "external-package" };
  }
}

export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
