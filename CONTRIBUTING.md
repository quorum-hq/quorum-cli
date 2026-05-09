# Contributing to quorum-cli

Two kinds of contribution move this project forward.

## 1. Tell us what broke (or what you need)

Bug reports, unclear docs, and sharp edges in real workflows are welcome. Open a **GitHub issue** with what you expected, what happened, and your environment (OS, Node version, `quorum` version). If you prefer email, use [kachhwalvansh230@gmail.com](mailto:kachhwalvansh230@gmail.com).

For **security-sensitive** reports, do **not** use a public issue. Follow [SECURITY.md](SECURITY.md) (private vulnerability reporting).

## 2. Ship a pull request

Small fixes (tests, docs, bugfixes) can go straight to a PR. For **larger** changes (new commands, hook behavior, distill pipeline), open an issue first so we can align on direction.

### Running tests

```bash
npm install
npm test
```

`npm test` runs a production build (`tsc`) then `vitest run`.

### Style

- Match existing TypeScript style; the project uses **strict** mode.
- Keep changes focused: **one concern per PR** when practical.
- If you touch behavior, add or update tests when it makes sense.

## Scope (what we're optimizing for right now)

- **In scope for PRs:** CLI reliability, tests, docs, and improvements that match the current architecture (checkpoints, hooks, distill wrappers, git/shadow flows).
- **Expect coordination:** new first-class agent integrations beyond what's documented in the README; those depend on upstream CLI stability.

Thanks for helping make quorum-cli better for everyone who runs it.
