import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readShadowBranchTip } from "../src/git/shadow-branch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const cliEntry = join(projectRoot, "dist/cli.js");
const distillStub = join(projectRoot, "tests/fixtures/distill-stub.mjs");

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

function bareOriginAndWorkrepo(): { bare: string; work: string } {
  const bare = mkdtempSync(join(tmpdir(), "quorum-autopush-bare-"));
  const work = mkdtempSync(join(tmpdir(), "quorum-autopush-work-"));
  mkdirSync(bare, { recursive: true });
  spawnSync("git", ["init", "--bare"], { cwd: bare, stdio: "ignore" });
  spawnSync("git", ["init"], { cwd: work, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: work, stdio: "ignore" });
  spawnSync("git", ["config", "user.name", "Quorum Test"], { cwd: work, stdio: "ignore" });
  spawnSync("git", ["remote", "add", "origin", bare], { cwd: work, stdio: "ignore" });
  writeFileSync(join(work, "README.md"), "# t\n", "utf-8");
  spawnSync("git", ["add", "README.md"], { cwd: work, stdio: "ignore" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: work, stdio: "ignore" });
  spawnSync("git", ["branch", "-M", "main"], { cwd: work, stdio: "ignore" });
  spawnSync("git", ["push", "-u", "origin", "main"], { cwd: work, stdio: "ignore" });
  return { bare, work };
}

function remoteShadowTip(work: string, shadow: string): string | null {
  const r = spawnSync("git", ["ls-remote", "origin", shadow], {
    cwd: work,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    return null;
  }
  const line = (r.stdout ?? "").trim().split("\n").find(Boolean);
  if (!line) {
    return null;
  }
  return line.split(/\t/)[0] ?? null;
}

describe("auto_push shadow branch", () => {
  it("with default config (auto_push false), checkpoint does not advertise the shadow branch on origin", () => {
    const { work } = bareOriginAndWorkrepo();
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: work, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(work, ["init"]);

    writeFileSync(join(work, "transcript.txt"), "stub transcript", "utf-8");
    writeFileSync(join(work, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const r = runQuorumCapture(work, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(r.status).toBe(0);

    const shadow = "quorum/context/v1";
    expect(remoteShadowTip(work, shadow)).toBeNull();
    expect(readShadowBranchTip(work, shadow).length).toBe(40);
  });

  it("with auto_push true, checkpoint updates origin with the shadow branch tip", () => {
    const { work } = bareOriginAndWorkrepo();
    const head =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: work, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(work, ["init"]);
    writeFileSync(join(work, ".quorum/local.json"), `${JSON.stringify({ auto_push: true }, null, 2)}\n`, "utf-8");

    writeFileSync(join(work, "transcript.txt"), "stub transcript", "utf-8");
    writeFileSync(join(work, ".quorum-checkpoint-test-head"), `${head}\n`, "utf-8");

    const r = runQuorumCapture(work, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(r.status).toBe(0);

    const shadow = "quorum/context/v1";
    const localTip = readShadowBranchTip(work, shadow);
    expect(remoteShadowTip(work, shadow)).toBe(localTip);
  });

  it("after a concurrent push elsewhere, quorum fetch+rebases shadow and succeeds on retry", () => {
    const { bare, work: workA } = bareOriginAndWorkrepo();
    const headA =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: workA, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(workA, ["init"]);
    writeFileSync(join(workA, ".quorum/local.json"), `${JSON.stringify({ auto_push: true }, null, 2)}\n`, "utf-8");

    writeFileSync(join(workA, "transcript.txt"), "a", "utf-8");
    writeFileSync(join(workA, ".quorum-checkpoint-test-head"), `${headA}\n`, "utf-8");

    expect(
      runQuorumCapture(workA, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
        QUORUM_DISTILL_WRAPPER: distillStub,
      }).status,
    ).toBe(0);

    const shadow = "quorum/context/v1";

    const workB = mkdtempSync(join(tmpdir(), "quorum-autopush-workB-"));
    spawnSync("git", ["clone", bare, workB], { stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: workB, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "Quorum Clone"], { cwd: workB, stdio: "ignore" });

    spawnSync("git", ["fetch", "origin", `refs/heads/${shadow}:refs/heads/${shadow}`], {
      cwd: workB,
      stdio: "ignore",
    });

    const qa = join(workA, ".quorum", "config.json");
    mkdirSync(join(workB, ".quorum"), { recursive: true });
    writeFileSync(join(workB, ".quorum/config.json"), readFileSync(qa, "utf-8"), "utf-8");
    writeFileSync(
      join(workB, ".quorum/local.json"),
      `${JSON.stringify({ auto_push: true }, null, 2)}\n`,
      "utf-8",
    );

    const headB =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: workB, encoding: "utf-8" }).stdout?.trim() ?? "";
    writeFileSync(join(workB, "transcript-b.txt"), "b", "utf-8");
    writeFileSync(join(workB, ".quorum-checkpoint-test-head"), `${headB}\n`, "utf-8");

    expect(
      runQuorumCapture(workB, ["checkpoint", "--agent", "claude-code", "transcript-b.txt"], {
        QUORUM_DISTILL_WRAPPER: distillStub,
      }).status,
    ).toBe(0);
    expect(remoteShadowTip(workA, shadow)).toBe(readShadowBranchTip(workB, shadow));

    writeFileSync(join(workA, "transcript-a2.txt"), "a2", "utf-8");
    writeFileSync(join(workA, ".quorum-checkpoint-test-head"), `${headA}\n`, "utf-8");

    const rLate = runQuorumCapture(workA, ["checkpoint", "--agent", "claude-code", "transcript-a2.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
    });
    expect(rLate.status).toBe(0);
    expect(remoteShadowTip(workA, shadow)).toBe(readShadowBranchTip(workA, shadow));
  });

  it("with max push attempts capped to 1, a non-fast-forward rejection surfaces manual sync hints", () => {
    const { bare, work: workA } = bareOriginAndWorkrepo();
    const headA =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: workA, encoding: "utf-8" }).stdout?.trim() ?? "";

    runQuorumCapture(workA, ["init"]);
    writeFileSync(join(workA, ".quorum/local.json"), `${JSON.stringify({ auto_push: true }, null, 2)}\n`, "utf-8");

    writeFileSync(join(workA, "transcript.txt"), "a", "utf-8");
    writeFileSync(join(workA, ".quorum-checkpoint-test-head"), `${headA}\n`, "utf-8");

    expect(
      runQuorumCapture(workA, ["checkpoint", "--agent", "claude-code", "transcript.txt"], {
        QUORUM_DISTILL_WRAPPER: distillStub,
      }).status,
    ).toBe(0);

    const shadow = "quorum/context/v1";

    const workB = mkdtempSync(join(tmpdir(), "quorum-autopush-workBfail-"));
    spawnSync("git", ["clone", bare, workB], { stdio: "ignore" });
    spawnSync("git", ["config", "user.email", "q@test.dev"], { cwd: workB, stdio: "ignore" });
    spawnSync("git", ["config", "user.name", "Quorum Clone"], { cwd: workB, stdio: "ignore" });

    spawnSync("git", ["fetch", "origin", `refs/heads/${shadow}:refs/heads/${shadow}`], {
      cwd: workB,
      stdio: "ignore",
    });

    const qa = join(workA, ".quorum/config.json");
    mkdirSync(join(workB, ".quorum"), { recursive: true });
    writeFileSync(join(workB, ".quorum/config.json"), readFileSync(qa, "utf-8"), "utf-8");
    writeFileSync(
      join(workB, ".quorum/local.json"),
      `${JSON.stringify({ auto_push: true }, null, 2)}\n`,
      "utf-8",
    );

    const headB =
      spawnSync("git", ["rev-parse", "HEAD"], { cwd: workB, encoding: "utf-8" }).stdout?.trim() ?? "";
    writeFileSync(join(workB, "transcript-b.txt"), "b", "utf-8");
    writeFileSync(join(workB, ".quorum-checkpoint-test-head"), `${headB}\n`, "utf-8");

    expect(
      runQuorumCapture(workB, ["checkpoint", "--agent", "claude-code", "transcript-b.txt"], {
        QUORUM_DISTILL_WRAPPER: distillStub,
      }).status,
    ).toBe(0);

    writeFileSync(join(workA, "transcript-a2.txt"), "a2", "utf-8");
    writeFileSync(join(workA, ".quorum-checkpoint-test-head"), `${headA}\n`, "utf-8");

    const bad = runQuorumCapture(workA, ["checkpoint", "--agent", "claude-code", "transcript-a2.txt"], {
      QUORUM_DISTILL_WRAPPER: distillStub,
      QUORUM_SHADOW_PUSH_MAX_ATTEMPTS: "1",
    });
    expect(bad.status).toBe(1);
    expect(bad.stderr.toLowerCase()).toContain("manual");
    expect(bad.stderr).toContain("rebase");

    expect(readShadowBranchTip(workA, shadow).length).toBe(40);
    expect(remoteShadowTip(workA, shadow)).toBe(readShadowBranchTip(workB, shadow));
  });
});
