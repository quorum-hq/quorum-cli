import type { QuorumMergedConfig } from "../config/constants.js";
import { runSessionEndHookForAgent } from "../agent-hooks/session-end.js";

export async function runClaudeSessionEndHook(
  gitRoot: string,
  merged: QuorumMergedConfig,
  stdinText: string,
): Promise<void> {
  await runSessionEndHookForAgent(gitRoot, merged, stdinText, "claude-code");
}
