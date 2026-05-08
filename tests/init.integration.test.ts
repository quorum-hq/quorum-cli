import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMergedConfig } from "../src/config/load.js";
import { parseAndValidateCommittedConfig } from "../src/config/validate.js";
import { readShadowBranchTip } from "../src/git/shadow-branch.js";
import { QUORUM_HOOK_MARKER } from "../src/git/hooks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-init-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runQuorumCapture(cwd: string, args: string[]): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status ?? 1,
  };
}

describe("quorum init / install / disable", () => {
  it("writes valid config, gitignores local.json, bootstraps shadow branch, and prints security notice", () => {
    const dir = freshGitRepo();
    const { stdout, stderr, status } = runQuorumCapture(dir, ["init"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("does not redact");
    expect(stderr).toContain("initialized");

    const cfgPath = join(dir, ".quorum/config.json");
    expect(existsSync(cfgPath)).toBe(true);
    parseAndValidateCommittedConfig(cfgPath, JSON.parse(readFileSync(cfgPath, "utf-8")));

    const ign = spawnSync("git", ["check-ignore", "-q", ".quorum/local.json"], { cwd: dir, stdio: "ignore" });
    expect(ign.status).toBe(0);

    const tip = readShadowBranchTip(dir, "quorum/context/v1");
    expect(tip).toMatch(/^[0-9a-f]{40}$/);
  });

  it("is idempotent: second init leaves shadow tip unchanged", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    const tip1 = readShadowBranchTip(dir, "quorum/context/v1");
    runQuorumCapture(dir, ["init"]);
    const tip2 = readShadowBranchTip(dir, "quorum/context/v1");
    expect(tip2).toBe(tip1);
  });

  it("install fails without config; succeeds after init and installs hook", () => {
    const dir = freshGitRepo();
    const missing = runQuorumCapture(dir, ["install"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("config.json");

    runQuorumCapture(dir, ["init"]);
    const ok = runQuorumCapture(dir, ["install"]);
    expect(ok.status).toBe(0);

    const hook = join(dir, ".git/hooks/post-rewrite");
    expect(existsSync(hook)).toBe(true);
    expect(readFileSync(hook, "utf-8")).toContain(QUORUM_HOOK_MARKER);
  });

  it("disable removes Quorum post-rewrite hook; shadow branch remains", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    const tipBefore = readShadowBranchTip(dir, "quorum/context/v1");
    const hook = join(dir, ".git/hooks/post-rewrite");
    expect(existsSync(hook)).toBe(true);

    const dis = runQuorumCapture(dir, ["disable"]);
    expect(dis.status).toBe(0);
    expect(existsSync(hook)).toBe(false);

    expect(readShadowBranchTip(dir, "quorum/context/v1")).toBe(tipBefore);
  });

  it("merges local.json overrides when loading after init", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, ".quorum/local.json"), JSON.stringify({ distill_cli_timeout_seconds: 42 }, null, 2), "utf-8");
    const merged = loadMergedConfig(dir);
    expect(merged.distill_cli_timeout_seconds).toBe(42);
  });
});
