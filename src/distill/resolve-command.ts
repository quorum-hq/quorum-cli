import type { AgentId } from "../config/constants.js";

/** Test hook: if set, path to a script; Node runs `.mjs`/`.js`/`.cjs`, otherwise executed directly. */
export const DISTILL_WRAPPER_ENV = "QUORUM_DISTILL_WRAPPER";

export type DistillCommand = { command: string; args: string[] };

function isNodeScriptPath(p: string): boolean {
  return /\.(m|c)?js$/i.test(p);
}

/**
 * Resolve distiller invocation. Production paths are placeholders until the per-agent
 * invoke matrix is finalized (see MVP TODO); tests set `QUORUM_DISTILL_WRAPPER`.
 */
export function resolveDistillCommand(agent: AgentId, transcriptPath: string): DistillCommand {
  const wrapper = process.env[DISTILL_WRAPPER_ENV];
  if (wrapper && wrapper.length > 0) {
    if (isNodeScriptPath(wrapper)) {
      return { command: process.execPath, args: [wrapper, agent, transcriptPath] };
    }
    return { command: wrapper, args: [agent, transcriptPath] };
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
