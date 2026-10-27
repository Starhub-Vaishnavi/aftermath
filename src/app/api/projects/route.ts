import { NextResponse, type NextRequest } from "next/server";
import { fetchGitHubRepo, parseGitHubUrl } from "@/lib/ingest/github";
import { LIMITS } from "@/lib/ingest/limits";
import { extractZip } from "@/lib/ingest/zip";
import { getStore } from "@/lib/store";
import { createProject, ensureSampleProject } from "@/lib/server/projects";
import { handleError, jsonError } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    return NextResponse.json({ projects: await getStore().listProjects(), store: getStore().kind });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const type = req.headers.get("content-type") ?? "";
    if (type.startsWith("multipart/form-data")) {
      const declared = Number(req.headers.get("content-length") ?? 0);
      if (declared > LIMITS.maxArchiveBytes + 1024 * 1024) return jsonError("Upload is too large.", 413);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return jsonError("Attach a .zip file.");
      if (file.size > LIMITS.maxArchiveBytes) return jsonError("Upload is too large.", 413);
      const { files, skipped, rootPrefix } = extractZip(new Uint8Array(await file.arrayBuffer()));
      const name = (rootPrefix ?? file.name.replace(/\.zip$/i, "")).slice(0, 80) || "upload";
      const project = await createProject(name, { type: "zip", label: file.name.slice(0, 120) }, files, skipped);
      return NextResponse.json({ id: project.id, stats: project.stats });
    }

    const body = (await req.json().catch(() => null)) as { type?: string; url?: string } | null;
    if (body?.type === "sample") {
      const project = await ensureSampleProject();
      return NextResponse.json({ id: project.id, stats: project.stats });
    }
    if (body?.type === "github" && typeof body.url === "string") {
      const ref = parseGitHubUrl(body.url);
      const { files, skipped, resolvedRef } = await fetchGitHubRepo(ref);
      const project = await createProject(
        `${ref.owner}/${ref.repo}${ref.subdir ? `/${ref.subdir}` : ""}`,
        { type: "github", label: `github.com/${ref.owner}/${ref.repo}`, url: `https://github.com/${ref.owner}/${ref.repo}`, ref: resolvedRef },
        files,
        skipped,
      );
      return NextResponse.json({ id: project.id, stats: project.stats });
    }
    return jsonError("Expected { type: 'sample' }, { type: 'github', url }, or a multipart ZIP upload.");
  } catch (err) {
    return handleError(err);
  }
}
