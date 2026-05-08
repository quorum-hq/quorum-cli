import type { AgentId } from "../config/constants.js";
import { ALLOWED_AGENT_IDS } from "../config/constants.js";

export type SessionDecision = {
  id: string;
  topic: string;
  conclusion: string;
  rationale: string;
  canonical: boolean;
};

export type TokenUsage = {
  input: number;
  output: number;
};

export type SessionCheckpoint = {
  id: string;
  kind: "session";
  session_id: string;
  created_at: string;
  agent: AgentId;
  branch?: string | null;
  pr_number?: number | null;
  commit_sha: string;
  intent: string;
  decisions: SessionDecision[];
  files_touched: string[];
  open_questions: string[];
  token_usage?: TokenUsage;
};

export class CheckpointValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckpointValidationError";
  }
}

function isAgentId(s: string): s is AgentId {
  return (ALLOWED_AGENT_IDS as readonly string[]).includes(s);
}

function isHexSha40(s: string): boolean {
  return /^[0-9a-f]{40}$/i.test(s);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function expectString(path: string, v: unknown): string {
  if (typeof v !== "string" || v.length === 0) {
    throw new CheckpointValidationError(`${path} must be a non-empty string`);
  }
  return v;
}

function expectBool(path: string, v: unknown): boolean {
  if (typeof v !== "boolean") {
    throw new CheckpointValidationError(`${path} must be a boolean`);
  }
  return v;
}

function parseDecision(path: string, raw: unknown): SessionDecision {
  if (!isPlainObject(raw)) {
    throw new CheckpointValidationError(`${path} must be an object`);
  }
  return {
    id: expectString(`${path}.id`, raw.id),
    topic: expectString(`${path}.topic`, raw.topic),
    conclusion: expectString(`${path}.conclusion`, raw.conclusion),
    rationale: expectString(`${path}.rationale`, raw.rationale),
    canonical: expectBool(`${path}.canonical`, raw.canonical),
  };
}

/** Validate distilled JSON and normalize `commit_sha` to the repo `HEAD` SHA at capture time. */
export function parseAndNormalizeSessionCheckpoint(
  raw: unknown,
  headSha: string,
  fileId: string,
): SessionCheckpoint {
  if (!isPlainObject(raw)) {
    throw new CheckpointValidationError("checkpoint root must be a JSON object");
  }
  if (raw.kind !== "session") {
    throw new CheckpointValidationError(`expected kind \"session\", got ${JSON.stringify(raw.kind)}`);
  }
  const agent = expectString("agent", raw.agent);
  if (!isAgentId(agent)) {
    throw new CheckpointValidationError(
      `unknown agent kind ${JSON.stringify(agent)} — supported: ${ALLOWED_AGENT_IDS.join(", ")}`,
    );
  }
  const commitSha = expectString("commit_sha", raw.commit_sha);
  if (!isHexSha40(commitSha)) {
    throw new CheckpointValidationError("commit_sha must be a 40-character hex git object id");
  }
  if (!isHexSha40(headSha)) {
    throw new CheckpointValidationError("internal error: HEAD sha is not a 40-character hex id");
  }
  if (commitSha.toLowerCase() !== headSha.toLowerCase()) {
    throw new CheckpointValidationError(
      `checkpoint commit_sha ${commitSha} does not match current HEAD ${headSha}`,
    );
  }

  const decisionsRaw = raw.decisions;
  if (!Array.isArray(decisionsRaw)) {
    throw new CheckpointValidationError("decisions must be an array");
  }
  const decisions = decisionsRaw.map((d, i) => parseDecision(`decisions[${i}]`, d));

  const filesRaw = raw.files_touched;
  if (!Array.isArray(filesRaw) || !filesRaw.every((x) => typeof x === "string")) {
    throw new CheckpointValidationError("files_touched must be an array of strings");
  }

  const oqRaw = raw.open_questions;
  if (!Array.isArray(oqRaw) || !oqRaw.every((x) => typeof x === "string")) {
    throw new CheckpointValidationError("open_questions must be an array of strings");
  }

  let token_usage: TokenUsage | undefined;
  if ("token_usage" in raw && raw.token_usage !== undefined && raw.token_usage !== null) {
    if (!isPlainObject(raw.token_usage)) {
      throw new CheckpointValidationError("token_usage must be an object or omitted");
    }
    const tu = raw.token_usage;
    const input = tu.input;
    const output = tu.output;
    if (typeof input !== "number" || typeof output !== "number" || !Number.isInteger(input) || !Number.isInteger(output)) {
      throw new CheckpointValidationError("token_usage.input and token_usage.output must be integers");
    }
    if (input <= 0 || output <= 0) {
      throw new CheckpointValidationError(
        "token_usage must be omitted when unknown; placeholder zeros are not allowed",
      );
    }
    token_usage = { input, output };
  }

  const out: SessionCheckpoint = {
    id: fileId,
    kind: "session",
    session_id: expectString("session_id", raw.session_id),
    created_at: expectString("created_at", raw.created_at),
    agent,
    commit_sha: headSha.toLowerCase(),
    intent: expectString("intent", raw.intent),
    decisions,
    files_touched: [...filesRaw],
    open_questions: [...oqRaw],
  };
  if ("branch" in raw) {
    if (raw.branch === null) {
      out.branch = null;
    } else if (typeof raw.branch === "string") {
      out.branch = raw.branch;
    } else if (raw.branch !== undefined) {
      throw new CheckpointValidationError("branch must be a string or null");
    }
  }
  if ("pr_number" in raw && raw.pr_number !== undefined) {
    if (raw.pr_number === null) {
      out.pr_number = null;
    } else if (typeof raw.pr_number === "number" && Number.isInteger(raw.pr_number)) {
      out.pr_number = raw.pr_number;
    } else {
      throw new CheckpointValidationError("pr_number must be an integer or null");
    }
  }
  if (token_usage) {
    out.token_usage = token_usage;
  }
  return out;
}
