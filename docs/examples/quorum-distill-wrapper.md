# `QUORUM_DISTILL_WRAPPER` — when and how

If this variable is set, Quorum **does not** run its built-in distiller. It runs **your** program instead:

```text
<wrapper> <agent-id> <absolute-path-to-transcript>
```

(For `.js` / `.mjs` / `.cjs` paths, Quorum runs `node` on that file with the same two arguments.)

Your process must print **one** `<<QUORUM_JSON>>` … `<<END_QUORUM_JSON>>` block on stdout with valid session JSON. Everything else (hooks, shadow branch, pending/retry) stays the same.

See the root [README.md](../../README.md) for the full contract.

---

## Why use a wrapper?

| You want… | Rough idea |
|-----------|------------|
| **CI / tests** without calling real Claude | Script prints fixed or fixture JSON inside the fence. |
| **Same `claude-code` label**, different command | Wrapper calls `claude` with *your* flags, prompt, or a gateway script. |
| **Sanitize transcripts** before the model sees them | Read `$2`, strip secrets / ANSI / noise, write a temp file, point the model at it. |
| **Another binary** until defaults stabilize | Wrapper shells out to `my-tool distill …` and re-wraps or fixes JSON with `jq`. |

`--agent` is still whatever you pass to `quorum checkpoint`; the wrapper receives that string as **argv1** and should emit matching JSON `agent` (one of the supported ids).

---

## Minimal mental model (pseudocode)

```bash
# argv: agent, transcript_path
# cwd: git repo root (good for `git rev-parse HEAD`)

normalized="$(munge "$2")"           # optional
prompt="$(build_prompt "$normalized" "$1")"
out="$(my_claude_or_gateway "$prompt")"   # your invocation
json="$(extract_fence "$out")"       # lines between QUORUM markers
json="$(echo "$json" | jq --arg a "$1" --arg c "$(git rev-parse HEAD)" \
  '.agent=$a | .commit_sha=($c|ascii_downcase)')"

printf '%s\n' '<<QUORUM_JSON>>' "$json" '<<END_QUORUM_JSON>>'
```

---

## Wire-up

```bash
export QUORUM_DISTILL_WRAPPER="/absolute/path/to/your-wrapper.sh"
quorum checkpoint --agent claude-code path/to/transcript.txt
```

Use an **absolute** path if your shell cwd changes. Rollup-only override: `QUORUM_ROLLUP_DISTILL_WRAPPER` (see README).

---

## Full example: custom Claude flow (bash)

Same script lives in the repo as [`distill-wrapper-custom-claude.sh`](./distill-wrapper-custom-claude.sh). Copy it and edit the **normalization**, **prompt heredoc**, and **`claude …` line** to match your org.

```bash
#!/usr/bin/env bash
# Example QUORUM_DISTILL_WRAPPER for `--agent claude-code`:
#   - normalizes the transcript (light touch; extend as needed)
#   - builds a custom distillation prompt
#   - runs `claude --print` yourself (flags / flow you control)
#   - re-parses stdout, forces kind/agent/commit_sha, prints the Quorum envelope
#
# Usage (Quorum invokes this for you):
#   distill-wrapper-custom-claude.sh <agent-id> <absolute-transcript-path>
#
# Try locally:
#   export QUORUM_DISTILL_WRAPPER="$PWD/docs/examples/distill-wrapper-custom-claude.sh"
#   chmod +x "$QUORUM_DISTILL_WRAPPER"
#   quorum checkpoint --agent claude-code path/to/transcript.txt
#
# Requires: claude (Claude Code CLI), jq, git. Runs with cwd = repo root (Quorum sets this).

set -euo pipefail

agent="${1:-}"
transcript="${2:-}"

if [[ -z "$agent" || -z "$transcript" ]]; then
  echo "usage: $0 <agent-id> <absolute-transcript-path>" >&2
  exit 2
fi

if [[ ! -f "$transcript" ]]; then
  echo "transcript not found: $transcript" >&2
  exit 2
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not on PATH" >&2
  exit 127
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq not on PATH (brew install jq)" >&2
  exit 127
fi

head_sha="$(git rev-parse HEAD | tr '[:upper:]' '[:lower:]')"
if [[ "${#head_sha}" -ne 40 ]]; then
  echo "unexpected HEAD sha: $head_sha" >&2
  exit 1
fi

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/quorum-distill-wrap.XXXXXX")"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

normalized="$tmpdir/normalized.txt"
# Normalization examples (edit freely):
# - drop CR from Windows-style files
# - strip common ANSI SGR sequences (colors from captured terminals)
tr -d '\r' < "$transcript" \
  | sed $'s/\x1b\[[0-9;]*m//g' \
  > "$normalized"

prompt="$tmpdir/prompt.txt"
cat >"$prompt" <<EOF
You are Quorum distillation for a coding session transcript.

Read the transcript file at this absolute path (already lightly normalized on disk):
$normalized

Return exactly one block in this form (you may print short log lines, but the block must appear exactly once):
<<QUORUM_JSON>>
{"kind":"session","session_id":"<uuid>","created_at":"<ISO-8601 UTC>","agent":"$agent","commit_sha":"$head_sha","intent":"<one-line summary>","decisions":[{"id":"<id>","topic":"<topic>","conclusion":"<conclusion>","rationale":"<rationale>","canonical":false}],"files_touched":["<path>"],"open_questions":[]}
<<END_QUORUM_JSON>>

Rules:
- commit_sha must be exactly: $head_sha
- agent must be exactly: $agent
- Ground decisions in the transcript; keep text concise.
- Use a fresh UUID for session_id and a real ISO-8601 timestamp for created_at.
EOF

claude_stdout="$tmpdir/claude.out"
# You control the exact Claude invocation here (add flags your org allows).
if ! claude --print --output-format text --dangerously-skip-permissions "$(cat "$prompt")" >"$claude_stdout" 2>"$tmpdir/claude.err"; then
  echo "claude failed:" >&2
  cat "$tmpdir/claude.err" >&2
  exit 1
fi

json_body="$tmpdir/body.json"
awk '
  /^<<QUORUM_JSON>>$/ { grab=1; next }
  /^<<END_QUORUM_JSON>>$/ { grab=0 }
  grab { print }
' "$claude_stdout" >"$json_body"

if [[ ! -s "$json_body" ]]; then
  echo "no <<QUORUM_JSON>> block found in claude stdout" >&2
  echo "---- claude stdout (tail) ----" >&2
  tail -n 80 "$claude_stdout" >&2
  exit 1
fi

# Force invariants Quorum will check anyway (clearer errors if the model drifted).
jq \
  --arg kind "session" \
  --arg agent "$agent" \
  --arg commit "$head_sha" \
  '.kind = $kind | .agent = $agent | .commit_sha = $commit' \
  "$json_body" >"$tmpdir/fixed.json"

echo "<<QUORUM_JSON>>"
cat "$tmpdir/fixed.json"
echo ""
echo "<<END_QUORUM_JSON>>"
```

---

## Related

- [Manual transcript + checkpoint](./manual-transcript-checkpoint.md) — bringing your own transcript file.
