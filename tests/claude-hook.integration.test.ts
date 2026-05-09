import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shadowBranchCommitCount } from "../src/git/shadow-commit.js";
import { quorumPendingDir, quorumSessionsDir } from "../src/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");
const distillStub = join(projectRoot, "tests/fixtures/distill-stub.mjs");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-claude-hook-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runQuorumCapture(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  stdin = "",
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
    input: stdin,
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status ?? 1,
  };
}

function pendingDirCount(gitRoot: string): number {
  const p = quorumPendingDir(gitRoot);
  if (!existsSync(p)) {
    return 0;
  }
  return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
}

describe("quorum internal claude-session-end", () => {
  it("captures transcript artifact and commits session checkpoint on success", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "session-transcript.txt"), "fixture transcript", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const before = shadowBranchCommitCount(dir, "quorum/context/v1");
    const payload = JSON.stringify({ transcript_path: "session-transcript.txt" });
    const r = runQuorumCapture(
      dir,
      ["internal", "claude-session-end"],
      { QUORUM_DISTILL_WRAPPER: distillStub },
      payload,
    );
    expect(r.status).toBe(0);
    expect(shadowBranchCommitCount(dir, "quorum/context/v1")).toBe(before + 1);
    expect(pendingDirCount(dir)).toBe(0);

    const capturesDir = join(quorumSessionsDir(dir), "captures");
    expect(existsSync(capturesDir)).toBe(true);
    const captureFiles = readdirSync(capturesDir);
    expect(captureFiles.length).toBeGreaterThan(0);
  });

  it("writes pending and leaves shadow unchanged on distill failure", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "session-transcript.txt"), "fixture transcript", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const badStub = join(dir, "bad-distill.mjs");
    writeFileSync(
      badStub,
      `console.log('<<QUORUM_JSON>>'); console.log('{ not json'); console.log('<<END_QUORUM_JSON>>');\n`,
      "utf-8",
    );

    const before = shadowBranchCommitCount(dir, "quorum/context/v1");
    const payload = JSON.stringify({ transcript_path: "session-transcript.txt" });
    const r = runQuorumCapture(dir, ["internal", "claude-session-end"], { QUORUM_DISTILL_WRAPPER: badStub }, payload);
    expect(r.status).toBe(0);
    expect(shadowBranchCommitCount(dir, "quorum/context/v1")).toBe(before);
    expect(pendingDirCount(dir)).toBe(1);
    expect(r.stderr).toContain("queued as pending");
  });
});
