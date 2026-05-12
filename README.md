v0.1 beta · Claude Code only · expect rough edges · open issues freely

# quorum-cli

[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Status: Beta](https://img.shields.io/badge/status-beta-orange.svg)](#quorum-cli)

```text
 ██████╗ ██╗   ██╗ ██████╗ ██████╗ ██╗   ██╗███╗   ███╗
██╔═══██╗██║   ██║██╔═══██╗██╔══██╗██║   ██║████╗ ████║
██║   ██║██║   ██║██║   ██║██████╔╝██║   ██║██╔████╔██║
██║▄▄ ██║██║   ██║██║   ██║██╔══██╗██║   ██║██║╚██╔╝██║
╚██████╔╝╚██████╔╝╚██████╔╝██║  ██║╚██████╔╝██║ ╚═╝ ██║
 ╚══▀▀═╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝
```

Quorum is a git-native context layer that carries agent intent, decisions, touched files, and open questions into the next session automatically.

```bash
npm install -g quorum-cli
```

```bash
quorum brief src/auth/ | claude
```

In v0.1, automatic capture works for Claude Code only.

Unlike /resume, Quorum survives new terminals, new days, new teammates, and squash merges.

Quorum does not just store what happened; it assembles what the next agent needs to know for the files you are about to change.

> ⚠️ Security: Quorum sends session transcripts to Claude for distillation. Review transcripts for secrets before use, or set `QUORUM_DISTILL_WRAPPER` to add a scrubbing step.

This CLI is TypeScript, MIT licensed, and supports macOS and Linux in v0.1.

## Before and after

```text
BEFORE (manual CONTEXT.md workflow)             AFTER (quorum automatic workflow)

1) End agent session                            1) End Claude Code session
2) Open CONTEXT.md                              2) Hook captures transcript automatically
3) Re-read terminal scrollback                  3) Quorum runs headless distillation
4) Summarize intent by hand                     4) Structured JSON is committed to
5) Copy decisions and files manually               quorum/context/v1
6) Paste notes into next prompt                 5) Next session starts with:
                                                   quorum brief src/auth/ | claude
```

## Zero to first brief

Initialize once in a repository and verify hooks. After `quorum init`, run `quorum status` and confirm `claude-code: hooked`.

```bash
quorum init
quorum status
```

```text
post-rewrite: not hooked
claude-code: hooked
```

Then use Claude Code normally. When a session ends, Quorum captures the transcript and starts distillation in the background.

```bash
# use Claude Code as usual
claude

# on your next task, pull scoped context
quorum brief src/auth/
quorum brief src/auth/ | claude
```

## How brief assembly works

`quorum brief <path>` reads distilled session checkpoints from `quorum/context/v1`, filters to checkpoints that overlap the files or directories you pass, and ranks them by overlap first and recency second. It then emits pinned canonical decisions first, then ranked session decisions, then deduplicated open questions.

The token budget is the nominal limit for non-pinned context rows. In practice, this keeps the brief short enough to paste or pipe directly while still preserving pinned decisions even if they exceed budget.

```text
QUORUM // BRIEF ASSEMBLY
TARGETS: src/auth/
BUDGET: nominal 1200 tokens (canonical pins always included)
SHADOW: quorum/context/v1

CANONICAL DECISION PIN
dec-001 | src/auth/
conclusion: Store refresh tokens in httpOnly cookies rather than localStorage.
rationale: Security requirement from March 2026 audit.

SESSION
2026-05-11-2f41 | dec-018 | Token rotation behavior
conclusion: Rotate refresh token on every successful refresh call.
rationale: Limits replay window if cookie is exfiltrated.

SESSION
2026-05-10-b8aa | dec-014 | Middleware ordering
conclusion: Validate session before role checks in auth middleware.
rationale: Avoids role checks on unauthenticated requests.

OPEN QUESTIONS
- Should auth middleware return 401 or 403 for expired refresh token paths?
- Do we need device-bound refresh token metadata for SOC2 evidence?
```

## Pins and permanent decisions

Recency-based retrieval is useful for current work, but it can bury old decisions that are still binding. A security decision made in March is just as relevant in October, yet a purely recency-ranked brief will often drop it.

Pins solve that by making selected decisions canonical. A pinned decision always appears in briefs that touch its scope, regardless of when it was made.

```bash
quorum log src/auth/
quorum show <checkpoint-id>
quorum pin <checkpoint-id> <decision-id>
```

```text
CANONICAL DECISION PIN
dec-001 | src/auth/
conclusion: Store refresh tokens in httpOnly cookies rather than localStorage.
rationale: Security requirement from March 2026 audit. Do not change without revisiting that audit.
```

```bash
quorum pins
```

```bash
quorum unpin <checkpoint-id> <decision-id>
```

Unlike recency-based context tools, pinned decisions never decay. Your March architectural decision is as visible to October's agent as it was the day you made it.

## Session log and pending states

`quorum log` shows shadow-branch artifacts: distilled session checkpoints and rewrite manifests.

```bash
quorum log
```

```text
Quorum shadow log · 3 entries · quorum/context/v1 · newest first
────────────────────────────────────────────────────────────────
kind      session
id        2026-05-11-2f41
when      2026-05-11T19:33:11.000Z
intent    finalize auth refresh flow
files     src/auth/refresh.ts, src/auth/cookies.ts
agent     claude-code
commit    9f8e2a4d6e2df4c9f2a1d4f7b8c3e0a1b2c3d4e5

  quorum show 2026-05-11-2f41

────────────────────────────────────────────────────────────────
kind      rewrite
landing   c1b2a3d4e5f60718293a4b5c6d7e8f9012345678
absorbed  2 checkpoint(s): 2026-05-10-b8aa, 2026-05-10-a1cc
path      rewrite/c1b2a3d4e5f60718293a4b5c6d7e8f9012345678.json

  quorum show c1b2a3d4e5f60718293a4b5c6d7e8f9012345678

────────────────────────────────────────────────────────────────
kind      session
id        2026-05-10-b8aa
when      2026-05-10T14:08:41.000Z
intent    define auth middleware ordering
files     src/auth/middleware.ts
agent     claude-code
commit    4a3b2c1d0e9f87654321fedcba9876543210abcd

  quorum show 2026-05-10-b8aa
```

If pending captures exist under `.quorum/sessions/pending/`, `quorum log` and `quorum brief` print a warning on stderr that results may be stale and suggest running `quorum retry`.

## Vision

`quorum-cli` is the shipping primitive for a larger multiplayer workspace direction.

Full vision: [quorum-hq.github.io](https://quorum-hq.github.io)

## How this differs from Entire CLI

Based on Entire's public docs and README, Entire is positioned as a full capture and checkpoint system across multiple agents, with rewind and session-resume workflows as core primitives. See [Entire CLI README](https://github.com/entireio/cli) and [Entire CLI overview](https://docs.entire.io/cli/overview).

Quorum's v0.1 scope is narrower and opinionated around one loop: capture Claude Code sessions, distill them into structured decisions, and assemble a scoped brief for the next run with `quorum brief <path>`. The center of gravity is next-session context transfer, not replaying full prior sessions.

In practice, this means Quorum optimizes for file-overlap and recency ranking, token-budgeted brief output, and canonical decision pins that stay visible across time. The design goal is not only preserving history, but selecting what the next agent should see before it starts generating code.

## Contributing

See `CONTRIBUTING.md` for development setup and contribution workflow.

Issues and feedback are welcome.

## TECHNICAL REFERENCE

This section keeps the implementation-facing details together at the bottom.

The shadow branch model stores session checkpoints, rewrite manifests, and canonical pin state in git on `quorum/context/v1`. Product branches stay focused on product code while context history remains queryable and reviewable.

### Envelope contract

Distillation output must include exactly one JSON block wrapped with these markers.

```text
<<QUORUM_JSON>>
{"kind":"session","session_id":"<uuid>","created_at":"<ISO-8601 UTC>","agent":"<agent-id>","commit_sha":"<40-hex-sha>","intent":"<one-line summary>","decisions":[{"id":"<id>","topic":"<topic>","conclusion":"<conclusion>","rationale":"<rationale>","canonical":false}],"files_touched":["<path>"],"open_questions":["<question>"]}
<<END_QUORUM_JSON>>
```

### Distill wrappers

If `QUORUM_DISTILL_WRAPPER` is set, Quorum calls your wrapper instead of the built-in distiller.

```text
<wrapper> <agent-id> <absolute-path-to-transcript>
```

If `QUORUM_ROLLUP_DISTILL_WRAPPER` is set, rollup distillation for `quorum reconcile --rollup` uses that wrapper first.

```bash
export QUORUM_DISTILL_WRAPPER="/absolute/path/to/wrapper.sh"
quorum checkpoint --agent claude-code path/to/transcript.txt
```

### Squash-merge reconcile workflow

Local rewrites can be bridged by the `post-rewrite` hook. Server-side squash merges should be bridged by running reconcile with the landing commit.

```bash
LANDING="$(git rev-parse HEAD)"
quorum reconcile --landing "$LANDING" --pr <number>
```

A GitHub Actions example for post-merge reconcile is available at [`docs/examples/quorum-reconcile-squash-merge.yml`](docs/examples/quorum-reconcile-squash-merge.yml).

### Agent invoke matrix (v0.1)

Only `claude-code` is supported in v0.1.

```text
claude-code  -> supported + default
```

### Hook wiring details

`quorum init` creates config, ensures shadow branch, and installs hooks from merged config. `quorum install` reapplies hooks for clones that already have committed Quorum config. `quorum disable` removes Quorum-managed hooks without deleting shadow data.

When rewrite hook installation is enabled, Quorum writes this `post-rewrite` stub.

```sh
#!/bin/sh
# quorum-managed
# Quorum post-rewrite: record rewrite manifests on the shadow branch after rebase/amend.
command -v quorum >/dev/null 2>&1 || exit 0
quorum internal post-rewrite "$@" || exit 0
```

Claude Code SessionEnd hook wiring uses `.claude/settings.json` with a command entry that runs:

```text
quorum internal claude-session-end
```

### Core command surface

Use `quorum --help` for full syntax.

```text
quorum init
quorum install
quorum status
quorum disable
quorum version
quorum checkpoint --agent <id> <transcript-path>
quorum retry
quorum brief [--tokens N] [path...]
quorum pin <checkpoint-id> <decision-id>
quorum unpin <checkpoint-id> <decision-id>
quorum pins
quorum reconcile --landing <sha> [--checkpoint <id>] [--pr <number>] [--rollup]
quorum log [path-prefix]
quorum show <id-or-landing-sha> [--json]
quorum internal ...
```

`quorum reconcile` requires `--landing` and at least one of `--checkpoint` or `--pr`.

### Additional docs

For deeper implementation walkthroughs, use these example docs.

[Architecture deep dive](docs/examples/architecture.md)  
[Developer setup](docs/examples/developer-setup.md)  
[Post-rewrite hook and rewrite manifests](docs/examples/post-rewrite-hook-rewrite-manifest.md)  
[Distill wrapper guide](docs/examples/quorum-distill-wrapper.md)  
[Manual transcript checkpoint](docs/examples/manual-transcript-checkpoint.md)
