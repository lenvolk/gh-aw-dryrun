# gh-aw troubleshooting catalog

Start with `gh aw audit <run-id>` and `gh aw logs`. Use `gh run view <run-id> --log-failed` for raw failed-step logs. If the error is not listed, open <https://github.github.com/gh-aw/troubleshooting/debugging/> and <https://github.github.com/gh-aw/troubleshooting/common-issues/>.

## Compile-time errors (`gh aw compile` fails locally)

| Error | Cause | Fix |
|---|---|---|
| "unknown command" on `gh aw` | Extension not installed | `gh extension install github/gh-aw` |
| YAML parse error on `.md` | Malformed frontmatter (missing `---`, bad indent) | Fix the YAML header; compare against an example from `githubnext/agentics` |
| "unknown key X" / schema error | Key renamed/removed in newer gh-aw | `gh aw version`, then check that version's reference docs for the current key name |

## Activation-job failures (runs on GitHub, before the agent)

| Error (from logs) | Cause | Fix |
|---|---|---|
| `None of the following secrets are set: COPILOT_GITHUB_TOKEN` | PAT fallback selected but secret is missing or misnamed | Set `COPILOT_GITHUB_TOKEN`, or use `copilot-requests: write` when organization billing is available |
| `COPILOT_GITHUB_TOKEN is a classic Personal Access Token... Classic PATs are not supported` | Token starts with `ghp_` instead of `github_pat_` | Regenerate as a fine-grained PAT (see `references/engines.md`), re-run `gh secret set COPILOT_GITHUB_TOKEN` |
| OAuth or GitHub App token rejected for `COPILOT_GITHUB_TOKEN` | Unsupported token type | Use a fine-grained PAT |
| `401 Unauthorized` or PAT permission error from Copilot | PAT lacks `Copilot Requests: Read`, or owner lacks Copilot access | Regenerate the PAT with the correct account permission and verify the owner's license |
| `403 Forbidden` with `copilot-requests: write` | Organization token lacks centralized Copilot inference access | Verify organization billing, or use `COPILOT_GITHUB_TOKEN` |
| Workflow doesn't trigger at all | Actions disabled, or `permissions` / workflow-write disabled in repo settings | Repo **Settings → Actions → General**: enable Actions, allow read/write for workflows where applicable |

## Agent-job failures (agent runs but produces wrong/no output)

| Symptom | Cause | Fix |
|---|---|---|
| Agent posts comment but misses the Big-O issue (or similar judgment miss) | Non-deterministic model output | Re-run, or switch to a stronger model via `engine:` frontmatter |
| No comment after 5 min, activation succeeded | Downstream `safe_outputs` job failed or was skipped | `gh run view <id> --log` and inspect each job; look at `detection` job (prompt-injection scanner may have blocked the output) |
| `detection` job flags the agent's own output | Agent output triggered the safety scanner | Revise the agent prompt to produce cleaner output; or investigate whether an actual injection occurred |

## Re-triggering a workflow without a new commit

- Close and reopen the PR: `gh pr close <n>; gh pr reopen <n>` (fires `pull_request` again)
- Rerun failed jobs: `gh run rerun <run-id> --failed`
- Manually dispatch if the workflow has `on: workflow_dispatch`: `gh workflow run <name>.lock.yml`

## Investigation workflow

1. `gh run list --limit 5` — find the failing run ID.
2. `gh aw audit <id>` and `gh aw logs` — inspect the gh-aw audit trail and logs.
3. `gh run view <id> --log-failed` — inspect raw failed-step output when needed.
4. Match on this catalog; if no match, check <https://github.github.com/gh-aw/troubleshooting/debugging/>, common issues, and the `github/gh-aw` issues.
5. Only then propose a fix.
