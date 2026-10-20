---
name: modernization-review
description: Two-axis review of the modernization diff, adapted from the code-review skill. Spec asks whether the change matches the approved plan and assessment. Standards asks whether it follows this repository's rules and stays clean. Each axis runs as its own read-only agent, in parallel.
---

# Modernization review (two axes)

Adapted from the `code-review` skill. That skill runs a Standards and a Spec review as parallel sub-agents and reports them side by side, so one axis cannot mask the other. Here each axis is its own gh-aw agent job, started in parallel by `modernize-pipeline`:

| Axis | Agent | Question |
|---|---|---|
| Spec | `modernize-conformance-reviewer` | Does the diff implement exactly what the approved plan and assessment asked for? |
| Standards | `modernize-standards-reviewer` | Does the diff follow this repository's documented rules and avoid obvious smells? |

A change can pass one axis and fail the other. Report your axis only. Never merge or re-rank findings across axes.

Both reviews are read-only. Do not edit files or create commits.

## Fixed point and inputs

- Diff: `git diff origin/main...HEAD` (three dots, so the comparison is against the merge base). Commits: `git log origin/main..HEAD --oneline`.
- Spec sources: the approved plan (path in the task), and in the same folder `assessment.md`, `findings.json` and `evidence/facts.json`.
- Standards sources: the `java-upgrade-rules` skill, plus any of `CONTRIBUTING.md`, `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/*.md` that exist.
- Verification evidence: the comment that starts with `<!-- modernize-verification -->` on the Implementation pull request (tests before and after, advisories before and after, SpotBugs before and after, static checks), and the **JUnit on JDK 21** check on the head commit. Do not re-run builds.

## Spec axis

Report:

1. Traceability, one row per finding ID in `findings.json`: ID, rank, status (Met, Not met, Cannot verify, No change), commit or file that shows it, one-line note. A finding is Met only when the diff or the verification evidence shows it.
2. Plan steps and Run Parameters: target versions in the POMs, Maven Wrapper.
3. Scope creep: every changed file or dependency that no finding or plan step mentions, and every `fix(unplanned)` commit with its reason.
4. Safety: no deleted or disabled tests, no weakened assertions, JDK `javax` packages unchanged, no changes outside `asset-manager/` and `docs/modernization/`.
5. Baseline versus final tests from the verification comment. Worse is always Not met.

Quote the plan line or finding for each Not met item.

## Standards axis

Report per file and hunk:

1. Hard violations of a documented rule. Cite the source file and rule. For this upgrade, `java-upgrade-rules` already makes these hard:
   - A test deleted, disabled (`@Disabled`, `@Ignore`), or an assertion weakened.
   - `@SuppressWarnings`, `-Xlint` changes or compiler flags added to hide a problem instead of fixing it.
   - A CVE-driven version pin removed without a recorded reason.
   - A JDK `javax` package renamed to `jakarta`.
   - Build files changed by the code fixer, or source files changed by the build upgrader.
2. Measured evidence first: the verification comment's **SpotBugs, before and after** section lists the bug patterns the upgrade introduced. Report each new one on its line. A new pattern with priority High is a hard violation; a new Medium or Low one is a judgement call. Patterns that were already there before the upgrade are out of scope; patterns the upgrade removed need no comment.
3. Judgement calls from the smell baseline below, only inside changed hunks. Label each one as a possible smell, never as a violation. A documented repository rule always overrides the baseline. Skip what a compiler or tool already enforces.

Smell baseline (Fowler, _Refactoring_, chapter 3), shortened to what a migration diff can introduce:

- Mysterious Name: a renamed type or method whose new name hides what it does.
- Duplicated Code: the same migration workaround pasted into several files instead of one shared place.
- Speculative Generality: adapters, flags or abstractions the plan did not ask for.
- Middle Man: a new class that only delegates, added to avoid touching callers.
- Message Chains: new `a.b().c().d()` navigation introduced by an API replacement.
- Shotgun Surgery: one logical change scattered across many files when a single configuration point exists.

Post up to 10 inline review comments on the exact changed lines for the most important items, then submit them as one `COMMENT` review whose body is the summary.

## Verdict

End your summary (the Spec comment, or the Standards review body) with one line that is exactly one of these two, with no bold and no other wording such as "Changes requested" or "Approved". The `finalize` job matches the exact text; any other wording counts as NEEDS ATTENTION.

- `Verdict: PASS`: no Not met item (Spec) or no hard violation (Standards). Judgement calls alone never fail Standards.
- `Verdict: NEEDS ATTENTION`: put the reasons on the following lines, not on the verdict line.

Write in the style of the `pr-description` skill: short, plain words, tables in collapsed `<details>` blocks when longer than 8 rows.
