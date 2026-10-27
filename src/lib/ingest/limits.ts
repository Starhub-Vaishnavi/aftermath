/** Hard limits applied to every imported repository. Imported code is untrusted input. */
export const LIMITS = {
  maxArchiveBytes: 60 * 1024 * 1024,
  maxFileBytes: 512 * 1024,
  maxFiles: 4000,
  maxTotalSourceBytes: 40 * 1024 * 1024,
};

const IGNORED_DIRS = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.turbo|\.cache|vendor|bower_components)\//;

/** Files kept for analysis: JS/TS sources plus root config used for path aliases. */
export function shouldKeep(path: string): boolean {
  if (IGNORED_DIRS.test(path)) return false;
  if (path === "tsconfig.json" || path === "jsconfig.json" || path === "package.json") return true;
  return /\.(c|m)?(j|t)sx?$/.test(path) && !/\.d\.(c|m)?ts$/.test(path) && !/\.min\.js$/.test(path);
}

/**
 * Normalizes an archive entry path and rejects anything that could escape the
 * archive root. Paths never touch the filesystem, but we still refuse them.
 */
export function safeRelativePath(raw: string): string | null {
  const p = raw.replace(/\\/g, "/");
  if (p.startsWith("/") || /^[a-zA-Z]:/.test(p) || p.includes("\0")) return null;
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return null;
    parts.push(seg);
  }
  return parts.length ? parts.join("/") : null;
}
