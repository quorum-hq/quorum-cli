import { removeClaudeSessionEndHook } from "../claude/hooks.js";
import { removeCursorSessionEndHook } from "../cursor/hooks.js";
import { removeGeminiSessionEndHook } from "../gemini/hooks.js";
import { removeOpenCodeSessionEndHook } from "../opencode/hooks.js";
import { removeCodexSessionEndHook } from "../codex/hooks.js";
import { removeQuorumPostRewrite } from "../git/hooks.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

export function runDisable(gitRoot: string): void {
  removeQuorumPostRewrite(gitRoot);
  removeClaudeSessionEndHook(gitRoot);
  removeCursorSessionEndHook(gitRoot);
  removeGeminiSessionEndHook(gitRoot);
  removeOpenCodeSessionEndHook(gitRoot);
  removeCodexSessionEndHook(gitRoot);
  eprint("quorum: disabled Quorum git hooks in this repository (shadow branch and checkpoints were not modified).");
}
