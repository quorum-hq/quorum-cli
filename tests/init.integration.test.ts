import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { QUORUM_CLAUDE_COMMAND } from "../src/claude/hooks.js";
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

function setInstallGitRewriteHook(dir: string, value: boolean): void {
  const cfgPath = join(dir, ".quorum/config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as { install_git_rewrite_hook?: boolean };
  cfg.install_git_rewrite_hook = value;
  writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");
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
  function readHookCommands(
    file: string,
    event: string,
  ): string[] {
    if (!existsSync(file)) {
      return [];
    }
    const raw = JSON.parse(readFileSync(file, "utf-8")) as {
      hooks?: Record<string, Array<{ hooks?: Array<{ command?: string }> }>>;
    };
    return raw.hooks?.[event]?.flatMap((entry) => (entry.hooks ?? []).map((h) => h.command ?? "")) ?? [];
  }

  it("writes valid config, gitignores local.json, bootstraps shadow branch, and prints security notice", () => {
    const dir = freshGitRepo();
    const { stdout, stderr, status } = runQuorumCapture(dir, ["init"]);
    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("does not redact");
    expect(stderr).toContain("initialized");

    const cfgPath = join(dir, ".quorum/config.json");
    expect(existsSync(cfgPath)).toBe(true);
    const cfg0 = JSON.parse(readFileSync(cfgPath, "utf-8")) as { agents: string[] };
    expect(cfg0.agents).toEqual(["claude-code"]);
    parseAndValidateCommittedConfig(cfgPath, cfg0);

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

  it("install fails without config; post-rewrite installs only when install_git_rewrite_hook is true", () => {
    const dir = freshGitRepo();
    const missing = runQuorumCapture(dir, ["install"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("config.json");

    runQuorumCapture(dir, ["init"]);
    const firstInstall = runQuorumCapture(dir, ["install"]);
    expect(firstInstall.status).toBe(0);
    const hook = join(dir, ".git/hooks/post-rewrite");
    expect(existsSync(hook)).toBe(false);

    setInstallGitRewriteHook(dir, true);
    const ok = runQuorumCapture(dir, ["install"]);
    expect(ok.status).toBe(0);
    expect(existsSync(hook)).toBe(true);
    expect(readFileSync(hook, "utf-8")).toContain(QUORUM_HOOK_MARKER);

    const claudeSettings = join(dir, ".claude/settings.json");
    expect(existsSync(claudeSettings)).toBe(true);
    const commands = readHookCommands(claudeSettings, "SessionEnd");
    expect(commands).toContain(QUORUM_CLAUDE_COMMAND);

    expect(existsSync(join(dir, ".cursor/settings.json"))).toBe(false);
    expect(existsSync(join(dir, ".gemini/settings.json"))).toBe(false);
    expect(existsSync(join(dir, ".opencode/settings.json"))).toBe(false);
    expect(existsSync(join(dir, ".codex/hooks.json"))).toBe(false);
  });

  it("disable removes Quorum post-rewrite hook; shadow branch remains", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    setInstallGitRewriteHook(dir, true);
    expect(runQuorumCapture(dir, ["install"]).status).toBe(0);
    const tipBefore = readShadowBranchTip(dir, "quorum/context/v1");
    const hook = join(dir, ".git/hooks/post-rewrite");
    expect(existsSync(hook)).toBe(true);

    const dis = runQuorumCapture(dir, ["disable"]);
    expect(dis.status).toBe(0);
    expect(existsSync(hook)).toBe(false);
    const claudeSettings = join(dir, ".claude/settings.json");
    if (existsSync(claudeSettings)) {
      const raw = readFileSync(claudeSettings, "utf-8");
      expect(raw).not.toContain(QUORUM_CLAUDE_COMMAND);
    }
    expect(readShadowBranchTip(dir, "quorum/context/v1")).toBe(tipBefore);
  });

  it("merges local.json overrides when loading after init", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, ".quorum/local.json"), JSON.stringify({ distill_cli_timeout_seconds: 42 }, null, 2), "utf-8");
    const merged = loadMergedConfig(dir);
    expect(merged.distill_cli_timeout_seconds).toBe(42);
  });

  it("status reports active hook wiring by agent", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    const statusInit = runQuorumCapture(dir, ["status"]);
    expect(statusInit.status).toBe(0);
    expect(statusInit.stdout).toContain("post-rewrite: not hooked");
    expect(statusInit.stdout).toContain("claude-code: hooked");

    setInstallGitRewriteHook(dir, true);
    expect(runQuorumCapture(dir, ["install"]).status).toBe(0);
    const status = runQuorumCapture(dir, ["status"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("post-rewrite: hooked");
    expect(status.stdout).toContain("claude-code: hooked");
    expect(status.stdout).not.toContain("cursor:");
    expect(status.stdout).not.toContain("gemini-cli:");
    expect(status.stdout).not.toContain("opencode:");
    expect(status.stdout).not.toContain("codex:");

    runQuorumCapture(dir, ["disable"]);
    const after = runQuorumCapture(dir, ["status"]);
    expect(after.status).toBe(0);
    expect(after.stdout).toContain("post-rewrite: not hooked");
    expect(after.stdout).toContain("claude-code: not hooked");
  });

  it("install only wires hooks for agents enabled in config", () => {
    const dir = freshGitRepo();
    runQuorumCapture(dir, ["init"]);
    const cfgPath = join(dir, ".quorum/config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as { agents: string[] };
    cfg.agents = ["claude-code", "cursor"];
    writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf-8");

    runQuorumCapture(dir, ["disable"]);
    const r = runQuorumCapture(dir, ["install"]);
    expect(r.status).toBe(0);

    expect(readHookCommands(join(dir, ".claude/settings.json"), "SessionEnd")).toContain(QUORUM_CLAUDE_COMMAND);
    expect(existsSync(join(dir, ".cursor/settings.json"))).toBe(false);
    expect(existsSync(join(dir, ".gemini/settings.json"))).toBe(false);
    expect(existsSync(join(dir, ".opencode/settings.json"))).toBe(false);
    expect(existsSync(join(dir, ".codex/hooks.json"))).toBe(false);
  });
});
