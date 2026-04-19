# gh-aw troubleshooting catalog

Match on the error text from `gh run view <id> --log-failed`. If the error isn't listed, open <https://github.github.com/gh-aw/guides/debugging/>.

## Compile-time errors (`gh aw compile` fails locally)

| Error | Cause | Fix |
|---|---|---|
| "unknown command" on `gh aw` | Extension not installed | `gh extension install githubnext/gh-aw` |
| YAML parse error on `.md` | Malformed frontmatter (missing `---`, bad indent) | Fix the YAML header; compare against an example from `githubnext/agentics` |
| "unknown key X" / schema error | Key renamed/removed in newer gh-aw | `gh aw version`, then check that version's reference docs for the current key name |

## Activation-job failures (runs on GitHub, before the agent)

| Error (from logs) | Cause | Fix |
|---|---|---|
| `None of the following secrets are set: COPILOT_GITHUB_TOKEN` | Secret missing, or set under a different name | `gh secret set COPILOT_GITHUB_TOKEN` (delete any misnamed one like `COPILOT_API_KEY`) |
| `COPILOT_GITHUB_TOKEN is a classic Personal Access Token... Classic PATs are not supported` | Token starts with `ghp_` instead of `github_pat_` | Regenerate as a fine-grained PAT (see `references/engines.md`), re-run `gh secret set COPILOT_GITHUB_TOKEN` |
| `401 Unauthorized` from Copilot API | Fine-grained PAT lacks `Copilot Chat: Read` account permission | Regenerate the PAT with the correct permissions |
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
2. `gh run view <id> --log-failed` — read the exact failure (always the first step).
3. Match on this catalog; if no match, check <https://github.github.com/gh-aw/guides/debugging/> and the gh-aw repo issues.
4. Only then propose a fix.
