import { isAnalyzablePath, parseModule } from "./parser";
import { ModuleResolver, dirname, packageName, readResolverConfig } from "./resolver";
import type { DependencyGraph, GraphEdge, GraphNode, ParsedModule, SourceFile, UnresolvedImport } from "./types";

const TEST_PATTERN = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

export function isTestPath(path: string): boolean {
  return TEST_PATTERN.test(path);
}

/**
 * Builds the dependency graph. Every edge corresponds to one import statement
 * that resolved to a file in `files`; nothing is inferred.
 */
export function buildGraph(files: SourceFile[], opts: { skippedFiles?: number } = {}): DependencyGraph {
  const contents = new Map(files.map((f) => [f.path, f.content]));
  const sources = files.filter((f) => isAnalyzablePath(f.path)).sort((a, b) => a.path.localeCompare(b.path));
  const fileSet = new Set(sources.map((f) => f.path));
  const resolver = new ModuleResolver(fileSet, readResolverConfig(contents));

  const modules: Record<string, ParsedModule> = {};
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const unresolved: UnresolvedImport[] = [];
  const externals = new Map<string, Set<string>>();

  for (const f of sources) {
    const mod = parseModule(f.path, f.content);
    modules[f.path] = mod;
    nodes.push({
      id: f.path,
      path: f.path,
      dir: dirname(f.path),
      loc: mod.loc,
      isTest: isTestPath(f.path),
      exports: mod.exports,
      syntaxErrors: mod.syntaxErrors,
    });

    const seen = new Map<string, number>();
    for (const imp of mod.imports) {
      const res = resolver.resolve(f.path, imp.specifier);
      if (res.path === null) {
        if (res.reason === "external-package") {
          const name = packageName(imp.specifier);
          if (!externals.has(name)) externals.set(name, new Set());
          externals.get(name)!.add(f.path);
        }
        unresolved.push({ from: f.path, specifier: imp.specifier, line: imp.line, reason: res.reason });
        continue;
      }
      if (res.path === f.path) continue; // self-import
      const baseId = `${f.path}->${res.path}@${imp.line}`;
      const n = seen.get(baseId) ?? 0;
      seen.set(baseId, n + 1);
      const symbols = imp.bindings.length ? [...new Set(imp.bindings.map((b) => b.imported))] : [];
      edges.push({
        id: n ? `${baseId}#${n}` : baseId,
        source: f.path,
        target: res.path,
        kind: imp.kind,
        symbols,
        typeOnly: imp.typeOnly || (imp.bindings.length > 0 && imp.bindings.every((b) => b.typeOnly)),
        line: imp.line,
        text: imp.text,
        specifier: imp.specifier,
        resolution: res.resolution,
      });
    }
    for (const nl of mod.nonLiteralImports) {
      unresolved.push({ from: f.path, specifier: nl.text, line: nl.line, reason: "non-literal" });
    }
  }

  return {
    nodes,
    edges,
    modules,
    externals: [...externals.entries()]
      .map(([name, importers]) => ({ name, importers: [...importers].sort() }))
      .sort((a, b) => b.importers.length - a.importers.length || a.name.localeCompare(b.name)),
    unresolved,
    stats: {
      files: nodes.length,
      edges: edges.length,
      externalPackages: externals.size,
      unresolved: unresolved.filter((u) => u.reason === "not-found" || u.reason === "non-literal").length,
      loc: nodes.reduce((s, n) => s + n.loc, 0),
      syntaxErrors: nodes.reduce((s, n) => s + n.syntaxErrors, 0),
      skippedFiles: opts.skippedFiles ?? 0,
    },
  };
}
