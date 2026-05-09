import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { QuorumMergedConfig, AgentId } from "../config/constants.js";
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

function extractSessionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const obj = payload as Record<string, unknown>;
  const direct = obj.session_id ?? obj.sessionId;
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }
  const session = obj.session;
  if (session && typeof session === "object" && !Array.isArray(session)) {
    const s = session as Record<string, unknown>;
    const nested = s.id ?? s.session_id ?? s.sessionId;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }
  return null;
}

function wasCodexSessionAlreadyCaptured(gitRoot: string, sessionId: string): boolean {
  const seenDir = join(quorumSessionsDir(gitRoot), "codex-seen-sessions");
  const markerPath = join(seenDir, `${sessionId}.seen`);
  return existsSync(markerPath);
}

function markCodexSessionCaptured(gitRoot: string, sessionId: string, capturePath: string): void {
  const seenDir = join(quorumSessionsDir(gitRoot), "codex-seen-sessions");
  mkdirSync(seenDir, { recursive: true });
  const markerPath = join(seenDir, `${sessionId}.seen`);
  writeFileSync(markerPath, `${capturePath}\n`, "utf-8");
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

export async function runSessionEndHookForAgent(
  gitRoot: string,
  merged: QuorumMergedConfig,
  stdinText: string,
  agent: AgentId,
): Promise<void> {
  const internalName = `${agent}-session-end`;
  let payload: unknown;
  try {
    payload = JSON.parse(stdinText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`quorum internal ${internalName}: invalid JSON payload (${msg})`);
    return;
  }
  const transcriptPathRaw = extractTranscriptPath(payload);
  if (!transcriptPathRaw) {
    eprint(`quorum internal ${internalName}: payload missing transcript_path`);
    return;
  }
  const transcriptAbs = resolve(gitRoot, transcriptPathRaw);
  if (!existsSync(transcriptAbs)) {
    eprint(`quorum internal ${internalName}: transcript file not found: ${transcriptAbs}`);
    return;
  }
  if (agent === "codex") {
    const sessionId = extractSessionId(payload);
    if (sessionId && wasCodexSessionAlreadyCaptured(gitRoot, sessionId)) {
      return;
    }
    const capturePath = persistHookTranscript(gitRoot, transcriptAbs);
    if (sessionId) {
      markCodexSessionCaptured(gitRoot, sessionId, capturePath);
    }
    const result = await distillCommitOrPending(gitRoot, agent, capturePath, merged);
    if (!result.ok) {
      eprint(`quorum internal ${internalName}: capture queued as pending; run \`quorum retry\` after fixing distiller.`);
    }
    const lastPath = join(quorumSessionsDir(gitRoot), `last-${internalName}.txt`);
    writeFileSync(lastPath, `${capturePath}\n`, "utf-8");
    return;
  }

  const capturePath = persistHookTranscript(gitRoot, transcriptAbs);
  const result = await distillCommitOrPending(gitRoot, agent, capturePath, merged);
  if (!result.ok) {
    eprint(`quorum internal ${internalName}: capture queued as pending; run \`quorum retry\` after fixing distiller.`);
  }
  const lastPath = join(quorumSessionsDir(gitRoot), `last-${internalName}.txt`);
  writeFileSync(lastPath, `${capturePath}\n`, "utf-8");
}
