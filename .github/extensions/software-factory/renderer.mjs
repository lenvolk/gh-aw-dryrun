// renderer.mjs - The Software Factory canvas page. Static shell plus a small script that renders state pushed
// over server-sent events. Inputs (token, request text) live in the static shell, so live updates never clear them.

export const SAMPLE_PROMPT =
    "/modernize I am a developer who just inherited this app. I need to assess it, review the assessment and the plan, " +
    "and approve the modernization. AI token usage and GitHub Actions minutes are important to me, so show me the predicted cost before I approve.";

const CSS = `
:root { color-scheme: light dark; --bg:#f6f8fa; --panel:#fff; --text:#1f2328; --muted:#59636e; --line:#d1d9e0; --accent:#0969da;
  --ok:#1a7f37; --warn:#9a6700; --bad:#d1242f; --run:#0969da; --chip:#eef1f4; --gate:#fff8c5; }
@media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --panel:#151b23; --text:#e6edf3; --muted:#9198a1; --line:#3d444d; --accent:#4493f8;
  --ok:#3fb950; --warn:#d29922; --bad:#f85149; --run:#4493f8; --chip:#212830; --gate:#2b2510; } }
* { box-sizing: border-box; }
body { margin:0; font: 13px/1.45 -apple-system, "Segoe UI", system-ui, sans-serif; background:var(--bg); color:var(--text); }
header { position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px; padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--line); }
header h1 { font-size:16px; margin:0; } header .sub { color:var(--muted); } header .grow { flex:1; }
.layout { display:grid; grid-template-columns: 300px 1fr; gap:14px; padding:14px; align-items:start; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:12px; }
.panel h2 { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin:0 0 8px; }
.repo { border:1px solid var(--line); border-radius:6px; padding:8px; margin-bottom:6px; cursor:pointer; }
.repo.sel { border-color:var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
.repo.off { opacity:.55; cursor:not-allowed; }
.repo .name { font-weight:600; } .repo .meta { color:var(--muted); font-size:12px; }
.badge { display:inline-block; padding:1px 7px; border-radius:10px; font-size:11px; font-weight:600; background:var(--chip); color:var(--muted); }
.badge.ok { background:color-mix(in srgb, var(--ok) 18%, transparent); color:var(--ok); }
.badge.bad { background:color-mix(in srgb, var(--bad) 18%, transparent); color:var(--bad); }
.badge.warn, .badge.attention, .badge.waiting { background:color-mix(in srgb, var(--warn) 22%, transparent); color:var(--warn); }
.badge.running { background:color-mix(in srgb, var(--run) 18%, transparent); color:var(--run); }
.badge.done { background:color-mix(in srgb, var(--ok) 18%, transparent); color:var(--ok); }
.badge.failed { background:color-mix(in srgb, var(--bad) 18%, transparent); color:var(--bad); }
button { font:inherit; border:1px solid var(--line); background:var(--chip); color:var(--text); border-radius:6px; padding:5px 10px; cursor:pointer; }
button:hover:not(:disabled) { border-color:var(--accent); }
button:disabled { opacity:.5; cursor:not-allowed; }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
button.good { background:var(--ok); border-color:var(--ok); color:#fff; }
button.danger { color:var(--bad); }
button.link { background:none; border:none; color:var(--accent); padding:0; }
.row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.kv { display:grid; grid-template-columns: auto 1fr; gap:3px 10px; font-size:12px; } .kv .k { color:var(--muted); }
input[type=password], input[type=text], textarea, select { font:inherit; width:100%; padding:6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--text); }
textarea { min-height:70px; resize:vertical; }
.help { display:none; font-size:12px; background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:8px 10px; margin-top:6px; }
.help.show { display:block; } .help ol { padding-left:18px; margin:4px 0; } .help li { margin:3px 0; }
.qm { width:24px; height:24px; padding:0; border-radius:50%; font-weight:700; }
.bar { height:10px; border-radius:5px; background:var(--chip); overflow:hidden; }
.bar > div { height:100%; background:var(--run); transition: width .6s; }
.bar.done > div { background:var(--ok); } .bar.failed > div { background:var(--bad); } .bar.attention > div { background:var(--warn); }
.stage { position:relative; background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-bottom:10px; }
.stage.gate { background:var(--gate); }
.stage .head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.stage .head h3 { margin:0; font-size:14px; } .stage .head .grow { flex:1; }
.stage .num { width:22px; height:22px; border-radius:50%; display:grid; place-items:center; background:var(--chip); font-size:11px; font-weight:700; }
.jobs { margin:8px 0 0; padding:0; list-style:none; font-size:12px; columns: 2; column-gap:18px; }
@media (max-width: 1100px) { .jobs { columns:1; } }
.jobs li { break-inside:avoid; padding:2px 0; display:flex; gap:6px; align-items:baseline; }
.jobs .step { color:var(--muted); }
.ico { width:14px; text-align:center; }
.rows { font-size:12px; color:var(--muted); margin-top:6px; }
.links { margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
.card { border:1px solid var(--line); border-radius:6px; padding:8px 10px; margin-top:8px; background:var(--panel); }
.card h4 { margin:0 0 6px; font-size:12px; }
table { border-collapse:collapse; width:100%; font-size:12px; }
th, td { text-align:left; padding:3px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
td.n, th.n { text-align:right; white-space:nowrap; }
.notice { padding:6px 10px; border-radius:6px; margin-bottom:10px; font-size:12px; }
.notice.ok { background:color-mix(in srgb, var(--ok) 14%, transparent); }
.notice.error { background:color-mix(in srgb, var(--bad) 14%, transparent); }
.notice.agent { background:color-mix(in srgb, var(--run) 14%, transparent); }
.muted { color:var(--muted); } .small { font-size:12px; }
.overall { display:flex; gap:12px; align-items:center; }
.overall .bar { flex:1; height:14px; border-radius:7px; }
dialog { border:1px solid var(--line); border-radius:8px; background:var(--panel); color:var(--text); max-width:560px; width:92%; }
dialog::backdrop { background: rgba(0,0,0,.4); }
.spin { display:inline-block; width:10px; height:10px; border:2px solid var(--run); border-right-color:transparent; border-radius:50%; animation: s 1s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
`;

const TOKEN_HELP = `
<p><b>Why:</b> the agents call Copilot with this token. It is stored only as the <code>COPILOT_GITHUB_TOKEN</code> secret of the selected repository. The canvas never writes it to disk or shows it to the AI.</p>
<ol>
<li>Open gh-aw's official link. It pre-fills the name and the <b>Copilot Requests</b> permission:<br>
<button class="link" data-url="https://github.com/settings/personal-access-tokens/new?name=COPILOT_GITHUB_TOKEN&amp;description=GitHub+Agentic+Workflows+-+Copilot+engine+authentication&amp;user_copilot_requests=read">Create the fine-grained token</button></li>
<li>Set <b>Resource owner</b> to <b>your personal user account</b>, not an organization. The account needs an active Copilot license.</li>
<li>Set <b>Repository access</b> to <b>Only select repositories</b> and select the target repository (for example <code>java-migration-copilot-samples</code>).</li>
<li>Open <b>Permissions</b>, select the <b>Account</b> tab (not Repositories), and confirm <b>Copilot Requests</b> is listed with access <b>Read</b>. If it is missing: <b>Add permissions</b> on the Account tab, search <code>Copilot</code>, tick <b>Copilot Requests</b>.</li>
<li>Choose a short expiration and select <b>Generate token</b>.</li>
<li>Copy the token. It must start with <code>github_pat_</code>; a classic <code>ghp_</code> token does not work. Paste it here and select <b>Save token</b>.</li>
</ol>
<p>Do not grant repository permissions. GitHub Actions uses its own token to write to the repository.</p>
<p><b>Adding another repository later:</b> open <button class="link" data-url="https://github.com/settings/personal-access-tokens">your fine-grained tokens</button>, select <b>COPILOT_GITHUB_TOKEN</b>, <b>Edit</b>, add the repository under <b>Repository access</b>, and <b>Update token</b>. Then nominate the repository in <code>templates/catalog.json</code> and save the token for it here.</p>
`;

const SCRIPT = String.raw`
const TOKEN = new URLSearchParams(location.search).get("token");
const q = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
let S = null;

async function act(kind, payload) {
  const r = await fetch("/action?token=" + TOKEN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, payload }) });
  const j = await r.json().catch(() => ({ ok: false, error: "No response" }));
  if (!j.ok && j.error) showNotice({ kind: "error", text: j.error });
  return j;
}
function showNotice(n) {
  const el = q("#notice");
  if (!n) { el.innerHTML = ""; return; }
  el.innerHTML = '<div class="notice ' + esc(n.kind) + '">' + esc(n.text) + "</div>";
}
function link(label, url, cls) { return url ? '<button class="' + (cls || "") + '" data-url="' + esc(url) + '">' + esc(label) + " ↗</button>" : ""; }
function icon(s) { return { done:"✅", running:'<span class="spin"></span>', failed:"❌", attention:"⚠️", waiting:"⏸️", skipped:"⏭️", pending:"○" }[s] || "○"; }
function badge(s) {
  const words = { done:"done", running:"running", failed:"failed", attention:"needs you", waiting:"waiting", skipped:"skipped", pending:"pending" };
  return '<span class="badge ' + esc(s) + '">' + esc(words[s] || s) + "</span>";
}
function dur(ms) { if (!ms) return ""; const s = Math.round(ms/1000), m = Math.floor(s/60); return m ? m + " min " + String(s%60).padStart(2,"0") + " s" : s + " s"; }
function tok(v) { if (v == null) return "n/a"; return v >= 1e6 ? (v/1e6).toFixed(2) + "M" : (v/1e3).toFixed(1) + "K"; }
function cr(v) { return v == null ? "n/a" : Number(v).toFixed(1); }
function usd(credits) { return credits == null ? "n/a" : "$" + (credits/100).toFixed(2); }
function runnerUsd(min, priv, rate) {
  if (min == null) return "n/a";
  const billed = "$" + (min * rate).toFixed(2);
  return priv === false ? "$0.00 <span class='muted'>(public; " + billed + " if private)</span>" : billed;
}

function renderCatalog() {
  q("#catalog").innerHTML = S.catalog.map((r) =>
    '<div class="repo ' + (r.repo === S.selected ? "sel " : "") + (r.nominated ? "" : "off") + '" data-repo="' + esc(r.repo) + '" title="' + esc(r.reason || "") + '">' +
    '<div class="row"><span class="name">' + esc(r.title) + "</span>" + (r.nominated ? '<span class="badge ok">nominated</span>' : '<span class="badge">not nominated</span>') + "</div>" +
    '<div class="meta">' + esc(r.repo) + " · " + esc(r.language || "") + "</div>" +
    '<div class="meta">' + esc(r.nominated ? r.description : r.reason) + "</div></div>").join("");
}

function renderRepoStatus() {
  const t = S.templateStatus || {}, i = S.repoInfo || {};
  const stamp = t.stamp ? "template " + esc(t.stamp.templateCommit) + " · " + esc((t.stamp.deployedAt || "").slice(0, 10)) : "no factory stamp yet";
  q("#repoStatus").innerHTML = S.blocked ? '<div class="muted small">' + esc(S.blocked) + "</div>" :
    '<div class="kv">' +
    '<span class="k">Visibility</span><span>' + esc(i.visibility || "?") + (i.visibility === "public" ? ' <span class="muted">(runner minutes free)</span>' : "") + "</span>" +
    '<span class="k">Template</span><span>' + (t.deployed ? '<span class="badge ok">deployed</span> ' : '<span class="badge warn">not deployed</span> ') + '<span class="muted">' + stamp + "</span></span>" +
    '<span class="k">Workflows</span><span>' + esc(t.workflowsPresent ?? "?") + " of " + esc(t.workflowsExpected ?? "?") + " orchestrators registered</span>" +
    '<span class="k">Copilot token</span><span>' + (t.tokenSet ? '<span class="badge ok">secret set</span>' : t.tokenSet === false ? '<span class="badge warn">not set</span>' : "?") + "</span>" +
    '<span class="k">Signed in</span><span>' + esc(S.me || "?") + "</span></div>";
  const disabled = !!S.blocked;
  for (const id of ["#deployBtn", "#updateBtn", "#resetBtn", "#saveToken", "#startBtn"]) q(id).disabled = disabled;
}

function renderRequests() {
  const sel = q("#requestSel");
  const cur = S.issue ? String(S.issue) : "";
  const opts = ['<option value="">Open an existing request…</option>'].concat((S.requests || []).map((r) =>
    '<option value="' + r.number + '"' + (String(r.number) === cur ? " selected" : "") + ">#" + r.number + " · " + esc(r.title) + " · " + esc(r.state) + " · " + esc(r.created_at.slice(0, 10)) + "</option>"));
  sel.innerHTML = opts.join("");
}

function costPredicted(p) {
  if (!p) return "";
  const names = { assessment: "Assessment", plan: "Plan", execution: "Execution" };
  let tc = 0, tl = 0, th = 0, tm = 0, tt = 0;
  const rows = Object.entries(p.stages).map(([k, e]) => {
    tc += e.ai_credits || 0; tl += e.ai_low ?? e.ai_credits ?? 0; th += e.ai_high ?? e.ai_credits ?? 0; tm += e.minutes || 0; tt += e.tokens || 0;
    const range = e.kind === "predicted" ? ' <span class="muted">(' + cr(e.ai_low) + "–" + cr(e.ai_high) + ")</span>" : "";
    const src = e.minutes_source === "baseline" ? "baseline" : e.minutes_source === "this run" ? "this run" : "measured " + e.minutes_source;
    return "<tr><td>" + names[k] + ' <span class="muted">' + esc(e.kind) + "</span></td><td class=n>" + tok(e.tokens) + "</td><td class=n>" + cr(e.ai_credits) + range +
      "</td><td class=n>" + usd(e.ai_credits) + "</td><td class=n>" + esc(e.minutes) + ' <span class="muted">' + esc(src) + "</span></td><td class=n>" + runnerUsd(e.minutes, p.private, p.rate) + "</td></tr>";
  }).join("");
  return '<div class="card"><h4>Predicted cost (AI and GitHub Actions)</h4><table><tr><th>Stage</th><th class=n>AI tokens</th><th class=n>AI credits</th><th class=n>AI USD</th><th class=n>Runner min</th><th class=n>Runner USD</th></tr>' + rows +
    "<tr><th>Total</th><th class=n>" + tok(tt) + "</th><th class=n>" + cr(tc) + ' <span class="muted">(' + cr(tl) + "–" + cr(th) + ")</span></th><th class=n>" + usd(tc) + "</th><th class=n>" + tm + "</th><th class=n>" + runnerUsd(tm, p.private, p.rate) + "</th></tr></table>" +
    '<div class="muted small">1 AI credit = $0.01. Runner: $' + Number(p.rate).toFixed(3) + "/min, each job rounded up to a minute.</div></div>";
}

function costActual(c) {
  if (!c) return "";
  const names = { assessment: "Assessment", plan: "Plan", execution: "Execution" };
  const d = (a, p, digits = 1) => a == null || p == null ? "n/a" : (a - p >= 0 ? "+" : "−") + Math.abs(a - p).toFixed(digits);
  let pc = 0, ac = 0, pm = 0, am = 0;
  const rows = Object.entries(c.stages).map(([k, v]) => {
    const p = v.predicted, a = v.actual;
    pc += p.ai_credits || 0; ac += a.ai_credits || 0; pm += p.minutes || 0; am += a.minutes || 0;
    return "<tr><td>" + names[k] + "</td><td class=n>" + cr(p.ai_credits) + "</td><td class=n><b>" + cr(a.ai_credits) + "</b></td><td class=n>" + d(a.ai_credits, p.ai_credits) +
      "</td><td class=n>" + esc(p.minutes) + "</td><td class=n><b>" + (a.minutes ?? "n/a") + "</b></td><td class=n>" + d(a.minutes, p.minutes, 0) + "</td></tr>";
  }).join("");
  return '<div class="card"><h4>Actual vs predicted cost</h4><table><tr><th>Stage</th><th class=n>AI predicted</th><th class=n>AI actual</th><th class=n>Δ</th><th class=n>Min predicted</th><th class=n>Min actual</th><th class=n>Δ</th></tr>' + rows +
    "<tr><th>Total</th><th class=n>" + cr(pc) + "</th><th class=n>" + cr(ac) + "</th><th class=n>" + d(ac, pc) + "</th><th class=n>" + pm + "</th><th class=n>" + am + "</th><th class=n>" + d(am, pm, 0) + "</th></tr>" +
    "<tr><th>USD</th><td class=n>" + usd(pc) + "</td><td class=n><b>" + usd(ac) + "</b></td><td></td><td class=n>" + runnerUsd(pm, c.private, c.rate) + "</td><td class=n><b>" + runnerUsd(am, c.private, c.rate) + "</b></td><td></td></tr></table></div>";
}

function glance(rows) {
  if (!rows || !rows.length) return "";
  return '<div class="card"><h4>Assessment at a glance</h4><table><tr><th>Measure</th><th>Now</th><th>Target or result</th></tr>' +
    rows.map((r) => "<tr><td>" + esc(r.measure) + "</td><td>" + esc(r.now) + "</td><td>" + esc(r.target) + "</td></tr>").join("") + "</table></div>";
}

function stageBody(s) {
  const L = S.links || {}, C = S.cards || {};
  let h = "";
  if (s.kind === "stage") {
    h += '<div class="row"><div class="bar ' + esc(s.status) + '" style="flex:1"><div style="width:' + (s.percent || 0) + '%"></div></div><b>' + (s.percent || 0) + "%</b>" +
      (s.elapsedMs ? '<span class="muted small">' + dur(s.elapsedMs) + "</span>" : "") + "</div>";
  }
  if (s.jobs && s.jobs.length) {
    h += '<ul class="jobs">' + s.jobs.map((j) => "<li><span class=ico>" + icon(j.status) + "</span><span>" +
      (j.url ? '<button class="link" data-url="' + esc(j.url) + '">' + esc(j.name) + "</button>" : esc(j.name)) +
      (j.step ? ' <span class="step">· ' + esc(j.step) + "</span>" : "") +
      (j.status === "failed" ? ' <button class="link" data-act="troubleshoot" data-job="' + esc(j.name) + '" data-joburl="' + esc(j.url || "") + '">Troubleshoot with Copilot</button>' : "") +
      "</span></li>").join("") + "</ul>";
  }
  if (s.rows && s.rows.length) h += '<div class="rows">' + s.rows.map((r) => icon(r.status) + " " + esc(r.stage) + ": " + esc(r.detail.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"))).join("<br>") + "</div>";
  const links = [];
  switch (s.key) {
    case "request":
      if (S.request && S.request.body) h += '<blockquote class="small" style="margin:8px 0;padding:6px 10px;border-left:3px solid var(--line);white-space:pre-wrap">' + esc(S.request.body.slice(0, 600)) + "</blockquote>";
      links.push(link("Request issue", L.issue), link("Expanded request", L.request), link("Status board", L.tracker));
      break;
    case "assessment":
      if (s.status === "done") {
        links.push(link("Review the Assessment Report", L.report, "primary"), link("Evidence artifacts", L.artifacts), link("Assessment run", L.assessmentRun));
        links.push('<button data-act="explain_report">Explain it in Copilot chat</button>');
        h += glance(C.glance) + costPredicted(C.predicted);
      } else links.push(link("Assessment run", L.assessmentRun));
      break;
    case "gate1":
      if (s.status === "attention" && S.gate1) {
        h += '<div class="small">The run waits in the <b>' + esc(S.gate1.environment.name) + '</b> environment. Review the report and the predicted cost above, then decide. Nothing in the repository has changed.</div>';
        links.push('<button class="good" data-act="approve_gate1"' + (S.gate1.canApprove ? "" : " disabled") + ">Approve gate 1</button>", '<button class="danger" data-act="reject_gate1">Reject</button>');
      } else if (s.status === "done") h += '<div class="small muted">Approved. The plan pull request was opened from the approved report.</div>';
      else h += '<div class="small muted">Opens when the Assessment Report is ready.</div>';
      break;
    case "plan":
      links.push(link("Plan pull request", L.planPr), link("plan.md", L.plan), link("Cost estimate", L.costEstimate), link("Plan validation", L.validation), link("Files changed", L.planFiles));
      break;
    case "gate2": {
      const pr = S.planPr;
      if (s.status === "attention" && pr) {
        h += '<div class="small">Merging puts only Markdown and evidence on <code>' + esc(pr.defaultBranch || "main") + "</code>, in <code>" + esc(pr.requestDir || "") + "/</code>" +
          (pr.files ? " (" + pr.files.length + " files)" : "") + ". The Java code does not change. The merge starts the execution.</div>";
        links.push(link("Review plan pull request #" + pr.number, pr.html_url), '<button class="good" data-act="merge_plan" data-number="' + pr.number + '">Merge plan (gate 2)</button>');
      } else if (s.status === "done") h += '<div class="small muted">Plan merged.</div>';
      else h += '<div class="small muted">Opens when the plan passes validation.</div>';
      break;
    }
    case "execution":
      if (C.verification) h += '<div class="small"><b>Verification:</b> ' + esc(C.verification) + "</div>";
      links.push(link("Execution run", L.executionRun), link("Verification on JDK 21", L.verification), link("Commits vs main", L.compare));
      break;
    case "gate3": {
      const pr = S.implPr;
      if (pr) {
        h += costActual(C.actual);
        links.push(link("Implementation PR #" + pr.number, pr.html_url, "primary"), link("Files", L.implFiles), link("Checks", L.implChecks), link("Cost comment", L.cost));
        if (pr.myApproval) h += '<div class="small">Approved by you. <b>Not merged</b>: <code>main</code> keeps the original Java 8 code; the modernized code stays on <code>' + esc(pr.head) + "</code>.</div>";
        else if (s.status === "attention") links.push('<button class="good" data-act="approve_impl" data-number="' + pr.number + '">Approve (review only, no merge)</button>');
      } else h += '<div class="small muted">Opens when execution creates the Implementation pull request.</div>';
      break;
    }
  }
  const l = links.filter(Boolean);
  if (l.length) h += '<div class="links">' + l.join("") + "</div>";
  return h;
}

function renderTimeline() {
  if (S.blocked) { q("#overall").innerHTML = ""; q("#timeline").innerHTML = '<div class="panel muted">' + esc(S.blocked) + "</div>"; return; }
  const t = S.tracker;
  const req = S.request;
  q("#overall").innerHTML = req ? '<div class="panel"><div class="row" style="margin-bottom:6px"><b>Request #' + esc(req.number) + "</b> " + esc(req.title || "") + " " +
      (req.state ? '<span class="badge">' + esc(req.state) + "</span>" : "") + '<span class="grow"></span>' + (S.active ? '<span class="badge running">live</span>' : "") + "</div>" +
      '<div class="overall"><div class="bar"><div style="width:' + (t ? Math.round(t.done / t.total * 100) : 0) + '%"></div></div><span>' + (t ? t.done + " of " + t.total + " stages done" : "waiting for the status board") + "</span></div></div>"
    : '<div class="panel muted">No request selected. Type a /modernize request above, or open an existing one.</div>';
  q("#timeline").innerHTML = (S.stages || []).map((s, i) =>
    '<div class="stage ' + (s.kind === "gate" ? "gate" : "") + '"><div class="head"><span class="num">' + (s.kind === "gate" ? "🔒" : i + 1) + "</span><h3>" + esc(s.title) + '</h3><span class="grow"></span>' + badge(s.status) + "</div>" +
    (S.issue ? stageBody(s) : "") + "</div>").join("");
}

function render() {
  if (!S) return;
  if (!S.ok) { showNotice({ kind: "error", text: "Could not read GitHub: " + (S.error || "unknown error") }); return; }
  q("#updated").textContent = "updated " + new Date(S.updatedAt).toLocaleTimeString();
  q("#factory").textContent = S.factory + " → " + S.selected;
  renderCatalog(); renderRepoStatus(); renderRequests(); renderTimeline();
  showNotice(S.busy ? { kind: "agent", text: S.busy } : S.notice);
}

function mergePlanText() {
  const pr = S.planPr || {};
  const main = pr.defaultBranch || "main";
  const dir = pr.requestDir || ("docs/modernization/requests/" + S.issue);
  const files = (pr.files || []).filter(Boolean);
  const outside = files.filter((f) => !f.startsWith(dir + "/"));
  const list = files.length ? files.map((f) => "  • " + f.replace(dir + "/", "")).join("\n") : "  (file list unavailable; open Files changed on the plan pull request)";
  return "Merge plan pull request #" + pr.number + " (gate 2)?\n\n" +
    "These " + (files.length ? files.length + " " : "") + "files are squash-merged into the " + main + " branch of " + S.selected + ", in the folder:\n" +
    "  " + dir + "/\n\n" + list + "\n\n" +
    (outside.length ? "WARNING: " + outside.length + " file(s) are outside that folder: " + outside.join(", ") + "\n\n" : "") +
    "No Java code changes: " + main + " stays on Java 8. The merge starts the execution run, which writes the modernized code to the branch modernize/issue-" + S.issue + ", not to " + main + ".";
}

function askConfirm(text) {
  const dlg = q("#confirmDlg");
  q("#confirmText").textContent = text;
  return new Promise((resolve) => {
    const finish = (v) => { dlg.close(); q("#confirmYes").onclick = q("#confirmNo").onclick = null; resolve(v); };
    q("#confirmYes").onclick = (e) => { e.preventDefault(); finish(true); };
    q("#confirmNo").onclick = (e) => { e.preventDefault(); finish(false); };
    dlg.showModal();
  });
}

document.addEventListener("click", async (ev) => {
  const urlEl = ev.target.closest("[data-url]");
  if (urlEl) { ev.preventDefault(); await act("open_url", { url: urlEl.dataset.url }); return; }
  const repoEl = ev.target.closest(".repo");
  if (repoEl && !repoEl.classList.contains("off")) { await act("select_repo", { repo: repoEl.dataset.repo }); return; }
  const a = ev.target.closest("[data-act]");
  if (!a) return;
  const kind = a.dataset.act;
  const confirmText = {
    approve_gate1: "Approve gate 1? The run continues: the plan pull request is opened from this report.",
    reject_gate1: "Reject gate 1? The run stops here. Nothing changes in the repository.",
    merge_plan: S && S.planPr ? mergePlanText() : "Merge the plan pull request (gate 2)?",
    approve_impl: "Submit an approving review (gate 3)? The pull request is NOT merged.",
  }[kind];
  if (confirmText && !(await askConfirm(confirmText))) return;
  a.disabled = true;
  try { await act(kind, { number: a.dataset.number, job: a.dataset.job, url: a.dataset.joburl }); } finally { a.disabled = false; }
});

q("#helpBtn").addEventListener("click", () => q("#help").classList.toggle("show"));
q("#saveToken").addEventListener("click", async () => {
  const input = q("#token");
  const r = await act("save_token", { token: input.value });
  if (r.ok) input.value = "";
});
q("#startBtn").addEventListener("click", async () => {
  const text = q("#prompt").value;
  const r = await act("create_request", { text });
  if (r.ok) q("#prompt").value = "";
});
q("#sampleBtn").addEventListener("click", () => { q("#prompt").value = q("#prompt").placeholder; q("#prompt").focus(); });
q("#requestSel").addEventListener("change", (e) => act("select_issue", { issue: e.target.value }));
q("#refreshBtn").addEventListener("click", () => act("refresh"));
q("#deployBtn").addEventListener("click", () => act("deploy"));
q("#updateBtn").addEventListener("click", () => act("update_template"));

q("#resetBtn").addEventListener("click", async () => {
  const dlg = q("#resetDlg");
  q("#resetPreview").textContent = "Reading the repository…";
  q("#resetConfirm").value = "";
  q("#resetErr").textContent = "";
  q("#resetRepo").textContent = S.selected;
  q("#keepIssueLabel").textContent = S.issue ? "Keep request #" + S.issue + " open (your pre-run)" : "Keep the selected request open";
  q("#keepIssue").checked = false; q("#keepIssue").disabled = !S.issue;
  dlg.showModal();
  const r = await act("reset_preview");
  if (r.ok) {
    const p = r.preview;
    q("#resetPreview").innerHTML = "<b>" + p.issues.length + "</b> open issues, <b>" + p.prs.length + "</b> open pull requests, <b>" + p.branches.length + "</b> branches other than main, <b>" + p.runs + "</b> workflow runs." +
      (p.branches.length ? '<div class="muted small">' + p.branches.map(esc).join(", ") + "</div>" : "");
  } else q("#resetPreview").textContent = r.error || "Preview failed";
});
q("#resetGo").addEventListener("click", async (ev) => {
  ev.preventDefault();
  const r = await act("reset_execute", { confirm: q("#resetConfirm").value.trim(), keepIssue: q("#keepIssue").checked ? S.issue : null, deleteRuns: q("#deleteRuns").checked });
  q("#resetErr").textContent = r.ok ? "" : (r.error || "Reset failed");
  if (r.ok) q("#resetDlg").close();
});
q("#resetCancel").addEventListener("click", (ev) => { ev.preventDefault(); q("#resetDlg").close(); });

const es = new EventSource("/events?token=" + TOKEN);
es.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.type === "state") { S = msg.state; render(); }
  else if (msg.type === "notice") showNotice(msg.notice);
  else if (msg.type === "busy") showNotice({ kind: "agent", text: msg.busy });
};
fetch("/state?token=" + TOKEN).then((r) => r.json()).then((s) => { if (!S) { S = s; render(); } });
`;

export function renderHtml() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Software Factory</title><style>${CSS}</style></head><body>
<header><h1>🏭 Software Factory</h1><span class="sub" id="factory"></span><span class="grow"></span><span class="sub" id="updated"></span><button id="refreshBtn">Refresh</button></header>
<div class="layout">
<aside>
  <div class="panel"><h2>Repository catalog</h2><div id="catalog"></div>
    <div class="muted small">Only nominated repositories may spend the factory's Actions minutes and AI credits. Edit <code>templates/catalog.json</code> to nominate one.</div></div>
  <div class="panel"><h2>Selected repository</h2><div id="repoStatus"></div></div>
  <div class="panel"><h2>Copilot token</h2>
    <div class="row" style="flex-wrap:nowrap"><input type="password" id="token" placeholder="github_pat_…" autocomplete="off" spellcheck="false"><button class="qm" id="helpBtn" title="How to create the token">?</button></div>
    <div class="row" style="margin-top:6px"><button class="primary" id="saveToken">Save token</button><span class="muted small">Stored only as a repository secret.</span></div>
    <div class="help" id="help">${TOKEN_HELP}</div></div>
  <div class="panel"><h2>Template</h2>
    <div class="row"><button id="deployBtn" title="Copy missing template files, configure the repository, compile">Deploy</button><button id="updateBtn" title="Overwrite files that differ from the factory template">Update template</button></div>
    <div class="muted small" style="margin-top:6px">The Copilot agent runs <code>templates/JavaModernization/deploy.ps1</code> and asks you in chat before it pushes.</div>
    <div class="row" style="margin-top:10px"><button class="danger" id="resetBtn">Reset target…</button></div></div>
</aside>
<main>
  <div class="panel"><h2>Modernization request</h2>
    <textarea id="prompt" placeholder="${SAMPLE_PROMPT.replace(/"/g, "&quot;")}"></textarea>
    <div class="row" style="margin-top:6px"><button class="primary" id="startBtn">Start request</button><button class="link" id="sampleBtn">Use the sample prompt</button>
      <span class="grow" style="flex:1"></span><select id="requestSel" style="width:auto;max-width:55%"></select></div>
    <div class="muted small" style="margin-top:4px">Creates an issue with your exact text. It must start with <code>/modernize</code>; the pipeline expands the request itself.</div></div>
  <div id="notice"></div>
  <div id="overall"></div>
  <div id="timeline"></div>
</main>
</div>
<dialog id="resetDlg"><form method="dialog">
  <h3 style="margin-top:0">Reset <span id="resetRepo"></span></h3>
  <p class="small">Closes open issues and pull requests, deletes every branch except <code>main</code>, and deletes workflow runs. The deployed template and merged plans on <code>main</code> stay.</p>
  <div id="resetPreview" class="small"></div>
  <p class="small"><label><input type="checkbox" id="keepIssue"> <span id="keepIssueLabel"></span></label><br>
  <label><input type="checkbox" id="deleteRuns" checked> Delete workflow runs (the runner-minute prediction then falls back to the baseline)</label></p>
  <p class="small">Type the repository name to confirm:</p><input type="text" id="resetConfirm" autocomplete="off">
  <div id="resetErr" class="small" style="color:var(--bad);margin-top:6px"></div>
  <div class="row" style="margin-top:10px;justify-content:flex-end"><button id="resetCancel">Cancel</button><button class="danger" id="resetGo">Reset</button></div>
</form></dialog>
<dialog id="confirmDlg"><form method="dialog"><p id="confirmText" style="white-space:pre-line;font-size:13px"></p>
  <div class="row" style="justify-content:flex-end"><button id="confirmNo">Cancel</button><button class="good" id="confirmYes">Confirm</button></div></form></dialog>
<script>${SCRIPT}</script>
</body></html>`;
}
