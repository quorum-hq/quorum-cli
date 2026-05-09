import { hasClaudeSessionEndHook } from "../claude/hooks.js";
import { hasCursorSessionEndHook } from "../cursor/hooks.js";
import { hasGeminiSessionEndHook } from "../gemini/hooks.js";
import { hasOpenCodeSessionEndHook } from "../opencode/hooks.js";
import { hasCodexSessionEndHook } from "../codex/hooks.js";
import { hasQuorumPostRewrite } from "../git/hooks.js";

export function runStatus(gitRoot: string): void {
  const lines = [
    `post-rewrite: ${hasQuorumPostRewrite(gitRoot) ? "hooked" : "not hooked"}`,
    `claude-code: ${hasClaudeSessionEndHook(gitRoot) ? "hooked" : "not hooked"}`,
    `cursor: ${hasCursorSessionEndHook(gitRoot) ? "hooked" : "not hooked"}`,
    `gemini-cli: ${hasGeminiSessionEndHook(gitRoot) ? "hooked" : "not hooked"}`,
    `opencode: ${hasOpenCodeSessionEndHook(gitRoot) ? "hooked" : "not hooked"}`,
    `codex: ${hasCodexSessionEndHook(gitRoot) ? "hooked" : "not hooked"}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}
