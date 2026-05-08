import { execFileSync } from "node:child_process";

/** Tracked paths differing from `HEAD` (untracked files are not listed). */
export function trackedDiffPathsVsHead(gitRoot: string): string[] {
  const out = execFileSync("git", ["diff", "--name-only", "HEAD"], {
    cwd: gitRoot,
    encoding: "utf-8",
  });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
