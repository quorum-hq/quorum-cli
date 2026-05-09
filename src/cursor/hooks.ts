import { hasJsonSessionEndHook, installJsonSessionEndHook, removeJsonSessionEndHook } from "../agent-hooks/json-hooks.js";
import { cursorSettingsPath } from "../paths.js";

export const QUORUM_CURSOR_COMMAND = "quorum internal cursor-session-end";

export function installCursorSessionEndHook(gitRoot: string): { skipped: boolean; reason?: string } {
  return installJsonSessionEndHook(cursorSettingsPath(gitRoot), QUORUM_CURSOR_COMMAND);
}

export function removeCursorSessionEndHook(gitRoot: string): void {
  removeJsonSessionEndHook(cursorSettingsPath(gitRoot), QUORUM_CURSOR_COMMAND);
}

export function hasCursorSessionEndHook(gitRoot: string): boolean {
  return hasJsonSessionEndHook(cursorSettingsPath(gitRoot), QUORUM_CURSOR_COMMAND);
}
