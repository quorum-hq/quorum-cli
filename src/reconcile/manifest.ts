export type RewriteManifestV1 = {
  kind: "rewrite";
  version: 1;
  landing_commit_sha: string;
  absorbed_checkpoint_ids: string[];
  pr_number?: number | null;
};

export class RewriteManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RewriteManifestError";
  }
}

function isHexSha40(s: string): boolean {
  return /^[0-9a-f]{40}$/i.test(s);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseRewriteManifestRecord(raw: unknown, fileHint: string): RewriteManifestV1 {
  if (!isPlainObject(raw)) {
    throw new RewriteManifestError(`${fileHint}: rewrite manifest root must be an object`);
  }
  if (raw.kind !== "rewrite") {
    throw new RewriteManifestError(`${fileHint}: expected kind \"rewrite\", got ${JSON.stringify(raw.kind)}`);
  }
  if (raw.version !== 1) {
    throw new RewriteManifestError(`${fileHint}: unsupported rewrite manifest version ${JSON.stringify(raw.version)}`);
  }
  const landing = raw.landing_commit_sha;
  if (typeof landing !== "string" || !isHexSha40(landing)) {
    throw new RewriteManifestError(`${fileHint}: landing_commit_sha must be a 40-character hex git object id`);
  }
  const idsRaw = raw.absorbed_checkpoint_ids;
  if (!Array.isArray(idsRaw) || !idsRaw.every((x) => typeof x === "string" && x.length > 0)) {
    throw new RewriteManifestError(`${fileHint}: absorbed_checkpoint_ids must be an array of non-empty strings`);
  }
  const out: RewriteManifestV1 = {
    kind: "rewrite",
    version: 1,
    landing_commit_sha: landing.toLowerCase(),
    absorbed_checkpoint_ids: [...idsRaw],
  };
  if ("pr_number" in raw && raw.pr_number !== undefined) {
    if (raw.pr_number === null) {
      out.pr_number = null;
    } else if (typeof raw.pr_number === "number" && Number.isInteger(raw.pr_number)) {
      out.pr_number = raw.pr_number;
    } else {
      throw new RewriteManifestError(`${fileHint}: pr_number must be an integer or null`);
    }
  }
  return out;
}

export function serializeRewriteManifest(m: RewriteManifestV1): string {
  return `${JSON.stringify(m, null, 2)}\n`;
}

/** Return a validated rewrite manifest or null if JSON is not a rewrite document. */
export function tryParseRewriteManifestJson(rawText: string, fileHint: string): RewriteManifestV1 | null {
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
  if (!isPlainObject(raw) || raw.kind !== "rewrite") {
    return null;
  }
  try {
    return parseRewriteManifestRecord(raw, fileHint);
  } catch {
    return null;
  }
}
