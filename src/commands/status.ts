// TODO: Re-add status lines for cursor, gemini-cli, opencode, and codex when this release line
// provides supported hook wiring for those agents (see ../cursor/hooks, ../gemini/hooks, etc.).

import { hasClaudeSessionEndHook } from "../claude/hooks.js";
import { hasQuorumPostRewrite } from "../git/hooks.js";

export function runStatus(gitRoot: string): void {
  const lines = [
    `post-rewrite: ${hasQuorumPostRewrite(gitRoot) ? "hooked" : "not hooked"}`,
    `claude-code: ${hasClaudeSessionEndHook(gitRoot) ? "hooked" : "not hooked"}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}
