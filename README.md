# quorum-cli

We make your next agent session start with everything it needs to know automatically.

## Documentation

- **Squash-merge reconcile (GitHub Actions):** copy [`docs/examples/quorum-reconcile-squash-merge.yml`](docs/examples/quorum-reconcile-squash-merge.yml) into `.github/workflows/` and adjust paths. The workflow comments list required inputs and the CI-only rollup hook.

### Rollup distillation without an agent CLI

For `quorum reconcile … --rollup`, distillation uses the same agent CLI resolution as `quorum checkpoint`, except **`QUORUM_ROLLUP_DISTILL_WRAPPER` is checked first** (then `QUORUM_DISTILL_WRAPPER`, then the normal per-agent command). Point it at a small executable that prints the `<<QUORUM_JSON>>` … `<<END_QUORUM_JSON>>` envelope containing valid `kind: squash_rollup` JSON whose `commit_sha` matches `--landing`. The reconcile step **overwrites `sources`** with the checkpoint ids from the rewrite manifest, so the wrapper can emit a placeholder `sources` list.
