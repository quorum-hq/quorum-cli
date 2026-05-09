import { execFileSync } from "node:child_process";
import type { QuorumMergedConfig } from "../config/constants.js";

/**
 * Pushes `refs/heads/<shadow>` to `origin` when enabled. Checkpoint JSON uses unique filenames
 * (UUIDs / dates), so concurrent writers usually diverge via distinct tree paths—fast-forward
 * pushes tend to succeed without rebase recovery.
 */

export class ShadowPushFailure extends Error {
  override readonly name = "ShadowPushFailure";
}

function maxPushAttempts(): number {
  const raw = process.env.QUORUM_SHADOW_PUSH_MAX_ATTEMPTS;
  if (raw === undefined || raw === "") {
    return 5;
  }
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

function execGit(
  gitRoot: string,
  args: string[],
): { ok: true } | { ok: false; combined: string } {
  try {
    execFileSync("git", args, {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e: unknown) {
    let stderr = "";
    let stdout = "";
    if (e && typeof e === "object") {
      if ("stderr" in e && e.stderr !== undefined) {
        stderr =
          typeof e.stderr === "string" ? e.stderr : Buffer.from(e.stderr as Uint8Array).toString("utf-8");
      }
      if ("stdout" in e && e.stdout !== undefined) {
        stdout =
          typeof e.stdout === "string" ? e.stdout : Buffer.from(e.stdout as Uint8Array).toString("utf-8");
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, combined: `${stderr}\n${stdout}\n${msg}`.trim() };
  }
}

/** Heuristic match for non-fast-forward push rejection (handles common git versions / hosts). */
function looksLikeNonFastForwardReject(combined: string): boolean {
  const s = combined.toLowerCase();
  return (
    s.includes("non-fast-forward") ||
    (s.includes("updates were rejected") &&
      (s.includes("because the remote contains") || s.includes("tip of your branch is behind")))
  );
}

function manualSyncHelp(shadowBranch: string): string {
  const refPair = `refs/heads/${shadowBranch}:refs/heads/${shadowBranch}`;
  return (
    `  Your commits are preserved on the local shadow branch (${shadowBranch}); nothing was discarded.\n` +
    `  To finish syncing manually:\n` +
    `    git fetch origin\n` +
    `    git rebase origin/${shadowBranch} ${shadowBranch}\n` +
    `    # resolve conflicts if prompted, then\n` +
    `    git push origin ${refPair}\n`
  );
}

/** After a shadow-branch commit succeeds, push when `merged.auto_push` is true (no-op otherwise). */
export function maybePushShadowBranchAfterCommit(gitRoot: string, merged: QuorumMergedConfig): void {
  if (!merged.auto_push) {
    return;
  }
  const shadowBranch = merged.shadow_branch;
  const attempts = maxPushAttempts();
  let lastCombined = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const push = execGit(gitRoot, [
      "push",
      "origin",
      `refs/heads/${shadowBranch}:refs/heads/${shadowBranch}`,
    ]);
    if (push.ok) {
      return;
    }
    lastCombined = push.combined;

    if (!looksLikeNonFastForwardReject(push.combined)) {
      throw new ShadowPushFailure(
        `quorum: could not push shadow branch ${shadowBranch} to origin (auto_push).\n` +
          `${push.combined.trim()}\n` +
          manualSyncHelp(shadowBranch),
      );
    }

    if (attempt >= attempts) {
      break;
    }

    const fetch = execGit(gitRoot, ["fetch", "origin", shadowBranch]);
    if (!fetch.ok) {
      throw new ShadowPushFailure(
        `quorum: fetch from origin failed while recovering from a non-fast-forward push for ${shadowBranch}.\n` +
          `${fetch.combined.trim()}\n` +
          manualSyncHelp(shadowBranch),
      );
    }

    const rebase = execGit(gitRoot, ["rebase", `origin/${shadowBranch}`, shadowBranch]);
    if (!rebase.ok) {
      throw new ShadowPushFailure(
        `quorum: rebase onto origin/${shadowBranch} failed while recovering from a rejected push.\n` +
          `${rebase.combined.trim()}\n` +
          manualSyncHelp(shadowBranch),
      );
    }
  }

  throw new ShadowPushFailure(
    `quorum: push still rejected after ${attempts} attempt(s); another machine may be updating the shadow branch.\n` +
      `${lastCombined.trim()}\n` +
      manualSyncHelp(shadowBranch),
  );
}
