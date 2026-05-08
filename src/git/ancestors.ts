import { execFileSync } from "node:child_process";

/** True if `ancestorSha` is an ancestor of `descendantHead` (inclusive: a commit is its own ancestor). */
export function isCommitAncestorOf(gitRoot: string, ancestorSha: string, descendantHead: string): boolean {
  const a = ancestorSha.toLowerCase();
  const d = descendantHead.toLowerCase();
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", a, d], {
      cwd: gitRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
