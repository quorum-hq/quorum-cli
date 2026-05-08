import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_COMMITTED_CONFIG } from "../src/config/constants.js";
import { loadMergedConfig } from "../src/config/load.js";
import { mergeQuorumConfig } from "../src/config/merge.js";

describe("mergeQuorumConfig", () => {
  it("applies local overrides on top of committed config", () => {
    const base = { ...DEFAULT_COMMITTED_CONFIG, agents: [...DEFAULT_COMMITTED_CONFIG.agents] };
    const merged = mergeQuorumConfig(base, { distill_cli_timeout_seconds: 1800, auto_push: true });
    expect(merged.distill_cli_timeout_seconds).toBe(1800);
    expect(merged.auto_push).toBe(true);
    expect(merged.default_token_budget).toBe(4000);
  });
});

describe("loadMergedConfig", () => {
  it("reads committed + local from disk", () => {
    const root = mkdtempSync(join(tmpdir(), "quorum-load-"));
    mkdirSync(join(root, ".quorum"), { recursive: true });
    writeFileSync(
      join(root, ".quorum/config.json"),
      JSON.stringify({ ...DEFAULT_COMMITTED_CONFIG, agents: [...DEFAULT_COMMITTED_CONFIG.agents] }, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(root, ".quorum/local.json"),
      JSON.stringify({ distill_cli_timeout_seconds: 333 }),
      "utf-8",
    );
    const merged = loadMergedConfig(root);
    expect(merged.distill_cli_timeout_seconds).toBe(333);
    expect(merged.shadow_branch).toBe(DEFAULT_COMMITTED_CONFIG.shadow_branch);
  });
});
