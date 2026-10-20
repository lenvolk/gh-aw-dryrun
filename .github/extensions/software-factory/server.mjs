// server.mjs - Per-instance loopback server of the Software Factory canvas: state, live updates, actions.
//
// Direct actions (no AI): save the Copilot token, create the request, approve or reject gate 1, merge the plan
// (gate 2), approve the Implementation PR (gate 3, never merge), reset. Every gate is a human click.
// Agent actions: Deploy, Update template, explain the report, troubleshoot a failed job. They send a prompt to
// the Copilot agent in this session; the agent does the work and asks before pushing anything.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as G from "./github.mjs";
import { MARKERS, buildStages, isActive, parseAtAGlance, parseCostJson, parseTracker, validateRequest, validateToken, isSafeUrl } from "./state.mjs";
import { renderHtml } from "./renderer.mjs";

const FAST_POLL_MS = 10000;
const SLOW_POLL_MS = 30000;
const REPO_CACHE_MS = 60000;

export function loadCatalog(factoryRoot) {
    return JSON.parse(readFileSync(join(factoryRoot, "templates", "catalog.json"), "utf8"));
}

function selectedEntry(rec, catalog) {
    return catalog.repositories.find((r) => r.repo === rec.repo) || catalog.repositories.find((r) => r.nominated) || catalog.repositories[0];
}

async function settle(promise, fallback = null) {
    try {
        return await promise;
    } catch (e) {
        return fallback === undefined ? null : typeof fallback === "function" ? fallback(e) : fallback;
    }
}

async function repoLevel(rec, entry, tpl, force) {
    const cached = rec.repoCache;
    if (!force && cached && cached.repo === entry.repo && Date.now() - cached.at < REPO_CACHE_MS) return cached;
    const workflows = [tpl.assessmentWorkflow, tpl.pipelineWorkflow];
    const [info, template, requests, me] = await Promise.all([
        settle(G.repoInfo(entry.repo)),
        settle(G.templateStatus(entry.repo, workflows)),
        settle(G.listRequests(entry.repo, tpl.requestLabel), []),
        settle(G.whoami()),
    ]);
    rec.repoCache = { repo: entry.repo, at: Date.now(), info, template, requests, me };
    return rec.repoCache;
}

/** Everything the canvas shows for the selected repository and request. */
export async function collectState(rec) {
    const catalog = loadCatalog(rec.factoryRoot);
    const entry = selectedEntry(rec, catalog);
    rec.repo = entry.repo;
    const tpl = catalog.templates[entry.template] || {};
    const state = {
        ok: true,
        updatedAt: new Date().toISOString(),
        factory: catalog.factory,
        billing: catalog.billing,
        catalog: catalog.repositories.map((r) => ({ repo: r.repo, title: r.title, description: r.description, language: r.language, nominated: !!r.nominated, reason: r.reason || null, template: r.template })),
        selected: entry.repo,
        template: { id: entry.template, title: tpl.title },
        notice: rec.notice || null,
        busy: rec.busy || null,
    };
    if (!entry.nominated) {
        state.blocked = entry.reason || "Not nominated in templates/catalog.json.";
        return state;
    }
    const repoData = await repoLevel(rec, entry, tpl, rec.forceRepo);
    rec.forceRepo = false;
    state.repoInfo = repoData.info;
    state.templateStatus = repoData.template;
    state.requests = repoData.requests;
    state.me = repoData.me && repoData.me.login;

    if (!rec.issue && repoData.requests.length) {
        const open = repoData.requests.find((r) => r.state === "open");
        if (open) rec.issue = open.number;
    }
    state.issue = rec.issue || null;
    if (!rec.issue) {
        state.stages = buildStages({});
        state.active = false;
        return state;
    }
    const repo = entry.repo;
    const n = rec.issue;
    const [issue, comments] = await Promise.all([settle(G.issue(repo, n)), settle(G.issueComments(repo, n), [])]);
    const find = (list, marker) => (list || []).find((c) => c.body && c.body.includes(marker)) || null;
    const trackerComment = find(comments, MARKERS.tracker);
    const reportComment = find(comments, MARKERS.assessment);
    const requestComment = find(comments, MARKERS.request);
    const tracker = trackerComment ? parseTracker(trackerComment.body) : null;

    let assessmentRun = tracker && tracker.runs.assessment ? { id: tracker.runs.assessment.id, html_url: tracker.runs.assessment.url } : null;
    if (!assessmentRun && issue) assessmentRun = await settle(G.findRun(repo, tpl.assessmentWorkflow, issue.created_at));
    const assessmentJobs = assessmentRun ? await settle(G.runJobs(repo, assessmentRun.id), []) : [];

    const gate1Done = tracker && tracker.rows.some((r) => r.stage === "Assessment approval" && r.status === "done");
    let pendingGate = null;
    if (assessmentRun && !gate1Done && assessmentJobs.some((j) => j.name === "assessment-approval" && j.status === "waiting")) {
        const pending = await settle(G.pendingDeployments(repo, assessmentRun.id), []);
        pendingGate = pending.find((p) => p.environment && p.environment.name === tpl.approvalEnvironment) || pending[0] || null;
    }

    const [planPr, implPr] = await Promise.all([settle(G.prByHead(repo, `modernize/plan-${n}`)), settle(G.prByHead(repo, `modernize/issue-${n}`))]);
    let executionRun = tracker && tracker.runs.execution ? { id: tracker.runs.execution.id, html_url: tracker.runs.execution.url } : null;
    if (!executionRun && planPr && planPr.merged) executionRun = await settle(G.findRun(repo, tpl.pipelineWorkflow, planPr.merged_at));
    const executionJobs = executionRun ? await settle(G.runJobs(repo, executionRun.id), []) : [];

    const [planComments, implComments, implReviews] = await Promise.all([
        planPr ? settle(G.issueComments(repo, planPr.number), []) : [],
        implPr ? settle(G.issueComments(repo, implPr.number), []) : [],
        implPr ? settle(G.prReviews(repo, implPr.number), []) : [],
    ]);
    const costComment = find(implComments, MARKERS.cost);
    const verificationComment = find(implComments, MARKERS.verification);
    const validationComment = find(planComments, MARKERS.planValidation);
    const myApproval = implReviews.find((r) => r.user === state.me && r.state === "APPROVED") || null;

    const stages = buildStages({ issue, tracker, assessmentJobs, executionJobs, pendingGate, planPr, implPr, implApproved: !!myApproval });
    const web = `https://github.com/${repo}`;
    const requestDir = `docs/modernization/requests/${n}`;
    const planRef = planPr && planPr.merged ? "main" : `modernize/plan-${n}`;
    state.request = issue ? { number: issue.number, title: issue.title, state: issue.state, url: issue.html_url, createdAt: issue.created_at, body: issue.body } : { number: n };
    state.tracker = tracker ? { done: tracker.done, total: tracker.total, url: trackerComment.html_url } : null;
    state.stages = stages;
    state.active = isActive(stages) || !!(assessmentRun && assessmentJobs.some((j) => j.status !== "completed" && j.status !== "waiting"));
    state.gate1 = pendingGate ? { environment: pendingGate.environment, canApprove: pendingGate.current_user_can_approve, runId: assessmentRun.id } : null;
    state.planPr = planPr;
    state.implPr = implPr ? { ...implPr, myApproval } : null;
    state.cards = {
        glance: reportComment ? parseAtAGlance(reportComment.body) : [],
        predicted: reportComment ? parseCostJson(reportComment.body, "predicted") : null,
        actual: costComment ? parseCostJson(costComment.body, "actual") : null,
        verification: tracker ? (tracker.rows.find((r) => r.stage === "Build and test verification") || {}).detail || null : null,
        expanded: requestComment ? { url: requestComment.html_url } : null,
    };
    state.links = {
        issue: issue && issue.html_url,
        tracker: trackerComment && trackerComment.html_url,
        request: requestComment && requestComment.html_url,
        report: reportComment && reportComment.html_url,
        assessmentRun: assessmentRun && (assessmentRun.html_url || `${web}/actions/runs/${assessmentRun.id}`),
        artifacts: assessmentRun && `${assessmentRun.html_url || `${web}/actions/runs/${assessmentRun.id}`}#artifacts`,
        planPr: planPr && planPr.html_url,
        planFiles: planPr && `${planPr.html_url}/files`,
        plan: planPr && `${web}/blob/${planRef}/${requestDir}/plan.md`,
        costEstimate: planPr && `${web}/blob/${planRef}/${requestDir}/cost-estimate.md`,
        validation: validationComment && validationComment.html_url,
        executionRun: executionRun && (executionRun.html_url || `${web}/actions/runs/${executionRun.id}`),
        implPr: implPr && implPr.html_url,
        implFiles: implPr && `${implPr.html_url}/files`,
        implChecks: implPr && `${implPr.html_url}/checks`,
        compare: implPr && `${web}/compare/main...modernize/issue-${n}`,
        verification: verificationComment && verificationComment.html_url,
        cost: costComment && costComment.html_url,
    };
    return state;
}

export function broadcast(rec, payload) {
    const data = "data: " + JSON.stringify(payload) + "\n\n";
    for (const res of rec.sseClients) {
        try {
            res.write(data);
        } catch {
            rec.sseClients.delete(res);
        }
    }
}

export async function pushState(rec, log) {
    // Callers that arrive during a refresh share it instead of getting nothing.
    if (rec.collecting) return rec.collecting;
    rec.collecting = (async () => {
        try {
            const state = await collectState(rec);
            rec.lastState = state;
            broadcast(rec, { type: "state", state });
            return state;
        } catch (e) {
            if (log) log("Software Factory: refresh failed: " + e.message, { level: "warning" });
            const state = { ok: false, error: e.message, updatedAt: new Date().toISOString() };
            broadcast(rec, { type: "state", state });
            return state;
        } finally {
            rec.collecting = null;
        }
    })();
    return rec.collecting;
}

/** Poll GitHub while a canvas is connected: fast while something runs, slow otherwise. */
export function schedule(rec, log) {
    clearTimeout(rec.timer);
    if (rec.closed || rec.sseClients.size === 0) return;
    const delay = rec.lastState && rec.lastState.active ? FAST_POLL_MS : SLOW_POLL_MS;
    rec.timer = setTimeout(async () => {
        await pushState(rec, log);
        schedule(rec, log);
    }, delay);
}

function notice(rec, kind, text) {
    rec.notice = { kind, text, at: new Date().toISOString() };
}

export function agentPrompt(kind, rec, payload = {}) {
    const repo = rec.repo;
    const root = rec.factoryRoot;
    const script = join(root, "templates", "JavaModernization", "deploy.ps1");
    switch (kind) {
        case "deploy":
        case "update_template": {
            const update = kind === "update_template";
            return [
                `Software Factory canvas: ${update ? "Update template" : "Deploy"} the java-modernization template to ${repo}.`,
                "",
                `1. From ${root}, run: pwsh -NoProfile -File "${script}" -Repo ${repo}${update ? " -Update" : ""}`,
                "2. Show me the result table from the script output in plain words: what was added, updated, kept, and configured.",
                "3. If the outcome in the FACTORY-RESULT line is needs-push, list the pending files and ask me, with the ask_user tool, whether to commit and push them to main of the target. " +
                "Only after I confirm, run the same command again with -Push added. Never push without my confirmation.",
                "4. If the script fails, explain the cause and the fix. Do not change the template files.",
                "Do not create issues, pull requests, or workflow runs.",
            ].join("\n");
        }
        case "explain_report":
            return [
                `Software Factory canvas: explain the Assessment Report for modernization request #${rec.issue} in ${repo} before I decide on gate 1.`,
                `Read the report comment with: gh api repos/${repo}/issues/${rec.issue}/comments --jq '.[] | select(.body | contains("<!-- modernize-assessment -->")) | .body'`,
                "In plain words and under 250 words: the key numbers, the blockers, the decisions waiting for me, and the predicted cost (AI credits and runner minutes per stage).",
                "Do not approve or reject anything. Gate 1 is my click in the canvas.",
            ].join("\n");
        case "troubleshoot":
            return [
                `Software Factory canvas: the job "${payload.job}" failed in ${repo} (run ${payload.url || "unknown"}), modernization request #${rec.issue}.`,
                `Find the cause with gh run view <run-id> --repo ${repo} --log-failed and gh aw audit <run-id> (run from the target checkout if gh aw needs it).`,
                "Explain the cause and the smallest fix. Ask me before re-running any job or changing any file.",
            ].join("\n");
        default:
            return null;
    }
}

/** Handle a canvas action. Gates and the token are handled here directly and never reach the agent. */
export async function dispatchAction(rec, kind, payload, deps) {
    const p = payload || {};
    const catalog = loadCatalog(rec.factoryRoot);
    const entry = selectedEntry(rec, catalog);
    const tpl = catalog.templates[entry.template] || {};
    const repo = entry.repo;
    const needNominated = () => {
        if (!entry.nominated) throw new Error(`${repo} is not nominated. The factory does not spend minutes or credits on it.`);
    };
    const done = async (message, extra = {}) => {
        notice(rec, "ok", message);
        await pushState(rec, deps.log);
        schedule(rec, deps.log);
        return { ok: true, message, ...extra };
    };
    try {
        switch (kind) {
            case "refresh":
                rec.forceRepo = true;
                return await done("Refreshed from GitHub");
            case "select_repo": {
                const target = catalog.repositories.find((r) => r.repo === p.repo);
                if (!target) throw new Error("Unknown repository");
                rec.repo = target.repo;
                rec.issue = null;
                rec.forceRepo = true;
                return await done(`Selected ${target.repo}`);
            }
            case "select_issue":
                rec.issue = Number(p.issue) || null;
                return await done(rec.issue ? `Opened request #${rec.issue}` : "No request selected");
            case "save_token": {
                needNominated();
                const v = validateToken(p.token);
                if (!v.ok) return { ok: false, error: v.error };
                await G.setCopilotSecret(repo, v.token);
                rec.forceRepo = true;
                return await done(`COPILOT_GITHUB_TOKEN saved as a secret of ${repo}. The token was not stored anywhere else.`);
            }
            case "create_request": {
                needNominated();
                const v = validateRequest(p.text);
                if (!v.ok) return { ok: false, error: v.error };
                const created = await G.createIssue(repo, tpl.requestTitle || "Modernization request", v.body, tpl.requestLabel);
                rec.issue = created.number;
                rec.forceRepo = true;
                return await done(`Created request #${created.number}. The assessment starts in a few seconds.`, { url: created.html_url });
            }
            case "approve_gate1":
            case "reject_gate1": {
                needNominated();
                const s = rec.lastState;
                if (!s || !s.gate1) throw new Error("Gate 1 is not waiting for approval.");
                if (!s.gate1.canApprove) throw new Error("You are not a required reviewer of the approval environment.");
                const approve = kind === "approve_gate1";
                await G.reviewDeployment(repo, s.gate1.runId, s.gate1.environment.id, approve,
                    approve ? "Approved at gate 1 from the Software Factory canvas." : "Rejected at gate 1 from the Software Factory canvas.");
                return await done(approve ? "Gate 1 approved. The plan pull request opens next." : "Gate 1 rejected. Nothing changes in the repository.");
            }
            case "merge_plan": {
                needNominated();
                const pr = rec.lastState && rec.lastState.planPr;
                if (!pr || pr.state !== "open" || pr.draft) throw new Error("The plan pull request is not ready to merge.");
                if (!pr.title.startsWith(tpl.planTitlePrefix || "[modernization-plan]")) throw new Error("This is not a plan pull request.");
                if (Number(p.number) !== pr.number) throw new Error("The plan pull request changed. Refresh and try again.");
                await G.mergePr(repo, pr.number);
                return await done(`Gate 2: plan pull request #${pr.number} merged. Only Markdown and evidence reached main. Execution starts next.`);
            }
            case "approve_impl": {
                needNominated();
                const pr = rec.lastState && rec.lastState.implPr;
                if (!pr || pr.state !== "open") throw new Error("There is no open Implementation pull request.");
                if (Number(p.number) !== pr.number) throw new Error("The Implementation pull request changed. Refresh and try again.");
                await G.approvePr(repo, pr.number, "Gate 3: reviewed and approved from the Software Factory canvas. Not merged: the modernized code stays on its branch for the demo.");
                return await done(`Gate 3: approving review submitted on #${pr.number}. Not merged; main keeps the original code.`);
            }
            case "reset_preview": {
                needNominated();
                const info = rec.repoCache && rec.repoCache.info;
                const preview = await G.resetPreview(repo, (info && info.default_branch) || "main");
                return { ok: true, preview };
            }
            case "reset_execute": {
                needNominated();
                if (p.confirm !== repo) return { ok: false, error: `Type ${repo} to confirm.` };
                const info = rec.repoCache && rec.repoCache.info;
                rec.busy = "Resetting the target repository…";
                broadcast(rec, { type: "busy", busy: rec.busy });
                try {
                    const result = await G.resetExecute(repo, (info && info.default_branch) || "main", { keepIssue: Number(p.keepIssue) || null, deleteRuns: !!p.deleteRuns });
                    rec.busy = null;
                    if (!p.keepIssue || Number(p.keepIssue) !== rec.issue) rec.issue = null;
                    rec.forceRepo = true;
                    return await done(`Reset ${repo}: closed ${result.closedIssues} issues and ${result.closedPrs} pull requests, deleted ${result.deletedBranches} branches and ${result.deletedRuns} runs.` +
                        (result.problems.length ? ` ${result.problems.length} items failed.` : ""), { result });
                } finally {
                    rec.busy = null;
                }
            }
            case "open_url":
                if (!isSafeUrl(p.url)) return { ok: false, error: "Only github.com links can be opened." };
                G.openInBrowser(p.url);
                return { ok: true };
            case "deploy":
            case "update_template":
            case "explain_report":
            case "troubleshoot": {
                if (kind === "deploy" || kind === "update_template") needNominated();
                if (typeof deps.sendPrompt !== "function") throw new Error("The Copilot session is not ready.");
                const prompt = agentPrompt(kind, rec, p);
                await deps.sendPrompt(prompt);
                const labels = { deploy: "Deploy", update_template: "Update template", explain_report: "Explain the report", troubleshoot: "Troubleshoot" };
                notice(rec, "agent", `Sent to the Copilot agent: ${labels[kind]}. Watch the chat; it asks before pushing anything.`);
                broadcast(rec, { type: "notice", notice: rec.notice });
                return { ok: true, message: rec.notice.text };
            }
            default:
                return { ok: false, error: "Unknown action: " + kind };
        }
    } catch (e) {
        notice(rec, "error", e.message);
        broadcast(rec, { type: "notice", notice: rec.notice });
        return { ok: false, error: e.message };
    }
}

const MAX_BODY = 128 * 1024;
function readBody(req) {
    return new Promise((resolve) => {
        let data = "";
        let size = 0;
        req.on("data", (c) => {
            size += c.length;
            if (size > MAX_BODY) {
                req.destroy();
                resolve(null);
                return;
            }
            data += c;
        });
        req.on("end", () => resolve(data));
        req.on("error", () => resolve(null));
    });
}

function sendJson(res, status, value) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(value));
}

export function makeHandler(rec, deps) {
    return async function handler(req, res) {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname === "/favicon.ico") {
            res.statusCode = 204;
            res.end();
            return;
        }
        if (rec.token && url.searchParams.get("token") !== rec.token) return sendJson(res, 403, { ok: false, error: "forbidden" });
        if (req.method === "GET" && url.pathname === "/") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            res.end(renderHtml({ token: rec.token }));
            return;
        }
        if (req.method === "GET" && url.pathname === "/state") {
            const state = rec.lastState || (await pushState(rec, deps.log));
            return sendJson(res, 200, state);
        }
        if (req.method === "GET" && url.pathname === "/events") {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
            res.write("retry: 3000\n\n");
            rec.sseClients.add(res);
            req.on("close", () => {
                rec.sseClients.delete(res);
                if (rec.sseClients.size === 0) clearTimeout(rec.timer);
            });
            if (rec.lastState) res.write("data: " + JSON.stringify({ type: "state", state: rec.lastState }) + "\n\n");
            schedule(rec, deps.log);
            return;
        }
        if (req.method === "POST" && url.pathname === "/action") {
            const body = await readBody(req);
            if (body === null) return sendJson(res, 413, { ok: false, error: "request too large" });
            let parsed;
            try {
                parsed = JSON.parse(body || "{}");
            } catch {
                return sendJson(res, 400, { ok: false, error: "invalid JSON" });
            }
            if (!parsed || typeof parsed.kind !== "string") return sendJson(res, 400, { ok: false, error: "missing kind" });
            const result = await dispatchAction(rec, parsed.kind, parsed.payload, deps);
            return sendJson(res, 200, result);
        }
        sendJson(res, 404, { ok: false, error: "not found" });
    };
}

export async function createInstanceServer({ factoryRoot, repo, issue, sendPrompt, log }) {
    const rec = {
        factoryRoot, repo: repo || null, issue: issue || null, sseClients: new Set(), token: randomBytes(16).toString("hex"),
        lastState: null, repoCache: null, timer: null, closed: false, notice: null, busy: null,
    };
    const deps = { sendPrompt, log };
    const handler = makeHandler(rec, deps);
    const server = createServer((req, res) => {
        handler(req, res).catch((err) => {
            if (log) log("Software Factory server error: " + (err && err.message), { level: "error" });
            try {
                if (!res.headersSent) sendJson(res, 500, { ok: false, error: "internal error" });
                else res.end();
            } catch {
                /* already closed */
            }
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    rec.server = server;
    rec.deps = deps;
    rec.url = `http://127.0.0.1:${port}/?token=${rec.token}`;
    return rec;
}

export async function closeInstance(rec) {
    rec.closed = true;
    clearTimeout(rec.timer);
    for (const res of rec.sseClients) {
        try {
            res.end();
        } catch {
            /* ignore */
        }
    }
    await new Promise((resolve) => rec.server.close(() => resolve()));
}
