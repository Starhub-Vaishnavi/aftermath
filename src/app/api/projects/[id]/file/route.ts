import { NextResponse, type NextRequest } from "next/server";
import { loadProject } from "@/lib/store";
import { handleError, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const path = req.nextUrl.searchParams.get("path") ?? "";
    const project = await loadProject(id).catch(() => null);
    if (!project) return jsonError("Project not found.", 404);
    const content = project.files[path];
    if (content === undefined) return jsonError("File not found.", 404);
    return NextResponse.json({ path, content });
  } catch (err) {
    return handleError(err);
  }
}
