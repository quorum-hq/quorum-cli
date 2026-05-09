import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentId } from "../config/constants.js";
import { quorumSessionsDir } from "../paths.js";

function quorumCliJsPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "cli.js");
}

function capturePathAllowed(gitRoot: string, captureAbs: string): boolean {
  const root = resolve(quorumSessionsDir(gitRoot));
  const p = resolve(captureAbs);
  return p === root || p.startsWith(`${root}${sep}`);
}

/**
 * Run distill → shadow commit in a detached child so SessionEnd hooks return immediately
 * after copying the transcript into `.quorum/sessions/captures/`.
 */
export function spawnSessionEndBackgroundDistill(opts: {
  gitRoot: string;
  agent: AgentId;
  captureAbsPath: string;
}): void {
  const gitRoot = resolve(opts.gitRoot);
  const cap = resolve(opts.captureAbsPath);
  if (!capturePathAllowed(gitRoot, cap)) {
    throw new Error(`refusing background distill: capture outside .quorum/sessions (${cap})`);
  }
  if (!existsSync(cap)) {
    throw new Error(`capture file missing: ${cap}`);
  }

  const cliJs = quorumCliJsPath();
  const child = spawn(
    process.execPath,
    [cliJs, "internal", "background-session-distill", gitRoot, opts.agent, cap],
    {
      detached: true,
      stdio: "ignore",
      cwd: gitRoot,
      env: process.env,
    },
  );
  child.unref();
}
