export type ReconcileCliArgs = {
  landing: string;
  checkpoints: string[];
  pr?: number;
};

export function parseReconcileArgs(argv: string[]): ReconcileCliArgs {
  let landing: string | undefined;
  const checkpoints: string[] = [];
  let pr: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--landing" && argv[i + 1]) {
      landing = argv[++i];
    } else if (a === "--checkpoint" && argv[i + 1]) {
      checkpoints.push(argv[++i]);
    } else if (a === "--pr" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i], 10);
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("--pr must be a positive integer");
      }
      pr = n;
    } else if (a) {
      throw new Error(`unexpected argument ${JSON.stringify(a)}`);
    }
  }

  if (!landing) {
    throw new Error("missing required flag --landing <sha>");
  }
  if (!/^[0-9a-f]{40}$/i.test(landing)) {
    throw new Error("--landing must be a 40-character hex git object id");
  }

  return { landing: landing.toLowerCase(), checkpoints, pr };
}
