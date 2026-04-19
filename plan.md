# gh-aw Demo — Beginner's Setup Guide

**Who this is for:** Someone who has used GitHub through the website and maybe tried GitHub Copilot in VS Code, but has never heard of "GitHub Agentic Workflows" (gh-aw). Follow this top to bottom on a fresh Windows machine and you'll have a working two-beat demo at the end.

**Time needed:** ~45 min first time (most of it is installs + waiting on the agent).

---

## What you're building (and why it's interesting)

**GitHub Agentic Workflows (gh-aw)** lets you describe an automation in plain-English markdown instead of writing a YAML GitHub Actions file. The `gh aw compile` command then *generates* a hardened `.lock.yml` workflow from your markdown. When the trigger fires (a PR opens, an issue is filed, etc.), GitHub Actions runs an AI agent that follows your markdown instructions and posts back results — comments, labels, etc.

You'll set up two of these "agents":

- **Beat 1 — Big-O Auditor**: When someone opens a Pull Request, the agent reads the changed code and posts a comment flagging slow algorithms (e.g., O(n²) loops) with a suggested fix.
- **Beat 2 — Issue Triage**: When someone files a new Issue, the agent reads it, applies labels (`bug`, `feature-request`, severity, etc.), and posts a triage comment asking for missing info.

Same building block (a markdown file), two different triggers (`pull_request` vs. `issues`), two different outputs (`add-comment` vs. `add-labels`). That contrast is the whole point of the demo.

---

## Part 1 — Quick prerequisite check

This guide assumes the following are already installed and configured. Run this one-liner in **PowerShell** to confirm everything is good:

```powershell
git --version; gh --version; gh auth status; python --version; gh aw --help | Select-Object -First 1
```

You should see, with no errors:

| Tool | Why it's needed | Expected output |
|---|---|---|
| `git` | Push code to GitHub | `git version 2.x` |
| `gh` (GitHub CLI) | Create repos, open PRs, set secrets, install extensions | `gh version 2.40+` |
| `gh auth status` | Confirms you're signed in to github.com | `Logged in to github.com as <you>` |
| `python` | The demo code we review is Python (not executed locally) | `Python 3.8+` |
| `gh aw` (gh-aw extension) | Compiles markdown agents into hardened Actions workflows | usage line for `gh aw` |
| GitHub Copilot subscription | The AI brain the workflow calls | check at <https://github.com/settings/copilot> |

**Recommended before a live demo — upgrade everything to latest:**

```powershell
winget upgrade github.cli      # upgrade gh first (extension cmds come from gh)
gh extension upgrade aw        # then upgrade the gh-aw extension
```

> **No Copilot?** You can swap to Claude (`ANTHROPIC_API_KEY`) or OpenAI (`OPENAI_API_KEY`) at Step 2.5 — change the `engine:` line in the workflow `.md` files and set the matching secret.

---

## Part 2 — Set up the demo repo

### 2.1 Create an empty GitHub repo

Go to <https://github.com/new>:
- **Repository name:** `gh-aw-demo` (or anything you like)
- **Visibility:** Private is fine for first run; you can make it public later
- **Initialize:** Leave all checkboxes UNchecked (no README, no .gitignore, no license — we'll add our own)
- Click **Create repository**

### 2.2 Clone it locally

Copy the HTTPS URL GitHub shows you (looks like `https://github.com/<you>/gh-aw-demo.git`), then in PowerShell:

```powershell
cd C:\Temp\GIT          # or wherever you keep code; create the folder if needed
git clone https://github.com/<you>/gh-aw-demo.git
cd gh-aw-demo
```

Verify with `git status` — should say "On branch main" and "nothing to commit".

### 2.3 Copy the template files into the repo

This guide ships with a `templates/` folder containing every file you need. Copy them into the new repo with the right names and folders:

```powershell
# From inside the gh-aw-demo folder. Adjust $src to where THIS guide lives:
$src = "C:\Temp\GIT\gh-aw-dryrun\templates"

New-Item -ItemType Directory -Force -Path .github\workflows, src | Out-Null

Copy-Item "$src\big-o-auditor.md" .github\workflows\big-o-auditor.md
Copy-Item "$src\issue-triage.md"  .github\workflows\issue-triage.md
Copy-Item "$src\main.py"          src\main.py
Copy-Item "$src\README.md"        README.md
Copy-Item "$src\.gitignore"       .gitignore
```

Your repo should now look like:
```
gh-aw-demo/
├── .github/workflows/
│   ├── big-o-auditor.md       # Beat 1: PR reviewer agent (markdown!)
│   └── issue-triage.md        # Beat 2: Issue triage agent (markdown!)
├── src/
│   └── main.py                # Starter Python file
├── .gitignore
└── README.md
```

**Open the two `.md` files in `.github/workflows/`** — these are the agents. Read them. Notice they're plain English with a small YAML header. That's the magic.

### 2.4 Compile the agents into real workflows

Run this from the **root of your `gh-aw-demo` repo** (the same folder you've been in since Step 2.2 — it's the one that contains the `.github/` and `src/` folders you just created). `gh aw compile` looks for `.github/workflows/*.md` relative to the current directory, so being at the repo root is how it finds both agents.

```powershell
# Confirm you're in the repo root first:
Get-Location                         # should print ...\gh-aw-demo
Test-Path .github\workflows\big-o-auditor.md   # should print True

gh aw compile
```

**What this does:** Reads each `.md` file in `.github/workflows/` and generates a matching `.lock.yml` file next to it. The `.lock.yml` is the hardened, audited GitHub Actions YAML that Actions actually runs. You don't write the YAML; you read it to understand what was generated.

**Verify:** You should now also have `.github/workflows/big-o-auditor.lock.yml` and `.github/workflows/issue-triage.lock.yml`. Open one — notice it's locked-down (read-only permissions, pinned action SHAs, etc.).

**If it fails:** Most common causes are a missing/malformed YAML header at the top of the `.md`, or you're offline. Re-read the error; it usually points at the line.

### 2.5 Set the AI provider secret

The compiled workflow needs a token to call the AI. With the default GitHub Copilot engine, the workflow reads a secret named **`COPILOT_GITHUB_TOKEN`** — the name matters, it won't work under any other name.

```powershell
gh secret set COPILOT_GITHUB_TOKEN
```

You'll be prompted to paste a value. Paste your personal access token and press Enter.

> **How to generate the token:**
> 1. Go to <https://github.com/settings/personal-access-tokens/new> — this is the **fine-grained** PAT page. The Copilot CLI engine **rejects classic PATs (`ghp_…`)**; you must use a fine-grained one (`github_pat_…`).
> 2. **Token name:** `gh-aw demo` so future-you knows what it's for.
> 3. **Expiration:** 30 or 60 days — just enough for the demo. Never pick "No expiration".
> 4. **Resource owner:** your user (or the org that owns the demo repo).
> 5. **Repository access:** *Only select repositories* → pick `gh-aw-demo`.
> 6. **Repository permissions** (all Read/Write unless noted):
>    - `Contents`: **Read**
>    - `Pull requests`: **Read and write**
>    - `Issues`: **Read and write**
>    - `Metadata`: **Read** (auto-selected)
> 7. **Account permissions:** `Copilot Chat`: **Read-only** (this is what lets the engine call Copilot's chat-completion API — the plain "Copilot" permission doesn't exist; "Copilot Editor Context" and "Copilot Requests" are for different surfaces and aren't needed).
> 8. Click **Generate token**, then **copy it immediately** — GitHub only shows it once. It will start with `github_pat_`.
> 9. Paste it when `gh secret set COPILOT_GITHUB_TOKEN` prompts you.
>
> **Prefer Claude or OpenAI instead?** Open the workflow `.md` files, change the `engine:` line in the YAML header, then `gh secret set ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (those keys come from the respective provider consoles, not GitHub).

### 2.6 Commit and push

```powershell
git add .
git commit -m "feat: add gh-aw Big-O Auditor and Issue Triage demo"
git push
```

Open your repo on github.com and click the **Actions** tab. You should see the two workflows listed (they won't have run yet — they only run when their trigger fires).

---

## Part 3 — Run Beat 1 (PR reviewer)

You'll create a branch, paste in some deliberately slow code, open a PR, and wait for the agent to review it.

```powershell
git checkout -b feat/add-search-function
```

Append the inefficient sample function to `src/main.py`:

```powershell
Get-Content "$src\inefficient-snippet.py" | Add-Content src\main.py
```

(`$src` is still set from Step 2.3. If you opened a new PowerShell window, re-set it: `$src = "C:\Temp\GIT\gh-aw-dryrun\templates"`.)

Commit, push, open the PR:

```powershell
git add src\main.py
git commit -m "feat: add record search function"
git push -u origin feat/add-search-function

gh pr create --title "Add record search function" `
             --body "Adds a function to search for matching records in our dataset."
```

The PR URL will be printed. Open it in the browser.

**What to wait for (~3 min):** A new comment appears on the PR from the workflow. It should:
- Call out O(n²) complexity in the new function
- Include a small markdown table
- Suggest an optimization (e.g., set lookup → O(n))
- Estimate the perf impact

If nothing appears after 5 minutes, jump to Troubleshooting below.

---

## Part 4 — Run Beat 2 (issue triage)

The triage agent applies labels, so first create the labels it knows about. Run this once per repo:

```powershell
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
```

Now file a vague bug report to trigger the agent:

```powershell
gh issue create `
  --title "App crashes when I click the export button" `
  --body "It just crashes. Please fix."
```

**Wait ~2-3 min, then refresh the issue.** You should see:
- Labels applied (likely `bug`, `needs-repro`, and a severity label)
- A single triage comment asking for reproduction details (version, OS, exact steps, error message)

**Bonus contrast:** File a second, well-formed issue — `gh issue create --title "Add dark mode to settings page" --body "Would love a dark theme option in Settings → Appearance."` — and watch it get `feature-request` instead. Same agent, different classification.

---

## Part 5 — Demo talking points

When showing this to others:

- **The shift:** "I didn't write YAML. I wrote a markdown file in English." Open `big-o-auditor.md` and read the first paragraph aloud.
- **Compile step:** Run `gh aw compile` live and open the generated `.lock.yml` to show the hardened YAML you didn't have to write.
- **Security:** Point at `permissions: read-all` in the lockfile — the agent can read code but can't push, can't merge, can't change settings. Outputs go through "safe outputs" (`add-comment`, `add-labels`) which are validated.
- **Two beats, one pattern:** Open both `.md` files side-by-side. Same structure, just `on: pull_request` vs `on: issues` and different safe outputs.

---

## Part 6 — Troubleshooting

| Symptom | Fix |
|---|---|
| `gh aw` says "unknown command" | Re-run `gh extension install githubnext/gh-aw` |
| `gh aw compile` fails | Check the `.md` file has a valid YAML header (between `---` markers) at the top |
| Workflow doesn't trigger on the PR | Open the repo's **Settings → Actions → General**, ensure Actions are enabled, and that workflow permissions allow comments |
| No comment after 5 min | `gh run list` to see runs, then `gh run view <id> --log` to read the full log |
| Log shows "Invalid API key" or "None of the following secrets are set" | Re-set the secret under the exact name the engine expects: `gh secret set COPILOT_GITHUB_TOKEN` |
| Log shows "COPILOT_GITHUB_TOKEN is a classic Personal Access Token... Classic PATs are not supported" | Regenerate as a **fine-grained** PAT (`github_pat_…`) per Step 2.5, then re-set the secret |
| Agent comments but misses the O(n²) | The AI is non-deterministic. Try again, or use a stronger model in the workflow's `engine:` block. |

---

## Part 7 — Reset to the starting state (so you can re-run the demo)

After running the demo you'll have: an extra branch, an open PR, an issue, and an extra function in `main.py`. Use this to get back to the clean post-Part-2 state — ready to demo again.

> **Scope:** This is a *local* reset — it cleans up branches, PRs, issues, and reverts files inside your demo repo. It does **not** delete the repo, secrets, or the labels. (Those are reusable across runs.)

Run from inside the `gh-aw-demo` folder. Make sure `$src` is still set (re-run `$src = "C:\Temp\GIT\gh-aw-dryrun\templates"` if you opened a new PowerShell window):

```powershell
# 1. Close the demo PR and delete its branch (both remote and local)
$prNumber = (gh pr list --head feat/add-search-function --json number --jq '.[0].number')
if ($prNumber) {
  gh pr close $prNumber --delete-branch
}

# 2. Close any demo issues we filed
gh issue list --state open --json number,title `
  | ConvertFrom-Json `
  | Where-Object { $_.title -in @(
      "App crashes when I click the export button",
      "Add dark mode to settings page"
    ) } `
  | ForEach-Object { gh issue close $_.number }

# 3. Make sure you're on main and synced
git checkout main
git pull

# 4. Remove the local feature branch if it still exists
git branch -D feat/add-search-function 2>$null

# 5. Restore main.py to the clean template (removes the inefficient snippet)
Copy-Item "$src\main.py" src\main.py -Force
git add src\main.py
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  git commit -m "chore: reset main.py to starting template"
  git push
}
```

After these steps your repo is back to: `main` branch only, no open PR, no open demo issues, `main.py` matches the original template. You can now re-run **Part 3** and **Part 4** for another demo.

> **If you want to start completely from scratch** (new repo, new secrets, new labels): just delete the GitHub repo via **Settings → Danger Zone → Delete this repository** and start over from **Part 2.1**.

---

## Reference Links

- gh-aw docs: <https://github.github.com/gh-aw/>
- Quick Start: <https://github.github.com/gh-aw/setup/quick-start/>
- Example agents: <https://github.com/githubnext/agentics>
