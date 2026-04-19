# Two-beat reference demo

This is the canonical gh-aw demo — it proves "any trigger, any output, all markdown" in ~10 minutes of live time. Use this structure unless the user has a different scenario in mind.

## Target repo layout

```
<demo-repo>/
├── .github/
│   └── workflows/
│       ├── big-o-auditor.md       # Beat 1: PR reviewer
│       └── issue-triage.md        # Beat 2: issue triager
├── src/
│   └── main.py                    # Efficient starter code
├── .gitignore
└── README.md                      # Audience-facing explainer
```

After `gh aw compile`, two `.lock.yml` files appear alongside the `.md` files. Those are what Actions runs.

## Beat 1 — Big-O Auditor (PR reviewer)

| Frontmatter field | Value |
|---|---|
| `on:` | `pull_request` (types: `[opened, synchronize, reopened]`) |
| `permissions:` | `read-all` (agent job only reads) |
| `engine:` | Copilot (or whichever engine is configured) |
| `safe-outputs:` | `add-comment` (one comment on the PR) |

**Agent prompt:** read changed Python files in the PR, detect inefficient algorithms (O(n²) nested loops, repeated list scans), post a single comment with (1) complexity analysis in a markdown table, (2) a concrete optimized rewrite, (3) expected performance impact.

**Demo trigger:** create a branch, append an intentionally inefficient function (e.g., nested-loop `find_matching_records`) to `src/main.py`, open a PR. Comment should appear in ~2-3 min.

## Beat 2 — Issue Triage

| Frontmatter field | Value |
|---|---|
| `on:` | `issues` (types: `[opened]`) |
| `permissions:` | `read-all` |
| `safe-outputs:` | `add-labels` and `add-comment` |

**Agent prompt:** read the issue title and body, classify by type (`bug` / `feature-request` / `question` / `docs`) and severity (`severity:critical…low`), apply the appropriate labels, post one comment requesting any missing info (repro steps, version, OS, error text).

**Pre-req:** the labels must exist in the repo before the first issue is filed. Create them once:

```powershell
$labels = @(
  @{name='bug'; color='d73a4a'},
  @{name='feature-request'; color='a2eeef'},
  @{name='question'; color='d876e3'},
  @{name='needs-repro'; color='e4e669'},
  @{name='severity:critical'; color='b60205'},
  @{name='severity:high'; color='d93f0b'},
  @{name='severity:medium'; color='fbca04'},
  @{name='severity:low'; color='c2e0c6'}
)
foreach ($l in $labels) { gh label create $l.name --color $l.color --force 2>$null }
```

**Demo trigger:** `gh issue create --title "App crashes when I click export" --body "It just crashes. Please fix."` — expect `bug` + `needs-repro` + severity label + a triage comment. Contrast with a well-formed feature request to show different classification.

## Reset flow (so the demo can be re-run)

1. `gh pr close <n> --delete-branch`
2. Close demo issues (`gh issue close <n>`)
3. `git checkout main; git pull`
4. Restore `main.py` from the original starter template
5. Commit the reset

Keep secrets and labels — they are reusable across runs.

## Why this demo works

- Two triggers from one skill (`pull_request` + `issues`) → proves it's not just a "code review bot"
- Two safe-output types (`add-comment` + `add-labels`) → proves the gated-write pattern generalizes
- Same compile step for both → proves the markdown-to-hardened-YAML pipeline
- Non-deterministic output (judgment calls) → shows "productive ambiguity with guardrails"

## Authoritative templates

Before writing the two `.md` files, fetch:

- <https://github.com/githubnext/agentics> — working examples for both triggers
- <https://github.github.com/gh-aw/reference/frontmatter/> — valid keys for this version
- <https://github.github.com/gh-aw/reference/safe-outputs/> — exact names and permission models for `add-comment` / `add-labels`
