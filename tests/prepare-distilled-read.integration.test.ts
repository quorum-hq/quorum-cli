import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");
const holdFixture = join(projectRoot, "tests/fixtures/hold-distill-inflight.mjs");

function freshGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorum-prepread-"));
  spawnSync("git", ["init"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function runQuorumCapture(
  cwd: string,
  args: string[],
): { stdout: string; stderr: string; status: number } {
  const r = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  return {
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    status: r.status ?? 1,
  };
}

describe("prepareForDistilledReads (brief / log / pins)", () => {
  it("brief --no-wait warns when distillation is in flight but exits 0", async () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    runQuorumCapture(dir, ["init"]);

    const child = spawn(process.execPath, [holdFixture, dir, "2000"], {
      cwd: projectRoot,
      stdio: "ignore",
      detached: false,
    });

    const inflightDir = join(dir, ".quorum", "sessions", "distill-inflight");
    for (let i = 0; i < 100; i++) {
      if (existsSync(inflightDir) && readdirSync(inflightDir).length > 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    const r = runQuorumCapture(dir, ["brief", "--no-wait", "README.md"]);
    child.kill();
    await new Promise((r) => setTimeout(r, 50));

    expect(r.status).toBe(0);
    expect(r.stderr).toContain("still in progress");
    expect(r.stderr).toContain("may be stale");
  });

  it("brief waits for inflight child then succeeds without stale-in-progress warning", async () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    runQuorumCapture(dir, ["init"]);

    const child = spawn(process.execPath, [holdFixture, dir, "400"], {
      cwd: projectRoot,
      stdio: "ignore",
    });

    const inflightDirWait = join(dir, ".quorum", "sessions", "distill-inflight");
    for (let i = 0; i < 100; i++) {
      if (existsSync(inflightDirWait) && readdirSync(inflightDirWait).length > 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    const r = runQuorumCapture(dir, ["brief", "README.md"]);
    await new Promise<void>((resolve) => {
      child.on("exit", () => resolve());
    });

    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain("still in progress");
  });

  it("brief prints pending warning when sessions/pending exists", () => {
    const dir = freshGitRepo();
    writeFileSync(join(dir, "README.md"), "# t\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: dir, stdio: "ignore" });
    spawnSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "ignore" });
    runQuorumCapture(dir, ["init"]);

    const pendingId = "00000000-0000-4000-8000-000000000001";
    const pendingBase = join(dir, ".quorum", "sessions", "pending", pendingId);
    mkdirSync(pendingBase, { recursive: true });
    writeFileSync(
      join(pendingBase, "meta.json"),
      JSON.stringify(
        {
          pending_id: pendingId,
          created_at: "2026-01-01T00:00:00.000Z",
          agent: "claude-code",
          head_sha: "a".repeat(40),
          transcript_file: "transcript.txt",
          reason: "nonzero_exit",
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    writeFileSync(join(pendingBase, "transcript.txt"), "x\n", "utf-8");

    const r = runQuorumCapture(dir, ["brief", "README.md"]);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("pending");
    expect(r.stderr).toContain("quorum retry");
  });
});
