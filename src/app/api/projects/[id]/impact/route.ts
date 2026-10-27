import { NextResponse } from "next/server";
import { analyzeImpact } from "@/lib/analysis/impact";
import { getProject } from "@/lib/server/projects";
import { handleError, jsonError } from "@/lib/server/http";
import { canViewProject, currentUserId } from "@/lib/server/user";
import { ImpactRequest } from "@/lib/server/validate";

export const runtime = "nodejs";

/** Deterministic impact preview. No LLM involved. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = ImpactRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const project = await getProject(id);
    if (!project || !canViewProject(project, await currentUserId())) return jsonError("Project not found.", 404);
    const { file, symbol, mode, includeTypeOnly } = parsed.data;
    if (!project.graph.modules[file]) return jsonError("That file is not part of the analyzed graph.", 404);
    return NextResponse.json({ report: analyzeImpact(project.graph, { file, symbol: symbol ?? null }, { mode, includeTypeOnly }) });
  } catch (err) {
    return handleError(err);
  }
}
