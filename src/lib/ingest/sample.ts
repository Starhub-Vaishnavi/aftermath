import { promises as fs } from "node:fs";
import path from "node:path";
import type { SourceFile } from "../analysis/types";
import { shouldKeep } from "./limits";

export const SAMPLE_NAME = "acme-storefront";

export async function loadSampleRepo(root = path.join(process.cwd(), "samples", SAMPLE_NAME)): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else {
        const rel = path.relative(root, abs).split(path.sep).join("/");
        if (shouldKeep(rel)) out.push({ path: rel, content: await fs.readFile(abs, "utf8") });
      }
    }
  };
  await walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
