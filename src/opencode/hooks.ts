import { hasJsonSessionEndHook, installJsonSessionEndHook, removeJsonSessionEndHook } from "../agent-hooks/json-hooks.js";
import { opencodeSettingsPath } from "../paths.js";

export const QUORUM_OPENCODE_COMMAND = "quorum internal opencode-session-end";

export function installOpenCodeSessionEndHook(gitRoot: string): { skipped: boolean; reason?: string } {
  return installJsonSessionEndHook(opencodeSettingsPath(gitRoot), QUORUM_OPENCODE_COMMAND);
}

export function removeOpenCodeSessionEndHook(gitRoot: string): void {
  removeJsonSessionEndHook(opencodeSettingsPath(gitRoot), QUORUM_OPENCODE_COMMAND);
}

export function hasOpenCodeSessionEndHook(gitRoot: string): boolean {
  return hasJsonSessionEndHook(opencodeSettingsPath(gitRoot), QUORUM_OPENCODE_COMMAND);
}
