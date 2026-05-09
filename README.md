# quorum-cli

We make your next agent session start with everything it needs to know automatically.

## Documentation

- **Squash-merge reconcile (GitHub Actions):** copy [`docs/examples/quorum-reconcile-squash-merge.yml`](docs/examples/quorum-reconcile-squash-merge.yml) into `.github/workflows/` and adjust paths. The workflow comments list required inputs and the CI-only rollup hook.

## Agent invoke matrix (v0.1)

Quorum currently supports production hook auto-capture only for:

- `claude-code`

Other GA agents are still work-in-progress for auto-capture hook integration:

- `cursor`
- `gemini-cli`
- `opencode`
- `codex`

For these WIP agents, `quorum init` / `quorum install` intentionally do **not** install agent hooks yet (no-op for hook wiring).

### Distill invocation (`quorum checkpoint`, `quorum retry`)

- **Primary override:** `QUORUM_DISTILL_WRAPPER` (all agents). Quorum invokes the wrapper as `<wrapper> <agent-id> <transcript-path>` (or `node <wrapper> ...` for `.js/.mjs/.cjs` wrappers).
- **Envelope contract:** stdout may include chatter, but must include exactly one `<<QUORUM_JSON>> ... <<END_QUORUM_JSON>>` JSON block.
- **Fallback behavior:** if wrapper is unset, Quorum uses per-agent defaults:
  - `claude-code` -> `claude --print --output-format text --dangerously-skip-permissions "<prompt>"`
  - `cursor` -> `cursor quorum-distill --transcript <path>`
  - `gemini-cli` -> `gemini quorum-distill --transcript <path>`
  - `opencode` -> `opencode quorum-distill --transcript <path>`
  - `codex` -> `codex exec --skip-git-repo-check "<prompt>"`

### Auto-capture hook wiring (`quorum init`, `quorum install`, `quorum disable`)

- Quorum only installs hooks for agents that are enabled in `.quorum/config.json` (`agents` array).
- Hook surfaces:
  - Claude Code -> `.claude/settings.json` `hooks.SessionEnd`
  - Cursor/Gemini/OpenCode/Codex -> not installed yet (WIP, no-op)
- Hook commands call `quorum internal <agent>-session-end`, which persists transcript captures to `.quorum/sessions/captures/` and then runs the same distill/pending pipeline as manual checkpoints.

### Known limitations

- Non-Claude default distill commands are placeholders pending final upstream CLI command stabilization for Cursor/Gemini/OpenCode; set `QUORUM_DISTILL_WRAPPER` for deterministic CI/local behavior.
- Session-end payload parsing currently expects a JSON payload with a transcript path key (`transcript_path`, `transcriptPath`, `transcript_file`, or `transcriptFile`, optionally under `session`).
- Quorum does not redact secrets in captured transcripts before distillation (security notice is printed on init).

### Rollup distillation without an agent CLI

For `quorum reconcile … --rollup`, distillation uses the same agent CLI resolution as `quorum checkpoint`, except **`QUORUM_ROLLUP_DISTILL_WRAPPER` is checked first** (then `QUORUM_DISTILL_WRAPPER`, then the normal per-agent command). Point it at a small executable that prints the `<<QUORUM_JSON>>` … `<<END_QUORUM_JSON>>` envelope containing valid `kind: squash_rollup` JSON whose `commit_sha` matches `--landing`. The reconcile step **overwrites `sources`** with the checkpoint ids from the rewrite manifest, so the wrapper can emit a placeholder `sources` list.
