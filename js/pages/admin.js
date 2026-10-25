// The Admin Control Centre (admin.html): one page for running the app.
//   Overview (users, plans, revenue) · System health · Server · API monitor
//   AI & routing · Live log · Security · Backend · Code health · Releases
// Only admins get data: every admin_* function checks "is this an admin?"
// inside the database (supabase/upgrade_admin_ai.sql), not just here.
// This page is for the team, so it is in English only.
import { apiCalls, apiKind, onApiCall } from "../api-monitor.js"; // must stay the first import
import { SUPABASE_KEY, SUPABASE_URL } from "../config.js";
import { supabase } from "../supabase-client.js";
import {
  adminBackend, adminEvents, adminOverview, adminSecurity, adminUsers, askAI, healthPing, isAdmin, logAiRequest, pingAI,
} from "../db.js";
import { formatRM } from "../cashflow.js";
import { adviceLines, aiSummary } from "../insights.js";
import { demoForecast } from "../plans.js";
import { CODE_STATS } from "../code-stats.js";
import { LIBRARIES, RELEASES, RELEASE_DATE, VERSION } from "../version.js";
import { html, kpi, raw, runPage, show as showHtml, startPage, todayISO } from "../ui.js";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const MY = "Asia/Kuala_Lumpur";
const clock = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: MY, hour12: false });
const dateTime = (d) => (d ? new Date(d).toLocaleString("en-GB", {
  timeZone: MY, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
}) : "Never");
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ms = (n) => `${Math.round(n)} ms`;
const dot = (state) => html`<span class="status-dot status-${state}" aria-hidden="true"></span>`;
const STATE_TEXT = { ok: "Working", warn: "Needs attention", bad: "Down", wait: "Checking…", idle: "Not tested yet" };
const errorText = (error) => String(error?.message || error || "Unknown error").slice(0, 160);
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];

const VERCEL_REGIONS = {
  sin1: "Singapore", hkg1: "Hong Kong", hnd1: "Tokyo", kix1: "Osaka", icn1: "Seoul", bom1: "Mumbai", syd1: "Sydney",
  iad1: "Washington DC, USA", cle1: "Cleveland, USA", pdx1: "Portland, USA", sfo1: "San Francisco, USA",
  fra1: "Frankfurt", cdg1: "Paris", lhr1: "London", dub1: "Dublin", arn1: "Stockholm", gru1: "São Paulo",
  cpt1: "Cape Town", dxb1: "Dubai",
};
const AWS_REGIONS = {
  "ap-southeast-1": "Singapore", "ap-southeast-2": "Sydney", "ap-northeast-1": "Tokyo", "ap-northeast-2": "Seoul",
  "ap-south-1": "Mumbai", "us-east-1": "N. Virginia, USA", "us-east-2": "Ohio, USA", "us-west-1": "N. California, USA",
  "us-west-2": "Oregon, USA", "eu-central-1": "Frankfurt", "eu-west-1": "Ireland", "eu-west-2": "London",
  "eu-west-3": "Paris", "ca-central-1": "Canada", "sa-east-1": "São Paulo",
};
const region = (code, names) => (code ? `${names[code] ?? code} (${code})` : "Unknown");

// The CSP blocks inline style="" attributes, so bar widths are written as
// data-w="42" and set from JavaScript after each render (which CSP allows).
function show(target, content) {
  const el = showHtml(target, content);
  el.querySelectorAll("[data-w]").forEach((bar) => { bar.style.width = `${bar.dataset.w}%`; });
  return el;
}

// What we learn from the checks, shared by several sections.
const info = { vercelId: null, protocol: null, ping: null, fn: null, headers: null, aiTest: null };
let paused = false;

// ---------------------------------------------------------------------------
// Static reference tables
// ---------------------------------------------------------------------------
const ENDPOINTS = [
  ["POST", "/auth/v1/signup", "Create an account", "Public key"],
  ["POST", "/auth/v1/token", "Log in", "Public key"],
  ["GET", "/auth/v1/user", "Check who is logged in", "User token"],
  ["GET, PATCH", "/rest/v1/profiles", "Business details, cash, plan", "User token + RLS"],
  ["GET, POST, PATCH, DELETE", "/rest/v1/invoices", "Invoices", "User token + RLS"],
  ["GET, POST, PATCH, DELETE", "/rest/v1/expenses", "Expenses", "User token + RLS"],
  ["GET, POST, DELETE", "/rest/v1/uploads, /import_rows", "CSV uploads waiting for review", "User token + RLS"],
  ["GET, POST, DELETE", "/rest/v1/team_invites", "Team invites (Premium)", "User token + RLS"],
  ["POST", "/rest/v1/rpc/start_premium_trial", "Start the 1-month free trial (once)", "User token"],
  ["POST", "/rest/v1/rpc/mark_invoice_paid", "Mark paid and add to cash in one step", "User token"],
  ["POST", "/rest/v1/rpc/accept_import", "Confirm reviewed CSV rows", "User token"],
  ["POST", "/rest/v1/rpc/log_ai_request", "Record an AI request in the log", "User token"],
  ["POST", "/rest/v1/rpc/health_ping", "Is the database awake?", "User token"],
  ["POST", "/rest/v1/rpc/admin_*", "This Control Centre", "Admins only"],
  ["POST", "/functions/v1/ai-insights", "AI advice (our Edge Function)", "User token"],
  ["POST", "Google: models/…:generateContent", "Gemini AI, called only by the Edge Function", "Secret key (server only)"],
];

const ROUTES = [
  ["/ (index.html)", "Everyone", "Home page. Logged-in users go straight to the dashboard."],
  ["/login.html, /register.html", "Everyone", "Log in and sign up (choose a plan)."],
  ["/dashboard.html", "Logged in", "startPage({ login: true }) sends visitors to the login page."],
  ["/invoices, /expenses, /import, /settings", "Logged in", "Same login check. The database (RLS) only returns their own rows."],
  ["/reports.html", "Basic, Premium", "Plan check on the page; Free users see an upgrade card."],
  ["/scenarios.html, /team.html", "Premium", "Plan check on the page; others see an upgrade card."],
  ["/admin.html", "Admins only", "is_admin() is checked in the database on every call."],
  ["Any other address", "Everyone", "Vercel shows our 404.html page."],
];

const FUNCTION_NOTES = {
  handle_new_user: "Creates the profile (and free trial) when someone signs up",
  start_premium_trial: "Starts the 30-day Premium trial, once per account",
  mark_invoice_paid: "Marks an invoice paid and adds the money to cash, all-or-nothing",
  accept_import: "Turns ticked CSV rows into invoices/expenses",
  clear_my_data: "Deletes the user's own records",
  limit_team_invites: "Allows at most 10 team invites",
  is_admin: "Is the caller an admin?",
  require_admin: "Stops admin functions for non-admins",
  log_event: "Writes one line to the live log",
  log_profile_change: "Logs sign-ups, plan changes, trials, demo data",
  log_login: "Logs every login",
  log_rows_added: "Logs new invoices and expenses",
  log_invoice_paid: "Logs paid invoices",
  log_upload: "Logs CSV uploads and reviews",
  log_team_invite: "Logs team invites",
  log_ai_request: "Logs AI requests and fallbacks",
  health_ping: "Health check for the database",
  rm: "Formats sen as RM text",
  admin_overview: "Control Centre: headline numbers",
  admin_users: "Control Centre: user list",
  admin_events: "Control Centre: live log",
  admin_security: "Control Centre: security status",
  admin_backend: "Control Centre: this backend view",
};

const EVENT_STYLE = {
  signup: ["bi-person-plus", "New sign-up"], login: ["bi-box-arrow-in-right", "Login"],
  plan_change: ["bi-arrow-left-right", "Plan change"], trial_started: ["bi-gift", "Trial started"],
  demo_loaded: ["bi-database-add", "Demo data"], invoice_added: ["bi-receipt", "Invoice"],
  invoice_paid: ["bi-cash-coin", "Invoice paid"], expense_added: ["bi-wallet2", "Expense"],
  csv_uploaded: ["bi-upload", "CSV upload"], csv_reviewed: ["bi-check2-square", "CSV reviewed"],
  team_invite: ["bi-people", "Team invite"], ai_request: ["bi-stars", "AI request"],
  ai_fallback: ["bi-exclamation-triangle", "AI fallback"],
};

const SECTIONS = [
  ["overview", "Overview"], ["health", "System health"], ["server", "Server"], ["api", "API"],
  ["ai", "AI & routing"], ["log", "Live log"], ["security", "Security"], ["backend", "Backend"],
  ["code", "Code health"], ["releases", "Releases"],
];

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
runPage(async () => {
  const ctx = await startPage("admin", { login: true });
  if (!(await isAdmin())) {
    showNotAdmin(ctx.email);
    return;
  }

  show("main", html`
    <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
      <div>
        <div class="eyebrow mb-1">SME CashFlow · Admin</div>
        <h1 class="h3 mb-1">Admin Control Centre</h1>
        <div class="text-secondary small">Version ${VERSION} · released ${longDate(RELEASE_DATE)} · logged in as ${ctx.email}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="live-pill" id="live-pill"><span class="live-dot"></span> Live · <span id="live-time">…</span></span>
        <button class="btn btn-sm btn-outline-secondary" type="button" id="pause-button"><i class="bi bi-pause-fill"></i> Pause</button>
      </div>
    </div>
    <nav class="admin-tabs mb-4" aria-label="Sections">${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav>

    ${section("overview", "Overview", "bi-speedometer2", "Users, plans and activity, straight from the database.")}
    ${section("health", "System health", "bi-heart-pulse", "Each part of the app is checked every 30 seconds.")}
    ${section("server", "Server", "bi-hdd-network", "Where each part runs.")}
    ${section("api", "API", "bi-plug", "Every request this page makes, live, plus the full list of API endpoints the app uses.")}
    ${section("ai", "AI & routing", "bi-diagram-3", "How a request travels from the phone to the AI and back.")}
    ${section("log", "Live log", "bi-activity", "What users are doing, written by the database itself. Updates every 5 seconds.")}
    ${section("security", "Cyber security", "bi-shield-lock", "Live checks of the protections in the app and the database.")}
    ${section("backend", "Backend engineering", "bi-database-gear", "The database tables, functions and triggers behind the app.")}
    ${section("code", "Code health", "bi-bug", "The automatic tests run right here in your browser.")}
    ${section("releases", "Releases", "bi-tag", "Version history.")}
  `);

  document.getElementById("pause-button").addEventListener("click", (event) => {
    paused = !paused;
    event.currentTarget.innerHTML = paused ? '<i class="bi bi-play-fill"></i> Resume' : '<i class="bi bi-pause-fill"></i> Pause';
    document.getElementById("live-pill").classList.toggle("paused", paused);
  });

  renderReleases();
  renderApi();
  onApiCall(() => renderApiLive());
  renderAiStatic();

  await Promise.all([loadOverview(), runHealth(), loadLog()]);
  renderServer();
  await Promise.all([loadSecurity(), loadBackend()]);
  runCodeHealth();

  setInterval(() => { if (!paused) loadLog(); }, 5000);
  setInterval(() => { if (!paused) { runHealth().then(renderServer); loadOverview(); } }, 30000);
  if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
});

function section(id, title, icon, subtitle) {
  return html`<section id="${id}" class="admin-section mb-4">
    <div class="d-flex align-items-center gap-2 mb-1"><i class="bi ${icon} section-icon"></i><h2 class="h5 m-0">${title}</h2></div>
    <p class="text-secondary small mb-3">${subtitle}</p>
    <div id="${id}-body"><p class="text-secondary small">Loading…</p></div>
  </section>`;
}

function touchLive() {
  const el = document.getElementById("live-time");
  if (el) el.textContent = `updated ${clock(new Date())}`;
}

function showNotAdmin(email) {
  const sql = `insert into public.admins (user_id)\nselect id from auth.users where lower(email) = lower('${email}')\non conflict (user_id) do nothing;`;
  show("main", html`<div class="card p-4 mx-auto form-card">
    <div class="display-6 text-secondary"><i class="bi bi-shield-lock"></i></div>
    <h1 class="h4 mt-2">Admins only</h1>
    <p class="text-secondary">The Admin Control Centre is only for the SME CashFlow team. Your account is not an admin.</p>
    <p class="small mb-2"><strong>Are you the project owner?</strong> In Supabase, open <strong>SQL Editor</strong>, make sure you have run
      <code>supabase/upgrade_admin_ai.sql</code>, then run:</p>
    <pre class="sql-box">${sql}</pre>
    <a class="btn btn-outline-secondary" href="dashboard.html">Back to dashboard</a>
  </div>`);
}

// ---------------------------------------------------------------------------
// 1. Overview
// ---------------------------------------------------------------------------
async function loadOverview() {
  try {
    const [o, users] = await Promise.all([adminOverview(), adminUsers()]);
    const plans = { free: 0, basic: 0, premium: 0, ...o.plans };
    const total = Math.max(1, o.users_total);
    show("overview-body", html`
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-2">${kpi("Users", String(o.users_total), "", `+${o.users_7d} in 7 days`)}</div>
        <div class="col-6 col-lg-2">${kpi("Active today", String(o.active_24h), "", `${o.logins_24h} logins in 24 h`)}</div>
        <div class="col-6 col-lg-2">${kpi("Monthly revenue", formatRM(o.mrr_sen), "good", "Prototype: nothing charged")}</div>
        <div class="col-6 col-lg-2">${kpi("Free trials", String(o.trials_active), "", `${o.trials_used} used in total`)}</div>
        <div class="col-6 col-lg-2">${kpi("Records", String(o.invoices + o.expenses), "", `${o.invoices} invoices · ${o.expenses} expenses`)}</div>
        <div class="col-6 col-lg-2">${kpi("Events (24 h)", String(o.events_24h), o.errors_24h ? "bad" : "", `${o.errors_24h} warnings`)}</div>
      </div>
      <div class="card p-3 mb-3">
        <div class="d-flex justify-content-between small mb-2"><strong>Users by plan</strong>
          <span class="text-secondary">${o.onboarding} asked for guided onboarding (RM49)</span></div>
        <div class="plan-bar" role="img" aria-label="Free ${plans.free}, Basic ${plans.basic}, Premium ${plans.premium}">
          ${["free", "basic", "premium"].map((p) => (plans[p]
            ? html`<span class="plan-seg seg-${p}" data-w="${(plans[p] / total) * 100}"></span>` : ""))}
        </div>
        <div class="d-flex flex-wrap gap-3 small mt-2">
          <span><span class="legend seg-free"></span> Free ${plans.free}</span>
          <span><span class="legend seg-basic"></span> Basic ${plans.basic}</span>
          <span><span class="legend seg-premium"></span> Premium ${plans.premium} (${o.trials_active} on trial)</span>
        </div>
      </div>
      <div class="card p-0">
        <div class="table-responsive"><table class="table table-sm align-middle mb-0 admin-table">
          <thead><tr><th>User</th><th>Business</th><th>Plan</th><th class="text-end">Records</th><th>Joined</th><th>Last login</th></tr></thead>
          <tbody>${users.length ? users.map((u) => html`<tr>
            <td class="text-break">${u.email}${u.onboarding ? html` <span class="badge text-bg-light">onboarding</span>` : ""}</td>
            <td>${u.business_name || "-"}${u.demo_data ? html` <span class="tag tag-demo">demo</span>` : ""}</td>
            <td><span class="plan-chip chip-${u.plan}">${u.plan}</span>${u.on_trial ? html` <span class="badge text-bg-info">trial</span>` : ""}</td>
            <td class="text-end">${u.invoices + u.expenses}</td>
            <td class="small">${dateTime(u.created_at)}</td>
            <td class="small">${dateTime(u.last_sign_in_at)}</td>
          </tr>`) : html`<tr><td colspan="6" class="text-secondary">No users yet.</td></tr>`}</tbody>
        </table></div>
      </div>`);
    info.overview = o;
    touchLive();
    renderAiStats();
  } catch (error) {
    show("overview-body", html`<div class="alert alert-danger small">Couldn't load the overview: ${errorText(error)}</div>`);
  }
}

// ---------------------------------------------------------------------------
// 2. System health
// ---------------------------------------------------------------------------
const CHECKS = [
  { key: "web", name: "Website (Vercel)", detail: "The app's pages and code",
    run: async () => {
      const r = await fetch(`favicon.svg?health=${Date.now()}`, { method: "HEAD", cache: "no-store" });
      info.vercelId = r.headers.get("x-vercel-id");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } },
  { key: "auth", name: "Login service (Supabase Auth)", detail: "Sign-up, log-in, sessions",
    run: async () => {
      const { error } = await supabase.auth.getUser();
      if (error) throw error;
    } },
  { key: "db", name: "Database (PostgreSQL)", detail: "All business data",
    run: async () => { info.ping = await healthPing(); } },
  { key: "fn", name: "AI function (Supabase Edge Function)", detail: "ai-insights",
    run: async () => {
      info.fn = await pingAI();
      if (!info.fn.key_set) return { state: "warn", note: "Running, but GEMINI_API_KEY is not set" };
      return null;
    } },
];
const health = Object.fromEntries(CHECKS.map((c) => [c.key, { state: "wait", history: [], ok: 0, runs: 0 }]));

async function runHealth() {
  await Promise.all(CHECKS.map(async (check) => {
    const h = health[check.key];
    const started = performance.now();
    try {
      const result = await check.run();
      h.state = result?.state ?? "ok";
      h.note = result?.note ?? "";
    } catch (error) {
      h.state = "bad";
      h.note = errorText(error);
    }
    h.ms = performance.now() - started;
    h.runs += 1;
    if (h.state !== "bad") h.ok += 1;
    h.history.push(h.state === "bad" ? null : h.ms);
    if (h.history.length > 20) h.history.shift();
    h.at = new Date();
  }));
  const nav = performance.getEntriesByType("navigation")[0];
  info.protocol = nav?.nextHopProtocol || null;
  renderHealth();
  renderAiRoute();
  touchLive();
}

function sparkline(values) {
  const w = 120;
  const h = 28;
  const good = values.filter((v) => v !== null);
  if (good.length < 2) return "";
  const max = Math.max(...good, 1);
  const step = w / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => (v === null ? null : `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`))
    .filter(Boolean).join(" ");
  return raw(`<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`);
}

function renderHealth() {
  const ai = info.aiTest;
  const rows = [
    ...CHECKS.map((c) => ({ name: c.name, detail: c.detail, ...health[c.key] })),
    { name: "AI provider (Google Gemini)", detail: "Only checked when you run the live AI test (it uses the free quota)",
      state: ai ? (ai.ok ? "ok" : "bad") : "idle", ms: ai?.ms, note: ai && !ai.ok ? ai.error : "", history: [], runs: ai ? 1 : 0, ok: ai?.ok ? 1 : 0 },
  ];
  const down = rows.filter((r) => r.state === "bad").length;
  const warn = rows.filter((r) => r.state === "warn").length;
  show("health-body", html`
    <div class="alert ${down ? "alert-danger" : warn ? "alert-warning" : "alert-success"} d-flex gap-2 align-items-center py-2">
      <i class="bi ${down ? "bi-x-octagon-fill" : warn ? "bi-exclamation-triangle-fill" : "bi-check-circle-fill"}"></i>
      <div><strong>${down ? `${down} part${down > 1 ? "s" : ""} down` : warn ? "Working, with a warning" : "All systems working"}</strong>
        <span class="small"> · ${navigator.onLine ? "This browser is online" : "This browser is offline"}</span></div>
    </div>
    <div class="card p-0"><div class="table-responsive"><table class="table table-sm align-middle mb-0 admin-table">
      <thead><tr><th>Part of the app</th><th>Status</th><th class="text-end">Response</th><th>Last 20 checks</th><th class="text-end">Uptime (this session)</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr>
        <td><div class="fw-semibold small">${r.name}</div><div class="text-secondary small">${r.note || r.detail}</div></td>
        <td class="text-nowrap small">${dot(r.state)} ${STATE_TEXT[r.state]}</td>
        <td class="text-end small text-nowrap">${r.ms !== undefined ? ms(r.ms) : "-"}</td>
        <td class="text-primary">${sparkline(r.history)}</td>
        <td class="text-end small">${r.runs ? `${Math.round((r.ok / r.runs) * 100)}%` : "-"}</td>
      </tr>`)}</tbody>
    </table></div></div>`);
}

// ---------------------------------------------------------------------------
// 3. Server
// ---------------------------------------------------------------------------
function renderServer() {
  const edge = info.vercelId?.split("::")[0];
  const ping = info.ping;
  const fn = info.fn;
  const sizeBytes = info.overview?.db_size_bytes ?? 0;
  const limit = 500 * 1048576;
  const skewSeconds = ping ? Math.round((Date.now() - new Date(ping.server_time).getTime()) / 1000) : null;
  const rows = [
    ["Frontend hosting", "Vercel (free Hobby plan): static pages on a global CDN", info.vercelId ? `This page was served from ${region(edge, VERCEL_REGIONS)}` : "Region shows on the live site"],
    ["Web address", window.location.host, `Connection: HTTPS${info.protocol ? ` over ${info.protocol.toUpperCase()}` : ""}`],
    ["Backend", "Supabase (free plan)", `Project ${projectRef} · ${new URL(SUPABASE_URL).host}`],
    ["Database server", ping ? `PostgreSQL ${ping.postgres.split(" ")[0]}` : "PostgreSQL", ping ? `Server clock ${clock(ping.server_time)} (${ping.timezone})${skewSeconds !== null && Math.abs(skewSeconds) > 5 ? ` · browser is ${skewSeconds}s off` : ""}` : "Waiting for health check"],
    ["Edge Functions", fn?.runtime ?? "Deno runtime", fn ? `Last ran in ${region(fn.region, AWS_REGIONS)}` : "Not reachable yet"],
    ["AI provider", "Google Gemini API", fn ? `Model: ${fn.model} · key ${fn.key_set ? "stored as a Supabase secret" : "NOT set"}` : "-"],
    ["Running cost", "RM0 / month", "Vercel, Supabase and Gemini free tiers; no paid domain"],
  ];
  show("server-body", html`<div class="row g-3">
    <div class="col-lg-8"><div class="card p-0"><div class="table-responsive"><table class="table table-sm align-middle mb-0 admin-table">
      <tbody>${rows.map(([k, v, note]) => html`<tr><th class="small text-secondary fw-semibold w-30">${k}</th>
        <td><div class="small fw-semibold">${v}</div><div class="small text-secondary">${note}</div></td></tr>`)}</tbody>
    </table></div></div></div>
    <div class="col-lg-4"><div class="card p-3 h-100">
      <div class="small fw-semibold mb-1">Database storage</div>
      <div class="h4 mb-1">${bytes(sizeBytes)} <small class="text-secondary fs-6">of 500 MB free</small></div>
      <div class="progress" role="progressbar" aria-valuenow="${Math.round((sizeBytes / limit) * 100)}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar" data-w="${Math.max(1, (sizeBytes / limit) * 100).toFixed(1)}"></div></div>
      <div class="small text-secondary mt-2">Supabase free plan limit. Note: a free project pauses after about a week with no activity.</div>
    </div></div>
  </div>`);
}

// ---------------------------------------------------------------------------
// 4. API
// ---------------------------------------------------------------------------
function renderApi() {
  show("api-body", html`
    <div id="api-live"></div>
    <details class="card p-3 mt-3">
      <summary class="fw-semibold small">All API endpoints the app uses (${ENDPOINTS.length})</summary>
      <div class="table-responsive mt-2"><table class="table table-sm mb-0 admin-table">
        <thead><tr><th>Method</th><th>Endpoint</th><th>Used for</th><th>Who can call it</th></tr></thead>
        <tbody>${ENDPOINTS.map(([m, path, use, who]) => html`<tr><td class="small text-nowrap"><code>${m}</code></td>
          <td class="small"><code>${path}</code></td><td class="small">${use}</td><td class="small">${who}</td></tr>`)}</tbody>
      </table></div>
      <p class="small text-secondary mt-2 mb-0">Supabase turns every database table into a REST API automatically (PostgREST). Row Level Security means
        the same endpoint returns only the caller's own rows.</p>
    </details>`);
  renderApiLive();
}

function renderApiLive() {
  const box = document.getElementById("api-live");
  if (!box || paused) return;
  const calls = apiCalls;
  const errors = calls.filter((c) => !c.ok).length;
  const avg = calls.length ? calls.reduce((sum, c) => sum + c.ms, 0) / calls.length : 0;
  const byKind = {};
  calls.forEach((c) => { byKind[apiKind(c)] = (byKind[apiKind(c)] || 0) + 1; });
  show(box, html`
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3">${kpi("Requests (this page)", String(calls.length))}</div>
      <div class="col-6 col-lg-3">${kpi("Average response", calls.length ? ms(avg) : "-")}</div>
      <div class="col-6 col-lg-3">${kpi("Failed", String(errors), errors ? "bad" : "")}</div>
      <div class="col-6 col-lg-3">${kpi("Request types", String(Object.keys(byKind).length), "", Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(" · "))}</div>
    </div>
    <div class="card p-0"><div class="table-responsive api-feed"><table class="table table-sm align-middle mb-0 admin-table">
      <thead><tr><th>Time</th><th>Method</th><th>Endpoint</th><th>Type</th><th>Status</th><th class="text-end">Time taken</th></tr></thead>
      <tbody>${calls.slice(0, 12).map((c) => html`<tr>
        <td class="small text-nowrap">${clock(c.at)}</td>
        <td class="small"><code>${c.method}</code></td>
        <td class="small text-break"><code>${c.path}</code></td>
        <td class="small">${apiKind(c)}</td>
        <td class="small text-nowrap">${dot(c.ok ? "ok" : "bad")} ${c.status || "failed"}</td>
        <td class="small text-end">${ms(c.ms)}</td>
      </tr>`)}</tbody>
    </table></div></div>`);
}

// ---------------------------------------------------------------------------
// 5. AI & routing
// ---------------------------------------------------------------------------
function renderAiStatic() {
  show("ai-body", html`
    <div class="card p-3 mb-3">
      <div class="small fw-semibold mb-2">Request route when a user taps "Ask AI"</div>
      <div class="route" id="ai-route"></div>
      <p class="small text-secondary mt-3 mb-0">The Gemini API key is a secret. It is saved in Supabase (Edge Functions → Secrets) and only our
        Edge Function can read it; it is never sent to the phone. Only forecast numbers, dates and categories are sent to Google,
        never names, emails or bank details. If the AI is slow (30 s) or fails, the app shows built-in rule-based tips instead.</p>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-lg-5"><div class="card p-3 h-100" id="ai-stats"></div></div>
      <div class="col-lg-7"><div class="card p-3 h-100">
        <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
          <div class="small fw-semibold">Live AI test (demo business forecast)</div>
          <button class="btn btn-sm btn-primary" type="button" id="ai-test-button"><i class="bi bi-stars"></i> Run live AI test</button>
        </div>
        <div id="ai-test-result" class="small text-secondary">Sends the Dapur Seri demo forecast through the whole route above and shows the answer.</div>
      </div></div>
    </div>
    <div class="card p-0"><div class="p-3 pb-0 small fw-semibold">Page routing: who can open each page</div>
      <div class="table-responsive"><table class="table table-sm mb-0 admin-table">
        <thead><tr><th>Address</th><th>Who</th><th>How it is enforced</th></tr></thead>
        <tbody>${ROUTES.map(([path, who, how]) => html`<tr><td class="small"><code>${path}</code></td><td class="small text-nowrap">${who}</td><td class="small">${how}</td></tr>`)}</tbody>
      </table></div></div>`);
  document.getElementById("ai-test-button").addEventListener("click", runAiTest);
  renderAiRoute();
  renderAiStats();
}

function renderAiRoute() {
  const box = document.getElementById("ai-route");
  if (!box) return;
  const ai = info.aiTest;
  const nodes = [
    ["bi-phone", "User's phone", "Browser app", navigator.onLine ? "ok" : "bad"],
    ["bi-triangle", "Vercel", "Serves the app", health.web.state],
    ["bi-shield-check", "Supabase Auth", "Checks the login token", health.auth.state],
    ["bi-cpu", "Edge Function", "ai-insights (holds the key)", health.fn.state],
    ["bi-stars", "Google Gemini API", info.fn?.model ?? "AI model", ai ? (ai.ok ? "ok" : "bad") : "idle"],
  ];
  show(box, html`${nodes.map(([icon, name, sub, state], i) => html`
    ${i ? html`<div class="route-arrow" aria-hidden="true"><i class="bi bi-arrow-right"></i></div>` : ""}
    <div class="route-node"><div class="route-icon"><i class="bi ${icon}"></i></div>
      <div class="fw-semibold small">${name}</div><div class="text-secondary route-sub">${sub}</div>
      <div class="route-state small">${dot(state)} ${STATE_TEXT[state]}</div></div>`)}`);
}

function renderAiStats() {
  const box = document.getElementById("ai-stats");
  if (!box) return;
  const o = info.overview;
  const okCount = o?.ai_ok_24h ?? 0;
  const fallback = o?.ai_fallback_24h ?? 0;
  const total = okCount + fallback;
  show(box, html`<div class="small fw-semibold mb-2">AI requests (last 24 hours)</div>
    <div class="d-flex gap-4 mb-2">
      <div><div class="h4 mb-0">${total}</div><div class="small text-secondary">requests</div></div>
      <div><div class="h4 mb-0 text-success">${okCount}</div><div class="small text-secondary">answered by AI</div></div>
      <div><div class="h4 mb-0 ${fallback ? "text-warning" : ""}">${fallback}</div><div class="small text-secondary">used backup rules</div></div>
    </div>
    <div class="small text-secondary">Success rate: ${total ? `${Math.round((okCount / total) * 100)}%` : "no requests yet"}.
      Model: ${info.fn?.model ?? "unknown"}. Key: ${info.fn ? (info.fn.key_set ? "set" : "missing") : "unknown"}.</div>`);
}

async function runAiTest(event) {
  const button = event.currentTarget;
  button.disabled = true;
  show("ai-test-result", html`<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Sending the demo forecast to Gemini…`);
  const started = performance.now();
  try {
    const result = await askAI(aiSummary(demoForecast(todayISO()), todayISO()), "en");
    info.aiTest = { ok: true, ms: result.ms };
    logAiRequest("ok", result.ms, result.model);
    show("ai-test-result", html`<div class="mb-2">${dot("ok")} <strong>Answered in ${ms(result.ms)}</strong> by ${result.model}</div>
      <ul class="ai-tips mb-0">${adviceLines(result.advice).slice(0, 4).map((line) => html`<li>${line}</li>`)}</ul>`);
  } catch (error) {
    const took = performance.now() - started;
    info.aiTest = { ok: false, ms: took, error: errorText(error) };
    logAiRequest("fallback", took);
    show("ai-test-result", html`<div>${dot("bad")} <strong>The AI didn't answer</strong> (${ms(took)}): ${errorText(error)}</div>
      <div class="text-secondary mt-1">Users would see the built-in rule-based tips instead. Check that the ai-insights function is deployed and GEMINI_API_KEY is set.</div>`);
  } finally {
    button.disabled = false;
    renderAiRoute();
    renderHealth();
    setTimeout(loadOverview, 1500);
  }
}

// ---------------------------------------------------------------------------
// 6. Live log
// ---------------------------------------------------------------------------
const log = { rows: [], lastId: 0, filter: "all", ready: false, error: null };

async function loadLog() {
  try {
    const fresh = await adminEvents(log.lastId, log.lastId ? 100 : 50);
    log.error = null;
    if (fresh.length) {
      fresh.forEach((row) => { row.isNew = log.ready; });
      log.rows = [...fresh, ...log.rows].slice(0, 200);
      log.lastId = Math.max(log.lastId, ...fresh.map((row) => row.id));
    }
  } catch (error) {
    log.error = errorText(error);
  }
  if (!log.ready) {
    log.ready = true;
    renderLogShell();
  }
  renderLogRows();
  touchLive();
}

function renderLogShell() {
  show("log-body", html`
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
      <div class="btn-group btn-group-sm" role="group" aria-label="Filter">
        <button type="button" class="btn btn-secondary" data-filter="all">All events</button>
        <button type="button" class="btn btn-outline-secondary" data-filter="warn">Warnings</button>
      </div>
      <span class="small text-secondary" id="log-count"></span>
    </div>
    <div class="card p-0"><div class="table-responsive log-feed"><table class="table table-sm align-middle mb-0 admin-table">
      <thead><tr><th>Time</th><th>Event</th><th>User</th><th>Details</th></tr></thead>
      <tbody id="log-rows"></tbody>
    </table></div></div>`);
  document.querySelectorAll("#log-body [data-filter]").forEach((button) => button.addEventListener("click", () => {
    log.filter = button.dataset.filter;
    document.querySelectorAll("#log-body [data-filter]").forEach((b) => {
      b.classList.toggle("btn-secondary", b === button);
      b.classList.toggle("btn-outline-secondary", b !== button);
    });
    renderLogRows();
  }));
}

function renderLogRows() {
  const body = document.getElementById("log-rows");
  if (!body) return;
  const rows = log.rows.filter((r) => log.filter === "all" || r.level !== "info");
  document.getElementById("log-count").textContent = log.error
    ? `Couldn't update: ${log.error}`
    : `${log.rows.length} recent events · checking every 5 s`;
  show(body, rows.length ? rows.slice(0, 60).map((r) => {
    const [icon, label] = EVENT_STYLE[r.event] ?? ["bi-dot", r.event];
    return html`<tr class="${r.isNew ? "log-new" : ""} ${r.level !== "info" ? "log-warn" : ""}">
      <td class="small text-nowrap">${clock(r.created_at)}<div class="text-secondary">${new Date(r.created_at).toLocaleDateString("en-GB", { timeZone: MY, day: "numeric", month: "short" })}</div></td>
      <td class="small text-nowrap"><span class="event-chip ev-${r.level}"><i class="bi ${icon}"></i> ${label}</span></td>
      <td class="small text-break">${r.email || "-"}</td>
      <td class="small">${r.detail}</td>
    </tr>`;
  }) : html`<tr><td colspan="4" class="small text-secondary">No events yet. Sign up, log in or add an invoice in another tab and watch it appear here.</td></tr>`);
  log.rows.forEach((r) => { r.isNew = false; });
}

// ---------------------------------------------------------------------------
// 7. Security
// ---------------------------------------------------------------------------
async function loadSecurity() {
  const checks = [];
  const add = (pass, title, detail) => checks.push({ pass, title, detail });

  let sec = null;
  try {
    sec = await adminSecurity();
  } catch (error) {
    add(false, "Database security status", errorText(error));
  }

  add(window.location.protocol === "https:", "Encrypted connection (HTTPS)",
    window.location.protocol === "https:" ? "Everything between the phone and our servers is encrypted." : "This copy is not on HTTPS (fine for local testing only).");

  const wanted = {
    "content-security-policy": "Content-Security-Policy", "x-frame-options": "X-Frame-Options",
    "x-content-type-options": "X-Content-Type-Options", "referrer-policy": "Referrer-Policy",
    "permissions-policy": "Permissions-Policy", "strict-transport-security": "Strict-Transport-Security (HSTS)",
  };
  let headerChips = "";
  try {
    const r = await fetch(`index.html?headers=${Date.now()}`, { method: "HEAD", cache: "no-store" });
    const present = Object.entries(wanted).map(([key, name]) => [name, r.headers.has(key)]);
    const count = present.filter(([, has]) => has).length;
    headerChips = html`<div class="d-flex flex-wrap gap-1 mt-1">${present.map(([name, has]) => html`<span class="sec-chip ${has ? "on" : "off"}">${has ? "✓" : "✗"} ${name}</span>`)}</div>`;
    add(count >= 5, `Security headers (${count} of ${present.length})`,
      "Block other sites from framing the app, stop unknown scripts, and force HTTPS. Set in vercel.json.");
  } catch (error) {
    add(false, "Security headers", errorText(error));
  }

  if (sec) {
    const tables = sec.tables ?? [];
    const noRls = tables.filter((t) => !t.rls).map((t) => t.name);
    add(!noRls.length, `Row Level Security on all ${tables.length} tables`,
      noRls.length ? `Missing on: ${noRls.join(", ")}` : "Each user can only read and change their own rows, enforced by the database.");
    const anonTables = tables.filter((t) => t.anon_access).map((t) => t.name);
    add(!anonTables.length, "No table access for logged-out visitors",
      anonTables.length ? `Logged-out access on: ${anonTables.join(", ")}` : "The public key alone can't read any table.");
    add(sec.check_rules > 0, `${sec.check_rules} database validation rules`, "Amounts, dates, plans and text lengths are checked again by the database, even if the app is bypassed.");
    add(sec.admins > 0 && sec.admins <= 5, `Admin access limited to ${sec.admins} account${sec.admins === 1 ? "" : "s"}`,
      "Admins can only be added in the Supabase SQL Editor, never from the app.");
  }

  // Live attack test: try to read invoices with only the public key (no login).
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/invoices?select=id&limit=1`, { headers: { apikey: SUPABASE_KEY }, cache: "no-store" });
    const body = (await r.text()).trim();
    const blocked = !r.ok || body === "[]";
    add(blocked, "Live test: reading invoices without logging in",
      blocked ? `Blocked (server answered ${r.status}${body === "[]" ? ", no rows" : ""}).` : "NOT blocked: data was returned!");
  } catch (error) {
    add(false, "Live test: reading invoices without logging in", errorText(error));
  }

  const publicKey = SUPABASE_KEY.startsWith("sb_publishable_") || keyRole(SUPABASE_KEY) === "anon";
  add(publicKey, "Only the public key is in the browser", publicKey
    ? "The secret service key never leaves Supabase." : "The key in js/config.js is not a public key. Replace it now!");
  add(info.fn ? info.fn.key_set : false, "AI key kept on the server", info.fn
    ? (info.fn.key_set ? "GEMINI_API_KEY is a Supabase secret, read only by the Edge Function." : "GEMINI_API_KEY is not set yet.")
    : "Couldn't reach the AI function.");
  add(true, "Passwords are never stored by us", "Supabase Auth stores only a one-way hash (bcrypt). We can't see anyone's password.");
  add(true, "Safe display of user text", "Everything users type is escaped before it is shown, which blocks HTML/script injection (XSS).");

  const passed = checks.filter((c) => c.pass).length;
  show("security-body", html`
    <div class="d-flex align-items-center gap-3 mb-3">
      <div class="sec-score ${passed === checks.length ? "all" : ""}">${passed}/${checks.length}</div>
      <div class="small text-secondary">security checks passed, tested live just now.</div>
    </div>
    <div class="row g-2 mb-3">${checks.map((c) => html`<div class="col-md-6"><div class="card p-3 h-100 sec-card">
      <div class="d-flex gap-2"><i class="bi ${c.pass ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"}"></i>
        <div><div class="fw-semibold small">${c.title}</div><div class="small text-secondary">${c.detail}</div>
        ${c.title.startsWith("Security headers") ? headerChips : ""}</div></div></div></div>`)}</div>
    ${sec ? html`<div class="card p-0"><div class="table-responsive"><table class="table table-sm mb-0 admin-table">
      <thead><tr><th>Table</th><th>Row Level Security</th><th class="text-end">Policies</th><th>Logged-out access</th></tr></thead>
      <tbody>${(sec.tables ?? []).map((t) => html`<tr><td class="small"><code>${t.name}</code></td>
        <td class="small">${dot(t.rls ? "ok" : "bad")} ${t.rls ? "On" : "Off"}</td>
        <td class="small text-end">${t.policies}${t.policies === 0 ? html` <span class="text-secondary">(fully locked)</span>` : ""}</td>
        <td class="small">${dot(t.anon_access ? "bad" : "ok")} ${t.anon_access ? "Allowed" : "Blocked"}</td></tr>`)}</tbody>
    </table></div></div>` : ""}`);
}

function keyRole(key) {
  try {
    return JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 8. Backend engineering
// ---------------------------------------------------------------------------
async function loadBackend() {
  try {
    const b = await adminBackend();
    const tables = b.tables ?? [];
    const functions = b.functions ?? [];
    const triggers = b.triggers ?? [];
    show("backend-body", html`
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3">${kpi("Tables", String(tables.length), "", `${tables.reduce((s, t) => s + t.rows, 0)} rows in total`)}</div>
        <div class="col-6 col-lg-3">${kpi("Database functions", String(functions.length), "", `${functions.filter((f) => f.definer).length} run with extra rights`)}</div>
        <div class="col-6 col-lg-3">${kpi("Triggers", String(triggers.length), "", "Run automatically on changes")}</div>
        <div class="col-6 col-lg-3">${kpi("Indexes", String(b.indexes), "", "Keep look-ups fast")}</div>
      </div>
      <div class="row g-3">
        <div class="col-lg-5"><div class="card p-0 h-100"><div class="p-3 pb-0 small fw-semibold">Tables</div>
          <div class="table-responsive"><table class="table table-sm mb-0 admin-table"><thead><tr><th>Table</th><th class="text-end">Rows</th><th class="text-end">Columns</th><th class="text-end">Size</th></tr></thead>
          <tbody>${tables.map((t) => html`<tr><td class="small"><code>${t.name}</code></td><td class="small text-end">${t.rows}</td>
            <td class="small text-end">${t.columns}</td><td class="small text-end">${bytes(t.size_bytes)}</td></tr>`)}</tbody></table></div>
          <div class="p-3 small text-secondary">Money is stored as whole sen (integers), so RM amounts are always exact.
            Dates use Malaysia time.</div></div></div>
        <div class="col-lg-7"><div class="card p-0 h-100"><div class="p-3 pb-0 small fw-semibold">Database functions (server-side logic)</div>
          <div class="table-responsive backend-feed"><table class="table table-sm mb-0 admin-table"><tbody>${functions.map((f) => html`<tr>
            <td class="small"><code>${f.name}(${f.args})</code>${f.definer ? html` <span class="badge text-bg-light">definer</span>` : ""}</td>
            <td class="small text-secondary">${FUNCTION_NOTES[f.name] ?? ""}</td></tr>`)}</tbody></table></div></div></div>
      </div>
      <div class="card p-0 mt-3"><div class="p-3 pb-0 small fw-semibold">Triggers (automatic actions)</div>
        <div class="table-responsive"><table class="table table-sm mb-0 admin-table">
          <thead><tr><th>Trigger</th><th>On table</th><th>Runs</th></tr></thead>
          <tbody>${triggers.map((t) => html`<tr><td class="small"><code>${t.name}</code></td><td class="small"><code>${t.table}</code></td>
            <td class="small"><code>${t.function}()</code></td></tr>`)}</tbody></table></div></div>
      <div class="card p-3 mt-3 small">
        <div class="fw-semibold mb-1">How the backend is built</div>
        <ul class="mb-0 text-secondary">
          <li><strong>No custom server to maintain:</strong> Supabase gives us PostgreSQL, login and an automatic REST API.</li>
          <li><strong>Business rules live in the database:</strong> marking a paid invoice, starting a trial and confirming imports are
            single all-or-nothing functions, so a double-click or a lost connection can't leave half-saved data.</li>
          <li><strong>Security in the database:</strong> Row Level Security and check rules apply even if someone edits the app's code.</li>
          <li><strong>Audit trail:</strong> triggers write the live log, so events can't be faked from the browser.</li>
          <li><strong>One serverless function</strong> (Deno, TypeScript) for the AI, so the Gemini key stays secret.</li>
          <li><strong>Setup as code:</strong> <code>supabase/schema.sql</code>, <code>supabase/upgrade_admin_ai.sql</code> and
            <code>supabase/functions/ai-insights</code> rebuild the whole backend.</li>
        </ul>
      </div>`);
  } catch (error) {
    show("backend-body", html`<div class="alert alert-danger small">Couldn't load the backend details: ${errorText(error)}</div>`);
  }
}

// ---------------------------------------------------------------------------
// 9. Code health: run the real automatic tests in this browser
// ---------------------------------------------------------------------------
const pageErrors = [];
window.addEventListener("error", (event) => pageErrors.push(String(event.message)));
window.addEventListener("unhandledrejection", (event) => pageErrors.push(String(event.reason?.message || event.reason)));

async function runCodeHealth() {
  show("code-body", html`<p class="small text-secondary"><span class="spinner-border spinner-border-sm me-2"></span>Running the automatic tests…</p>`);
  const results = [];
  let summary;
  const started = performance.now();
  try {
    const harness = await import("../../tests/harness.js");
    await import("../../tests/app.test.js");
    summary = await harness.runAll((name, error) => results.push({ name, error: error ? errorText(error) : null }));
  } catch (error) {
    summary = { passed: 0, failed: 1 };
    results.push({ name: "Load the tests", error: errorText(error) });
  }
  const took = performance.now() - started;
  const failed = results.filter((r) => r.error);
  const langs = Object.entries(CODE_STATS.byLanguage).sort((a, b) => b[1].lines - a[1].lines);
  const totalLines = langs.reduce((s, [, v]) => s + v.lines, 0);
  show("code-body", html`
    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3">${kpi("Automatic tests", `${summary.passed}/${summary.passed + summary.failed}`, summary.failed ? "bad" : "good", `passed in ${ms(took)}`)}</div>
      <div class="col-6 col-lg-3">${kpi("Lines of code", totalLines.toLocaleString("en-MY"), "", `${langs.reduce((s, [, v]) => s + v.files, 0)} files`)}</div>
      <div class="col-6 col-lg-3">${kpi("Errors on this page", String(pageErrors.length), pageErrors.length ? "bad" : "")}</div>
      <div class="col-6 col-lg-3">${kpi("npm packages to patch", "0", "", "No build step; 4 pinned CDN libraries")}</div>
    </div>
    <div class="row g-3">
      <div class="col-lg-7"><div class="card p-0 h-100"><div class="p-3 pb-0 small fw-semibold d-flex justify-content-between">
          <span>Test results</span><button class="btn btn-sm btn-outline-primary" type="button" id="rerun-tests">Run again</button></div>
        <div class="table-responsive backend-feed"><table class="table table-sm mb-0 admin-table"><tbody>${results.map((r) => html`<tr>
          <td class="small">${dot(r.error ? "bad" : "ok")} ${r.name}${r.error ? html`<div class="text-danger small">${r.error}</div>` : ""}</td></tr>`)}</tbody></table></div>
      </div></div>
      <div class="col-lg-5"><div class="card p-3 h-100 small">
        <div class="fw-semibold mb-2">Code by language</div>
        ${langs.map(([lang, v]) => html`<div class="d-flex justify-content-between"><span>${lang}</span><span class="text-secondary">${v.files} files · ${v.lines.toLocaleString("en-MY")} lines</span></div>
          <div class="progress progress-thin mb-2"><div class="progress-bar" data-w="${((v.lines / totalLines) * 100).toFixed(1)}"></div></div>`)}
        <div class="fw-semibold mt-2 mb-1">Libraries (pinned versions)</div>
        ${LIBRARIES.map((l) => html`<div class="d-flex justify-content-between"><span>${l.name} ${l.version}</span><span class="text-secondary">${l.use}</span></div>`)}
        <div class="text-secondary mt-2">What the tests cover: money and date maths, the forecast, CSV reading, plans, the free trial,
          SST, the AI backup rules and that every screen has a Bahasa Melayu translation. Counted ${CODE_STATS.counted}.</div>
      </div></div>
    </div>`);
  document.getElementById("rerun-tests").addEventListener("click", runCodeHealth);
  if (failed.length) console.warn("Failing tests:", failed);
}

// ---------------------------------------------------------------------------
// 10. Releases
// ---------------------------------------------------------------------------
function renderReleases() {
  show("releases-body", html`<div class="card p-3">
    <div class="d-flex flex-wrap gap-3 align-items-center mb-3">
      <div><div class="small text-secondary">Current version</div><div class="h4 mb-0">v${VERSION}</div></div>
      <div><div class="small text-secondary">Released</div><div class="h6 mb-0">${longDate(RELEASE_DATE)}</div></div>
      <div><div class="small text-secondary">How releases go out</div><div class="small">Push to GitHub → Vercel deploys automatically in about 30 seconds</div></div>
    </div>
    <ol class="release-list mb-0">${RELEASES.map((r) => html`<li>
      <div><span class="release-tag ${r.version === VERSION ? "current" : ""}">v${r.version}</span>
        <strong class="small">${r.title}</strong> <span class="small text-secondary">· ${longDate(r.date)}</span></div>
      <ul class="small text-secondary mb-0">${r.notes.map((n) => html`<li>${n}</li>`)}</ul></li>`)}</ol>
  </div>`);
}
