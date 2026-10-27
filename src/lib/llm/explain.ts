import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { ImpactReport, ImpactedNode } from "../analysis/types";
import { buildContext } from "./context";
import { ModelOutputSchema, type Explanation, type ModelOutput, type Risk } from "./schema";

export const DEFAULT_MODEL = "claude-opus-5-5";

const SYSTEM_PROMPT = `You are the explanation layer of AFTERMATH, a change-impact simulator for JavaScript/TypeScript codebases.

A deterministic static analyzer (the TypeScript parser) has already computed which files depend on the changed code, with import statements and referencing lines as evidence. Your job is to interpret that evidence for a developer who is considering the proposed change.

Rules:
- Only discuss files that appear in the static impact report. Never introduce new files or dependencies; if you suspect a dependency the report does not show (e.g. string-based lookups, runtime reflection), mention it under "assumptions" instead.
- The dependency facts are given. What you add is hypotheses about *behavior*: how the proposed change might alter what each dependent does. Phrase these as hypotheses ("may", "could", "if ... then ...") and ground them in the cited code lines. Never state that something will definitely break.
- Use likelihood "likely" only when the cited code visibly relies on the exact aspect being changed (e.g. string concatenation of a return value that will become an object). Use "unlikely" when the dependent only passes the value through.
- Files marked "possible" could not be narrowed to the changed symbol; say so rather than guessing how they use it.
- Checklist steps should be concrete and ordered (update the definition, then direct callers, then transitive surfaces, then tests).
- Suggested regression tests should target the behaviors your hypotheses identify, preferably in the impacted test files that already exist. Keep sketches short.`;

function evidenceFor(n: ImpactedNode): Risk["evidence"] {
  const hop = n.path[n.path.length - 1];
  const ev = [{ file: n.file, line: hop.line, text: hop.text }];
  for (const u of hop.usages.slice(0, 3)) ev.push({ file: n.file, line: u.line, text: `${u.ref} referenced in ${u.declaration}` });
  return ev;
}

/** Enforces the evidence boundary on model output. */
export function groundModelOutput(output: ModelOutput, report: ImpactReport, model: string): Explanation {
  const byFile = new Map(report.impacted.map((n) => [n.file, n]));
  const discarded: Explanation["discarded"] = [];
  const risks: Risk[] = [];
  for (const r of output.risks) {
    const node = byFile.get(r.file);
    if (!node) {
      discarded.push({
        file: r.file,
        title: r.title,
        reason: r.file === report.target.file ? "refers to the changed file itself" : "file is not in the static impact set",
      });
      continue;
    }
    risks.push({ ...r, dependency: node.confidence, depth: node.depth, evidence: evidenceFor(node) });
  }
  const known = new Set([report.target.file, ...byFile.keys()]);
  return {
    source: "llm",
    model,
    summary: output.summary,
    risks,
    checklist: output.checklist.map((c) => ({ ...c, file: c.file && known.has(c.file) ? c.file : null })),
    tests: output.tests,
    assumptions: output.assumptions,
    discarded,
    notice: null,
  };
}

/** Graph-only explanation used when no LLM is configured or the call fails. */
export function deterministicExplanation(report: ImpactReport, change: string, notice: string | null): Explanation {
  const { target, stats } = report;
  const name = target.symbol ? `\`${target.symbol}\`` : `\`${target.file}\``;
  const direct = report.impacted.filter((n) => n.depth === 1 && !n.isTest);
  const transitive = report.impacted.filter((n) => n.depth > 1 && !n.isTest);
  const tests = report.impacted.filter((n) => n.isTest);

  const risks: Risk[] = report.impacted
    .filter((n) => !n.isTest)
    .map((n) => {
      const hop = n.path[n.path.length - 1];
      const usage = hop.usages[0];
      const where = usage ? `${usage.declaration} (line ${usage.line})` : `line ${hop.line}`;
      return {
        file: n.file,
        title: n.depth === 1 ? `Directly depends on ${name}` : `Reaches ${name} through ${hop.to}`,
        hypothesis:
          n.confidence === "confirmed"
            ? `References ${hop.symbols.join(", ")} from ${hop.to} in ${where}. Any change to the contract of ${name} may surface here. Review whether this code relies on the aspect being changed.`
            : `Imports ${hop.to} in a way static analysis cannot narrow to ${name} (${hop.via}). Manual review needed.`,
        likelihood: "plausible" as const,
        severity: n.depth === 1 ? ("medium" as const) : ("low" as const),
        dependency: n.confidence,
        depth: n.depth,
        evidence: evidenceFor(n),
      };
    });

  const testFilesReaching = new Set(tests.flatMap((t) => t.path.map((h) => h.to)));
  const untested = direct.filter((n) => !testFilesReaching.has(n.file));

  return {
    source: "deterministic",
    model: null,
    summary:
      report.impacted.length === 0
        ? `No file in this repository references ${name}. Static analysis found no dependents, so the change appears contained (runtime string lookups or external consumers are not visible to this analysis).`
        : `${report.impacted.length} file${report.impacted.length === 1 ? "" : "s"} depend on ${name}: ${stats.direct} directly and ${stats.transitive} transitively, ${stats.confirmed} confirmed by symbol references and ${stats.possible} possible. ${stats.tests} test file${stats.tests === 1 ? "" : "s"} exercise this path. Behavioral risk is not assessed without an LLM; review the evidence for each dependent.`,
    risks,
    checklist: [
      { step: `Implement the change in ${target.file}${target.symbol ? ` (${target.symbol})` : ""}: ${change.slice(0, 140)}`, file: target.file },
      ...direct.map((n) => ({ step: `Update direct dependent ${n.file} (${n.path[n.path.length - 1].usages[0]?.declaration ?? "import site"})`, file: n.file })),
      ...transitive.slice(0, 10).map((n) => ({ step: `Verify transitive dependent ${n.file} (via ${n.path[n.path.length - 1].to})`, file: n.file })),
      ...(tests.length ? [{ step: `Run impacted tests: ${tests.map((t) => t.file).join(", ")}`, file: null }] : []),
      ...(report.excluded.length ? [{ step: `Spot-check excluded importers (${report.excluded.length}) — they import the module but not ${name}`, file: null }] : []),
    ],
    tests: [
      ...tests.map((t) => ({
        name: `Re-run ${t.file}`,
        file: t.file,
        rationale: `Reaches ${name} through ${t.path.map((h) => h.to).slice(1).join(" → ") || target.file}.`,
        sketch: `npx vitest run ${t.file}`,
      })),
      ...untested.map((n) => ({
        name: `Add coverage for ${n.affectedExports.filter((e) => e !== "*")[0] ?? n.file}`,
        file: n.file.replace(/\.(m|c)?(t|j)sx?$/, ".test.ts"),
        rationale: `${n.file} directly depends on ${name} but no impacted test reaches it.`,
        sketch: `// assert the current output of ${n.affectedExports[0] ?? "this module"} before changing ${target.symbol ?? "the module"}`,
      })),
    ],
    assumptions: ["Generated from the dependency graph only; no behavioral reasoning was applied."],
    discarded: [],
    notice,
  };
}

export function llmConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function explainImpact(report: ImpactReport, files: Record<string, string>, change: string): Promise<Explanation> {
  if (!llmConfigured()) {
    return deterministicExplanation(report, change, "No ANTHROPIC_API_KEY configured — showing graph-derived guidance only.");
  }
  const model = process.env.AFTERMATH_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(ModelOutputSchema) },
      messages: [{ role: "user", content: buildContext(report, files, change) }],
    });
    if (response.stop_reason === "refusal") {
      return deterministicExplanation(report, change, "The model declined this request — showing graph-derived guidance only.");
    }
    if (!response.parsed_output) {
      return deterministicExplanation(report, change, "The model response could not be parsed — showing graph-derived guidance only.");
    }
    return groundModelOutput(response.parsed_output, report, response.model);
  } catch (err) {
    const msg =
      err instanceof Anthropic.AuthenticationError
        ? "the API key was rejected"
        : err instanceof Anthropic.RateLimitError
          ? "rate limited"
          : err instanceof Anthropic.APIConnectionError
            ? "could not reach the API"
            : err instanceof Anthropic.APIError
              ? `API error ${err.status ?? ""}`.trim()
              : (err as Error).message;
    return deterministicExplanation(report, change, `LLM explanation unavailable (${msg}) — showing graph-derived guidance only.`);
  }
}
