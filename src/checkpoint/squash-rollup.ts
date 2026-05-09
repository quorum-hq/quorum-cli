import type { AgentId } from "../config/constants.js";
import { ALLOWED_AGENT_IDS } from "../config/constants.js";
import type { SessionCheckpoint, SessionDecision } from "./session.js";
import { CheckpointValidationError } from "./session.js";

export type BriefCheckpoint = SessionCheckpoint | SquashRollupCheckpoint;

export type SquashRollupCheckpoint = {
  id: string;
  kind: "squash_rollup";
  rollup_id: string;
  created_at: string;
  agent: AgentId;
  commit_sha: string;
  intent: string;
  /** Session checkpoint ids absorbed into this rollup narrative. */
  sources: string[];
  decisions: SessionDecision[];
  files_touched: string[];
  open_questions: string[];
};

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

export function parseSquashRollupCheckpointRecord(raw: unknown, fileId: string): SquashRollupCheckpoint {
  return parseSquashRollupInner(raw, fileId, { mode: "record" });
}

export function parseAndNormalizeSquashRollupCheckpoint(
  raw: unknown,
  landingSha: string,
  fileId: string,
): SquashRollupCheckpoint {
  return parseSquashRollupInner(raw, fileId, { mode: "landing", landingSha });
}

function parseSquashRollupInner(
  raw: unknown,
  fileId: string,
  mode: { mode: "record" } | { mode: "landing"; landingSha: string },
): SquashRollupCheckpoint {
  if (!isPlainObject(raw)) {
    throw new CheckpointValidationError("checkpoint root must be a JSON object");
  }
  if (raw.kind !== "squash_rollup") {
    throw new CheckpointValidationError(`expected kind \"squash_rollup\", got ${JSON.stringify(raw.kind)}`);
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

  let normalizedCommitSha: string;
  if (mode.mode === "landing") {
    const landing = mode.landingSha;
    if (!isHexSha40(landing)) {
      throw new CheckpointValidationError("internal error: landing sha is not a 40-character hex id");
    }
    if (commitSha.toLowerCase() !== landing.toLowerCase()) {
      throw new CheckpointValidationError(
        `checkpoint commit_sha ${commitSha} does not match reconcile landing ${landing}`,
      );
    }
    normalizedCommitSha = landing.toLowerCase();
  } else {
    normalizedCommitSha = commitSha.toLowerCase();
  }

  const sourcesRaw = raw.sources;
  if (!Array.isArray(sourcesRaw) || sourcesRaw.length === 0 || !sourcesRaw.every((x) => typeof x === "string" && x.length > 0)) {
    throw new CheckpointValidationError("sources must be a non-empty array of non-empty strings");
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

  return {
    id: fileId,
    kind: "squash_rollup",
    rollup_id: expectString("rollup_id", raw.rollup_id),
    created_at: expectString("created_at", raw.created_at),
    agent,
    commit_sha: normalizedCommitSha,
    intent: expectString("intent", raw.intent),
    sources: [...sourcesRaw],
    decisions,
    files_touched: [...filesRaw],
    open_questions: [...oqRaw],
  };
}
