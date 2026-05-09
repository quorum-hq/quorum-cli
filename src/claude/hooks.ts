import { hasJsonSessionEndHook, installJsonSessionEndHook, removeJsonSessionEndHook } from "../agent-hooks/json-hooks.js";
import { claudeSettingsPath } from "../paths.js";

export const QUORUM_CLAUDE_COMMAND = "quorum internal claude-session-end";

export function installClaudeSessionEndHook(gitRoot: string): { skipped: boolean; reason?: string } {
  return installJsonSessionEndHook(claudeSettingsPath(gitRoot), QUORUM_CLAUDE_COMMAND);
}

export function removeClaudeSessionEndHook(gitRoot: string): void {
  removeJsonSessionEndHook(claudeSettingsPath(gitRoot), QUORUM_CLAUDE_COMMAND);
}

export function hasClaudeSessionEndHook(gitRoot: string): boolean {
  return hasJsonSessionEndHook(claudeSettingsPath(gitRoot), QUORUM_CLAUDE_COMMAND);
}
