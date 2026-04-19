# Beat 1 debrief — what to show the audience

Everything from Part 3 of `plan.md` is now visible on GitHub. Open these tabs in order and narrate as you go.

## 1. The source markdown agent (the "input")

**Open:** `gh-aw-demo/.github/workflows/big-o-auditor.md` in VS Code (or on github.com).

**Say:** *"This is the entire agent. Plain English, no YAML pipeline. The trigger (`on: pull_request`), the permissions (`read-all`), and the instructions are all in one ~30-line markdown file."*

## 2. The compiled lockfile (the "output" of `gh aw compile`)

**Open:** `.github/workflows/big-o-auditor.lock.yml` side-by-side with the `.md`.

**Say:** *"Here's the hardened Actions workflow gh-aw generated for me. Notice it's ~500 lines, pins every action to a SHA, splits into `activation / agent / detection / safe_outputs / conclusion` jobs, and only `safe_outputs` has write permission to comment. I didn't write any of this — and I can audit it before it runs."*

Point specifically at:

- `permissions: read-all` at the top (the agent job itself can't write)
- The `safe_outputs` job where `pull-requests: write` is scoped
- The `detection` job — that's the prompt-injection scanner

## 3. The PR with the agent's comment (the "proof it worked")

**Open:** <https://github.com/lenvolk/gh-aw-demo/pull/1>

**Walk through the comment:**

- The Big-O complexity analysis flagging O(n·m)
- The markdown table summarizing the issues
- The concrete code rewrite (set lookup → O(n+m))
- The closing question ("want me to apply this or leave it as demo bait?")

**Say:** *"I didn't press any button. Opening the PR fired the workflow; ~2 min later this comment appeared. Same flow would work on a 500-file monorepo PR."*

## 4. The Actions run (the "receipt")

**Open:** <https://github.com/lenvolk/gh-aw-demo/actions/workflows/big-o-auditor.lock.yml> → click the latest run.

**Show three things:**

- **Job graph**: `pre_activation → activation → agent → detection → safe_outputs → conclusion`. Each job is isolated — the `agent` job has the API key but no write scope; `safe_outputs` has the write scope but no API key.
- **Agent logs**: click the `agent` job, expand the step that ran the prompt. You can see the exact reasoning steps the model took. Audit trail for every run.
- **Duration**: total runtime (usually ~90-120 sec) — *"This cost cents, not dollars, and ran in the time it takes to refill your coffee."*

## 5. The artifacts (bonus, only if audience asks about governance)

On the run page, scroll to **Artifacts** at the bottom — gh-aw attaches the full conversation log and the detection scan result as downloadable files. Compliance teams love this.

## The one-sentence takeaway

*"I wrote English. GitHub generated hardened YAML. An AI reviewed code. A separate gated job posted the comment. Every step is auditable, and I still control the permissions — this is what 'productive ambiguity with guardrails' looks like."*

Then transition: *"Now watch the same pattern work for a completely different trigger — filing an issue."* → jump to **Part 4** of `plan.md` for Beat 2.
