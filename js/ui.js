// Shared page pieces: the top menu, messages, safe HTML, the chart, and
// the "is this person logged in?" check that every private page runs first.
import { isConfigured, supabase } from "./supabase-client.js";
import { friendlyError, getProfile, getSession, signOut } from "./db.js";
import { APP_NAME, PLANS, planFor, trialStatus } from "./plans.js";
import { formatRM, prettyDate } from "./cashflow.js";
import { LANG_NAMES, LANGS, getLang, plural, setLang, t } from "./i18n.js";
import { VERSION } from "./version.js";

export { t, plural };

// ---------------------------------------------------------------------------
// Safe HTML. Anything a user typed (a customer name, say) could contain
// <script> tricks, so every ${value} inside html`...` is escaped automatically.
// Only things wrapped in raw() (our own trusted HTML) are inserted as-is.
// ---------------------------------------------------------------------------
class SafeHtml {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}
export const raw = (text) => new SafeHtml(String(text));

export function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderValue(value) {
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  if (value === null || value === undefined || value === false) return "";
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += renderValue(value) + strings[i + 1]; });
  return new SafeHtml(out);
}

/** Translate a sentence that contains our own HTML (like <strong>), filling in
 *  its {blanks} safely: the blanks are escaped like any other ${value}. */
export function th(text, vars = {}) {
  const safeVars = Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, renderValue(value)]));
  return raw(t(text, safeVars));
}

/** Put safe HTML into an element (by id or element). */
export function show(target, content) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  el.innerHTML = renderValue(content);
  return el;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Today's date in Malaysia, like "2026-10-13" (tests can set window.SME_TODAY). */
export function todayISO() {
  if (globalThis.SME_TODAY) return globalThis.SME_TODAY;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** A moment in time as a Malaysian calendar date, like "2026-11-12". */
export function malaysiaDate(moment) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(moment));
}

/** Read ?name=value from the address bar. */
export function param(name) {
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

/** Disable a button while something runs, and show any error as a message. */
export async function busy(button, task) {
  if (button) button.disabled = true;
  try {
    return await task();
  } catch (error) {
    showMessage(friendlyError(error), "danger");
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Messages ("Invoice added", "Wrong password", ...)
// flash() keeps a message for the NEXT page; showMessage() shows it now.
// ---------------------------------------------------------------------------
const FLASH_KEY = "sme-flash";

export function flash(message, type = "success") {
  try {
    const queue = JSON.parse(sessionStorage.getItem(FLASH_KEY) || "[]");
    queue.push({ message, type });
    sessionStorage.setItem(FLASH_KEY, JSON.stringify(queue));
  } catch { /* storage blocked: the message is simply skipped */ }
}

export function showMessage(message, type = "success") {
  const box = document.getElementById("flash");
  if (!box) return;
  const alert = document.createElement("div");
  alert.className = `alert alert-${type} alert-dismissible fade show mb-2`;
  alert.setAttribute("role", type === "danger" ? "alert" : "status");
  alert.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "btn-close";
  close.setAttribute("aria-label", t("Close"));
  close.addEventListener("click", () => alert.remove());
  alert.append(close);
  box.append(alert);
  alert.scrollIntoView({ block: "nearest" });
}

function showQueuedMessages() {
  try {
    const queue = JSON.parse(sessionStorage.getItem(FLASH_KEY) || "[]");
    sessionStorage.removeItem(FLASH_KEY);
    queue.forEach(({ message, type }) => showMessage(message, type));
  } catch { /* nothing to show */ }
}

export function clearMessages() {
  const box = document.getElementById("flash");
  if (box) box.innerHTML = "";
}

/** Go to another page, optionally with a message waiting there. */
export function goTo(page, message, type) {
  if (message) flash(message, type);
  const target = new URL(page, window.location.href);
  const samePage = target.pathname === window.location.pathname && target.search === window.location.search;
  if (samePage) {
    // Only the #part differs, which would not reload the page: reload it ourselves.
    window.history.replaceState(null, "", target.href);
    window.location.reload();
  } else {
    window.location.href = target.href;
  }
}

// ---------------------------------------------------------------------------
// The top menu
// ---------------------------------------------------------------------------
const MENU = [
  { page: "dashboard", label: t("Dashboard") },
  { page: "invoices", label: t("Invoices") },
  { page: "expenses", label: t("Expenses") },
  { page: "import", label: t("Import") },
  { page: "scenarios", label: t("Scenarios"), feature: "scenarios" },
  { page: "reports", label: t("Reports"), feature: "summaries" },
  { page: "team", label: t("Team"), feature: "team" },
];

const BRAND = html`<a class="navbar-brand" href="index.html">
  <span class="brand-mark"><i class="bi bi-graph-up-arrow"></i></span>
  <span>SME <span class="brand-accent">CashFlow</span></span></a>`;

const TOGGLER = raw(`<button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse"
  data-bs-target="#mainMenu" aria-controls="mainMenu" aria-expanded="false" aria-label="${esc(t("Open the menu"))}">
  <span class="navbar-toggler-icon"></span></button>`);

export function planBadgeText(profile) {
  const trial = trialStatus(profile);
  const plan = planFor(profile);
  return trial.active ? t("{plan} trial · {days} left", { plan: t(plan.label), days: plural(trial.daysLeft, "day") }) : t(plan.label);
}

/** The EN | BM switch. Picking a language saves it and reloads the page in that language. */
function languageSwitch() {
  return html`<div class="btn-group btn-group-sm lang-switch" role="group" aria-label="${t("Language")}">${LANGS.map((lang) => html`
    <button type="button" class="btn ${lang === getLang() ? "btn-secondary" : "btn-outline-secondary"}" data-lang="${lang}"
      lang="${lang}" title="${LANG_NAMES[lang]}" aria-pressed="${lang === getLang() ? "true" : "false"}">${lang === "ms" ? "BM" : "EN"}</button>`)}
  </div>`;
}

function wireLanguageSwitch(nav) {
  nav.querySelectorAll("button[data-lang]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.lang === getLang()) return;
    setLang(button.dataset.lang);
    window.location.reload();
  }));
}

function renderNav(current, profile) {
  const nav = document.getElementById("nav");
  if (!nav) return;
  // The logged-in menu is long (and Malay words are longer), so it only spreads
  // out in one row on wide screens (1400px+); narrower screens get the ☰ button.
  nav.classList.toggle("navbar-expand-lg", !profile);
  nav.classList.toggle("navbar-expand-xxl", Boolean(profile));
  if (!profile) {
    show(nav, html`<div class="container">${BRAND}${TOGGLER}
      <div class="collapse navbar-collapse" id="mainMenu">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item"><a class="nav-link" href="index.html#how-it-works">${t("How It Works")}</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#features">${t("Features")}</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#pricing">${t("Pricing")}</a></li>
          <li class="nav-item"><a class="nav-link" href="index.html#support">${t("Support")}</a></li>
        </ul>
        <div class="d-flex flex-wrap align-items-center gap-2 pb-2 pb-lg-0">
          ${languageSwitch()}
          <a class="btn btn-sm btn-outline-primary" href="login.html">${t("Log in")}</a>
          <a class="btn btn-sm btn-primary" href="register.html">${t("Get Started")}</a>
        </div>
      </div></div>`);
    wireLanguageSwitch(nav);
    return;
  }
  const plan = planFor(profile);
  const items = MENU.map((item) => {
    const locked = item.feature && !plan[item.feature];
    return html`<li class="nav-item"><a class="nav-link ${item.page === current ? "active" : ""}"
      ${raw(item.page === current ? 'aria-current="page"' : "")} href="${item.page}.html">${item.label}${locked
        ? html`<i class="bi bi-lock-fill lock-tag" title="${t("Not on your plan")}"></i>` : ""}</a></li>`;
  });
  show(nav, html`<div class="container">${BRAND}${TOGGLER}
    <div class="collapse navbar-collapse" id="mainMenu">
      <ul class="navbar-nav me-auto mb-2 mb-xxl-0">${items}</ul>
      <div class="d-flex flex-wrap align-items-center gap-2 pb-2 pb-xxl-0">
        ${languageSwitch()}
        <a class="plan-pill" href="settings.html#plan" title="${t("Change plan")}">${planBadgeText(profile)}</a>
        <a class="btn btn-sm btn-outline-primary ${current === "settings" ? "active" : ""}" href="settings.html">${t("Settings")}</a>
        <button class="btn btn-sm btn-outline-secondary" type="button" id="logout-button">${t("Log out")}</button>
      </div>
    </div></div>`);
  wireLanguageSwitch(nav);
  document.getElementById("logout-button").addEventListener("click", async () => {
    await signOut();
    goTo("index.html", t("You have been logged out."), "info");
  });
}

// ---------------------------------------------------------------------------
// Start every page with this.
//   const ctx = await startPage("dashboard", { login: true });
// It draws the menu, shows waiting messages and, for private pages, sends
// logged-out visitors to the login page. Returns {session, profile, plan, trial, userId}.
// ---------------------------------------------------------------------------
export async function startPage(current, { login = false } = {}) {
  translateShell();
  showQueuedMessages();
  if (!isConfigured) {
    renderNav(current, null);
    show("main", html`<div class="card p-4 mx-auto form-card">
      <h1 class="h4">${t("Almost there: connect Supabase")}</h1>
      <p class="text-secondary mb-2">${t("This copy of {app} is not connected to a database yet.", { app: APP_NAME })}</p>
      <p class="mb-0">${th("Open <code>js/config.js</code> and paste in your Supabase project URL and publishable (anon) key. The README explains where to find them.")}</p></div>`);
    throw new PageStopped();
  }

  const session = await getSession();
  if (login && !session) {
    const next = window.location.pathname.split("/").pop() + window.location.search;
    window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
    throw new PageStopped();
  }

  let profile = null;
  if (session) {
    try {
      profile = await getProfile();
    } catch (error) {
      renderNav(current, null);
      show("main", html`<div class="alert alert-danger">${t("We couldn't load your account: {error}", { error: friendlyError(error) })}
        <br>${th("If you just set up Supabase, check that you ran <code>supabase/schema.sql</code>.")}</div>`);
      throw new PageStopped();
    }
  }
  renderNav(current, profile);

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && login) window.location.replace("index.html");
  });

  return {
    session,
    profile,
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? "",
    plan: planFor(profile),
    trial: trialStatus(profile),
  };
}

/** The parts of every page that are written in the .html files: the page
 *  language, the "Loading..." text and the footer. */
function translateShell() {
  document.documentElement.lang = getLang();
  const footer = document.querySelector(".app-footer .container");
  if (footer) {
    footer.textContent = `${t("SME CashFlow · Forecasts are estimates based on the numbers you enter. They are not bookkeeping, tax or financial advice.")} · v${VERSION}`;
  }
  const loading = document.querySelector("#main > p.text-secondary");
  if (loading) loading.textContent = t("Loading…");
}

/** Thrown to stop a page script quietly (for example while redirecting). */
export class PageStopped extends Error {}

/** Run a page's main function and report anything unexpected. */
export function runPage(main) {
  main().catch((error) => {
    if (error instanceof PageStopped) return;
    console.error(error);
    showMessage(friendlyError(error), "danger");
  });
}

/** The "this page is on a higher plan" card. */
export function lockedCard(featureName, neededPlan, plan) {
  return html`<div class="card p-4 text-center mx-auto locked-card">
    <div class="display-6 text-secondary"><i class="bi bi-lock-fill"></i></div>
    <h1 class="h4 mt-2">${t("{feature} is on the {plan} plan", { feature: featureName, plan: t(neededPlan) })}</h1>
    <p class="text-secondary">${th("You are on the <strong>{plan}</strong> plan.", { plan: t(plan.label) })}
      ${neededPlan === "Premium" ? t("Premium comes with a 1-month free trial.") : ""}
      ${t("Switch plan in Settings to unlock this page. It is a prototype, so no payment is taken.")}</p>
    <div class="d-flex justify-content-center gap-2 flex-wrap">
      <a class="btn btn-primary" href="settings.html#plan">${t("See plans")}</a>
      <a class="btn btn-outline-secondary" href="dashboard.html">${t("Back to dashboard")}</a>
    </div></div>`;
}

/** A banner about the free trial (shown on the dashboard and settings). */
export function trialBanner(trial, profile) {
  if (trial.active) {
    return html`<div class="alert alert-info d-flex gap-2 align-items-start trial-banner" role="status">
      <i class="bi bi-gift-fill mt-1"></i><div><strong>${t("Premium free trial: {days} left.", { days: plural(trial.daysLeft, "day") })}</strong>
      ${t("It ends on {date}. After that, Premium is {price}/month. This is a prototype, so no payment is taken.",
        { date: prettyDate(malaysiaDate(trial.endsAt)), price: PLANS.premium.price })}</div></div>`;
  }
  if (trial.ended && profile.plan === "premium") {
    return html`<div class="alert alert-secondary small" role="status">${t("Your free trial has ended. Premium is now {price}/month (prototype: no payment is taken).",
      { price: PLANS.premium.price })}</div>`;
  }
  return "";
}

/** One number card on the dashboard and reports. */
export function kpi(label, value, tone = "", note = "") {
  return html`<div class="card p-3 h-100 kpi-card"><div class="kpi-label">${label}</div>
    <div class="kpi-value ${tone}">${value}</div>${note ? html`<div class="small text-secondary">${note}</div>` : ""}</div>`;
}

export const toneFor = (sen) => (sen < 0 ? "bad" : "");
export const rm = formatRM;

// ---------------------------------------------------------------------------
// The forecast line chart (Chart.js is loaded by the page from a CDN)
// ---------------------------------------------------------------------------
let currentChart = null;

export function drawChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof window.Chart === "undefined") return; // the page still works without it
  if (currentChart) currentChart.destroy();
  const money = (value) => (value < 0 ? "-RM" : "RM")
    + Math.abs(value).toLocaleString("en-MY", { maximumFractionDigits: 2 });

  currentChart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((set, index) => ({
        label: set.label,
        data: set.data,
        borderColor: index === 0 ? "#1d5bd6" : "#94a3b8",
        backgroundColor: index === 0 ? "rgba(29, 91, 214, 0.10)" : "transparent",
        borderDash: set.dashed ? [6, 5] : [],
        borderWidth: index === 0 ? 2.5 : 2,
        fill: index === 0,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.15,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: datasets.length > 1, position: "bottom" },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${money(item.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: {
          ticks: { callback: (value) => money(value) },
          // The zero line is red: below it, the business is out of cash.
          grid: {
            color: (context) => (context.tick.value === 0 ? "#dc2626" : "#e5e9f2"),
            lineWidth: (context) => (context.tick.value === 0 ? 2 : 1),
          },
        },
      },
    },
  });
}

/** Turn forecast points into chart numbers (RM, not sen). */
export const chartValues = (forecast) => forecast.points.map((p) => p.balance_sen / 100);
