import { existsSync, readFileSync } from "node:fs";
import type { QuorumCommittedConfig, QuorumMergedConfig } from "./constants.js";
import { DEFAULT_COMMITTED_CONFIG } from "./constants.js";
import { mergeQuorumConfig } from "./merge.js";
import { ConfigError, parseAndValidateCommittedConfig, parseAndValidateLocalOverrides } from "./validate.js";
import { quorumConfigPath, quorumLocalPath } from "../paths.js";

function readJson(path: string): unknown {
  const raw = readFileSync(path, "utf-8");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ConfigError(path, "invalid JSON");
  }
}

/** Load committed + optional local overrides. Requires valid `config.json`. */
export function loadMergedConfig(gitRoot: string): QuorumMergedConfig {
  const cPath = quorumConfigPath(gitRoot);
  if (!existsSync(cPath)) {
    throw new ConfigError(cPath, "file not found — run `quorum init` in this repository first");
  }
  const committed = parseAndValidateCommittedConfig(cPath, readJson(cPath));
  const lPath = quorumLocalPath(gitRoot);
  if (!existsSync(lPath)) {
    return committed;
  }
  const local = parseAndValidateLocalOverrides(lPath, readJson(lPath));
  return mergeQuorumConfig(committed, local);
}

export function defaultCommittedConfigSnapshot(): QuorumCommittedConfig {
  return { ...DEFAULT_COMMITTED_CONFIG, agents: [...DEFAULT_COMMITTED_CONFIG.agents] };
}
