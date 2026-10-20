#!/usr/bin/env python3
"""Create or update the single status board ('tracker') on the Modernization Request issue.

One row per stage, across both workflows: modernize-assessment (assess, approve, plan) and
modernize-pipeline (execute, verify, review). Plain jobs write to it. Agents never do.

Usage:
  modernize_tracker.py --issue 12 --stage "Build upgrade" --status done --detail "..." [--link URL]
Requires GH_TOKEN and GITHUB_REPOSITORY in the environment.
"""
import argparse
import json
import os
import subprocess
import time
import sys

MARKER = "<!-- modernize-tracker -->"
STAGES = [
    ("Request", "Request received"),
    ("Assess", "Baseline and tool evidence"),
    ("Assess", "Compatibility analysis"),
    ("Assess", "Dependency analysis"),
    ("Assess", "Assessment report"),
    ("Gate 1", "Assessment approval"),
    ("Plan", "Plan drafted"),
    ("Plan", "Plan validation"),
    ("Gate 2", "Plan approval"),
    ("Execute", "Build upgrade"),
    ("Execute", "Code fixes"),
    ("Verify", "Build and test verification"),
    ("Verify", "Static checks"),
    ("Review", "Spec review"),
    ("Review", "Standards review"),
    ("Gate 3", "Human review"),
]
STAGE_NAMES = [name for _, name in STAGES]
ICONS = {"pending": "⏳", "running": "🔄", "done": "✅", "failed": "❌", "attention": "⚠️", "skipped": "⏭️"}


def gh(*args, stdin=None, required=True):
    # The status board is cosmetic: retry transient API errors, and never fail a pipeline job over it.
    for attempt in range(4):
        result = subprocess.run(["gh", *args], input=stdin, capture_output=True, text=True, encoding="utf-8")
        if result.returncode == 0:
            return result.stdout
        time.sleep(3 * (attempt + 1))
    message = f"gh {' '.join(args)} failed: {result.stderr.strip()}"
    if required:
        sys.exit(message)
    print(f"::warning::{message}")
    return None


def parse_rows(body):
    rows = {}
    for line in body.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.startswith("|") and len(cells) >= 4 and cells[1] in STAGE_NAMES:
            rows[cells[1]] = (cells[2], cells[3])
    return rows


def parse_runs(body):
    runs = []
    for line in body.splitlines():
        if line.startswith("- Run: "):
            runs.append(line[len("- Run: "):].strip())
    return runs


def phase_status(rows, phase):
    statuses = [rows.get(name, ("pending", ""))[0].split()[-1] for p, name in STAGES if p == phase]
    for status in ("failed", "attention", "running"):
        if status in statuses:
            return status
    return "done" if all(s in ("done", "skipped") for s in statuses) else "pending"


def flow(rows):
    """show-me view of the lifecycle: one node per phase, colored by status, gates as diamonds."""
    phases = list(dict.fromkeys(p for p, _ in STAGES))
    lines = ["```mermaid", "flowchart LR"]
    for i, phase in enumerate(phases):
        node = f"P{i}"
        label = f'"{phase}"'
        lines.append(f"    {node}{{{label}}}:::{phase_status(rows, phase)}" if phase.startswith("Gate") else f"    {node}[{label}]:::{phase_status(rows, phase)}")
    lines += [f"    P{i} --> P{i + 1}" for i in range(len(phases) - 1)]
    lines += ["    classDef done fill:#b2f2bb,stroke:#2f9e44", "    classDef attention fill:#ffec99,stroke:#f08c00",
              "    classDef failed fill:#ffc9c9,stroke:#e03131", "    classDef running fill:#a5d8ff,stroke:#4a9eed",
              "    classDef pending fill:#f1f3f5,stroke:#adb5bd", "```"]
    return lines


def render(rows, runs):
    done = sum(1 for name in STAGE_NAMES if rows.get(name, ("", ""))[0].endswith(("done", "skipped")))
    lines = [
        MARKER,
        "## Modernization status",
        "",
        f"{done} of {len(STAGES)} stages done. Three human gates: approve the assessment, approve the plan (merge the plan pull request), review the Implementation pull request.",
        "",
        *flow(rows),
        "",
        "| Phase | Stage | Status | Detail |",
        "|---|---|---|---|",
    ]
    for phase, name in STAGES:
        status, detail = rows.get(name, (f"{ICONS['pending']} pending", ""))
        lines.append(f"| {phase} | {name} | {status} | {detail} |")
    if runs:
        lines += ["", "Workflow runs:", ""] + [f"- Run: {r}" for r in runs]
    lines += ["", "_Updated automatically by the modernization workflows. Re-run a failed job from its Actions run._"]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--issue", required=True)
    parser.add_argument("--stage")
    parser.add_argument("--status", choices=ICONS.keys())
    parser.add_argument("--detail", default="")
    parser.add_argument("--link", default="", help="URL appended to the detail")
    parser.add_argument("--run", default="", help="Workflow run to list once, as 'name: URL'")
    args = parser.parse_args()

    repo = os.environ["GITHUB_REPOSITORY"]
    out = gh("api", f"repos/{repo}/issues/{args.issue}/comments", "--paginate", "--jq", ".[] | {id, body}", required=False)
    if out is None:
        return
    comments = [json.loads(line) for line in out.splitlines() if line.strip()]
    existing = next((c for c in comments if MARKER in c["body"]), None)

    rows = parse_rows(existing["body"]) if existing else {}
    runs = parse_runs(existing["body"]) if existing else []
    if args.run and args.run not in runs:
        runs.append(args.run)
    if args.stage:
        if args.stage not in STAGE_NAMES:
            sys.exit(f"Unknown stage: {args.stage}")
        detail = args.detail.replace("|", "/").replace("\n", " ")
        if args.link:
            detail = f"{detail} [link]({args.link})".strip()
        rows[args.stage] = (f"{ICONS[args.status]} {args.status}", detail)

    body = render(rows, runs)
    if existing:
        gh("api", "-X", "PATCH", f"repos/{repo}/issues/comments/{existing['id']}", "-F", "body=@-", stdin=body, required=False)
    else:
        gh("api", "-X", "POST", f"repos/{repo}/issues/{args.issue}/comments", "-F", "body=@-", stdin=body, required=False)


if __name__ == "__main__":
    main()
