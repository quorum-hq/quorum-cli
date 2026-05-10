/** Empty git tree object id (universal). */
export const GIT_EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// TODO: When cursor / gemini-cli / opencode / codex are first-class in this release line, consider
// adding them to DEFAULT_COMMITTED_CONFIG.agents (and expanding status output) — code paths stay
// available for manual config + QUORUM_DISTILL_WRAPPER until then.

export const ALLOWED_AGENT_IDS = [
  "claude-code",
  "cursor",
  "gemini-cli",
  "opencode",
  "codex",
] as const;

export type AgentId = (typeof ALLOWED_AGENT_IDS)[number];

export const CONFIG_KEYS = [
  "shadow_branch",
  "default_token_budget",
  "agents",
  "distill_cli_timeout_seconds",
  "rollup_on_reconcile",
  "install_git_rewrite_hook",
  "auto_push",
] as const;

export type QuorumCommittedConfig = {
  shadow_branch: string;
  default_token_budget: number;
  agents: AgentId[];
  distill_cli_timeout_seconds: number;
  rollup_on_reconcile: boolean;
  install_git_rewrite_hook: boolean;
  auto_push: boolean;
};

export type QuorumLocalOverrides = Partial<{
  shadow_branch: string;
  default_token_budget: number;
  agents: AgentId[];
  distill_cli_timeout_seconds: number;
  rollup_on_reconcile: boolean;
  install_git_rewrite_hook: boolean;
  auto_push: boolean;
}>;

export type QuorumMergedConfig = QuorumCommittedConfig;

export const DEFAULT_COMMITTED_CONFIG: QuorumCommittedConfig = {
  shadow_branch: "quorum/context/v1",
  default_token_budget: 4000,
  /** v0.1: only Claude has supported auto-capture hooks; add other ids here to opt into experimental distill paths. */
  agents: ["claude-code"],
  distill_cli_timeout_seconds: 900,
  rollup_on_reconcile: false,
  /** Off by default: touching `.git/hooks` surprises some teams; opt in via config + `quorum install`. */
  install_git_rewrite_hook: false,
  auto_push: false,
};
