import { removeClaudeSessionEndHook } from "../claude/hooks.js";
import { removeQuorumPostRewrite } from "../git/hooks.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export function runDisable(gitRoot: string): void {
  removeQuorumPostRewrite(gitRoot);
  removeClaudeSessionEndHook(gitRoot);
  eprint("quorum: disabled Quorum git hooks in this repository (shadow branch and checkpoints were not modified).");
}
