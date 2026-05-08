import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { quorumShadowWorktreesDir } from "../paths.js";

/** Add a single JSON file on `shadowBranch` via a detached worktree and one commit. */
export function commitCheckpointJsonOnShadowBranch(
  gitRoot: string,
  shadowBranch: string,
  filename: string,
  jsonBody: string,
): void {
  mkdirSync(quorumShadowWorktreesDir(gitRoot), { recursive: true });
  const wt = mkdtempSync(join(quorumShadowWorktreesDir(gitRoot), "wt-"));
  try {
    execFileSync("git", ["worktree", "add", "--force", wt, shadowBranch], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const dest = join(wt, filename);
    if (existsSync(dest)) {
      throw new Error(`refusing to overwrite existing shadow file ${filename}`);
    }
    writeFileSync(dest, jsonBody, "utf-8");
    execFileSync("git", ["add", "--", filename], { cwd: wt, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["commit", "-m", `checkpoint: ${filename}`], {
      cwd: wt,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    try {
      execFileSync("git", ["worktree", "remove", "--force", wt], {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      try {
        rmSync(wt, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
}

/** Create or replace a JSON blob on `shadowBranch` (e.g. pin/unpin updates). */
export function upsertCheckpointJsonOnShadowBranch(
  gitRoot: string,
  shadowBranch: string,
  filename: string,
  jsonBody: string,
): void {
  mkdirSync(quorumShadowWorktreesDir(gitRoot), { recursive: true });
  const wt = mkdtempSync(join(quorumShadowWorktreesDir(gitRoot), "wt-"));
  try {
    execFileSync("git", ["worktree", "add", "--force", wt, shadowBranch], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const dest = join(wt, filename);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, jsonBody, "utf-8");
    execFileSync("git", ["add", "--", filename], { cwd: wt, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["commit", "-m", `checkpoint: update ${filename}`], {
      cwd: wt,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } finally {
    try {
      execFileSync("git", ["worktree", "remove", "--force", wt], {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      try {
        rmSync(wt, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
}

export function shadowBranchCommitCount(gitRoot: string, shadowBranch: string): number {
  const out = execFileSync("git", ["rev-list", "--count", shadowBranch], {
    cwd: gitRoot,
    encoding: "utf-8",
  }).trim();
  return Number.parseInt(out, 10);
}
