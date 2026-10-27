import type { ImpactReport, ImpactedNode } from "../analysis/types";

const MAX_TARGET_LINES = 220;
const SNIPPET_RADIUS = 3;
const MAX_NODES = 24;

function snippet(content: string | undefined, line: number, radius = SNIPPET_RADIUS): string {
  if (!content) return "(source unavailable)";
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - radius);
  const end = Math.min(lines.length, line + radius);
  return lines
    .slice(start, end)
    .map((l, i) => `${String(start + i + 1).padStart(4)}| ${l}`)
    .join("\n");
}

function describeNode(n: ImpactedNode, files: Record<string, string>): string {
  const hop = n.path[n.path.length - 1];
  const chain = [n.path[0]?.to, ...n.path.map((h) => h.from)].filter(Boolean).join(" → ");
  const usageLines = hop.usages.slice(0, 3);
  const parts = [
    `### ${n.file}`,
    `- depth: ${n.depth} (${n.depth === 1 ? "direct" : "transitive"})`,
    `- dependency: ${n.confidence}${n.confidence === "possible" ? " (static analysis could not narrow this to the changed symbol)" : ""}`,
    `- via: ${hop.via}, imports [${hop.symbols.join(", ")}] from ${hop.to} at line ${hop.line}: \`${hop.text}\``,
    `- exports affected in turn: ${n.affectedExports.join(", ") || "(none — impact stops here)"}`,
    `- chain: ${chain}`,
    n.isTest ? `- this is a TEST file` : "",
    "```",
    snippet(files[n.file], hop.line, 0),
    ...usageLines.map((u) => `… in ${u.declaration}:\n${snippet(files[n.file], u.line)}`),
    "```",
  ];
  return parts.filter(Boolean).join("\n");
}

/** Builds the evidence pack given to the model. Only facts produced by static analysis go in here. */
export function buildContext(report: ImpactReport, files: Record<string, string>, change: string): string {
  const target = files[report.target.file] ?? "";
  const targetLines = target.split("\n");
  const shown = targetLines.slice(0, MAX_TARGET_LINES).map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
  const nodes = report.impacted.slice(0, MAX_NODES);
  return [
    `## Proposed change`,
    change,
    ``,
    `## Changed target`,
    `file: ${report.target.file}`,
    `symbol: ${report.target.symbol ?? "(whole module)"}`,
    "```",
    shown + (targetLines.length > MAX_TARGET_LINES ? `\n… (${targetLines.length - MAX_TARGET_LINES} more lines)` : ""),
    "```",
    ``,
    `## Static impact report (deterministic, from the TypeScript parser)`,
    `mode: ${report.mode}; impacted files: ${report.impacted.length} (${report.stats.direct} direct, ${report.stats.transitive} transitive; ${report.stats.confirmed} confirmed, ${report.stats.possible} possible)`,
    report.impacted.length > MAX_NODES ? `(showing the ${MAX_NODES} closest files)` : "",
    ``,
    ...nodes.map((n) => describeNode(n, files)),
    ``,
    `## Importers that were excluded (they do not reference the changed symbol)`,
    ...(report.excluded.length ? report.excluded.slice(0, 15).map((e) => `- ${e.file}: ${e.reason}`) : ["(none)"]),
  ].join("\n");
}
