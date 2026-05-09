import { hasJsonSessionEndHook, installJsonSessionEndHook, removeJsonSessionEndHook } from "../agent-hooks/json-hooks.js";
import { geminiSettingsPath } from "../paths.js";

export const QUORUM_GEMINI_COMMAND = "quorum internal gemini-session-end";

export function installGeminiSessionEndHook(gitRoot: string): { skipped: boolean; reason?: string } {
  return installJsonSessionEndHook(geminiSettingsPath(gitRoot), QUORUM_GEMINI_COMMAND);
}

export function removeGeminiSessionEndHook(gitRoot: string): void {
  removeJsonSessionEndHook(geminiSettingsPath(gitRoot), QUORUM_GEMINI_COMMAND);
}

export function hasGeminiSessionEndHook(gitRoot: string): boolean {
  return hasJsonSessionEndHook(geminiSettingsPath(gitRoot), QUORUM_GEMINI_COMMAND);
}
