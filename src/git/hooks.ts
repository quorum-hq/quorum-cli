import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { gitHooksDir } from "../paths.js";

export const QUORUM_HOOK_MARKER = "# quorum-managed";

const POST_REWRITE_HOOK = `#!/bin/sh
${QUORUM_HOOK_MARKER}
# Quorum post-rewrite: record rewrite manifests on the shadow branch after rebase/amend.
command -v quorum >/dev/null 2>&1 || exit 0
quorum internal post-rewrite "$@" || exit 0
`;

function postRewritePath(gitRoot: string): string {
  return join(gitHooksDir(gitRoot), "post-rewrite");
}

/** Install Quorum `post-rewrite` if missing or Quorum-owned; skip if a non-Quorum hook exists. */
export function installPostRewriteStub(gitRoot: string): { skipped: boolean; reason?: string } {
  const path = postRewritePath(gitRoot);
  let existing = "";
  try {
    existing = readFileSync(path, "utf-8");
  } catch {
    /* absent */
  }
  if (existing.length > 0 && !existing.includes(QUORUM_HOOK_MARKER)) {
    return {
      skipped: true,
      reason: `${path} already exists and is not Quorum-managed; leaving it unchanged.`,
    };
  }
  writeFileSync(path, POST_REWRITE_HOOK, "utf-8");
  chmodSync(path, 0o755);
  return { skipped: false };
}

/** Remove Quorum-managed `post-rewrite` hook only. */
export function removeQuorumPostRewrite(gitRoot: string): void {
  const path = postRewritePath(gitRoot);
  let content = "";
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return;
  }
  if (content.includes(QUORUM_HOOK_MARKER)) {
    unlinkSync(path);
  }
}
