import { NextResponse } from "next/server";
import { analyzeImpact } from "@/lib/analysis/impact";
import { explainImpact } from "@/lib/llm/explain";
import { getStore, newId } from "@/lib/store";
import type { Investigation } from "@/lib/store/types";
import { getProject } from "@/lib/server/projects";
import { handleError, jsonError } from "@/lib/server/http";
import { InvestigationRequest } from "@/lib/server/validate";
import { canViewProject, currentUserId, ownerFilter, requireUser } from "@/lib/server/user";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const uid = await currentUserId();
    return NextResponse.json({ investigations: await getStore().listInvestigations(id, ownerFilter(uid)) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const uid = await requireUser();
    const parsed = InvestigationRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const project = await getProject(id);
    if (!project || !canViewProject(project, uid)) return jsonError("Project not found.", 404);
    const { file, symbol, mode, includeTypeOnly, change, title } = parsed.data;
    if (!project.graph.modules[file]) return jsonError("That file is not part of the analyzed graph.", 404);

    const report = analyzeImpact(project.graph, { file, symbol: symbol ?? null }, { mode, includeTypeOnly });
    const explanation = await explainImpact(report, project.files, change);
    const investigation: Investigation = {
      id: newId("inv"),
      projectId: id,
      title: title || `${symbol ?? file.split("/").pop()}: ${change.slice(0, 60)}${change.length > 60 ? "…" : ""}`,
      target: report.target,
      change,
      mode,
      createdAt: new Date().toISOString(),
      stats: report.stats,
      ownerId: uid,
      report,
      explanation,
    };
    await getStore().saveInvestigation(investigation);
    return NextResponse.json({ investigation });
  } catch (err) {
    return handleError(err);
  }
}
