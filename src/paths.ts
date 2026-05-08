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

export function quorumSessionsDir(gitRoot: string): string {
  return join(quorumDir(gitRoot), "sessions");
}

export function quorumPendingDir(gitRoot: string): string {
  return join(quorumSessionsDir(gitRoot), "pending");
}

export function quorumShadowWorktreesDir(gitRoot: string): string {
  return join(quorumDir(gitRoot), "shadow-worktrees");
}
