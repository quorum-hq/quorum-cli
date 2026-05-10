import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripNoWaitFlag } from "../src/read-side/prepare-distilled-read.js";
import { quorumSessionsDir } from "../src/paths.js";
import {
  clearStaleDistillInflight,
  isDistillInflightActive,
  registerDistillInflight,
  unregisterDistillInflight,
} from "../src/sessions/distill-inflight.js";

describe("distill inflight markers", () => {
  it("register and unregister clear active state", () => {
    const gitRoot = mkdtempSync(join(tmpdir(), "quorum-inflight-"));
    expect(isDistillInflightActive(gitRoot)).toBe(false);
    registerDistillInflight(gitRoot);
    expect(isDistillInflightActive(gitRoot)).toBe(true);
    unregisterDistillInflight(gitRoot);
    expect(isDistillInflightActive(gitRoot)).toBe(false);
  });

  it("clears stale pid files for dead processes", () => {
    const gitRoot = mkdtempSync(join(tmpdir(), "quorum-inflight-stale-"));
    const dir = join(quorumSessionsDir(gitRoot), "distill-inflight");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "999999999.json"), `{"pid":999999999}\n`, "utf-8");
    expect(existsSync(join(dir, "999999999.json"))).toBe(true);
    clearStaleDistillInflight(gitRoot);
    expect(existsSync(join(dir, "999999999.json"))).toBe(false);
  });
});

describe("stripNoWaitFlag", () => {
  it("removes --no-wait and sets noWait", () => {
    expect(stripNoWaitFlag(["--no-wait", "a"])).toEqual({ argv: ["a"], noWait: true });
    expect(stripNoWaitFlag(["a", "--no-wait", "b"])).toEqual({ argv: ["a", "b"], noWait: true });
    expect(stripNoWaitFlag(["x"])).toEqual({ argv: ["x"], noWait: false });
  });
});
