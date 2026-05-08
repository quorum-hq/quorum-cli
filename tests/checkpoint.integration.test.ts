import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shadowBranchCommitCount } from "../src/git/shadow-commit.js";
import { quorumPendingDir } from "../src/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");
const distillStub = join(projectRoot, "tests/fixtures/distill-stub.mjs");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-chk-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runQuorumCapture(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...extraEnv },
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

describe("quorum checkpoint / retry", () => {
  it("commits a valid session checkpoint to the shadow branch when distiller stdout uses the envelope (stub)", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);

    const shadow = "quorum/context/v1";
    const before = shadowBranchCommitCount(dir, shadow);

    writeFileSync(join(dir, "transcript.txt"), "stub transcript", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const r = runQuorumCapture(
      dir,
      ["checkpoint", "--agent", "claude-code", "transcript.txt"],
      { QUORUM_DISTILL_WRAPPER: distillStub },
    );
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("checkpoint committed");

    const after = shadowBranchCommitCount(dir, shadow);
    expect(after).toBe(before + 1);
    expect(pendingDirCount(dir)).toBe(0);
  });

  it("does not advance shadow on distiller failure but writes pending; retry can succeed with a fixed stub", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# x\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    const shadow = "quorum/context/v1";
    const before = shadowBranchCommitCount(dir, shadow);

    writeFileSync(join(dir, "transcript.txt"), "body", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const badStub = join(dir, "bad-distill.mjs");
    writeFileSync(
      badStub,
      `console.log('<<QUORUM_JSON>>'); console.log('{ not json'); console.log('<<END_QUORUM_JSON>>');\n`,
      "utf-8",
    );

    const bad = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: badStub,
    });
    expect(bad.status).toBe(1);
    expect(shadowBranchCommitCount(dir, shadow)).toBe(before);
    expect(pendingDirCount(dir)).toBe(1);

    const ok = runQuorumCapture(dir, ["retry"], { QUORUM_DISTILL_WRAPPER: distillStub });
    expect(ok.status).toBe(0);
    expect(shadowBranchCommitCount(dir, shadow)).toBe(before + 1);
    expect(pendingDirCount(dir)).toBe(0);
  });

  it("terminates a hung distiller after timeout and records pending (SIGTERM then SIGKILL path)", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# y\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(dir, ["init"]);
    writeFileSync(
      join(dir, ".quorum/local.json"),
      JSON.stringify({ distill_cli_timeout_seconds: 1 }, null, 2),
      "utf-8",
    );

    const shadow = "quorum/context/v1";
    const before = shadowBranchCommitCount(dir, shadow);

    writeFileSync(join(dir, "transcript.txt"), "t", "utf-8");
    writeFileSync(join(dir, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const hangStub = join(dir, "hang.mjs");
    writeFileSync(
      hangStub,
      `setInterval(() => {}, 1000);\nprocess.stdout.write("starting\\n");\n`,
      "utf-8",
    );

    const r = runQuorumCapture(dir, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: hangStub,
    });
    expect(r.status).toBe(1);
    expect(r.stderr.toLowerCase()).toContain("timed out");
    expect(shadowBranchCommitCount(dir, shadow)).toBe(before);
    expect(pendingDirCount(dir)).toBeGreaterThanOrEqual(1);
  });

  it("rejects unknown agent kinds with a clear message", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# z\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    runQuorumCapture(dir, ["init"]);
    writeFileSync(join(dir, "t.txt"), "x", "utf-8");
    const r = runQuorumCapture(dir, ["checkpoint", "--agent", "not-an-agent", "t.txt"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("unknown agent kind");
  });
});
