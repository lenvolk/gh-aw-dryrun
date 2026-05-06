# Demo expansion playbook

Use this when the user asks to add a follow-up beat, create another AW demo, or adapt the current gh-aw demo for a new audience. The goal is a reliable live demo, not the most advanced workflow possible.

## Source order

1. Fetch the relevant official gh-aw reference page before using schema details:
   - Frontmatter: <https://github.github.com/gh-aw/reference/frontmatter/>
   - Triggers: <https://github.github.com/gh-aw/reference/triggers/>
   - Safe outputs: <https://github.github.com/gh-aw/reference/safe-outputs/>
   - Engines/secrets: <https://github.github.com/gh-aw/reference/engines/>
   - CLI/debugging: <https://github.github.com/gh-aw/setup/cli/> and <https://github.github.com/gh-aw/troubleshooting/debugging/>
2. Use <https://github.com/githubnext/agentics> for working examples and prompt patterns. Prefer adapting a current example over inventing YAML keys.
3. If docs and behavior disagree, inspect `gh aw version`, the generated `.lock.yml`, and relevant `githubnext/gh-aw` issues or releases.

## Demo selection criteria

Choose demos that satisfy most of these:

- One sentence story: the audience can say what happened without reading code.
- One primary trigger: PR opened, issue opened, slash command, schedule, workflow run, or label command.
- One or two visible safe outputs: comment, labels, issue, PR, review comment, artifact, or status update.
- Small setup: no external service unless it is central to the story.
- Re-runnable: easy reset commands and no irreversible repository changes.
- Different from existing beats: introduce a new trigger, safe-output type, or security/control concept.
- Compiles cleanly with the installed gh-aw version.

Avoid demos that require many secrets, organization-only configuration, paid third-party systems, large fixtures, or long-running jobs unless the user explicitly wants an advanced demo.

## Good follow-up beat patterns

| Pattern | Public examples to inspect | Trigger | Visible payoff | Safe outputs to verify |
|---|---|---|---|---|
| ChatOps fix request | `pr-fix`, `repo-ask`, command-triggered workflows | `slash_command` or `issue_comment` | Maintainer asks for help in a comment | `add-comment`, `create-pull-request`, `push-to-pull-request-branch` |
| CI failure investigator | `ci-doctor`, `ci-coach` | `workflow_run` completed with failure | Agent explains failing check and next action | `add-comment`, `create-issue`, `create-pull-request` |
| Daily status/report | `daily-repo-status`, `weekly-issue-summary`, `daily-team-status` | `schedule` or `workflow_dispatch` | New report issue with trends and recommendations | `create-issue`, `add-comment`, `upload-artifact` |
| Documentation maintainer | `update-docs`, `daily-doc-updater`, `link-checker` | `schedule`, `pull_request`, or `workflow_dispatch` | Agent opens a docs PR | `create-pull-request` |
| Issue planning assistant | `plan`, `issue-arborist`, `sub-issue-closer` | `slash_command`, `label_command`, or `issues` | Issue is broken into tasks or linked | `create-issue`, `link-sub-issue`, `add-comment` |
| Security coda | malicious scan, VEX generator, threat detection docs | `pull_request`, `schedule`, or crafted issue | Shows guardrails and blocked/sanitized output | `create-code-scanning-alert`, `add-comment`, `noop` |

## Design workflow

1. Read the current repository walkthrough and existing templates so the new beat matches the style, file names, audience, and reset flow.
2. Pick the demo story first, then choose trigger and safe outputs. Do not start from the most novel safe output.
3. Fetch the official docs for the chosen trigger, safe outputs, and engine.
4. Inspect a matching example in `githubnext/agentics` for current syntax and prompt shape.
5. Create or update only the files needed for the beat: workflow `.md`, sample fixture, walkthrough text, and optional diagram/debrief notes.
6. Include a deterministic trigger recipe: exact `gh` commands, sample PR/issue/comment body, expected wait time, expected visible output, and reset steps.
7. Run or recommend `gh aw compile`; then inspect the generated `.lock.yml` for permissions, secret names, and the job graph. Never hand-edit `.lock.yml`.

## Beat writing checklist

Each new beat should document:

- What the audience sees before the trigger.
- The exact event that triggers the workflow.
- What the agent is allowed to read.
- What the agent is allowed to request through safe outputs.
- What visible result proves the beat worked.
- What security guardrail the beat demonstrates.
- How to reset the repo for another live run.

## Recommendation rules

- For beginner demos, prefer `add-comment`, `add-labels`, and `create-issue` before code-writing outputs.
- For a "wow" follow-up, prefer `slash_command` plus `create-pull-request` if the repo already has a simple fixture to fix.
- For reliability, prefer `workflow_dispatch` alongside advanced triggers so the presenter can manually retry.
- For safety, constrain labels, title prefixes, target repos, protected files, and maximum counts in `safe-outputs:`.
- For no-op cases, instruct the agent to call `noop` with a short message.
- For public repos or fork-heavy demos, check fork filtering and role restrictions before enabling PR triggers.

## Validation

Before considering the demo ready:

1. `gh aw compile` succeeds.
2. The compiled `.lock.yml` references the expected secret and grants writes only in safe-output jobs.
3. Labels, milestones, environments, or project URLs referenced by the demo exist or are created in setup steps.
4. The walkthrough includes a trigger command and an expected output.
5. The reset flow restores the repository to a clean demo state.
