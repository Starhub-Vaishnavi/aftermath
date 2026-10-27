import { NextResponse, type NextRequest } from "next/server";
import { getProject } from "@/lib/server/projects";
import { handleError, jsonError } from "@/lib/server/http";
import { canViewProject, currentUserId } from "@/lib/server/user";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const path = req.nextUrl.searchParams.get("path") ?? "";
    const project = await getProject(id);
    if (!project || !canViewProject(project, await currentUserId())) return jsonError("Project not found.", 404);
    const content = project.files[path];
    if (content === undefined) return jsonError("File not found.", 404);
    return NextResponse.json({ path, content });
  } catch (err) {
    return handleError(err);
  }
}
