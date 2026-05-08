import type { QuorumCommittedConfig, QuorumLocalOverrides, QuorumMergedConfig } from "./constants.js";

/** Shallow merge: `local` overrides `base` for any defined field. */
export function mergeQuorumConfig(
  base: QuorumCommittedConfig,
  local: QuorumLocalOverrides,
): QuorumMergedConfig {
  return { ...base, ...local };
}
