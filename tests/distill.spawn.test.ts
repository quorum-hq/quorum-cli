import { describe, expect, it } from "vitest";
import { spawnDistillerWithTimeout } from "../src/distill/spawn.js";

describe("spawnDistillerWithTimeout", () => {
  it("sends SIGTERM then SIGKILL when the child exceeds the wall clock", async () => {
    const r = await spawnDistillerWithTimeout({
      command: "/bin/sh",
      args: ["-c", "sleep 30"],
      cwd: process.cwd(),
      env: { ...process.env },
      timeoutMs: 400,
      killGraceMs: 500,
    });
    expect(r.ok).toBe(false);
    if (r.ok) {
      return;
    }
    expect(r.reason).toBe("timeout");
  }, 10_000);
});
