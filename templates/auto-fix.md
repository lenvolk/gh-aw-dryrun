---
on:
  slash_command:
    name: fix
    events: [pull_request_comment]

permissions:
  contents: read
  pull-requests: read
  issues: read

engine: copilot

safe-outputs:
  create-pull-request:
    title-prefix: "[ai] "
    labels: [ai-fix, automation]
    draft: false
    max: 1
---

# Auto-Fix Agent

You close the loop on the Big-O Auditor. When a reviewer comments `/fix` on a pull request that was flagged by the auditor, you apply the suggested optimization and open a follow-up pull request against that PR's branch.

## Context you have

- The triggering pull request and all of its comments (you can read them).
- The repository contents at the PR branch (checked out automatically).
- The file most likely to need changes is `src/main.py`.

## Your task

1. **Find the audit.** Read the most recent comment on this pull request that came from the Big-O Auditor workflow. It contains:
   - The name of an inefficient function (typically in `src/main.py`).
   - A proposed optimized rewrite in a fenced code block.
   - A new Big-O complexity estimate.

2. **Apply the fix.** Replace the flagged function in `src/main.py` with the optimized version from the audit comment. Keep the function signature identical so existing callers do not break. Do not touch any other file.

3. **Open a pull request.** Use the `create-pull-request` safe output to open a new PR with:
   - **Title:** `Optimize <function_name> to <new complexity>` (e.g. `Optimize find_matching_records to O(n)`)
   - **Base branch:** the head branch of the triggering pull request (so this PR stacks on top of it).
   - **Body:** a short markdown summary that includes:
     - One sentence describing the change.
     - A "Based on audit in #<PR number>" line linking back to the triggering PR.
     - The before/after complexity (e.g. `O(n²) → O(n)`).

4. **No audit found?** If you cannot locate a Big-O Auditor comment on this PR, call the `noop` safe output with a short message explaining that there is nothing to fix. Do not open an empty PR.

## Guardrails

- Only edit `src/main.py`. Do not modify workflows, the README, or any other file.
- Preserve the function's public name and signature.
- Do not invent an optimization the auditor did not propose — copy the rewrite from the comment.
- Keep the PR focused on the single flagged function.

## Tone

Be concise and factual in the PR body. This is a bot-authored PR that a human will review before merging — make their job easy.
