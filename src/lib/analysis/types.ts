/**
 * Core data model for AFTERMATH's static analysis.
 *
 * Everything in this file is produced deterministically from source text by the
 * TypeScript compiler's parser. Nothing here is ever produced by an LLM.
 */

export interface SourceFile {
  /** POSIX-style path relative to the repository root, e.g. `src/lib/pricing.ts`. */
  path: string;
  content: string;
}

export type ImportKind =
  | "static" // import { a } from "./x"
  | "side-effect" // import "./x"
  | "dynamic" // import("./x")
  | "require" // require("./x")
  | "re-export" // export { a } from "./x"
  | "re-export-all"; // export * from "./x"

export interface ImportBinding {
  /** Name exported by the target module: an identifier, `default`, or `*` for a namespace. */
  imported: string;
  /** Local binding name in the importing module (`null` for re-exports and unbound requires). */
  local: string | null;
  typeOnly: boolean;
}

export interface ImportRecord {
  specifier: string;
  kind: ImportKind;
  bindings: ImportBinding[];
  /** True when the whole statement is `import type` / `export type`. */
  typeOnly: boolean;
  line: number;
  /** The source text of the statement, trimmed to one line for display. */
  text: string;
}

export type ExportKind =
  | "function"
  | "class"
  | "variable"
  | "type"
  | "interface"
  | "enum"
  | "default"
  | "re-export"
  | "namespace"
  | "commonjs";

export interface ExportRecord {
  /** Public name. `default` for default exports. */
  name: string;
  kind: ExportKind;
  line: number;
  typeOnly: boolean;
  /** Local top-level name that backs this export, when it is defined in this file. */
  local: string | null;
  /** For re-exports: the module specifier and the name imported from it. */
  from?: { specifier: string; imported: string };
}

export interface Reference {
  /** Identifier or `namespace.member` reference. */
  name: string;
  line: number;
}

/** A top-level declaration and the identifiers it references. */
export interface Declaration {
  name: string;
  line: number;
  refs: Reference[];
}

export interface ParsedModule {
  path: string;
  imports: ImportRecord[];
  exports: ExportRecord[];
  /** `export * from` specifiers. */
  starReexports: { specifier: string; line: number; text: string }[];
  declarations: Declaration[];
  /** References made by top-level statements that are not declarations (module side effects). */
  topLevelRefs: Reference[];
  /** require()/import() calls whose argument is not a string literal. */
  nonLiteralImports: { line: number; text: string }[];
  loc: number;
  syntaxErrors: number;
}

export interface GraphNode {
  id: string;
  path: string;
  dir: string;
  loc: number;
  isTest: boolean;
  exports: ExportRecord[];
  syntaxErrors: number;
}

export interface GraphEdge {
  id: string;
  source: string; // importer
  target: string; // imported module
  kind: ImportKind;
  /** Imported names (`*` for namespace or whole-module). */
  symbols: string[];
  typeOnly: boolean;
  line: number;
  text: string;
  specifier: string;
  /** How the specifier was resolved, for transparency. */
  resolution: "relative" | "tsconfig-paths" | "base-url";
}

export interface UnresolvedImport {
  from: string;
  specifier: string;
  line: number;
  reason: "external-package" | "not-found" | "non-literal" | "builtin";
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  modules: Record<string, ParsedModule>;
  externals: { name: string; importers: string[] }[];
  unresolved: UnresolvedImport[];
  stats: {
    files: number;
    edges: number;
    externalPackages: number;
    unresolved: number;
    loc: number;
    syntaxErrors: number;
    skippedFiles: number;
  };
}

/* ------------------------------------------------------------------ */
/* Impact analysis                                                     */
/* ------------------------------------------------------------------ */

export type ImpactMode = "symbol" | "file";

/**
 * - `confirmed`: every hop in the evidence chain is a syntactically verified
 *   reference to an affected symbol.
 * - `possible`: the dependency edge is real, but at least one hop could not be
 *   narrowed to a specific symbol (namespace object passed around, dynamic
 *   import, `require` without destructuring, or file-level mode).
 */
export type Confidence = "confirmed" | "possible";

export interface EvidenceHop {
  /** Importer (the file that is affected by this hop). */
  from: string;
  /** Module being imported. */
  to: string;
  edgeId: string;
  line: number;
  text: string;
  /** Symbols of `to` that `from` depends on through this edge. */
  symbols: string[];
  via: "symbol" | "namespace-member" | "re-export" | "namespace-opaque" | "dynamic" | "file";
  /** Top-level declarations in `from` that reference the affected bindings. */
  usages: { declaration: string; line: number; ref: string }[];
}

export interface ImpactedNode {
  file: string;
  depth: number;
  confidence: Confidence;
  /** Exports of this file that are affected and therefore propagate further. `*` = unknown/all. */
  affectedExports: string[];
  /** Shortest evidence chain from the changed target to this file (target-first). */
  path: EvidenceHop[];
  isTest: boolean;
}

export interface ImpactReport {
  target: { file: string; symbol: string | null };
  mode: ImpactMode;
  includeTypeOnly: boolean;
  impacted: ImpactedNode[];
  /**
   * Files that import the target module but do not reference the changed
   * symbol. Reported so users can see why they were excluded.
   */
  excluded: { file: string; reason: string; line: number; text: string }[];
  stats: {
    direct: number;
    transitive: number;
    confirmed: number;
    possible: number;
    tests: number;
    maxDepth: number;
  };
}
