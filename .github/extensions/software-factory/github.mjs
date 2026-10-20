// github.mjs - All GitHub I/O of the Software Factory canvas, through the signed-in GitHub CLI (`gh`).
// The canvas never handles your GitHub credentials; gh does. The Copilot token is piped to `gh secret set`
// on stdin and is never logged, stored on disk, or returned to the canvas.

import { execFile, spawn } from "node:child_process";

const MAX_BUFFER = 64 * 1024 * 1024;

export function gh(args, { input, timeoutMs = 120000 } = {}) {
    return new Promise((resolve) => {
        if (input !== undefined) {
            const child = spawn("gh", args, { windowsHide: true });
            let stdout = "";
            let stderr = "";
            const timer = setTimeout(() => child.kill(), timeoutMs);
            child.stdout.on("data", (d) => (stdout += d));
            child.stderr.on("data", (d) => (stderr += d));
            child.on("error", (e) => {
                clearTimeout(timer);
                resolve({ ok: false, stdout, stderr: e.message });
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                resolve({ ok: code === 0, stdout, stderr });
            });
            child.stdin.end(input);
            return;
        }
        execFile("gh", args, { maxBuffer: MAX_BUFFER, timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || (err && err.message) || "") });
        });
    });
}

function errorText(r) {
    return (r.stderr || r.stdout || "unknown error").trim().split(/\r?\n/).slice(-3).join(" ");
}

// `gh --jq` prints strings raw (no quotes) and other values as JSON.
function parseValue(text) {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

export async function apiJson(path, { method, fields, rawFields, jq } = {}) {
    const args = ["api", path];
    if (method) args.push("-X", method);
    for (const [k, v] of Object.entries(fields || {})) args.push("-F", `${k}=${v}`);
    for (const [k, v] of Object.entries(rawFields || {})) args.push("-f", `${k}=${v}`);
    if (jq) args.push("--jq", jq);
    const r = await gh(args);
    if (!r.ok) throw new Error(errorText(r));
    const text = r.stdout.trim();
    return text ? parseValue(text) : null;
}

/** Paginated list: one value per line from `--jq`. */
export async function apiLines(path, jq, { paginate = true } = {}) {
    const args = ["api", path, "--jq", jq];
    if (paginate) args.push("--paginate");
    const r = await gh(args);
    if (!r.ok) throw new Error(errorText(r));
    return r.stdout.split(/\r?\n/).filter((l) => l.trim()).map(parseValue);
}

let meCache = null;
export async function whoami() {
    if (!meCache) meCache = await apiJson("user", { jq: "{login, id}" });
    return meCache;
}

export async function repoInfo(repo) {
    return apiJson(`repos/${repo}`, { jq: "{full_name, visibility, private, default_branch, has_issues, html_url}" });
}

export async function templateStatus(repo, workflowNames) {
    const [workflows, secrets, stamp] = await Promise.all([
        apiLines(`repos/${repo}/actions/workflows?per_page=100`, ".workflows[] | {name, path, state}").catch(() => []),
        apiLines(`repos/${repo}/actions/secrets?per_page=100`, ".secrets[] | .name").catch(() => null),
        apiJson(`repos/${repo}/contents/.github/factory.json`, { jq: ".content" })
            .then((c) => JSON.parse(Buffer.from(String(c), "base64").toString("utf8")))
            .catch(() => null),
    ]);
    const paths = new Set(workflows.map((w) => w.path.split("/").pop()));
    const present = workflowNames.filter((n) => paths.has(n));
    return {
        workflowsPresent: present.length,
        workflowsExpected: workflowNames.length,
        deployed: present.length === workflowNames.length,
        stamp,
        tokenSet: secrets ? secrets.includes("COPILOT_GITHUB_TOKEN") : null,
    };
}

export async function listRequests(repo, label) {
    return apiLines(`repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=15&sort=created&direction=desc`,
        ".[] | select(.pull_request | not) | {number, title, state, created_at, html_url}", { paginate: false });
}

export async function issue(repo, number) {
    return apiJson(`repos/${repo}/issues/${number}`, { jq: "{number, title, state, created_at, html_url, body}" });
}

export async function issueComments(repo, number) {
    return apiLines(`repos/${repo}/issues/${number}/comments?per_page=100`,
        ".[] | {id, body, html_url, created_at, updated_at, user: .user.login}");
}

export async function runJobs(repo, runId) {
    return apiLines(`repos/${repo}/actions/runs/${runId}/jobs?per_page=100`,
        ".jobs[] | {name, status, conclusion, started_at, completed_at, html_url, steps: [(.steps // [])[] | {name, status, conclusion}]}");
}

export async function run(repo, runId) {
    return apiJson(`repos/${repo}/actions/runs/${runId}`, { jq: "{id, status, conclusion, html_url, created_at, event, display_title}" });
}

/** Newest run of a workflow created at or after `since`. Used before the status board links the run. */
export async function findRun(repo, workflowFile, since) {
    const runs = await apiLines(`repos/${repo}/actions/workflows/${workflowFile}/runs?per_page=20`,
        ".workflow_runs[] | {id, status, conclusion, html_url, created_at, event}", { paginate: false }).catch(() => []);
    const t = Date.parse(since);
    return runs.find((r) => Date.parse(r.created_at) >= t - 5000) || null;
}

export async function pendingDeployments(repo, runId) {
    return apiLines(`repos/${repo}/actions/runs/${runId}/pending_deployments`,
        ".[] | {environment: {id: .environment.id, name: .environment.name}, current_user_can_approve}", { paginate: false });
}

export async function reviewDeployment(repo, runId, environmentId, approve, comment) {
    const payload = JSON.stringify({ environment_ids: [environmentId], state: approve ? "approved" : "rejected", comment });
    const r = await gh(["api", "-X", "POST", `repos/${repo}/actions/runs/${runId}/pending_deployments`, "--input", "-"], { input: payload });
    if (!r.ok) throw new Error(errorText(r));
}

export async function prByHead(repo, branch) {
    const owner = repo.split("/")[0];
    const list = await apiLines(`repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=5`,
        ".[] | {number, title, state, draft, merged_at, html_url, head: .head.ref, base: .base.ref}", { paginate: false });
    const pr = list[0];
    return pr ? { ...pr, merged: !!pr.merged_at } : null;
}

export async function prReviews(repo, number) {
    return apiLines(`repos/${repo}/pulls/${number}/reviews?per_page=100`, ".[] | {user: .user.login, state, submitted_at, html_url}");
}

export async function createIssue(repo, title, body, label) {
    const payload = JSON.stringify({ title, body, labels: [label] });
    const r = await gh(["api", "-X", "POST", `repos/${repo}/issues`, "--input", "-", "--jq", "{number, html_url}"], { input: payload });
    if (!r.ok) throw new Error(errorText(r));
    return JSON.parse(r.stdout);
}

export async function setCopilotSecret(repo, token) {
    const r = await gh(["secret", "set", "COPILOT_GITHUB_TOKEN", "--repo", repo], { input: token });
    if (!r.ok) throw new Error("gh secret set failed: " + errorText(r).replace(/github_pat_\w+/g, "github_pat_***"));
}

export async function mergePr(repo, number) {
    const r = await gh(["pr", "merge", String(number), "--repo", repo, "--squash"]);
    if (!r.ok) throw new Error(errorText(r));
}

export async function approvePr(repo, number, body) {
    const payload = JSON.stringify({ event: "APPROVE", body });
    const r = await gh(["api", "-X", "POST", `repos/${repo}/pulls/${number}/reviews`, "--input", "-", "--jq", ".html_url"], { input: payload });
    if (!r.ok) throw new Error(errorText(r));
    return r.stdout.trim().replace(/^"|"$/g, "");
}

// Reset: the same clean-up as demo\beat4\reset.ps1 -Full, through the REST API.
export async function resetPreview(repo, defaultBranch) {
    const [issues, prs, branches, runs] = await Promise.all([
        apiLines(`repos/${repo}/issues?state=open&per_page=100`, ".[] | select(.pull_request | not) | {number, title}"),
        apiLines(`repos/${repo}/pulls?state=open&per_page=100`, ".[] | {number, title}"),
        apiLines(`repos/${repo}/branches?per_page=100`, ".[] | .name"),
        apiJson(`repos/${repo}/actions/runs?per_page=1`, { jq: ".total_count" }),
    ]);
    return { issues, prs, branches: branches.filter((b) => b !== defaultBranch), runs: runs || 0 };
}

export async function resetExecute(repo, defaultBranch, { keepIssue, deleteRuns }) {
    const log = [];
    const preview = await resetPreview(repo, defaultBranch);
    for (const pr of preview.prs) {
        await apiJson(`repos/${repo}/pulls/${pr.number}`, { method: "PATCH", rawFields: { state: "closed" } }).catch((e) => log.push(`PR #${pr.number}: ${e.message}`));
    }
    for (const i of preview.issues) {
        if (keepIssue && i.number === keepIssue) continue;
        await apiJson(`repos/${repo}/issues/${i.number}`, { method: "PATCH", rawFields: { state: "closed", state_reason: "not_planned" } })
            .catch((e) => log.push(`issue #${i.number}: ${e.message}`));
    }
    for (const b of preview.branches) {
        await apiJson(`repos/${repo}/git/refs/heads/${b.split("/").map(encodeURIComponent).join("/")}`, { method: "DELETE" })
            .catch((e) => log.push(`branch ${b}: ${e.message}`));
    }
    let deleted = 0;
    if (deleteRuns) {
        const active = await apiLines(`repos/${repo}/actions/runs?status=in_progress&per_page=100`, ".workflow_runs[] | .id").catch(() => []);
        const queued = await apiLines(`repos/${repo}/actions/runs?status=queued&per_page=100`, ".workflow_runs[] | .id").catch(() => []);
        const waiting = await apiLines(`repos/${repo}/actions/runs?status=waiting&per_page=100`, ".workflow_runs[] | .id").catch(() => []);
        for (const id of [...active, ...queued, ...waiting]) await apiJson(`repos/${repo}/actions/runs/${id}/cancel`, { method: "POST" }).catch(() => {});
        if (active.length + queued.length + waiting.length) await new Promise((r) => setTimeout(r, 5000));
        const ids = await apiLines(`repos/${repo}/actions/runs?per_page=100`, ".workflow_runs[] | .id").catch(() => []);
        for (const id of ids) {
            await apiJson(`repos/${repo}/actions/runs/${id}`, { method: "DELETE" }).then(() => deleted++).catch((e) => log.push(`run ${id}: ${e.message}`));
        }
    }
    return {
        closedPrs: preview.prs.length, closedIssues: preview.issues.filter((i) => i.number !== keepIssue).length,
        deletedBranches: preview.branches.length, deletedRuns: deleted, problems: log,
    };
}

/** Open a GitHub URL in the default browser. Callers validate the URL first. */
export function openInBrowser(url) {
    const [cmd, args] = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
}
