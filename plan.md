# gh-aw Demo Setup Plan

**Purpose:** Agent instructions for setting up the GitHub Agentic Workflows (gh-aw) demo environment in a new GitHub repository.

**Two-beat demo structure:**
- **Beat 1 — Big-O Auditor**: Agent reviews a PR, flags O(n²) code, suggests optimization. Shows PR-triggered workflow + comment output.
- **Beat 2 — Issue Triage**: Agent auto-labels a new issue and posts a welcome/triage comment. Shows *different* trigger (`on: issues`) and *different* safe-output (labels). Together they prove "any trigger, any output, all markdown."

**How to use this:**
1. Create a new empty GitHub repo (public or private, name it something like `gh-aw-demo`)
2. Clone it locally
3. Open in VS Code with `@mcaps` agent active
4. Say: *"Follow the plan in `plan.md` and set up the demo in this repo."*
5. Provide the agent with the local repo path

---

## Prerequisites Check (Agent: verify before starting)

Before doing anything, verify the user has the required tools installed:

```powershell
gh --version          # GitHub CLI installed (v2.40+) — needed to talk to GitHub from the terminal
gh auth status        # Confirms you're logged in to GitHub (the extension + secrets use this auth)
git --version         # Git installed — needed for clone/commit/push
python --version      # Python 3.8+ — the demo code we'll PR into the repo is Python
```

Also verify GitHub Copilot is available (this is the AI provider the agent calls):
```powershell
gh copilot --help     # Should not error — confirms your Copilot subscription is active
```

If Copilot isn't available, the demo can fall back to Claude (ANTHROPIC_API_KEY) or OpenAI (OPENAI_API_KEY).

### Update everything to latest (recommended before a live demo)

Run these in order to make sure nothing is stale on demo day:

```powershell
winget upgrade github.cli            # Upgrades the GitHub CLI (gh) itself to the latest release via Windows Package Manager
copilot update                       # Upgrades the Copilot CLI — keeps the AI provider wiring current
gh extension install githubnext/gh-aw  # First-time install of the Agentic Workflows extension (safe to re-run; no-op if already installed)
gh extension upgrade aw              # Upgrades the gh-aw extension to latest — pick up recent compiler fixes and schema changes
```

**Order matters**: upgrade `gh` first (`winget upgrade github.cli`), because the `gh extension` commands below are provided by `gh` itself. Then install/upgrade extensions.

On Mac/Linux replace `winget upgrade github.cli` with `brew upgrade gh` (or follow [cli.github.com](https://cli.github.com/) for your package manager).

If `gh` is missing entirely: `winget install GitHub.cli` then `gh auth login`.

---

## Step-by-Step Setup Tasks

### Task 1 — Install the gh-aw CLI extension

```powershell
gh extension install githubnext/gh-aw
gh aw --help
```

Verify `gh aw` commands are listed (compile, logs, audit, etc.).

### Task 2 — Navigate to the user's new repo

Ask the user for the local path if not already in it. Example:
```powershell
cd C:\Temp\GIT\gh-aw-demo
```

Verify `git status` works and we're in a GitHub-linked repo.

### Task 3 — Create the demo file structure

Create these files (preserve content exactly — see template section below):

```
├── .github/
│   └── workflows/
│       ├── big-o-auditor.md       # Beat 1: PR reviewer agent
│       └── issue-triage.md        # Beat 2: Issue triage agent
├── src/
│   └── main.py                    # Starter Python file (efficient code)
├── .gitignore                     # Python + VS Code ignores
└── README.md                      # Educational walkthrough for the audience
```

**Important**: Files to create are in the `templates/` folder next to this plan. Copy them:
- `templates/big-o-auditor.md` → `.github/workflows/big-o-auditor.md`
- `templates/issue-triage.md` → `.github/workflows/issue-triage.md`
- `templates/main.py` → `src/main.py`
- `templates/README.md` → `README.md`
- `templates/.gitignore` → `.gitignore`

### Task 4 — Compile the agentic workflows

From repo root:
```powershell
gh aw compile
```

This should:
- Read BOTH `.github/workflows/big-o-auditor.md` and `.github/workflows/issue-triage.md`
- Generate matching `.lock.yml` files for each (the hardened Actions workflows)
- Generate `.github/aw/` folder with supporting lockfiles

Verify the `.lock.yml` was created. If `gh aw compile` fails, surface the error clearly — common issues:
- Missing YAML header in the markdown file
- Invalid permissions or safe-outputs syntax
- Network issues reaching the gh-aw compile service

### Task 5 — Set the AI provider secret

The compiled workflow needs an API key. Default: GitHub Copilot.

```powershell
# For Copilot (preferred — uses existing GitHub auth)
gh secret set COPILOT_API_KEY

# Alternative: Claude
# gh secret set ANTHROPIC_API_KEY

# Alternative: OpenAI
# gh secret set OPENAI_API_KEY
```

The user will be prompted to paste the key. For live demo, check what provider the workflow file specifies in its YAML header and set the matching secret.

### Task 6 — Initial commit & push

```powershell
git add .
git commit -m "feat: add gh-aw Big-O Auditor demo"
git push
```

Verify the workflow shows up under Actions tab in the GitHub repo.

### Task 7a — Beat 1 rehearsal: Create the demo PR

Create a branch, add inefficient code, open a PR, and watch the Big-O Auditor comment.

```powershell
git checkout -b feat/add-search-function

# Agent: append the O(n²) function to src/main.py — use the content from
# templates/inefficient-snippet.py

git add src/main.py
git commit -m "feat: add record search function"
git push -u origin feat/add-search-function

# Open the PR
gh pr create --title "Add record search function" --body "Adds a function to search for matching records in our dataset."
```

Then wait for the agent to comment on the PR (~3 min per the YouTube demo). Verify the comment shows:
- Big-O complexity analysis (should flag O(n²))
- A formatted table
- Suggested optimization
- Performance impact

### Task 7b — Beat 2 rehearsal: File a sample issue

Create the labels the triage agent will apply, then open an issue and watch it get labeled + commented on.

```powershell
# Pre-create the label set (one-time setup)
$labels = @(
  @{name='bug'; color='d73a4a'},
  @{name='feature-request'; color='a2eeef'},
  @{name='question'; color='d876e3'},
  @{name='docs'; color='0075ca'},
  @{name='performance'; color='fbca04'},
  @{name='security'; color='b60205'},
  @{name='good-first-issue'; color='7057ff'},
  @{name='needs-repro'; color='e4e669'},
  @{name='needs-triage'; color='ededed'},
  @{name='duplicate-suspect'; color='cfd3d7'},
  @{name='severity:critical'; color='b60205'},
  @{name='severity:high'; color='d93f0b'},
  @{name='severity:medium'; color='fbca04'},
  @{name='severity:low'; color='c2e0c6'}
)
foreach ($l in $labels) {
  gh label create $l.name --color $l.color --force 2>$null
}

# File a sample bug issue (this will trigger the agent)
gh issue create `
  --title "App crashes when I click the export button" `
  --body "It just crashes. Please fix."
```

Wait ~2-3 min, then refresh the issue. You should see:
- Labels applied (`bug`, `needs-repro`, `severity:medium` or similar)
- A single triage comment asking for reproduction details (version, OS, exact steps, error message)

**Demo tip**: File a second, well-formed issue live on stage to contrast — e.g., "Add dark mode to settings page" — and watch it get `feature-request` instead. The contrast makes the classification visible.

### Task 8 — Post-demo cleanup prep (optional)

Create a "reset" script so the user can re-run the demo:

```powershell
# Close the PR, delete the branch, reset main
gh pr close <pr-number> --delete-branch
git checkout main
git pull
```

---

## Troubleshooting Reference

| Symptom | Fix |
|---------|-----|
| `gh aw compile` fails with "unknown command" | Re-run `gh extension install githubnext/gh-aw` |
| Workflow doesn't trigger on PR | Check `.lock.yml` has the PR trigger, verify Actions are enabled in repo settings |
| Agent posts no comment after 5 min | Check Actions run logs: `gh run list` then `gh run view <id> --log` |
| "Invalid API key" in logs | Re-set the secret: `gh secret set COPILOT_API_KEY` |
| Agent comments but misses the O(n²) | Expected for research prototype — note latency + human-in-the-loop per GitHub Next disclaimer |

---

## Success Criteria

At the end of setup, the user should be able to:
1. Show a markdown file (the agent definition) and explain it in plain English
2. Run `gh aw compile` live and show the generated `.lock.yml` files (both of them)
3. **Beat 1**: Open a PR with inefficient code → return 3 min later → show the Big-O comment
4. **Beat 2**: File an issue → return 2 min later → show the auto-applied labels + triage comment
5. Explain the contrast: same markdown structure, different trigger (`on: pull_request` vs `on: issues`), different safe-output (`add-comment` vs `add-labels`)

---

## Demo Talking Points (per slide in the deck)

- **Slide 2 (The Shift)**: "I didn't write YAML. I wrote a markdown file in English."
- **Slide 3 (How It Works)**: Show the `agent.md` file, then show the compiled `.lock.yml` — emphasize that YOU control the hardened workflow
- **Slide 4 (Security)**: Show the `permissions: read-all` in the header, emphasize the agent has no write access
- **Slide 5 (Demo)**: Walk through the PR flow live
- **Slide 6/7 (Use Cases / Alignment)**: "What else could your teams build with this?"

---

## Reference Links

- Docs: https://github.github.com/gh-aw/
- Quick Start: https://github.github.com/gh-aw/setup/quick-start/
- Examples: https://github.com/githubnext/agentics
