import type { AgentId } from "../config/constants.js";

/** Test hook: if set, path to a script; Node runs `.mjs`/`.js`/`.cjs`, otherwise executed directly. */
export const DISTILL_WRAPPER_ENV = "QUORUM_DISTILL_WRAPPER";

/** CI / tests: wrapper used only for `quorum reconcile --rollup` distillation (checked before QUORUM_DISTILL_WRAPPER). */
export const ROLLUP_DISTILL_WRAPPER_ENV = "QUORUM_ROLLUP_DISTILL_WRAPPER";

export type DistillCommand = { command: string; args: string[] };

function isNodeScriptPath(p: string): boolean {
  return /\.(m|c)?js$/i.test(p);
}

/**
 * Resolve distiller invocation. Production paths are placeholders until the per-agent
 * invoke matrix is finalized (see MVP TODO); tests set `QUORUM_DISTILL_WRAPPER`.
 */
function distillCommandFromWrapper(wrapper: string, agent: AgentId, transcriptPath: string): DistillCommand {
  if (isNodeScriptPath(wrapper)) {
    return { command: process.execPath, args: [wrapper, agent, transcriptPath] };
  }
  return { command: wrapper, args: [agent, transcriptPath] };
}

function claudeSessionDistillPrompt(transcriptPath: string, expectedHeadSha?: string): string {
  const commitHint =
    expectedHeadSha && expectedHeadSha.length > 0
      ? `- commit_sha must be exactly: ${expectedHeadSha.toLowerCase()}`
      : "- commit_sha must be a 40-character lowercase hex string from the transcript context.";
  return [
    "You are Quorum distillation for a coding session transcript.",
    "Read the transcript file at this absolute path:",
    transcriptPath,
    "",
    "Return only one envelope block in this exact format:",
    "<<QUORUM_JSON>>",
    '{"kind":"session","session_id":"<uuid>","created_at":"<ISO-8601>","agent":"claude-code","commit_sha":"<40-hex-sha>","intent":"<summary>","decisions":[{"id":"<id>","topic":"<topic>","conclusion":"<conclusion>","rationale":"<rationale>","canonical":false}],"files_touched":["<path>"],"open_questions":["<question>"]}',
    "<<END_QUORUM_JSON>>",
    "",
    "Rules:",
    "- Output no text before or after the envelope.",
    commitHint,
    "- If unknown values exist, infer reasonable non-empty strings; never emit empty strings.",
    "- Keep decisions concise and grounded in transcript evidence.",
  ].join("\n");
}

function codexSessionDistillPrompt(transcriptPath: string, expectedHeadSha?: string): string {
  const commitHint =
    expectedHeadSha && expectedHeadSha.length > 0
      ? `- commit_sha must be exactly: ${expectedHeadSha.toLowerCase()}`
      : "- commit_sha must be a 40-character lowercase hex string from the transcript context.";
  return [
    "You are Quorum distillation for a coding session transcript.",
    "Read the transcript file at this absolute path:",
    transcriptPath,
    "",
    "Return only one envelope block in this exact format:",
    "<<QUORUM_JSON>>",
    '{"kind":"session","session_id":"<uuid>","created_at":"<ISO-8601>","agent":"codex","commit_sha":"<40-hex-sha>","intent":"<summary>","decisions":[{"id":"<id>","topic":"<topic>","conclusion":"<conclusion>","rationale":"<rationale>","canonical":false}],"files_touched":["<path>"],"open_questions":["<question>"]}',
    "<<END_QUORUM_JSON>>",
    "",
    "Rules:",
    "- Output no text before or after the envelope.",
    commitHint,
    "- If unknown values exist, infer reasonable non-empty strings; never emit empty strings.",
    "- Keep decisions concise and grounded in transcript evidence.",
  ].join("\n");
}

export function resolveDistillCommand(agent: AgentId, transcriptPath: string, expectedHeadSha?: string): DistillCommand {
  const wrapper = process.env[DISTILL_WRAPPER_ENV];
  if (wrapper && wrapper.length > 0) {
    return distillCommandFromWrapper(wrapper, agent, transcriptPath);
  }
  switch (agent) {
    case "claude-code":
      return {
        command: "claude",
        args: [
          "--print",
          "--output-format",
          "text",
          "--dangerously-skip-permissions",
          claudeSessionDistillPrompt(transcriptPath, expectedHeadSha),
        ],
      };
    case "cursor":
      return {
        command: "cursor",
        args: ["quorum-distill", "--transcript", transcriptPath],
      };
    case "gemini-cli":
      return {
        command: "gemini",
        args: ["quorum-distill", "--transcript", transcriptPath],
      };
    case "opencode":
      return {
        command: "opencode",
        args: ["quorum-distill", "--transcript", transcriptPath],
      };
    case "codex":
      return {
        command: "codex",
        args: ["exec", "--skip-git-repo-check", codexSessionDistillPrompt(transcriptPath, expectedHeadSha)],
      };
    default: {
      const _exhaustive: never = agent;
      return _exhaustive;
    }
  }
}

/** Rollup path prefers QUORUM_ROLLUP_DISTILL_WRAPPER, then falls back to resolveDistillCommand. */
export function resolveRollupDistillCommand(agent: AgentId, transcriptPath: string): DistillCommand {
  const rollupWrapper = process.env[ROLLUP_DISTILL_WRAPPER_ENV];
  if (rollupWrapper && rollupWrapper.length > 0) {
    return distillCommandFromWrapper(rollupWrapper, agent, transcriptPath);
  }
  return resolveDistillCommand(agent, transcriptPath);
}
