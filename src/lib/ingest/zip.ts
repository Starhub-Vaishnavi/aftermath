import { unzipSync } from "fflate";
import type { SourceFile } from "../analysis/types";
import { LIMITS, safeRelativePath, shouldKeep } from "./limits";

export class IngestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface ExtractResult {
  files: SourceFile[];
  skipped: number;
  rootPrefix: string | null;
}

/**
 * Extracts JS/TS sources from a ZIP archive held in memory.
 *
 * The archive is never written to disk and nothing inside it is executed.
 * Entries are filtered by path *before* decompression, oversized entries are
 * skipped, and traversal paths (`../`, absolute) are rejected.
 */
export function extractZip(data: Uint8Array): ExtractResult {
  if (data.byteLength > LIMITS.maxArchiveBytes) {
    throw new IngestError(`Archive is larger than ${Math.round(LIMITS.maxArchiveBytes / 1024 / 1024)} MB.`, 413);
  }
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new IngestError("That file is not a ZIP archive.");

  let skipped = 0;
  let accepted = 0;
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (file) => {
        const rel = safeRelativePath(file.name);
        if (!rel || file.name.endsWith("/")) return false;
        const stripped = rel.includes("/") ? rel.slice(rel.indexOf("/") + 1) : rel;
        if (!shouldKeep(rel) && !shouldKeep(stripped)) return false;
        if (file.originalSize > LIMITS.maxFileBytes || accepted >= LIMITS.maxFiles || total + file.originalSize > LIMITS.maxTotalSourceBytes) {
          skipped++;
          return false;
        }
        accepted++;
        total += file.originalSize;
        return true;
      },
    });
  } catch (err) {
    throw new IngestError(`Could not read ZIP archive: ${(err as Error).message}`);
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let files: SourceFile[] = [];
  for (const [name, bytes] of Object.entries(entries)) {
    const rel = safeRelativePath(name);
    if (!rel) continue;
    if (bytes.byteLength > LIMITS.maxFileBytes) {
      skipped++;
      continue;
    }
    if (bytes.subarray(0, 8000).includes(0)) {
      skipped++; // binary masquerading as source
      continue;
    }
    files.push({ path: rel, content: decoder.decode(bytes) });
  }

  // Strip a single shared top-level directory (GitHub archives, "zip the folder" uploads).
  let rootPrefix: string | null = null;
  const tops = new Set(files.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
  if (tops.size === 1 && !tops.has("")) {
    rootPrefix = [...tops][0];
    files = files.map((f) => ({ ...f, path: f.path.slice(rootPrefix!.length + 1) }));
  }
  files = files.filter((f) => shouldKeep(f.path)).sort((a, b) => a.path.localeCompare(b.path));

  if (!files.some((f) => f.path !== "package.json" && f.path !== "tsconfig.json" && f.path !== "jsconfig.json")) {
    throw new IngestError("No JavaScript or TypeScript source files were found in the archive.", 422);
  }
  return { files, skipped, rootPrefix };
}
