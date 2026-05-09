import { join } from "node:path";

export function quorumDir(gitRoot: string): string {
  return join(gitRoot, ".quorum");
}

export function quorumConfigPath(gitRoot: string): string {
  return join(quorumDir(gitRoot), "config.json");
}

export function quorumLocalPath(gitRoot: string): string {
  return join(quorumDir(gitRoot), "local.json");
}

export function gitHooksDir(gitRoot: string): string {
  return join(gitRoot, ".git", "hooks");
}

export function claudeSettingsPath(gitRoot: string): string {
  return join(gitRoot, ".claude", "settings.json");
}

export function cursorSettingsPath(gitRoot: string): string {
  return join(gitRoot, ".cursor", "settings.json");
}

export function geminiSettingsPath(gitRoot: string): string {
  return join(gitRoot, ".gemini", "settings.json");
}

export function opencodeSettingsPath(gitRoot: string): string {
  return join(gitRoot, ".opencode", "settings.json");
}

export function codexSettingsPath(gitRoot: string): string {
  return join(gitRoot, ".codex", "settings.json");
}

export function codexHooksPath(gitRoot: string): string {
  return join(gitRoot, ".codex", "hooks.json");
}

export function codexConfigTomlPath(gitRoot: string): string {
  return join(gitRoot, ".codex", "config.toml");
}

export function quorumSessionsDir(gitRoot: string): string {
  return join(quorumDir(gitRoot), "sessions");
}

export function quorumPendingDir(gitRoot: string): string {
  return join(quorumSessionsDir(gitRoot), "pending");
}

export function quorumShadowWorktreesDir(gitRoot: string): string {
  return join(quorumDir(gitRoot), "shadow-worktrees");
}
