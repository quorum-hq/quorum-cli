import type { QuorumMergedConfig } from "../config/constants.js";
import { runSessionEndHookForAgent } from "../agent-hooks/session-end.js";

export function runClaudeSessionEndHook(
  gitRoot: string,
  merged: QuorumMergedConfig,
  stdinText: string,
): void {
  runSessionEndHookForAgent(gitRoot, merged, stdinText, "claude-code");
}
