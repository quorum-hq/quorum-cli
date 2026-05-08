import {
  ALLOWED_AGENT_IDS,
  type AgentId,
  CONFIG_KEYS,
  type QuorumCommittedConfig,
  type QuorumLocalOverrides,
} from "./constants.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAgentId(s: string): s is AgentId {
  return (ALLOWED_AGENT_IDS as readonly string[]).includes(s);
}

export class ConfigError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ConfigError";
    this.path = path;
  }
}

function validateAgents(path: string, raw: unknown): AgentId[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ConfigError(path, `"agents" must be a non-empty array of known agent ids`);
  }
  const seen = new Set<string>();
  const out: AgentId[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !isAgentId(item)) {
      throw new ConfigError(
        path,
        `unknown agent id ${JSON.stringify(item)} — allowed: ${ALLOWED_AGENT_IDS.join(", ")}`,
      );
    }
    if (seen.has(item)) {
      throw new ConfigError(path, `duplicate agent id ${JSON.stringify(item)}`);
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

function validatePositiveInt(path: string, key: string, raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new ConfigError(path, `"${key}" must be a positive integer`);
  }
  return raw;
}

function validateBool(path: string, key: string, raw: unknown): boolean {
  if (typeof raw !== "boolean") {
    throw new ConfigError(path, `"${key}" must be a boolean`);
  }
  return raw;
}

function validateNonEmptyString(path: string, key: string, raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ConfigError(path, `"${key}" must be a non-empty string`);
  }
  return raw;
}

/** Validate `.quorum/config.json` — strict keys (team contract). */
export function parseAndValidateCommittedConfig(
  path: string,
  rawJson: unknown,
): QuorumCommittedConfig {
  if (!isPlainObject(rawJson)) {
    throw new ConfigError(path, "root must be a JSON object");
  }
  for (const k of Object.keys(rawJson)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(k)) {
      throw new ConfigError(path, `unknown key ${JSON.stringify(k)}`);
    }
  }
  for (const k of CONFIG_KEYS) {
    if (!(k in rawJson)) {
      throw new ConfigError(path, `missing required key ${JSON.stringify(k)}`);
    }
  }
  const o = rawJson;
  return {
    shadow_branch: validateNonEmptyString(path, "shadow_branch", o.shadow_branch),
    default_token_budget: validatePositiveInt(path, "default_token_budget", o.default_token_budget),
    agents: validateAgents(path, o.agents),
    distill_cli_timeout_seconds: validatePositiveInt(
      path,
      "distill_cli_timeout_seconds",
      o.distill_cli_timeout_seconds,
    ),
    rollup_on_reconcile: validateBool(path, "rollup_on_reconcile", o.rollup_on_reconcile),
    install_git_rewrite_hook: validateBool(
      path,
      "install_git_rewrite_hook",
      o.install_git_rewrite_hook,
    ),
    auto_push: validateBool(path, "auto_push", o.auto_push),
  };
}

/** Validate `.quorum/local.json` — known override keys optional; unknown keys ignored (forward compat). */
export function parseAndValidateLocalOverrides(
  path: string,
  rawJson: unknown,
): QuorumLocalOverrides {
  if (!isPlainObject(rawJson)) {
    throw new ConfigError(path, "root must be a JSON object");
  }
  const out: QuorumLocalOverrides = {};
  for (const [k, v] of Object.entries(rawJson)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(k)) {
      continue;
    }
    switch (k) {
      case "shadow_branch":
        out.shadow_branch = validateNonEmptyString(path, k, v);
        break;
      case "default_token_budget":
        out.default_token_budget = validatePositiveInt(path, k, v);
        break;
      case "agents":
        out.agents = validateAgents(path, v);
        break;
      case "distill_cli_timeout_seconds":
        out.distill_cli_timeout_seconds = validatePositiveInt(path, k, v);
        break;
      case "rollup_on_reconcile":
        out.rollup_on_reconcile = validateBool(path, k, v);
        break;
      case "install_git_rewrite_hook":
        out.install_git_rewrite_hook = validateBool(path, k, v);
        break;
      case "auto_push":
        out.auto_push = validateBool(path, k, v);
        break;
      default:
        break;
    }
  }
  return out;
}
