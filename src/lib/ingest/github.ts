import { LIMITS } from "./limits";
import { IngestError, extractZip, type ExtractResult } from "./zip";

export interface GitHubRef {
  owner: string;
  repo: string;
  ref: string | null;
  subdir: string | null;
}

const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/** Accepts `owner/repo`, `https://github.com/owner/repo`, and `.../tree/<ref>[/<subdir>]`. */
export function parseGitHubUrl(input: string): GitHubRef {
  const raw = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  let pathPart: string;
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    pathPart = raw;
  } else {
    let url: URL;
    try {
      url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    } catch {
      throw new IngestError("Enter a GitHub URL like https://github.com/owner/repo.");
    }
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      throw new IngestError("Only public repositories on github.com are supported.");
    }
    pathPart = url.pathname.replace(/^\/+/, "");
  }
  const [owner, repo, kind, ref, ...rest] = pathPart.split("/");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) {
    throw new IngestError("Could not find an owner and repository name in that URL.");
  }
  const hasRef = kind === "tree" && !!ref;
  if (hasRef && !/^[\w./-]{1,200}$/.test(ref)) throw new IngestError("Unsupported branch or tag name.");
  return { owner, repo, ref: hasRef ? ref : null, subdir: hasRef && rest.length ? rest.join("/") : null };
}

async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > limit) throw new IngestError(`Repository archive exceeds ${Math.round(limit / 1024 / 1024)} MB.`, 413);
  const reader = res.body?.getReader();
  if (!reader) throw new IngestError("GitHub returned an empty response.", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new IngestError(`Repository archive exceeds ${Math.round(limit / 1024 / 1024)} MB.`, 413);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Downloads a public repository as a ZIP from GitHub's archive endpoint. Only
 * fixed GitHub hosts are contacted; the URL is built from validated parts.
 *
 * No REST API call is needed (`archive/HEAD.zip` follows the default branch), so
 * imports are not subject to the 60-requests/hour anonymous API limit. Private
 * repositories return 404 to anonymous archive requests and are rejected.
 */
export async function fetchGitHubRepo(ref: GitHubRef): Promise<ExtractResult & { resolvedRef: string }> {
  const url = ref.ref
    ? `https://codeload.github.com/${ref.owner}/${ref.repo}/zip/${encodeURI(ref.ref)}`
    : `https://github.com/${ref.owner}/${ref.repo}/archive/HEAD.zip`;
  const archive = await fetch(url, {
    headers: { "User-Agent": "aftermath-impact-analyzer" },
    redirect: "follow",
    signal: AbortSignal.timeout(90000),
  });
  if (!["github.com", "codeload.github.com"].includes(new URL(archive.url || url).hostname)) {
    throw new IngestError("Unexpected redirect while downloading the repository.", 502);
  }
  if (archive.status === 404) {
    throw new IngestError(ref.ref ? `Branch or tag "${ref.ref}" not found, or the repository is private.` : "Repository not found. Is it public?", 404);
  }
  if (archive.status === 429 || archive.status === 403) throw new IngestError("GitHub is rate limiting downloads. Try again in a minute.", 429);
  if (!archive.ok) throw new IngestError(`Could not download repository archive (${archive.status}).`, 502);
  const branch = ref.ref ?? /\/zip\/(?:refs\/(?:heads|tags)\/)?(.+)$/.exec(archive.url)?.[1] ?? "HEAD";

  const bytes = await readLimited(archive, LIMITS.maxArchiveBytes);
  const result = extractZip(bytes);
  if (ref.subdir) {
    const prefix = ref.subdir.replace(/\/+$/, "") + "/";
    const files = result.files
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
    if (!files.length) throw new IngestError(`No JS/TS files under "${ref.subdir}".`, 422);
    return { ...result, files, resolvedRef: branch };
  }
  return { ...result, resolvedRef: branch };
}
