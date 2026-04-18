# GitHub Agentic Workflows — Hands-On Demo

Welcome! This repo is a **complete, working example** of [GitHub Agentic Workflows (gh-aw)](https://github.github.com/gh-aw/) — a new way to automate your repositories using AI agents instead of complicated YAML pipelines.

By the end of this walkthrough, you'll have:
- ✅ Installed the `gh-aw` tool
- ✅ Read your first AI agents (written in plain English!)
- ✅ Watched an agent review a pull request and suggest improvements
- ✅ Watched a second agent auto-triage a new issue with labels and a welcome comment

**Time required:** ~25 minutes
**Experience level:** None required — if you've used Git and GitHub before, you're ready

---

## What Are Agentic Workflows, In Plain English?

Think of a **regular GitHub Action** like a vending machine:
> *"If someone opens a pull request, run these 10 exact commands."*

Every outcome is pre-programmed. The machine does exactly what you tell it, no more, no less.

Now think of an **Agentic Workflow** like hiring a junior engineer:
> *"Hey, when a pull request comes in, take a look at the code. If you see anything slow or inefficient, leave a helpful comment explaining what you found and how to fix it."*

You describe the **goal**, not the steps. An AI agent figures out the details. GitHub calls this idea **"productive ambiguity"** — letting AI exercise judgment on tasks that aren't purely mechanical.

### But is it safe?

Yes. Every agent runs inside a hardened container with:
- **Read-only access** to your code (can't accidentally break anything)
- **No secrets** — API keys live in separate, isolated jobs
- **A network firewall** that only allows pre-approved destinations
- **"Safe outputs"** — the agent can *propose* changes, but a separate gated job with scoped permissions actually applies them
- **Threat detection** — an AI security scan checks for prompt injection attacks before anything is posted

You can read the full security architecture [here](https://github.github.com/gh-aw/introduction/architecture/).

---

## Part 1 — Install the Prerequisites (5 min)

### Step 1.1 — Install the GitHub CLI (`gh`)

The `gh` command lets you interact with GitHub from your terminal.

**Windows:**
```powershell
winget install GitHub.cli
```

**Mac:**
```bash
brew install gh
```

**Linux:** Follow [these instructions](https://github.com/cli/cli#installation).

Verify the install worked:
```powershell
gh --version
```
You should see something like `gh version 2.50.0` or later.

### Step 1.2 — Log in to GitHub

```powershell
gh auth login
```

Follow the prompts. Pick **GitHub.com**, **HTTPS**, and **Login with a web browser**. Your browser will open and ask you to authorize.

### Step 1.3 — Install the `gh-aw` extension

This is the tool that does the magic of turning markdown into a working AI workflow.

```powershell
gh extension install githubnext/gh-aw
```

Verify it's installed:
```powershell
gh aw --help
```
You should see a list of commands like `compile`, `logs`, `audit`.

> 💡 **What just happened?** GitHub CLI extensions are like plugins. The `gh-aw` extension adds new commands that know how to work with agentic workflows.

---

## Part 2 — Explore What's Already Here (5 min)

This repo already contains everything you need. Let's look at the pieces.

### Step 2.1 — Look at the agent definitions

Open these files in your editor:
```
.github/workflows/big-o-auditor.md
.github/workflows/issue-triage.md
```

**Notice two things:**

1. **The top part (between the `---` markers)** is YAML configuration — it says "when should this agent run?" and "what can it do?"
2. **The rest is plain English** — it's just instructions to the AI, the same way you'd explain a task to a colleague.

Those entire files ARE the workflows. No scripts, no custom code, no CI/CD expertise required. Just instructions.

**Compare the two:**

| | Big-O Auditor | Issue Triage |
|---|---|---|
| **When does it run?** | `on: pull_request` | `on: issues` |
| **What can it do?** | Post one comment | Apply up to 5 labels + post one comment |
| **What's its job?** | Find slow code | Classify new issues |

Same file structure. Totally different behavior. That's the power — one mental model, endless agents.

### Step 2.2 — Look at the starter code

Open:
```
src/main.py
```

This is a tiny Python file — just two lists of user IDs:

```python
data_1 = ["user123", "user456", "user789"] * 1000
data_2 = ["user789", "user000", "user123"] * 1000
```

That's it. No functions yet. During the demo we'll add one in a separate PR to trigger the agent.

---

## Part 3 — Compile the Workflow (2 min)

The `.md` file isn't a workflow GitHub can run directly. We need to **compile** it into a hardened Actions workflow file.

### Step 3.1 — Run the compile command

From the root of this repo:
```powershell
gh aw compile
```

You should see output like:
```
✓ Compiled .github/workflows/big-o-auditor.md
✓ Generated .github/workflows/big-o-auditor.lock.yml
✓ Compiled .github/workflows/issue-triage.md
✓ Generated .github/workflows/issue-triage.lock.yml
```

Both workflows compile from the same command. Any `.md` file in `.github/workflows/` with a valid gh-aw header gets picked up automatically.

### Step 3.2 — See what was generated

Open the new file:
```
.github/workflows/big-o-auditor.lock.yml
```

**This is a regular GitHub Actions workflow** — the same kind your team has been writing for years. But notice:
- It has `permissions: read-all` (no write access to your repo)
- It uses `runs-on: ubuntu-latest` with hardened container settings
- It has specific steps for each security layer (threat detection, safe outputs, etc.)

You didn't have to write any of that. The `gh-aw` compiler generated it from your plain-English markdown.

> 💡 **Why two files?** The markdown file is what you *edit*. The `.lock.yml` file is what GitHub *runs*. Every time you change the markdown, you re-run `gh aw compile`.

---

## Part 4 — Set Up Your AI Provider (3 min)

The agent needs to call an AI model to do its thinking. This repo is configured to use **GitHub Copilot**, but you can also use Claude or OpenAI.

### Step 4.1 — Get a Copilot API key

If you have a GitHub Copilot subscription, you already have access. Go to:
https://github.com/settings/copilot

Scroll down to find your API access token, or follow the prompts to generate one.

### Step 4.2 — Add it as a repository secret

```powershell
gh secret set COPILOT_API_KEY
```

When prompted, paste your API key. This stores it securely in GitHub — it's never visible in logs or code.

> 🔐 **Why a secret, not a file?** Secrets are encrypted by GitHub and only exposed to workflows that explicitly request them. They never appear in your commit history. The agent itself *cannot* read this secret — only the separate post-agent job can.

---

## Part 5 — Beat 1: Trigger the PR Reviewer (5 min)

Now the fun part. We'll add some deliberately slow code in a new branch, open a pull request, and watch the Big-O Auditor review it.

### Step 5.1 — Create a new branch

```powershell
git checkout -b feat/add-search-function
```

### Step 5.2 — Add an inefficient function

Open `src/main.py` and add this function above the two data lists (or append to the file — the agent will flag it either way):

```python
def find_matching_records(dataset_a, dataset_b):
    """
    Finds common elements between two datasets.
    This is intentionally inefficient (O(n*m)) for the demo.
    """
    matches = []

    # The performance bottleneck: Nested loops
    for item_a in dataset_a:
        # 'in' operator on a list is O(n), making the total O(n^2)
        if item_a in dataset_b:
            if item_a not in matches:
                matches.append(item_a)

    return matches


print(find_matching_records(data_1, data_2))
```

> 🎯 **What's wrong with this code?** The outer loop walks `dataset_a` (O(n)). Inside, `item_a in dataset_b` scans `dataset_b` linearly (another O(n)), and `item_a not in matches` does another linear scan. Overall **O(n²)**. With the 3,000-element datasets above that's ~9 million comparisons. A faster version uses `set` intersection: `list(set(dataset_a) & set(dataset_b))` — O(n), milliseconds instead of seconds.

### Step 5.3 — Commit and push

```powershell
git add src/main.py
git commit -m "feat: add record matcher function"
git push -u origin feat/add-search-function
```

### Step 5.4 — Open a pull request

```powershell
gh pr create --title "Add record matcher function" --body "Adds a function to find common elements between two datasets."
```

The command will print a URL — open it in your browser.

### Step 5.5 — Watch the magic happen

On the PR page:
1. Scroll down to the **Checks** section. You'll see the Big-O Auditor workflow running.
2. Wait ~2–3 minutes. This is a prototype — it's not instant.
3. Refresh the page. The agent will post a **comment** on your PR.

The comment should include:
- A summary of what it reviewed
- A complexity analysis table for `find_duplicates`
- A suggested optimized version (probably using a dictionary)
- An estimate of performance improvement

🎉 **Congratulations!** You just used an AI agent to review your code — and you wrote the instructions in plain English.

---

## Part 6 — Beat 2: Trigger the Issue Triage Agent (5 min)

The second agent has a completely different job. It watches for new **issues** (not PRs) and does two things at once: applies labels AND posts a welcome comment. This shows off two new concepts.

### Step 6.1 — Create the labels the agent will use

The agent can only apply labels that already exist in your repo. Run this once to create the full set:

```powershell
# Classification labels
gh label create "bug" --color "d73a4a" --force
gh label create "feature-request" --color "a2eeef" --force
gh label create "question" --color "d876e3" --force
gh label create "docs" --color "0075ca" --force
gh label create "performance" --color "fbca04" --force
gh label create "security" --color "b60205" --force
gh label create "good-first-issue" --color "7057ff" --force
gh label create "needs-repro" --color "e4e669" --force
gh label create "needs-triage" --color "ededed" --force
gh label create "duplicate-suspect" --color "cfd3d7" --force

# Severity labels (used when issue is a bug)
gh label create "severity:critical" --color "b60205" --force
gh label create "severity:high" --color "d93f0b" --force
gh label create "severity:medium" --color "fbca04" --force
gh label create "severity:low" --color "c2e0c6" --force
```

### Step 6.2 — File a sample bug issue

```powershell
gh issue create `
  --title "App crashes when I click the export button" `
  --body "It just crashes. Please fix."
```

### Step 6.3 — Watch the agent classify it

Open the URL the command printed. Within ~2 minutes you should see:

- Labels applied automatically: most likely `bug` + `needs-repro` + a severity label
- A single triage comment that:
  - Thanks the reporter
  - Explains the classification (e.g., "This looks like a bug but is missing reproduction details")
  - Asks for specific missing information as a short checklist

### Step 6.4 — Contrast with a well-formed issue

File a second issue to see how the agent handles different inputs:

```powershell
gh issue create `
  --title "Add dark mode to settings page" `
  --body "Would be great to have a toggle in Settings > Appearance to switch between light and dark themes. Happy to contribute if this is wanted."
```

This one should get `feature-request` (and possibly `good-first-issue`) — no repro request, different tone in the comment. Same agent, different output, because the agent *read* the issue and made a judgment.

🎉 **That's the second beat.** Notice: the *structure* of the two agents is identical — YAML header, plain English body. The behavior is totally different because the instructions are different.

---

## Part 7 — What Next?

Now that you've seen how it works, here are ideas for what YOUR team could build:

| You could build an agent that... | Real-world value |
|---|---|
| Auto-triages incoming issues by severity | Saves hours of manual triage per week |
| Reviews PRs for security vulnerabilities | Catches issues before they reach prod |
| Keeps your docs in sync with code changes | Ends "the docs are always out of date" |
| Generates a daily team status report as an issue | Replaces boring standup updates |
| Monitors CI failures and suggests fixes | Shortens outage recovery time |
| Reviews Terraform / Bicep for cost & compliance | Catches expensive or non-compliant IaC |

Every one of these is just a markdown file. You describe what you want, the agent figures out how.

### Official resources

- **Documentation:** https://github.github.com/gh-aw/
- **Quick start guide:** https://github.github.com/gh-aw/setup/quick-start/
- **Gallery of example workflows:** https://github.com/githubnext/agentics
- **Security architecture deep-dive:** https://github.github.com/gh-aw/introduction/architecture/
- **Blog announcement:** https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/

### Before you use this in production

⚠️ **gh-aw is a research prototype from GitHub Next.** Keep in mind:
- There's latency (a few minutes per run) — not suitable for time-critical operations
- Keep a human in the loop — review agent suggestions before auto-merging
- Start with read-only workflows (like this demo) before letting agents propose writes
- Costs depend on your AI provider — monitor your token usage

---

## Troubleshooting

### "gh aw: unknown command"
Re-run the extension install: `gh extension install githubnext/gh-aw`

### "gh aw compile failed"
Check that your `.github/workflows/big-o-auditor.md` has a valid YAML header (the section between `---` markers). Copy it fresh from the repo if you edited it.

### The workflow ran but no comment appeared
```powershell
gh run list --limit 5
gh run view <run-id> --log
```
Look for errors in the logs. Usually it's a missing or invalid API key.

### The agent posted a comment but didn't flag my code
This is a research prototype — sometimes the agent misses things. That's exactly why a human reviewer should still look at the PR. Try pushing a more obviously inefficient version and see if it catches it.

---

## Glossary

| Term | What it means |
|---|---|
| **Agent** | An AI that can understand context and make decisions, not just follow scripts |
| **Agentic workflow** | An automation driven by an AI agent instead of hard-coded logic |
| **Compile** | Converting the human-readable markdown into a machine-runnable Actions YAML |
| **Lock file** | The generated `.lock.yml` — this is what GitHub actually runs |
| **Safe outputs** | The system that lets an agent propose changes without granting it write access |
| **MCP** | Model Context Protocol — a way for agents to use tools like web search, databases, etc. |
| **Productive ambiguity** | GitHub Next's term for "letting AI exercise judgment instead of pre-coding every case" |

---

*Questions? Visit [github.github.com/gh-aw](https://github.github.com/gh-aw/) for the full documentation.*
