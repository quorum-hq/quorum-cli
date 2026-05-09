import type { AgentId } from "../config/constants.js";
import { ALLOWED_AGENT_IDS } from "../config/constants.js";

export type ReconcileCliArgs = {
  landing: string;
  checkpoints: string[];
  pr?: number;
  rollup?: { agent: AgentId; transcript: string };
};

function parseAgentId(flagLabel: string, s: string): AgentId {
  if (!(ALLOWED_AGENT_IDS as readonly string[]).includes(s)) {
    throw new Error(
      `unknown ${flagLabel} ${JSON.stringify(s)} — supported: ${ALLOWED_AGENT_IDS.join(", ")}`,
    );
  }
  return s as AgentId;
}

export function parseReconcileArgs(argv: string[]): ReconcileCliArgs {
  let landing: string | undefined;
  const checkpoints: string[] = [];
  let pr: number | undefined;
  let rollup = false;
  let rollupTranscript: string | undefined;
  let agent: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--landing" && argv[i + 1]) {
      landing = argv[++i];
    } else if (a === "--checkpoint" && argv[i + 1]) {
      checkpoints.push(argv[++i]);
    } else if (a === "--pr" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--pr must be a positive integer");
      }
      pr = n;
    } else if (a === "--rollup") {
      rollup = true;
    } else if (a === "--rollup-transcript" && argv[i + 1]) {
      rollupTranscript = argv[++i];
    } else if (a === "--agent" && argv[i + 1]) {
      agent = argv[++i];
    } else if (a) {
      throw new Error(`unexpected argument ${JSON.stringify(a)}`);
    }
  }

  if (!landing) {
    throw new Error("missing required flag --landing <sha>");
  }
  if (!/^[0-9a-f]{40}$/i.test(landing)) {
    throw new Error("--landing must be a 40-character hex git object id");
  }

  const out: ReconcileCliArgs = { landing: landing.toLowerCase(), checkpoints, pr };

  if (rollup) {
    if (!agent) {
      throw new Error("--rollup requires --agent <id>");
    }
    if (!rollupTranscript) {
      throw new Error("--rollup requires --rollup-transcript <path>");
    }
    out.rollup = { agent: parseAgentId("--agent", agent), transcript: rollupTranscript };
  } else if (agent) {
    throw new Error("--agent is only valid with --rollup");
  }

  return out;
}
