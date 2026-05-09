import { describe, expect, it } from "vitest";
import { spawnDistillerWithTimeout } from "../src/distill/spawn.js";

describe("spawnDistillerWithTimeout", () => {
  it("sends SIGTERM then SIGKILL when the child exceeds the wall clock", async () => {
    // Use Node as the child so Linux (dash) vs macOS (bash) /bin/sh signal semantics do not flake;
    // a long `setTimeout` ignores normal completion until signaled.
    const r = await spawnDistillerWithTimeout({
      command: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1_000_000)"],
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
