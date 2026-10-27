import { z } from "zod";

export const ImpactRequest = z.object({
  file: z.string().min(1).max(500),
  symbol: z.string().max(200).nullable().optional(),
  mode: z.enum(["symbol", "file"]).default("symbol"),
  includeTypeOnly: z.boolean().default(true),
});

export const InvestigationRequest = ImpactRequest.extend({
  change: z.string().trim().min(8, "Describe the change in at least a few words.").max(4000),
  title: z.string().trim().max(120).optional(),
});
