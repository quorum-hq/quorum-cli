import { describe, expect, it } from "vitest";
import { QUORUM_ENVELOPE_END, QUORUM_ENVELOPE_START } from "../src/envelope/constants.js";
import { extractJsonFromEnvelope, EnvelopeParseError } from "../src/envelope/extract.js";

describe("extractJsonFromEnvelope", () => {
  it("parses JSON between markers with leading and trailing chatter", () => {
    const stdout = `Welcome to FooCLI 1.0
${QUORUM_ENVELOPE_START}
{"ok":true,"n":2}
${QUORUM_ENVELOPE_END}
done.
`;
    expect(extractJsonFromEnvelope(stdout)).toEqual({ ok: true, n: 2 });
  });

  it("throws when start marker is missing", () => {
    expect(() => extractJsonFromEnvelope('{"x":1}')).toThrow(EnvelopeParseError);
  });

  it("throws when end marker is missing", () => {
    expect(() =>
      extractJsonFromEnvelope(`${QUORUM_ENVELOPE_START}\n{"x":1}\n`),
    ).toThrow(EnvelopeParseError);
  });
});
