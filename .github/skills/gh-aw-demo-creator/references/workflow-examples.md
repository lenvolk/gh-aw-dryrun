# Workflow examples and SDLC extensions

Use this reference to select examples for a demo or an explicitly requested software development lifecycle extension. Source review date: 2026-10-13. Links track upstream `main`; fetch the current files before use.

## Source roles

- [Creating GitHub Agentic Workflows](https://docs.github.com/en/copilot/how-tos/github-agentic-workflows/creating-github-agentic-workflows) explains authoring, authentication, updates, and reuse. It recommends coding-agent authoring after `gh aw init`, compiling the Markdown workflow, and reviewing the result before committing.
- [gh-aw technical documentation](https://github.github.com/gh-aw/) defines supported schema, permissions, engines, and CLI behavior.
- [Awesome Copilot workflows](https://github.com/github/awesome-copilot/tree/main/workflows) supplies contributed examples. It is not a complete SDLC or Java modernization pipeline.

Use references and short adaptations rather than vendoring the collection or its compiled workflows.

## Reviewed examples

| Example | What its source does | Fit to this repository | Boundary to preserve |
|---|---|---|---|
| [relevance-check.md](https://github.com/github/awesome-copilot/blob/main/workflows/relevance-check.md) | Responds to a maintainer slash command, checks issue or PR relevance against repository evidence, and posts one comment. | Borrow its evidence gathering and human recommendation structure for Beat 2 or a future backlog check. | It does not create a modernization plan or change code. Do not replace Beat 2's classification behavior without approval. |
| [daily-issues-report.md](https://github.com/github/awesome-copilot/blob/main/workflows/daily-issues-report.md) | Creates a scheduled report issue about new, closed, and stale issues. | A small follow-up demo for project visibility. | It is a report, not a build or release gate. Resolve its report label and authentication during setup. |
| [weekly-comment-sync.md](https://github.com/github/awesome-copilot/blob/main/workflows/weekly-comment-sync.md) | Checks comments and README snippets against current code and proposes one draft PR for text-only corrections. It supports manual dispatch and a no-change result. | Borrow its narrow edit scope and one-PR limit for Beat 3 or a later documentation-maintenance agent. | It prohibits executable-code changes. Do not copy its optional release bookkeeping unless the target repo requires it. |
| [ospo-release-compliance-checker.md](https://github.com/github/awesome-copilot/blob/main/workflows/ospo-release-compliance-checker.md) | Checks release documentation, license information, and security configuration, then posts a compliance report on an issue. | Consider it for a later release-readiness report after the basic demo. | A report is advisory, not enforced approval. Missing API access means unknown, not a passing or failing check. Restrict any cross-repository target. |

For raw source, replace the example URL with `https://raw.githubusercontent.com/github/awesome-copilot/main/workflows/<filename>`. If GitHub's directory page does not render, use the public contents API or raw file links. Do not infer behavior from a filename alone.

## Adaptation checklist

1. Name the demo outcome and select only the example that supports it.
2. Review its trigger, permissions, tools, paths, output limits, and external requirements. Remove behavior unrelated to the demo.
3. Verify its fields against current technical docs and the installed gh-aw compiler. A current upstream example may use features an older compiler does not support.
4. Resolve labels, authentication, repository ownership, and actor restrictions before the session. Do not copy an organization billing choice into a personal fork.
5. Compile the adapted source and inspect the generated lockfile. If using an import, follow the [reuse guide](https://github.github.com/gh-aw/guides/reusing-workflows/) for source tracking and updates.
6. Rehearse the actual trigger, output, no-change case, failure result, and reset path. Keep human review before merging any proposed changes.

## Current demo boundaries

The repo's [runbook](../../../../plan.md) and [templates](../../../../templates) remain the operator source of truth.

- Keep Beats 1, 2, and 3 focused on review, issue triage, and a requested code fix.
- Keep Beat 4 focused on Asset Manager intent, a Markdown plan PR, human approval, and a reviewable Java upgrade result.
- Use gh-aw for Beat 4 end to end: a planner agent, then a pipeline of small agent workflows (read-only analysts in parallel, one writer at a time on a shared branch, deterministic Actions jobs for builds and tests, a conformance reviewer). Orchestrate with plain GitHub Actions calling reusable gh-aw workflows (see the OrchestratorOps pattern) and keep the two human gates.
- Do not claim that importing an Awesome Copilot workflow supplies an unattended interface to the modernization extension.

## Extend the SDLC only when requested

Add one stage at a time. Specify its input, evidence, output, stop condition, and human approval before choosing a trigger.

| Candidate stage | Required input and evidence | Proposed result | Approval or validation boundary |
|---|---|---|---|
| Request and planning | Repository evidence plus a scoped issue | Markdown plan PR | Human reviews and merges the plan. |
| Implementation | Accepted plan and identified source revision | Code PR with change and validation summary | Human reviews the code; no automatic merge. Preserve Beat 4's product handoff. |
| Test and CI diagnosis | Test command, failing run, logs, and existing test baseline | Diagnosis comment or a bounded repair proposal | Use the repository's runner to verify repairs. Limit attempts and execution time; disclose unresolved failures. |
| Documentation maintenance | Accepted code changes and current docs | Text-only draft PR, using `weekly-comment-sync` as a reference | Human verifies the wording matches behavior. |
| Release readiness | Release criteria and available evidence | Advisory compliance report | Existing required checks and human release approval remain authoritative. |

Use the gallery or `githubnext/agentics` for CI diagnosis patterns absent from the reviewed collection. Do not label a compliance comment or an LLM's test summary as an enforced CI/CD gate. Leave deployment and production feedback outside the current beginner demo.
