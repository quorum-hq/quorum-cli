import { QUORUM_ENVELOPE_END, QUORUM_ENVELOPE_START } from "./constants.js";

export class EnvelopeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeParseError";
  }
}

/** Extract the first JSON object between envelope markers; tolerates outer chatter. */
export function extractJsonFromEnvelope(stdout: string): unknown {
  const start = stdout.indexOf(QUORUM_ENVELOPE_START);
  if (start === -1) {
    throw new EnvelopeParseError(
      `missing envelope start marker ${JSON.stringify(QUORUM_ENVELOPE_START)} in distiller stdout`,
    );
  }
  const afterStart = start + QUORUM_ENVELOPE_START.length;
  const end = stdout.indexOf(QUORUM_ENVELOPE_END, afterStart);
  if (end === -1) {
    throw new EnvelopeParseError(
      `missing envelope end marker ${JSON.stringify(QUORUM_ENVELOPE_END)} in distiller stdout`,
    );
  }
  const inner = stdout.slice(afterStart, end).trim();
  try {
    return JSON.parse(inner) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new EnvelopeParseError(`JSON inside envelope is invalid: ${msg}`);
  }
}
