// state.mjs - Pure parsing and the stage model of the Software Factory canvas. No I/O, unit-tested.
//
// Every value the canvas shows comes from GitHub: the status board comment on the request issue
// (<!-- modernize-tracker -->), the report comments, the hidden cost JSON blocks, and the Actions jobs API.

export const MARKERS = {
    tracker: "<!-- modernize-tracker -->",
    request: "<!-- modernize-request -->",
    assessment: "<!-- modernize-assessment -->",
    verification: "<!-- modernize-verification -->",
    cost: "<!-- modernize-cost -->",
    planValidation: "<!-- modernize-plan-validation -->",
};

// Top-level jobs of each stage, in run-graph order. Agent jobs are reusable gh-aw workflows with six jobs each.
export const STAGE_JOBS = {
    assessment: ["prepare", "assessment-facts", "modernize-compat-analyst", "modernize-dependency-analyst", "track-analysis", "assessment-report"],
    plan: ["open-plan-pr", "modernize-planner", "plan-ready"],
    execution: ["prepare", "modernize-build-upgrader", "modernize-code-fixer", "track-build", "verify-build", "verify-static",
        "modernize-conformance-reviewer", "modernize-standards-reviewer", "finalize"],
};
export const AGENT_JOBS = new Set(["modernize-compat-analyst", "modernize-dependency-analyst", "modernize-planner", "modernize-build-upgrader",
    "modernize-code-fixer", "modernize-conformance-reviewer", "modernize-standards-reviewer"]);
const AGENT_SUBJOBS = 6;

// Tracker rows (by stage name) that belong to each canvas stage.
export const STAGE_ROWS = {
    request: ["Request received"],
    assessment: ["Baseline and tool evidence", "Compatibility analysis", "Dependency analysis", "Assessment report"],
    gate1: ["Assessment approval"],
    plan: ["Plan drafted", "Plan validation"],
    gate2: ["Plan approval"],
    execution: ["Build upgrade", "Code fixes", "Build and test verification", "Static checks", "Spec review", "Standards review"],
    gate3: ["Human review"],
};

const STATUS_WORDS = ["done", "running", "failed", "attention", "skipped", "pending"];

/** Parse the status board comment into rows, the "X of Y stages done" counts and the run links. */
export function parseTracker(body) {
    if (!body || !body.includes(MARKERS.tracker)) return null;
    const rows = [];
    for (const line of body.split(/\r?\n/)) {
        const cells = line.split("|").map((c) => c.trim());
        // | Phase | Stage | Status | Detail |  ->  ["", phase, stage, status, detail, ""]
        if (cells.length < 6 || cells[1] === "Phase" || /^-+$/.test(cells[1])) continue;
        const statusText = cells[3].toLowerCase();
        const status = STATUS_WORDS.find((w) => statusText.includes(w));
        if (!status) continue;
        rows.push({ phase: cells[1], stage: cells[2], status, detail: cells.slice(4, -1).join("|").trim() });
    }
    const count = body.match(/(\d+) of (\d+) stages done/);
    const runs = {};
    for (const m of body.matchAll(/- Run: ([^:\n]+): (https:\/\/\S+\/actions\/runs\/(\d+))/g)) {
        const label = m[1].trim().toLowerCase();
        runs[label.startsWith("exec") ? "execution" : "assessment"] = { url: m[2], id: Number(m[3]) };
    }
    return { rows, done: count ? Number(count[1]) : rows.filter((r) => r.status === "done").length, total: count ? Number(count[2]) : rows.length, runs };
}

/** Read a hidden cost JSON block written by modernize_cost.py: <!-- modernize-cost-json:<kind> {...} -->. */
export function parseCostJson(body, kind) {
    if (!body) return null;
    const m = body.match(new RegExp(`<!-- modernize-cost-json:${kind} (\\{[\\s\\S]*?\\}) -->`));
    if (!m) return null;
    try {
        return JSON.parse(m[1]);
    } catch {
        return null;
    }
}

/** The "At a glance" measures table of the assessment report as [{measure, now, target}]. */
export function parseAtAGlance(body) {
    if (!body) return [];
    const start = body.indexOf("| Measure | Now |");
    if (start < 0) return [];
    const out = [];
    for (const line of body.slice(start).split(/\r?\n/).slice(2)) {
        if (!line.startsWith("|")) break;
        const c = line.split("|").map((s) => s.trim());
        if (c.length >= 5) out.push({ measure: stripMd(c[1]), now: stripMd(c[2]), target: stripMd(c[3]) });
    }
    return out;
}

function stripMd(s) {
    return s.replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

export function topJob(name) {
    return String(name || "").split(" / ")[0].trim();
}

function stepFraction(job) {
    if (job.status === "completed") return 1;
    const steps = job.steps || [];
    if (!steps.length) return job.status === "in_progress" ? 0.1 : 0;
    return steps.filter((s) => s.status === "completed").length / steps.length;
}

/**
 * Progress of one stage from the Actions jobs API: each expected top-level job counts equally.
 * A plain job advances by its steps; an agent job by its six gh-aw sub-jobs.
 */
export function stageProgress(jobs, stage, now = Date.now()) {
    const expected = STAGE_JOBS[stage] || [];
    const byTop = new Map();
    for (const job of jobs || []) {
        const top = topJob(job.name);
        if (!expected.includes(top)) continue;
        if (!byTop.has(top)) byTop.set(top, []);
        byTop.get(top).push(job);
    }
    const items = expected.map((name) => {
        const list = byTop.get(name) || [];
        let fraction = 0;
        let status = "pending";
        if (list.length) {
            const failed = list.some((j) => ["failure", "cancelled", "timed_out"].includes(j.conclusion));
            const waiting = list.some((j) => j.status === "waiting");
            const allDone = list.every((j) => j.status === "completed");
            const skipped = allDone && list.every((j) => j.conclusion === "skipped");
            if (AGENT_JOBS.has(name) && list.length > 1) {
                const finished = list.some((j) => /conclusion$/.test(j.name) && j.status === "completed");
                fraction = finished ? 1 : list.reduce((a, j) => a + stepFraction(j), 0) / Math.max(AGENT_SUBJOBS, list.length);
            } else {
                fraction = list.reduce((a, j) => a + stepFraction(j), 0) / list.length;
            }
            status = failed ? "failed" : skipped ? "skipped" : waiting ? "waiting" : allDone ? "done" : "running";
            if (status === "done" || status === "skipped") fraction = 1;
        }
        const current = list.find((j) => j.status === "in_progress");
        const step = current && (current.steps || []).find((s) => s.status === "in_progress");
        const failedJob = list.find((j) => ["failure", "cancelled", "timed_out"].includes(j.conclusion));
        return {
            name, status, fraction, step: step ? step.name : null, subjobs: list.length,
            url: (failedJob || current || list[0] || {}).html_url || null,
        };
    });
    const percent = expected.length ? Math.round((items.reduce((a, i) => a + i.fraction, 0) / expected.length) * 100) : 0;
    const relevant = (jobs || []).filter((j) => expected.includes(topJob(j.name)) && j.started_at && j.status !== "waiting");
    const starts = relevant.map((j) => Date.parse(j.started_at)).filter(Number.isFinite);
    const ends = relevant.map((j) => (j.completed_at ? Date.parse(j.completed_at) : now)).filter(Number.isFinite);
    const elapsedMs = starts.length ? Math.max(...ends) - Math.min(...starts) : 0;
    return { percent, items, elapsedMs, started: relevant.length > 0 };
}

function rowsFor(tracker, key) {
    if (!tracker) return [];
    const names = STAGE_ROWS[key];
    return tracker.rows.filter((r) => names.includes(r.stage));
}

export function rollup(rows) {
    if (!rows.length) return "pending";
    if (rows.some((r) => r.status === "failed")) return "failed";
    if (rows.every((r) => r.status === "done" || r.status === "skipped")) return "done";
    if (rows.some((r) => r.status === "attention")) return "attention";
    if (rows.some((r) => r.status === "running" || r.status === "done")) return "running";
    return "pending";
}

/**
 * Build the seven canvas stages from what GitHub reports.
 * @param {object} d { issue, tracker, assessmentJobs, executionJobs, pendingGate, planPr, implPr, implApproved, now }
 */
export function buildStages(d) {
    const t = d.tracker;
    const now = d.now || Date.now();
    const prog = {
        assessment: stageProgress(d.assessmentJobs, "assessment", now),
        plan: stageProgress(d.assessmentJobs, "plan", now),
        execution: stageProgress(d.executionJobs, "execution", now),
    };
    const stage = (key, title) => {
        const rows = rowsFor(t, key);
        const p = prog[key];
        let status = rollup(rows);
        // Jobs move before the status board does; a stage whose jobs started is running.
        if (status === "pending" && p && p.started) status = "running";
        if (p && p.items.some((i) => i.status === "failed") && status !== "done") status = "failed";
        const percent = status === "done" ? 100 : p && p.started ? Math.min(99, p.percent)
            : rows.length ? Math.round((rows.filter((r) => r.status === "done").length / rows.length) * 100) : 0;
        // A finished stage whose run was deleted has no job data; its jobs are done, not pending.
        const jobs = p ? p.items.map((i) => (status === "done" && i.status === "pending" ? { ...i, status: "done", fraction: 1, noData: true } : i)) : [];
        return { key, title, kind: "stage", status, percent, rows, jobs, elapsedMs: p ? p.elapsedMs : 0 };
    };
    const gate = (key, title, ready, done) => {
        const rows = rowsFor(t, key);
        const s = rollup(rows);
        const status = done || s === "done" ? "done" : ready ? "attention" : s === "failed" ? "failed" : "pending";
        return { key, title, kind: "gate", status, rows };
    };
    const request = { key: "request", title: "Modernization Request", kind: "stage", rows: rowsFor(t, "request"),
        status: t ? rollup(rowsFor(t, "request")) : d.issue ? "running" : "pending", jobs: [], elapsedMs: 0 };
    request.percent = request.status === "done" ? 100 : d.issue ? 50 : 0;
    const planPr = d.planPr;
    const implPr = d.implPr;
    const executionDone = rollup(rowsFor(t, "execution")) === "done";
    return [
        request,
        stage("assessment", "Assessment"),
        gate("gate1", "Gate 1: approve the assessment", !!d.pendingGate, false),
        stage("plan", "Modernization Plan"),
        gate("gate2", "Gate 2: merge the plan", !!(planPr && planPr.state === "open" && !planPr.draft), !!(planPr && planPr.merged)),
        stage("execution", "Execution and validation"),
        gate("gate3", "Gate 3: review the Implementation PR", !!(implPr && implPr.state === "open" && (executionDone || !implPr.draft)), !!d.implApproved),
    ];
}

/** True while something in the lifecycle is moving, so the canvas polls faster. */
export function isActive(stages) {
    return stages.some((s) => s.kind === "stage" && s.status === "running");
}

/** Accept only a request that the workflow will start: the body must begin with /modernize. */
export function validateRequest(text) {
    const body = String(text || "").trim();
    if (!body) return { ok: false, error: "Type a request that starts with /modernize." };
    if (!/^\/modernize(\s|$)/.test(body)) return { ok: false, error: "The request must start with /modernize, or the workflow does not start." };
    if (body.length > 60000) return { ok: false, error: "The request is too long." };
    return { ok: true, body };
}

/** Fine-grained PATs start with github_pat_. Classic ghp_ tokens are rejected by the Copilot engine. */
export function validateToken(token) {
    const t = String(token || "").trim();
    if (!t) return { ok: false, error: "Paste the token first." };
    if (t.startsWith("ghp_")) return { ok: false, error: "This is a classic token (ghp_). The Copilot engine needs a fine-grained token that starts with github_pat_." };
    if (!t.startsWith("github_pat_")) return { ok: false, error: "The token must be a fine-grained personal access token that starts with github_pat_." };
    if (/\s/.test(t)) return { ok: false, error: "The token contains spaces or line breaks. Copy it again." };
    return { ok: true, token: t };
}

/** Only GitHub web URLs may be opened from the canvas. */
export function isSafeUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname === "docs.github.com");
    } catch {
        return false;
    }
}

export function formatDuration(ms) {
    if (!ms || ms < 0) return "";
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}
