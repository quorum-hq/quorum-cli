import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { QuorumMergedConfig } from "../config/constants.js";
import { distillCommitOrPending } from "../checkpoint/pipeline.js";
import { quorumSessionsDir } from "../paths.js";

function eprint(msg: string): void {
  process.stderr.write(msg.endsWith("\n") ? msg : `${msg}\n`);
}

function extractTranscriptPath(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  const direct = obj.transcript_path ?? obj.transcriptPath ?? obj.transcript_file ?? obj.transcriptFile;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  const session = obj.session;
  if (session && typeof session === "object" && !Array.isArray(session)) {
    const s = session as Record<string, unknown>;
    const nested = s.transcript_path ?? s.transcriptPath ?? s.transcript_file ?? s.transcriptFile;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }
  return null;
}

function persistHookTranscript(gitRoot: string, source: string): string {
  const sessions = quorumSessionsDir(gitRoot);
  const captures = join(sessions, "captures");
  mkdirSync(captures, { recursive: true });
  const base = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.txt`;
  const dest = join(captures, base);
  copyFileSync(source, dest);
  return dest;
}

export async function runClaudeSessionEndHook(
  gitRoot: string,
  merged: QuorumMergedConfig,
  stdinText: string,
): Promise<void> {
  let payload: unknown;
  try {
    payload = JSON.parse(stdinText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`quorum internal claude-session-end: invalid JSON payload (${msg})`);
    return;
  }
  const transcriptPathRaw = extractTranscriptPath(payload);
  if (!transcriptPathRaw) {
    eprint("quorum internal claude-session-end: payload missing transcript_path");
    return;
  }
  const transcriptAbs = resolve(gitRoot, transcriptPathRaw);
  if (!existsSync(transcriptAbs)) {
    eprint(`quorum internal claude-session-end: transcript file not found: ${transcriptAbs}`);
    return;
  }

  const capturePath = persistHookTranscript(gitRoot, transcriptAbs);
  const result = await distillCommitOrPending(gitRoot, "claude-code", capturePath, merged);
  if (!result.ok) {
    eprint("quorum internal claude-session-end: capture queued as pending; run `quorum retry` after fixing distiller.");
  }
  const lastPath = join(quorumSessionsDir(gitRoot), "last-claude-session-end.txt");
  writeFileSync(lastPath, `${capturePath}\n`, "utf-8");
}
