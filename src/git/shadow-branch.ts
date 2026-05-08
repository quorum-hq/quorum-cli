import { execFileSync } from "node:child_process";
import { GIT_EMPTY_TREE_SHA } from "../config/constants.js";

const BOOTSTRAP_MESSAGE = "Quorum shadow context branch (bootstrap)";

/** Create `refs/heads/<branch>` at an empty-tree commit if it does not exist. */
export function ensureShadowBranch(gitRoot: string, branch: string): void {
  const ref = `refs/heads/${branch}`;
  try {
    execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return;
  } catch {
    /* missing */
  }
  const sha = execFileSync(
    "git",
    ["commit-tree", GIT_EMPTY_TREE_SHA, "-m", BOOTSTRAP_MESSAGE],
    { cwd: gitRoot, encoding: "utf-8" },
  ).trim();
  execFileSync("git", ["update-ref", ref, sha], { cwd: gitRoot });
}

export function readShadowBranchTip(gitRoot: string, branch: string): string {
  return execFileSync("git", ["rev-parse", `${branch}^{commit}`], {
    cwd: gitRoot,
    encoding: "utf-8",
  }).trim();
}
