import { NextResponse } from "next/server";
import { getProject, publicGraph } from "@/lib/server/projects";
import { handleError, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await getProject(id);
    if (!project) return jsonError("Project not found.", 404);
    const { graph, files: _files, ...meta } = project;
    return NextResponse.json({ project: meta, graph: publicGraph(graph) });
  } catch (err) {
    return handleError(err);
  }
}
