import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MARKER = "# --- Quorum (managed by quorum init; do not remove) ---";
const END = "# --- end Quorum ---\n";
const BLOCK_BODY = ".quorum/local.json\n.quorum/sessions/\n";

export function ensureQuorumGitignoreBlock(gitRoot: string): void {
  const path = join(gitRoot, ".gitignore");
  let content = "";
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    content = "";
  }
  if (content.includes(MARKER)) {
    return;
  }
  const block = `${MARKER}\n${BLOCK_BODY}${END}`;
  const next = content.length === 0 ? block : `${content.replace(/\s*$/, "")}\n\n${block}`;
  writeFileSync(path, next, "utf-8");
}
