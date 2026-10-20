#!/usr/bin/env python3
"""Estimate and report the cost of the modernization pipeline: Copilot AI credits and GitHub Actions minutes.

estimate: project the AI cost of a stage before a human approves it. The token profile per role
          was measured on a real pipeline run; prices come from the GitHub Copilot pricing page.
actual:   sum the credits that gh-aw recorded for the agents of a finished run.
predict:  at gate 1, the predicted cost of every stage: AI tokens and credits, and runner minutes.
          Minutes come from this repository's own past runs, or from a measured baseline when there are none.
render:   print the predicted cost table from the JSON that predict wrote.
compare:  at the end of execution, actual against predicted for every stage.

Usage:
  modernize_cost.py estimate --stages assessment,plan,execution [--format md|json]
  modernize_cost.py actual --artifacts <dir with *-info and *-usage artifacts> [--format md|json]
  modernize_cost.py predict --repo owner/name --run <run id> --usage <dir> --facts facts.json --out cost-estimate.json
  modernize_cost.py render --estimate cost-estimate.json
  modernize_cost.py compare --repo owner/name --run <run id> --usage <dir> --estimate cost-estimate.json [--out compare.json]

1 AI credit = 0.01 USD. Estimates are a range, not a quote: tokens vary by model, by run, and by
how many build and fix iterations the code fixer needs.
"""
import argparse
import datetime
import json
import math
import os
import pathlib
import re
import subprocess
import sys
import tempfile

PRICING_SOURCE = "https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing"
PRICING_DATE = "2026-10-19"

# USD per 1 million tokens: input, cached input, cache write (None = the model has no cache-write price), output.
PRICES = {
    "gpt-5-mini": (0.25, 0.025, None, 2.00),
    "gpt-5.3-codex": (1.75, 0.175, None, 14.00),
    "gpt-5.4": (2.50, 0.25, None, 15.00),
    "gpt-5.4-mini": (0.75, 0.075, None, 4.50),
    "gpt-5.4-nano": (0.20, 0.02, None, 1.25),
    "gpt-5.5": (5.00, 0.50, None, 30.00),
    "gpt-5.6-luna": (0.20, 0.02, 0.25, 1.20),
    "gpt-5.6-terra": (2.00, 0.20, 2.50, 12.00),
    "gpt-5.6-sol": (4.00, 0.40, 5.00, 20.00),
    "gpt-6-luna": (0.10, 0.01, 0.125, 0.50),
    "gpt-6-sol": (2.00, 0.20, 2.50, 10.00),
    "gpt-6.1-sol": (2.00, 0.10, 2.50, 10.00),
    "claude-haiku-4.5": (1.00, 0.10, 1.25, 5.00),
    "claude-haiku-5.5": (0.10, 0.01, 0.125, 0.50),
    "claude-sonnet-4": (3.00, 0.30, 3.75, 15.00),
    "claude-sonnet-4.6": (3.00, 0.30, 3.75, 15.00),
    "claude-sonnet-5": (2.00, 0.20, 2.50, 10.00),
    "claude-sonnet-5.5": (2.00, 0.10, 2.50, 10.00),
    "claude-opus-5.5": (4.00, 0.20, 5.00, 20.00),
}

# Tokens per agent run, measured on the full pre-run of 2026-10-19 (assessment and plan run 39338189682,
# execution run 39346443059): requests, input, output, cache read, cache write. Every gh-aw agent run is
# followed by a threat-detection job that reviews its output on the same model; it is measured separately.
PROFILES = {
    "modernize-compat-analyst": {"tokens": (16, 438406, 7530, 371440, 0), "detection": (2, 48382, 273, 21883, 0)},
    "modernize-dependency-analyst": {"tokens": (11, 5079, 18366, 660299, 98159), "detection": (2, 13581, 821, 19157, 26637)},
    "modernize-planner": {"tokens": (12, 6339, 9287, 489874, 62665), "detection": (2, 17976, 174, 18909, 43488)},
    "modernize-build-upgrader": {"tokens": (11, 6351, 6538, 406419, 46367), "detection": (2, 18287, 542, 18904, 39448)},
    "modernize-code-fixer": {"tokens": (13, 6526, 4062, 475152, 44352), "detection": (2, 18456, 176, 18909, 41544)},
    "modernize-conformance-reviewer": {"tokens": (10, 5439, 6032, 389220, 53754), "detection": (2, 17271, 155, 26875, 27472)},
    "modernize-standards-reviewer": {"tokens": (11, 6412, 5126, 408027, 51125), "detection": (3, 17107, 414, 63283, 27600)},
}
# Low and high multipliers around the measured point. The code fixer loops, so its range is wider.
BAND = {"default": (0.7, 1.8), "modernize-code-fixer": (0.7, 3.0)}
STAGES = {
    "assessment": ["modernize-compat-analyst", "modernize-dependency-analyst"],
    "plan": ["modernize-planner"],
    "execution": ["modernize-build-upgrader", "modernize-code-fixer", "modernize-conformance-reviewer", "modernize-standards-reviewer"],
}
STAGE_TITLES = {"assessment": "Assessment", "plan": "Plan", "execution": "Execution"}

# GitHub Actions: standard Linux 2-core x64 runner. Free on public repositories; billed per job, each job
# rounded up to a whole minute, on private ones. The Software Factory sets MODERNIZE_ACTIONS_USD_PER_MINUTE
# from its catalog; this default is used when the variable is missing.
ACTIONS_RATE_SOURCE = "https://docs.github.com/en/billing/reference/actions-runner-pricing"
ACTIONS_RATE_DATE = "2026-10-20"
ACTIONS_RATE_DEFAULT = 0.006
# Which workflow runs each stage, the top-level jobs that belong to it, and the job that proves it completed.
STAGE_JOBS = {
    "assessment": ("modernize-assessment.yml", {"prepare", "assessment-facts", "modernize-compat-analyst", "modernize-dependency-analyst",
                                                "track-analysis", "assessment-report"}, "assessment-report"),
    "plan": ("modernize-assessment.yml", {"assessment-approval", "open-plan-pr", "modernize-planner", "plan-ready"}, "plan-ready"),
    "execution": ("modernize-pipeline.yml", None, "finalize"),
}
# Billed runner minutes per top-level job when this repository has no past run to measure. Reconstructed from the
# timeline of the issue 35 pre-run of 2026-10-20 (its job logs were deleted with the run); each gh-aw agent call
# bills six jobs. Jobs that build or test scale with the lines of Java code, relative to the 1,287 lines measured then.
RUNNER_BASELINE_LOC = 1287
RUNNER_BASELINE = {
    "assessment": {"prepare": 1, "assessment-facts": 6, "modernize-compat-analyst": 9, "modernize-dependency-analyst": 9,
                   "track-analysis": 1, "assessment-report": 1},
    "plan": {"assessment-approval": 1, "open-plan-pr": 1, "modernize-planner": 9, "plan-ready": 1},
    "execution": {"prepare": 1, "modernize-build-upgrader": 9, "modernize-code-fixer": 10, "track-build": 1, "verify-build": 3,
                  "verify-static": 1, "modernize-conformance-reviewer": 9, "modernize-standards-reviewer": 11, "finalize": 1},
}
SIZE_SCALED = {"assessment-facts", "modernize-code-fixer", "verify-build"}


def workflow_model(name, workflows):
    path = pathlib.Path(workflows) / f"{name}.md"
    if not path.exists():
        return None
    front = path.read_text(encoding="utf-8").split("---")[1]
    match = re.search(r"(?m)^engine:\s*\n(?:\s+.*\n)*?\s+model:\s*([\w.\-]+)", front)
    return match.group(1) if match else None


def credits(model, inp, out, cache_read, cache_write):
    price = PRICES.get(model)
    if not price:
        return None
    p_in, p_cached, p_write, p_out = price
    if model.startswith("gpt-"):
        # OpenAI reports cached tokens inside input_tokens; bill them once, at the cached rate.
        inp = max(0, inp - cache_read)
    # Models without a cache-write price bill those tokens as normal input.
    write_price = p_write if p_write is not None else p_in
    usd = (inp * p_in + cache_read * p_cached + cache_write * write_price + out * p_out) / 1_000_000
    return usd * 100


def estimate_rows(stages, workflows):
    rows = []
    for stage in stages:
        for name in STAGES[stage]:
            model = workflow_model(name, workflows) or "unknown"
            req, *tokens = PROFILES[name]["tokens"]
            point = credits(model, *tokens)
            low, high = BAND.get(name, BAND["default"])
            d_req, *d_tokens = PROFILES[name]["detection"]
            detect = credits(model, *d_tokens)
            rows.append({
                "stage": stage, "agent": name, "model": model, "requests": req,
                "input": tokens[0], "output": tokens[1], "cache_read": tokens[2], "cache_write": tokens[3],
                "credits": point, "low": point * low if point is not None else None, "high": point * high if point is not None else None,
                "detection_credits": detect,
            })
    return rows


def fmt_tokens(value):
    return f"{value / 1000:.1f}K" if value < 1_000_000 else f"{value / 1_000_000:.2f}M"


def fmt_credits(value):
    return "n/a" if value is None else f"{value:.1f}"


def fmt_usd(value):
    return "n/a" if value is None else f"${value / 100:.2f}"


def estimate_markdown(rows):
    lines = ["| Stage | Agent | Model | Requests | Input | Output | Cache read | Cache write | AI credits (range) | USD (range) |",
             "|---|---|---|---:|---:|---:|---:|---:|---|---|"]
    for r in rows:
        lines.append(f"| {STAGE_TITLES[r['stage']]} | `{r['agent']}` | `{r['model']}` | ~{r['requests']} | {fmt_tokens(r['input'])} | {fmt_tokens(r['output'])} | "
                     f"{fmt_tokens(r['cache_read'])} | {fmt_tokens(r['cache_write'])} | {fmt_credits(r['credits'])} ({fmt_credits(r['low'])} to {fmt_credits(r['high'])}) | "
                     f"{fmt_usd(r['credits'])} ({fmt_usd(r['low'])} to {fmt_usd(r['high'])}) |")
    detect = sum(r["detection_credits"] or 0 for r in rows)
    lines.append(f"| All | threat detection after each agent ({len(rows)} {"run" if len(rows) == 1 else "runs"}, same model as the agent) | | ~{2 * len(rows)} | | | | | {fmt_credits(detect)} | {fmt_usd(detect)} |")
    known = [r for r in rows if r["credits"] is not None]
    total = sum(r["credits"] for r in known) + detect
    low = sum(r["low"] for r in known) + detect
    high = sum(r["high"] for r in known) + detect
    lines.append(f"| **Total** | | | | | | | | **{fmt_credits(total)} ({fmt_credits(low)} to {fmt_credits(high)})** | **{fmt_usd(total)} ({fmt_usd(low)} to {fmt_usd(high)})** |")
    unknown = [r["agent"] for r in rows if r["credits"] is None]
    lines += ["", f"Estimate from token counts measured on a full real run of this pipeline (2026-10-19). "
              f"Prices: [GitHub Copilot models and pricing]({PRICING_SOURCE}), read {PRICING_DATE}. 1 AI credit = $0.01. "
              "Credits count against the Copilot plan of the `COPILOT_GITHUB_TOKEN` owner; usage beyond the plan's included credits is billed. "
              "Deterministic jobs (tests, Maven, OpenRewrite, OSV) use GitHub Actions minutes and no AI credits."]
    if unknown:
        lines.append(f"No price on record for the model of: {', '.join(unknown)}. Add it to `PRICES` in `.github/scripts/modernize_cost.py`.")
    return "\n".join(lines) + "\n", total


def read_usage(artifacts):
    """Map each gh-aw artifact prefix to its workflow name and recorded token usage."""
    root = pathlib.Path(artifacts)
    names = {}
    for info in root.glob("*-info/aw_info.json"):
        names[info.parent.name[: -len("-info")]] = json.loads(info.read_text())["workflow_name"]
    rows = []
    for usage in sorted(root.glob("*-usage")):
        prefix = usage.name[: -len("-usage")]
        for kind in ("agent", "detection"):
            path = usage / kind / "token_usage.jsonl"
            if not path.exists():
                continue
            totals = {"requests": 0, "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "credits": 0.0, "models": set()}
            for line in path.read_text().splitlines():
                record = json.loads(line) if line.strip() else {}
                if record.get("event") != "token_usage":
                    continue
                totals["requests"] += 1
                totals["input"] += record.get("input_tokens", 0)
                totals["output"] += record.get("output_tokens", 0)
                totals["cache_read"] += record.get("cache_read_tokens", 0)
                totals["cache_write"] += record.get("cache_write_tokens", 0)
                totals["credits"] += record.get("ai_credits_this_response", 0) or 0
                totals["models"].add(record.get("model", "unknown"))
            totals["agent"] = names.get(prefix, prefix)
            totals["kind"] = kind
            totals["models"] = ", ".join(sorted(totals["models"]))
            rows.append(totals)
    return rows


def actual_markdown(rows):
    agents = sorted([r for r in rows if r["kind"] == "agent"], key=lambda r: r["agent"])
    detection = [r for r in rows if r["kind"] == "detection"]
    lines = ["| Agent | Model used | Requests | Input | Output | Cache read | Cache write | AI credits | USD |", "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for r in agents:
        lines.append(f"| `{r['agent']}` | `{r['models']}` | {r['requests']} | {fmt_tokens(r['input'])} | {fmt_tokens(r['output'])} | {fmt_tokens(r['cache_read'])} | "
                     f"{fmt_tokens(r['cache_write'])} | {r['credits']:.1f} | {fmt_usd(r['credits'])} |")
    if detection:
        d = sum(r["credits"] for r in detection)
        lines.append(f"| threat detection ({len(detection)} runs) | `{', '.join(sorted({r['models'] for r in detection}))}` | {sum(r['requests'] for r in detection)} | | | | | {d:.1f} | {fmt_usd(d)} |")
    total = sum(r["credits"] for r in rows)
    lines.append(f"| **Total** | | | | | | | **{total:.1f}** | **{fmt_usd(total)}** |")
    pie = [(r["agent"], r["credits"]) for r in agents if r["credits"] > 0]
    if detection:
        pie.append(("threat detection", sum(r["credits"] for r in detection)))
    if len(pie) > 1:
        lines += ["", "```mermaid", f"pie showData title AI credits by agent, {total:.1f} total"] + [f'    "{name}" : {value:.1f}' for name, value in pie] + ["```", "", "_Slices show the share of the total; the legend shows the credits._"]
    lines += ["", "Recorded by gh-aw for every model request (`token_usage.jsonl` in the `*-usage` artifacts of this run). 1 AI credit = $0.01."]
    return "\n".join(lines) + "\n", total


def gh_lines(path, jq, paginate=True):
    """Call the GitHub REST API through gh and return one JSON value per output line, or None on error."""
    cmd = ["gh", "api", path, "--jq", jq] + (["--paginate"] if paginate else [])
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    return [json.loads(line) for line in out.stdout.splitlines() if line.strip()]


def parse_time(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def job_minutes(job, now=None):
    """Billed minutes of one job: start to finish, rounded up to a whole minute. Jobs that never ran cost nothing."""
    start = parse_time(job.get("started_at"))
    if not start or job.get("conclusion") == "skipped" or job.get("status") in ("queued", "waiting", "pending", "requested"):
        return 0
    end = parse_time(job.get("completed_at")) if job.get("status") == "completed" else None
    end = end or now or datetime.datetime.now(datetime.timezone.utc)
    return max(1, math.ceil(max(0.0, (end - start).total_seconds()) / 60))


def run_jobs(repo, run_id):
    return gh_lines(f"repos/{repo}/actions/runs/{run_id}/jobs?per_page=100", ".jobs[] | {name, status, conclusion, started_at, completed_at}")


def top_job(name):
    # Jobs of a called workflow are named "<calling job> / <job>"; the calling job decides the stage.
    return name.split(" / ")[0].strip()


def stage_of(job, workflow):
    for stage, (wf, jobs, _) in STAGE_JOBS.items():
        if wf == workflow and (jobs is None or job in jobs):
            return stage
    return None


def minutes_by_stage(jobs, workflow, now=None):
    totals = {}
    for job in jobs or []:
        stage = stage_of(top_job(job["name"]), workflow)
        if stage:
            totals[stage] = totals.get(stage, 0) + job_minutes(job, now)
    return totals


def stage_completed(jobs, stage):
    marker = STAGE_JOBS[stage][2]
    return any(top_job(j["name"]) == marker and j.get("conclusion") == "success" for j in jobs or [])


def history_minutes(repo, exclude_run=None, limit=10):
    """Runner minutes per stage from the newest past run of this repository that completed the stage."""
    found, runs, jobs = {}, {}, {}
    for stage, (workflow, _, _) in STAGE_JOBS.items():
        if workflow not in runs:
            runs[workflow] = gh_lines(f"repos/{repo}/actions/workflows/{workflow}/runs?status=completed&per_page={limit}",
                                      ".workflow_runs[] | .id", paginate=False) or []
        for run_id in runs[workflow]:
            if str(run_id) == str(exclude_run):
                continue
            if run_id not in jobs:
                jobs[run_id] = run_jobs(repo, run_id) or []
            if stage_completed(jobs[run_id], stage):
                found[stage] = {"minutes": minutes_by_stage(jobs[run_id], workflow).get(stage, 0), "run": run_id}
                break
    return found


def baseline_minutes(stage, loc):
    scale = min(3.0, max(0.5, loc / RUNNER_BASELINE_LOC)) if loc else 1.0
    return sum(math.ceil(m * scale) if job in SIZE_SCALED else m for job, m in RUNNER_BASELINE[stage].items())


def repo_billing(repo):
    private = None
    if repo:
        out = gh_lines(f"repos/{repo}", ".private", paginate=False)
        private = bool(out[0]) if out else None
    try:
        rate = float(os.environ.get("MODERNIZE_ACTIONS_USD_PER_MINUTE") or ACTIONS_RATE_DEFAULT)
    except ValueError:
        rate = ACTIONS_RATE_DEFAULT
    return private, rate


def code_loc(facts):
    return sum(m.get("main_loc", 0) + m.get("test_loc", 0) for m in (facts or {}).get("inventory", []))


def usage_by_stage(rows):
    """Group gh-aw usage rows (agent and threat detection) by pipeline stage."""
    stage_of_agent = {agent: stage for stage, agents in STAGES.items() for agent in agents}
    out = {}
    for r in rows:
        stage = stage_of_agent.get(r["agent"])
        if not stage:
            continue
        t = out.setdefault(stage, {"credits": 0.0, "tokens": 0, "requests": 0})
        t["credits"] += r["credits"]
        t["tokens"] += r["input"] + r["output"] + r["cache_read"] + r["cache_write"]
        t["requests"] += r["requests"]
    return out


def read_usage_dir(path):
    return read_usage(path) if path and pathlib.Path(path).exists() else []


def predicted_ai(stage, workflows):
    rows = estimate_rows([stage], workflows)
    known = [r for r in rows if r["credits"] is not None]
    detect = sum(r["detection_credits"] or 0 for r in rows)
    tokens = sum(r["input"] + r["output"] + r["cache_read"] + r["cache_write"] for r in rows)
    tokens += sum(sum(PROFILES[r["agent"]]["detection"][1:]) for r in rows)
    return {"ai_credits": sum(r["credits"] for r in known) + detect, "ai_low": sum(r["low"] for r in known) + detect,
            "ai_high": sum(r["high"] for r in known) + detect, "tokens": tokens}


def predict(repo, run_id, usage_dir, facts, workflows):
    """Predicted cost of every stage at gate 1. The assessment already ran, so its numbers are actual."""
    loc = code_loc(facts)
    private, rate = repo_billing(repo)
    actual_ai = usage_by_stage(read_usage_dir(usage_dir))
    current = minutes_by_stage(run_jobs(repo, run_id), "modernize-assessment.yml") if repo and run_id else {}
    history = history_minutes(repo, exclude_run=run_id) if repo else {}
    stages = {}
    for stage in STAGES:
        if stage == "assessment":
            ai = actual_ai.get(stage)
            entry = {"kind": "actual", "ai_credits": ai["credits"] if ai else None, "ai_low": None, "ai_high": None,
                     "tokens": ai["tokens"] if ai else None}
            if current.get(stage):
                entry.update(minutes=current[stage], minutes_source="this run")
            else:
                entry.update(minutes=baseline_minutes(stage, loc), minutes_source="baseline")
        else:
            entry = {"kind": "predicted", **predicted_ai(stage, workflows)}
            if stage in history:
                entry.update(minutes=history[stage]["minutes"], minutes_source=f"run {history[stage]['run']}")
            else:
                entry.update(minutes=baseline_minutes(stage, loc), minutes_source="baseline")
        stages[stage] = entry
    return {"version": 1, "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
            "repo": repo, "run": run_id, "private": private, "rate": rate, "loc": loc, "stages": stages}


def runner_usd(minutes, private, rate):
    if minutes is None:
        return "n/a"
    billed = f"${minutes * rate:.2f}"
    return f"$0.00 (public; {billed} if private)" if private is False else billed


def hidden_json(kind, data):
    # A hidden block the Software Factory canvas reads. "--" would end an HTML comment; JSON only has it inside strings.
    return f"<!-- modernize-cost-json:{kind} " + json.dumps(data, separators=(",", ":")).replace("--", "-\\u002d") + " -->"


def basis_text(entry):
    ai = "actual" if entry["kind"] == "actual" else "measured token profile"
    src = entry.get("minutes_source", "")
    if src == "baseline":
        minutes = "baseline (no past run in this repo)"
    elif src == "this run":
        minutes = "this run"
    else:
        minutes = f"measured on {src}"
    return f"AI: {ai}; minutes: {minutes}"


def render_estimate(est):
    lines = ["| Stage | AI tokens | AI credits | AI USD | Runner minutes | Runner USD | Basis |", "|---|---:|---:|---:|---:|---:|---|"]
    total_credits = total_low = total_high = 0.0
    total_tokens = total_minutes = 0
    for stage in STAGES:
        e = est["stages"][stage]
        credits_text = fmt_credits(e["ai_credits"])
        usd_text = fmt_usd(e["ai_credits"])
        if e["kind"] == "predicted":
            credits_text += f" ({fmt_credits(e['ai_low'])} to {fmt_credits(e['ai_high'])})"
            usd_text += f" ({fmt_usd(e['ai_low'])} to {fmt_usd(e['ai_high'])})"
        tokens = e.get("tokens")
        lines.append(f"| {STAGE_TITLES[stage]} ({e['kind']}) | {fmt_tokens(tokens) if tokens else 'n/a'} | {credits_text} | {usd_text} | "
                     f"{e['minutes']} | {runner_usd(e['minutes'], est.get('private'), est['rate'])} | {basis_text(e)} |")
        total_credits += e["ai_credits"] or 0
        total_low += e["ai_low"] if e["ai_low"] is not None else (e["ai_credits"] or 0)
        total_high += e["ai_high"] if e["ai_high"] is not None else (e["ai_credits"] or 0)
        total_tokens += tokens or 0
        total_minutes += e["minutes"] or 0
    lines.append(f"| **Total** | **{fmt_tokens(total_tokens)}** | **{fmt_credits(total_credits)} ({fmt_credits(total_low)} to {fmt_credits(total_high)})** | "
                 f"**{fmt_usd(total_credits)} ({fmt_usd(total_low)} to {fmt_usd(total_high)})** | **{total_minutes}** | "
                 f"**{runner_usd(total_minutes, est.get('private'), est['rate'])}** | |")
    visibility = {True: "This repository is private", False: "This repository is public",
                  None: "Repository visibility is unknown"}[est.get("private")]
    lines += ["", f"AI: 1 credit = $0.01, [Copilot models and pricing]({PRICING_SOURCE}). Runner minutes: standard Linux runner, each job rounded up "
              f"to a whole minute, ${est['rate']:.3f} per minute ([Actions runner pricing]({ACTIONS_RATE_SOURCE}), read {ACTIONS_RATE_DATE}). "
              f"{visibility}; standard runners are free on public repositories.", "", hidden_json("predicted", est)]
    return "\n".join(lines) + "\n"


def compare(repo, run_id, usage_dir, est):
    """Actual cost of every stage at the end of execution, next to the prediction made at gate 1."""
    private, rate = est.get("private"), est.get("rate") or ACTIONS_RATE_DEFAULT
    actual = {s: {"ai_credits": None, "tokens": None, "minutes": None} for s in STAGES}
    ex_ai = usage_by_stage(read_usage_dir(usage_dir)).get("execution")
    if ex_ai:
        actual["execution"].update(ai_credits=ex_ai["credits"], tokens=ex_ai["tokens"])
    ex_jobs = run_jobs(repo, run_id) if repo and run_id else None
    if ex_jobs:
        actual["execution"]["minutes"] = minutes_by_stage(ex_jobs, "modernize-pipeline.yml").get("execution")
    assessment_run = est.get("run")
    if repo and assessment_run:
        a_jobs = run_jobs(repo, assessment_run)
        if a_jobs:
            for stage, minutes in minutes_by_stage(a_jobs, "modernize-assessment.yml").items():
                actual[stage]["minutes"] = minutes
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["gh", "run", "download", str(assessment_run), "-R", repo, "-p", "*-usage", "-p", "*-info", "-D", tmp],
                           capture_output=True, text=True)
            for stage, ai in usage_by_stage(read_usage(tmp)).items():
                if stage in ("assessment", "plan"):
                    actual[stage].update(ai_credits=ai["credits"], tokens=ai["tokens"])
    return {"version": 1, "repo": repo, "run": run_id, "assessment_run": assessment_run, "private": private, "rate": rate,
            "stages": {s: {"predicted": est["stages"][s], "actual": actual[s]} for s in STAGES}}


def delta(actual, predicted, fmt):
    if actual is None or predicted is None:
        return "n/a"
    diff = actual - predicted
    pct = f" ({diff / predicted * 100:+.0f}%)" if predicted else ""
    return ("+" if diff >= 0 else "-") + fmt(abs(diff)) + pct


def render_compare(cmp):
    lines = ["| Stage | AI credits predicted | AI credits actual | Difference | Runner minutes predicted | Runner minutes actual | Difference |",
             "|---|---:|---:|---:|---:|---:|---:|"]
    sums = {"pc": 0.0, "ac": None, "pm": 0, "am": None}
    for stage in STAGES:
        p, a = cmp["stages"][stage]["predicted"], cmp["stages"][stage]["actual"]
        lines.append(f"| {STAGE_TITLES[stage]} | {fmt_credits(p['ai_credits'])} | {fmt_credits(a['ai_credits'])} | {delta(a['ai_credits'], p['ai_credits'], fmt_credits)} | "
                     f"{p['minutes']} | {a['minutes'] if a['minutes'] is not None else 'n/a'} | {delta(a['minutes'], p['minutes'], str)} |")
        sums["pc"] += p["ai_credits"] or 0
        sums["pm"] += p["minutes"] or 0
        if a["ai_credits"] is not None:
            sums["ac"] = (sums["ac"] or 0) + a["ai_credits"]
        if a["minutes"] is not None:
            sums["am"] = (sums["am"] or 0) + a["minutes"]
    lines.append(f"| **Total** | **{fmt_credits(sums['pc'])}** | **{fmt_credits(sums['ac'])}** | **{delta(sums['ac'], sums['pc'], fmt_credits)}** | "
                 f"**{sums['pm']}** | **{sums['am'] if sums['am'] is not None else 'n/a'}** | **{delta(sums['am'], sums['pm'], str)}** |")
    lines.append(f"| **USD** | {fmt_usd(sums['pc'])} | {fmt_usd(sums['ac'])} | | {runner_usd(sums['pm'], cmp.get('private'), cmp['rate'])} | "
                 f"{runner_usd(sums['am'], cmp.get('private'), cmp['rate'])} | |")
    lines += ["", "Predicted at gate 1 (`cost-estimate.json` in the request folder). Actual AI credits are recorded by gh-aw for every model request; "
              "actual minutes come from the job times of the assessment run and this run, each job rounded up to a whole minute. "
              "`n/a` means the run or its artifacts were deleted.", "", hidden_json("actual", cmp)]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    e = sub.add_parser("estimate")
    e.add_argument("--stages", default="assessment,plan,execution")
    e.add_argument("--workflows", default=".github/workflows")
    e.add_argument("--format", choices=["md", "json"], default="md")
    a = sub.add_parser("actual")
    a.add_argument("--artifacts", required=True)
    a.add_argument("--format", choices=["md", "json"], default="md")
    p = sub.add_parser("predict")
    p.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
    p.add_argument("--run", default=os.environ.get("GITHUB_RUN_ID"))
    p.add_argument("--usage")
    p.add_argument("--facts")
    p.add_argument("--workflows", default=".github/workflows")
    p.add_argument("--out", required=True)
    r = sub.add_parser("render")
    r.add_argument("--estimate", required=True)
    c = sub.add_parser("compare")
    c.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY"))
    c.add_argument("--run", default=os.environ.get("GITHUB_RUN_ID"))
    c.add_argument("--usage")
    c.add_argument("--estimate", required=True)
    c.add_argument("--out")
    args = parser.parse_args()

    if args.command == "predict":
        facts = json.loads(pathlib.Path(args.facts).read_text(encoding="utf-8")) if args.facts and pathlib.Path(args.facts).exists() else {}
        est = predict(args.repo, args.run, args.usage, facts, args.workflows)
        pathlib.Path(args.out).write_text(json.dumps(est, indent=2), encoding="utf-8")
        print(render_estimate(est), end="")
    elif args.command == "render":
        print(render_estimate(json.loads(pathlib.Path(args.estimate).read_text(encoding="utf-8"))), end="")
    elif args.command == "compare":
        path = pathlib.Path(args.estimate)
        if not path.exists():
            print(f"No cost estimate at `{args.estimate}`; actual against predicted is not available for this request.")
            return
        cmp = compare(args.repo, args.run, args.usage, json.loads(path.read_text(encoding="utf-8")))
        if args.out:
            pathlib.Path(args.out).write_text(json.dumps(cmp, indent=2), encoding="utf-8")
        print(render_compare(cmp), end="")
    elif args.command == "estimate":
        rows = estimate_rows([s.strip() for s in args.stages.split(",") if s.strip()], args.workflows)
        if args.format == "json":
            print(json.dumps(rows, indent=2))
        else:
            print(estimate_markdown(rows)[0], end="")
    else:
        rows = read_usage(args.artifacts)
        if args.format == "json":
            print(json.dumps(rows, indent=2))
        elif rows:
            print(actual_markdown(rows)[0], end="")
        else:
            print("No gh-aw usage artifacts found in this run.")


if __name__ == "__main__":
    sys.exit(main())
