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

/** Imports of files AFTERMATH does not analyze (other languages, styles, data, media). */
const NON_JS_ASSET = /\.(vue|svelte|astro|css|scss|sass|less|styl|json|jsonc|ya?ml|toml|md|mdx|html?|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|wasm|graphql|gql|txt|csv)(\?.*)?$/i;

/** Package export conditions, most source-like first (build output is usually absent from an upload). */
const CONDITIONS = ["source", "development", "types", "import", "module", "browser", "node", "default", "require"];

/** Build-output directories that are commonly mirrored by a `src/` directory in the same package. */
const BUILD_DIRS = /^(dist|distribution|build|lib|out|esm|cjs)\//;
const SOURCE_DIRS = ["src/", "source/"];

export interface TsconfigAliases {
  /** Directory containing the tsconfig (repo-relative, "" for root). */
  dir: string;
  /** Repo-relative baseUrl, or null when not set. */
  baseUrl: string | null;
  /** Directory that `paths` targets are relative to. */
  pathsBase: string;
  paths: { pattern: string; targets: string[] }[];
}

export interface WorkspacePackage {
  name: string;
  dir: string;
  manifest: { main?: unknown; module?: unknown; source?: unknown; types?: unknown; typings?: unknown; exports?: unknown };
}

export interface ResolverConfig {
  tsconfigs: TsconfigAliases[];
  packages: WorkspacePackage[];
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

function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

/* ------------------------------------------------------------------ */
/* tsconfig / jsconfig                                                 */
/* ------------------------------------------------------------------ */

interface RawCompilerOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

function readJsonc(name: string, text: string): Record<string, unknown> | null {
  const parsed = ts.parseConfigFileTextToJson(name, text);
  return parsed.error || typeof parsed.config !== "object" || !parsed.config ? null : (parsed.config as Record<string, unknown>);
}

/** Effective baseUrl/paths for one tsconfig, following relative `extends` chains inside the repo. */
function effectiveAliases(path: string, files: Map<string, string>, depth = 0): Omit<TsconfigAliases, "dir"> {
  const empty: Omit<TsconfigAliases, "dir"> = { baseUrl: null, pathsBase: dirname(path), paths: [] };
  const text = files.get(path);
  if (!text || depth > 6) return empty;
  const config = readJsonc(path, text);
  if (!config) return empty;

  let inherited = empty;
  const ext = config.extends;
  for (const e of Array.isArray(ext) ? ext : ext ? [ext] : []) {
    if (typeof e !== "string" || !(e.startsWith("./") || e.startsWith("../"))) continue; // package-based extends are not in the upload
    const target = join(dirname(path), e.endsWith(".json") ? e : `${e}.json`);
    const parent = effectiveAliases(target, files, depth + 1);
    inherited = { ...inherited, ...(parent.baseUrl !== null ? { baseUrl: parent.baseUrl } : {}), ...(parent.paths.length ? { paths: parent.paths, pathsBase: parent.pathsBase } : {}) };
  }

  const opts = (config.compilerOptions ?? {}) as RawCompilerOptions;
  const dir = dirname(path);
  const baseUrl = typeof opts.baseUrl === "string" ? join(dir, opts.baseUrl) : inherited.baseUrl;
  if (opts.paths && typeof opts.paths === "object") {
    const paths = Object.entries(opts.paths)
      .filter(([, v]) => Array.isArray(v))
      .map(([pattern, targets]) => ({ pattern, targets: targets.filter((t) => typeof t === "string") }));
    // `paths` are relative to baseUrl when set, otherwise to the tsconfig that declares them.
    return { baseUrl, paths, pathsBase: baseUrl ?? dir };
  }
  return { baseUrl, paths: inherited.paths, pathsBase: baseUrl ?? (inherited.paths.length ? inherited.pathsBase : dir) };
}

/* ------------------------------------------------------------------ */
/* Workspaces                                                          */
/* ------------------------------------------------------------------ */

function globToRegExp(glob: string): RegExp {
  const src = normalizePath(glob)
    .split("/")
    .map((seg) => (seg === "**" ? "(?:.+)" : seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+")))
    .join("/");
  return new RegExp(`^${src}$`);
}

/** Workspace globs from package.json `workspaces`, pnpm-workspace.yaml, and lerna.json. */
function workspaceGlobs(files: Map<string, string>): string[] {
  const globs: string[] = [];
  const pkg = files.get("package.json");
  if (pkg) {
    const json = readJsonc("package.json", pkg);
    const ws = json?.workspaces;
    const list = Array.isArray(ws) ? ws : ws && typeof ws === "object" ? (ws as { packages?: unknown }).packages : null;
    if (Array.isArray(list)) globs.push(...list.filter((g): g is string => typeof g === "string"));
  }
  const pnpm = files.get("pnpm-workspace.yaml");
  if (pnpm) {
    // Minimal YAML reading: the `packages:` block is a list of quoted or bare globs.
    let inPackages = false;
    for (const line of pnpm.split("\n")) {
      if (/^packages\s*:/.test(line)) inPackages = true;
      else if (/^\S/.test(line)) inPackages = false;
      else if (inPackages) {
        const m = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*(#.*)?$/.exec(line);
        if (m && !m[1].startsWith("!")) globs.push(m[1].trim());
      }
    }
  }
  const lerna = files.get("lerna.json");
  if (lerna) {
    const json = readJsonc("lerna.json", lerna);
    if (Array.isArray(json?.packages)) globs.push(...(json.packages as unknown[]).filter((g): g is string => typeof g === "string"));
  }
  return globs;
}

export function readResolverConfig(files: Map<string, string>): ResolverConfig {
  const tsconfigs: TsconfigAliases[] = [];
  for (const path of files.keys()) {
    const name = basename(path);
    if (name !== "tsconfig.json" && name !== "jsconfig.json") continue;
    // Prefer tsconfig over jsconfig in the same directory.
    if (name === "jsconfig.json" && files.has(join(dirname(path), "tsconfig.json"))) continue;
    tsconfigs.push({ dir: dirname(path), ...effectiveAliases(path, files) });
  }
  tsconfigs.sort((a, b) => b.dir.length - a.dir.length);

  const globs = workspaceGlobs(files).map(globToRegExp);
  const packages: WorkspacePackage[] = [];
  for (const [path, text] of files) {
    if (basename(path) !== "package.json") continue;
    const dir = dirname(path);
    if (dir !== "" && !globs.some((g) => g.test(dir))) continue;
    const json = readJsonc(path, text);
    if (!json || typeof json.name !== "string") continue;
    packages.push({ name: json.name, dir, manifest: json as WorkspacePackage["manifest"] });
  }
  packages.sort((a, b) => b.name.length - a.name.length);
  return { tsconfigs, packages };
}

/** Back-compat helper: root-level aliases only. */
export function readPathAliases(files: Map<string, string>) {
  const root = readResolverConfig(files).tsconfigs.find((t) => t.dir === "");
  return root ?? { dir: "", baseUrl: null, pathsBase: "", paths: [] };
}

/* ------------------------------------------------------------------ */
/* Resolver                                                            */
/* ------------------------------------------------------------------ */

type Resolved = { path: string; resolution: GraphEdge["resolution"] } | { path: null; reason: UnresolvedImport["reason"] };

function matchPattern(pattern: string, specifier: string): string | null {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === specifier ? "" : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (specifier.startsWith(prefix) && specifier.endsWith(suffix) && specifier.length >= prefix.length + suffix.length) {
    return specifier.slice(prefix.length, specifier.length - suffix.length);
  }
  return null;
}

/** Flattens an `exports` target (string / array / conditions object) into candidate paths, preferred first. */
function exportTargets(target: unknown): string[] {
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.flatMap(exportTargets);
  if (target && typeof target === "object") {
    const obj = target as Record<string, unknown>;
    const keys = Object.keys(obj);
    const ordered = [...CONDITIONS.filter((c) => keys.includes(c)), ...keys.filter((k) => !CONDITIONS.includes(k) && !k.startsWith("."))];
    return ordered.flatMap((k) => exportTargets(obj[k]));
  }
  return [];
}

export class ModuleResolver {
  private readonly config: ResolverConfig;

  constructor(
    private readonly fileSet: Set<string>,
    config: ResolverConfig | { baseUrl: string | null; paths: { pattern: string; targets: string[] }[] } = { tsconfigs: [], packages: [] },
  ) {
    this.config =
      "tsconfigs" in config
        ? config
        : { tsconfigs: [{ dir: "", baseUrl: config.baseUrl, pathsBase: config.baseUrl ?? "", paths: config.paths }], packages: [] };
  }

  private probe(base: string): string | null {
    const candidates: string[] = [base];
    // ESM-style specifiers that name the emitted .js file of a .ts source.
    const jsLike = /\.(m|c)?jsx?$/.exec(base);
    if (jsLike) {
      const stem = base.slice(0, -jsLike[0].length);
      candidates.push(stem + ".ts", stem + ".tsx", stem + ".mts", stem + ".cts");
    }
    // Declaration files point at their source sibling.
    const dts = /\.d\.(m|c)?ts$/.exec(base);
    if (dts) {
      const stem = base.slice(0, -dts[0].length);
      candidates.push(stem + ".ts", stem + ".tsx");
    }
    for (const ext of RESOLVE_EXTENSIONS) candidates.push(base + ext);
    for (const ext of RESOLVE_EXTENSIONS) candidates.push(join(base, "index" + ext));
    for (const c of candidates) if (this.fileSet.has(c)) return c;
    return null;
  }

  private nearestTsconfig(importer: string): TsconfigAliases | null {
    const dir = dirname(importer);
    return this.config.tsconfigs.find((t) => t.dir === "" || dir === t.dir || dir.startsWith(t.dir + "/")) ?? null;
  }

  /** Resolves `pkg` or `pkg/sub` against a workspace package's manifest. */
  private resolvePackage(pkg: WorkspacePackage, subpath: string): string | null {
    const { manifest, dir } = pkg;
    const tryTargets = (targets: string[]): string | null => {
      for (const t of targets) {
        const rel = normalizePath(t);
        const hit = this.probe(join(dir, rel));
        if (hit) return hit;
        // Manifest points at build output (absent from source uploads): try the mirrored src/ path.
        if (BUILD_DIRS.test(rel)) {
          for (const src of SOURCE_DIRS) {
            const mirrored = this.probe(join(dir, rel.replace(BUILD_DIRS, src)).replace(/\.d\.(m|c)?ts$/, ""));
            if (mirrored) return mirrored;
          }
        }
      }
      return null;
    };

    const exp = manifest.exports;
    if (exp !== undefined && exp !== null) {
      const map: Record<string, unknown> =
        typeof exp === "string" || Array.isArray(exp) || !Object.keys(exp as object).some((k) => k.startsWith("."))
          ? { ".": exp }
          : (exp as Record<string, unknown>);
      const key = subpath === "" ? "." : `./${subpath}`;
      if (key in map) return tryTargets(exportTargets(map[key]));
      for (const [pattern, target] of Object.entries(map)) {
        const captured = matchPattern(pattern, key);
        if (captured !== null && pattern.includes("*")) return tryTargets(exportTargets(target).map((t) => t.replace(/\*/g, captured)));
      }
      return null; // exports is authoritative: unlisted subpaths are not importable
    }

    if (subpath) return this.probe(join(dir, subpath)) ?? tryTargets([subpath]);
    const fields = [manifest.source, manifest.module, manifest.main, manifest.types, manifest.typings].filter((f): f is string => typeof f === "string");
    return tryTargets([...fields, "index", "src/index", "source/index"]);
  }

  resolve(importer: string, specifier: string): Resolved {
    if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier.split("/")[0])) {
      return { path: null, reason: "builtin" };
    }
    if (specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..") {
      const hit = this.probe(join(dirname(importer), specifier));
      if (hit) return { path: hit, resolution: "relative" };
      return { path: null, reason: NON_JS_ASSET.test(specifier) ? "non-js-asset" : "not-found" };
    }
    if (specifier.startsWith("/")) {
      const hit = this.probe(normalizePath(specifier));
      return hit ? { path: hit, resolution: "relative" } : { path: null, reason: "not-found" };
    }

    // tsconfig "paths" from the nearest tsconfig/jsconfig
    const tsconfig = this.nearestTsconfig(importer);
    let aliasMatched = false;
    for (const { pattern, targets } of tsconfig?.paths ?? []) {
      const captured = matchPattern(pattern, specifier);
      if (captured === null) continue;
      aliasMatched = true;
      for (const t of targets) {
        const hit = this.probe(join(tsconfig!.pathsBase, t.replace("*", captured)));
        if (hit) return { path: hit, resolution: "tsconfig-paths" };
      }
    }

    // Workspace packages (monorepos), longest name first so `@a/b-c` beats `@a/b`.
    for (const pkg of this.config.packages) {
      if (specifier !== pkg.name && !specifier.startsWith(pkg.name + "/")) continue;
      const hit = this.resolvePackage(pkg, specifier.slice(pkg.name.length + 1));
      if (hit) return { path: hit, resolution: "workspace-package" };
      // A root package importing itself by name usually means "the published build" (e.g. type tests).
      if (pkg.dir === "") break;
      return { path: null, reason: "not-found" };
    }

    // baseUrl-relative bare specifiers (e.g. `import x from "components/Button"`)
    if (tsconfig?.baseUrl !== null && tsconfig?.baseUrl !== undefined) {
      const hit = this.probe(join(tsconfig.baseUrl, specifier));
      if (hit) return { path: hit, resolution: "base-url" };
    }

    return { path: null, reason: aliasMatched ? "not-found" : "external-package" };
  }
}

export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
