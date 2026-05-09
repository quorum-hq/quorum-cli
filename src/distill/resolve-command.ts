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

export function resolveDistillCommand(agent: AgentId, transcriptPath: string): DistillCommand {
  const wrapper = process.env[DISTILL_WRAPPER_ENV];
  if (wrapper && wrapper.length > 0) {
    return distillCommandFromWrapper(wrapper, agent, transcriptPath);
  }
  switch (agent) {
    case "claude-code":
      return {
        command: "claude",
        args: ["quorum-distill", "--transcript", transcriptPath],
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
