import type {
  Confidence,
  DependencyGraph,
  EvidenceHop,
  GraphEdge,
  ImpactMode,
  ImpactReport,
  ImpactedNode,
  ImportRecord,
  ParsedModule,
} from "./types";

/**
 * Reverse-dependency traversal from a changed file (optionally a single
 * exported symbol).
 *
 * In `symbol` mode the traversal tracks *which exports* are affected at each
 * hop: an importer is only reached if it binds an affected export, and it only
 * propagates the exports of its own whose top-level declarations reference
 * that binding. Every hop carries the import statement and the referencing
 * declarations as evidence.
 *
 * In `file` mode every importer of an affected file is reached (classic
 * reverse reachability). It is conservative and noisier.
 */

type SymbolSet = Set<string> | "*";

export interface ImpactOptions {
  mode?: ImpactMode;
  includeTypeOnly?: boolean;
  maxDepth?: number;
}

interface HopResult {
  via: EvidenceHop["via"];
  matchedSymbols: string[];
  usages: EvidenceHop["usages"];
  affectedExports: SymbolSet;
  opaque: boolean;
}

function findImportRecord(mod: ParsedModule, edge: GraphEdge): ImportRecord | undefined {
  return mod.imports.find((i) => i.line === edge.line && i.specifier === edge.specifier && i.kind === edge.kind);
}

/** Closure over top-level declarations: which local names (transitively) reference any of `seeds`. */
function affectedLocals(mod: ParsedModule, seeds: Set<string>): Set<string> {
  const affected = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of mod.declarations) {
      if (affected.has(d.name)) continue;
      if (d.refs.some((r) => affected.has(r.name))) {
        affected.add(d.name);
        changed = true;
      }
    }
  }
  return affected;
}

function usagesOf(mod: ParsedModule, names: Set<string>): EvidenceHop["usages"] {
  const out: EvidenceHop["usages"] = [];
  for (const d of mod.declarations) {
    for (const r of d.refs) {
      if (names.has(r.name)) out.push({ declaration: d.name, line: r.line, ref: r.name });
    }
  }
  for (const r of mod.topLevelRefs) {
    if (names.has(r.name)) out.push({ declaration: "(module scope)", line: r.line, ref: r.name });
  }
  // de-duplicate by declaration+line
  const seen = new Set<string>();
  return out.filter((u) => {
    const k = `${u.declaration}:${u.line}:${u.ref}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function evaluateHop(mod: ParsedModule, edge: GraphEdge, affected: SymbolSet): HopResult | null {
  const record = findImportRecord(mod, edge);
  if (!record) return null;
  const all = affected === "*";
  const has = (name: string) => all || (affected as Set<string>).has(name);

  const seeds = new Set<string>();
  const matched = new Set<string>();
  const reexported = new Set<string>();
  let via: EvidenceHop["via"] = "symbol";
  let opaque = false;

  if (record.kind === "re-export-all") {
    // `export * from` forwards every named export except `default`, unless shadowed locally.
    const own = new Set(mod.exports.filter((e) => !e.from).map((e) => e.name));
    if (all) {
      opaque = true; // the set of forwarded names is unknown without the target's export list
      matched.add("*");
    } else {
      for (const name of affected as Set<string>) {
        if (name !== "default" && !own.has(name)) {
          matched.add(name);
          reexported.add(name);
        }
      }
    }
    via = "re-export";
  } else if (record.kind === "re-export") {
    for (const b of record.bindings) {
      if (b.imported === "*" || has(b.imported)) {
        matched.add(b.imported);
        for (const e of mod.exports) {
          if (e.from && e.from.specifier === record.specifier && e.from.imported === b.imported) reexported.add(e.name);
        }
      }
    }
    via = "re-export";
  } else {
    for (const b of record.bindings) {
      if (b.imported === "*") {
        if (b.local === null) {
          // dynamic import() or a bare require(): symbol use cannot be determined statically.
          matched.add("*");
          opaque = true;
          via = "dynamic";
          continue;
        }
        const nsRefs = new Set<string>();
        let bareUse = false;
        const refsAll = [...mod.declarations.flatMap((d) => d.refs), ...mod.topLevelRefs];
        for (const r of refsAll) {
          if (r.name === b.local) bareUse = true;
          else if (r.name.startsWith(b.local + ".")) {
            const member = r.name.slice(b.local.length + 1);
            if (has(member)) nsRefs.add(r.name);
          }
        }
        // Re-exporting the namespace binding itself (`export { ns }`) also counts as bare use.
        if (mod.exports.some((e) => e.local === b.local)) bareUse = true;
        if (bareUse) {
          seeds.add(b.local);
          matched.add("*");
          opaque = true;
          via = "namespace-opaque";
        } else if (nsRefs.size) {
          for (const r of nsRefs) {
            seeds.add(r);
            matched.add(r.slice(b.local.length + 1));
          }
          if (via === "symbol") via = "namespace-member";
        } else if (all) {
          matched.add("*");
          if (b.local) seeds.add(b.local);
        }
      } else if (has(b.imported)) {
        matched.add(b.imported);
        if (b.local) seeds.add(b.local);
      }
    }
    if (record.kind === "side-effect" && all) {
      matched.add("*");
      via = "file";
    }
  }

  if (!matched.size) return null;

  const locals = affectedLocals(mod, seeds);
  const exportsHit = new Set<string>(reexported);
  for (const e of mod.exports) if (e.local && locals.has(e.local)) exportsHit.add(e.name);

  return {
    via,
    matchedSymbols: [...matched],
    usages: usagesOf(mod, seeds),
    affectedExports: opaque ? "*" : exportsHit,
    opaque,
  };
}

function mergeInto(existing: SymbolSet | undefined, incoming: SymbolSet): { merged: SymbolSet; grew: boolean } {
  if (existing === undefined) return { merged: incoming, grew: true };
  if (existing === "*") return { merged: "*", grew: false };
  if (incoming === "*") return { merged: "*", grew: true };
  let grew = false;
  const merged = new Set(existing);
  for (const s of incoming) if (!merged.has(s)) {
    merged.add(s);
    grew = true;
  }
  return { merged, grew };
}

export function analyzeImpact(
  graph: DependencyGraph,
  target: { file: string; symbol?: string | null },
  options: ImpactOptions = {},
): ImpactReport {
  const mode = options.mode ?? "symbol";
  const includeTypeOnly = options.includeTypeOnly ?? true;
  const maxDepth = options.maxDepth ?? 50;
  const symbol = target.symbol ?? null;

  if (!graph.modules[target.file]) {
    throw new Error(`File not found in graph: ${target.file}`);
  }

  const importersOf = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (!importersOf.has(e.target)) importersOf.set(e.target, []);
    importersOf.get(e.target)!.push(e);
  }
  const testFiles = new Set(graph.nodes.filter((n) => n.isTest).map((n) => n.path));

  const affected = new Map<string, SymbolSet>();
  const info = new Map<string, { depth: number; confidence: Confidence; path: EvidenceHop[] }>();
  const excluded = new Map<string, ImpactReport["excluded"][number]>();

  affected.set(target.file, mode === "file" || symbol === null ? "*" : new Set([symbol]));
  info.set(target.file, { depth: 0, confidence: "confirmed", path: [] });

  const queue: string[] = [target.file];
  while (queue.length) {
    const file = queue.shift()!;
    const current = info.get(file)!;
    if (current.depth >= maxDepth) continue;
    const set = affected.get(file)!;

    for (const edge of importersOf.get(file) ?? []) {
      const importer = edge.source;
      if (importer === target.file) continue;
      if (!includeTypeOnly && edge.typeOnly) {
        if (!info.has(importer)) excluded.set(importer, { file: importer, reason: "type-only import (excluded by filter)", line: edge.line, text: edge.text });
        continue;
      }
      const mod = graph.modules[importer];

      let hop: HopResult | null;
      if (mode === "file") {
        hop = { via: "file", matchedSymbols: edge.symbols.length ? edge.symbols : ["*"], usages: [], affectedExports: "*", opaque: true };
      } else {
        hop = evaluateHop(mod, edge, set);
      }

      if (!hop) {
        if (!info.has(importer)) {
          const names = set === "*" ? "the changed module" : [...set].map((s) => `\`${s}\``).join(", ");
          const imported = edge.symbols.length ? edge.symbols.map((s) => (s === "*" ? "namespace" : `\`${s}\``)).join(", ") : "nothing";
          excluded.set(importer, {
            file: importer,
            reason: `imports ${imported} from ${file}, but does not reference ${names}`,
            line: edge.line,
            text: edge.text,
          });
        }
        continue;
      }

      const confidence: Confidence =
        current.confidence === "confirmed" && !hop.opaque ? "confirmed" : mode === "file" && current.depth === 0 ? "confirmed" : "possible";
      const evidence: EvidenceHop = {
        from: importer,
        to: file,
        edgeId: edge.id,
        line: edge.line,
        text: edge.text,
        symbols: hop.matchedSymbols,
        via: hop.via,
        usages: hop.usages,
      };

      const prev = info.get(importer);
      if (!prev) {
        info.set(importer, { depth: current.depth + 1, confidence, path: [...current.path, evidence] });
        excluded.delete(importer);
      } else if (prev.confidence === "possible" && confidence === "confirmed") {
        info.set(importer, { depth: current.depth + 1, confidence, path: [...current.path, evidence] });
      }

      const { merged, grew } = mergeInto(affected.get(importer), hop.affectedExports);
      affected.set(importer, merged);
      const hasPropagation = merged === "*" || merged.size > 0;
      if ((grew || !prev) && hasPropagation) queue.push(importer);
    }
  }

  const impacted: ImpactedNode[] = [...info.entries()]
    .filter(([file]) => file !== target.file)
    .map(([file, i]) => {
      const set = affected.get(file)!;
      return {
        file,
        depth: i.depth,
        confidence: i.confidence,
        affectedExports: set === "*" ? ["*"] : [...set].sort(),
        path: i.path,
        isTest: testFiles.has(file),
      };
    })
    .sort((a, b) => a.depth - b.depth || a.file.localeCompare(b.file));

  return {
    target: { file: target.file, symbol },
    mode,
    includeTypeOnly,
    impacted,
    excluded: [...excluded.values()].filter((e) => !info.has(e.file)).sort((a, b) => a.file.localeCompare(b.file)),
    stats: {
      direct: impacted.filter((n) => n.depth === 1).length,
      transitive: impacted.filter((n) => n.depth > 1).length,
      confirmed: impacted.filter((n) => n.confidence === "confirmed").length,
      possible: impacted.filter((n) => n.confidence === "possible").length,
      tests: impacted.filter((n) => n.isTest).length,
      maxDepth: impacted.reduce((m, n) => Math.max(m, n.depth), 0),
    },
  };
}
