import { z } from "zod";

/** What the model is asked to return. Dependency facts are NOT part of this schema. */
export const ModelOutputSchema = z.object({
  summary: z.string().describe("2-4 sentences. Hedge appropriately; never claim certainty about runtime behavior."),
  risks: z
    .array(
      z.object({
        file: z.string().describe("Repository-relative path. MUST be one of the files listed in the impact report."),
        title: z.string(),
        hypothesis: z.string().describe("How this file's behavior may change, phrased as a hypothesis grounded in the cited code."),
        likelihood: z.enum(["likely", "plausible", "unlikely"]),
        severity: z.enum(["high", "medium", "low"]),
      }),
    )
    .describe("One entry per impacted file worth discussing, most important first."),
  checklist: z.array(z.object({ step: z.string(), file: z.string().nullable() })),
  tests: z.array(
    z.object({
      name: z.string(),
      file: z.string().describe("Where the test should live (existing test file if one is impacted)."),
      rationale: z.string(),
      sketch: z.string().describe("A short test sketch in the repository's apparent test style."),
    }),
  ),
  assumptions: z.array(z.string()).describe("Things you assumed about the proposed change or the codebase."),
});

export type ModelOutput = z.infer<typeof ModelOutputSchema>;

type ModelRisk = ModelOutput["risks"][number];

export interface Risk extends ModelRisk {
  /** Set by AFTERMATH from the static analysis, never by the model. */
  dependency: "confirmed" | "possible";
  depth: number;
  evidence: { file: string; line: number; text: string }[];
}

export interface Explanation {
  source: "llm" | "deterministic";
  model: string | null;
  summary: string;
  risks: Risk[];
  checklist: ModelOutput["checklist"];
  tests: ModelOutput["tests"];
  assumptions: string[];
  /** Model claims that referenced files outside the evidence and were removed. */
  discarded: { file: string; title: string; reason: string }[];
  notice: string | null;
}
