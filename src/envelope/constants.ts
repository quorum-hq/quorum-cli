/**
 * Documented stdout envelope for distiller output (v0.1).
 * Agent CLIs may print banners; only the fenced JSON block is parsed.
 */
export const QUORUM_ENVELOPE_START = "<<QUORUM_JSON>>";
export const QUORUM_ENVELOPE_END = "<<END_QUORUM_JSON>>";
