// The public home page: hero with the live demo forecast, features, pricing (with
// the 1-month Premium free trial), and support.
import { formatRM, sparkline } from "../cashflow.js";
import { DEMO_BUSINESS, DEMO_LOCATION, PLAN_ORDER, PLANS, demoForecast } from "../plans.js";
import { esc, html, raw, runPage, show, startPage, t, todayISO } from "../ui.js";

const FEATURES = [
  ["bi-graph-up", t("Cash-flow forecasting"), t("See projected balances for the next 7, 30, or 90 days.")],
  ["bi-receipt", t("Invoice tracking"), t("Track expected receipts and mark paid invoices when money arrives.")],
  ["bi-wallet2", t("Expense management"), t("Add planned costs and recurring commitments to the forecast.")],
  ["bi-upload", t("Document upload"), t("Review imported records before they change your forecast.")],
  ["bi-file-earmark-bar-graph", t("Detailed reports"), t("Summarise your current cash position and projected low point.")],
  ["bi-people", t("Team access"), t("Prepare a demo invite for a team member on Premium.")],
];

function planCard(key) {
  const plan = PLANS[key];
  const button = {
    free: html`<a class="btn btn-outline-primary w-100" href="register.html?plan=free">${t("Start Free")}</a>`,
    basic: html`<a class="btn btn-primary w-100" href="register.html?plan=basic">${t("Choose Basic")}</a>`,
    premium: html`<a class="btn btn-mint w-100" href="register.html?plan=premium">${t("Start 1-Month Free Trial")}</a>
      <div class="plan-note">${t("Then {price}/month after your 30-day trial.", { price: plan.price })}</div>`,
  }[key];
  return html`<div class="col-lg-4"><div class="card plan-card d-flex flex-column ${key === "premium" ? "plan-dark" : ""}">
    ${key === "premium" ? html`<div><span class="tag tag-mint">${t("Most complete")}</span></div>` : ""}
    <div class="mt-2">${plan.label}</div>
    <div class="price">${plan.price}<small>${t("/month")}</small></div>
    ${key === "premium" ? html`<div><span class="trial-chip">${t("First month free")}</span></div>` : ""}
    <ul class="flex-grow-1">${plan.highlights.map((line) => html`<li>${t(line)}</li>`)}</ul>
    <div>${button}</div></div></div>`;
}

runPage(async () => {
  const ctx = await startPage("home");
  if (ctx.session) {
    window.location.replace("dashboard.html");
    return;
  }

  const demo = demoForecast(todayISO());
  const chart = sparkline(demo.points);
  show("hero", html`<section class="hero-dark"><div class="container"><div class="row align-items-center g-4 g-lg-5">
    <div class="col-lg-6">
      <div class="eyebrow mb-3">${t("Cash-flow forecasting for Malaysian micro-SMEs")}</div>
      <h1 class="mb-3">${t("Know Your Cash Before It Runs Out.")}</h1>
      <p class="lead mb-4">${t("SME CashFlow helps Malaysian micro-businesses turn scattered financial records into simple, forward-looking cash-flow forecasts.")}</p>
      <a class="btn btn-primary btn-lg me-2 mb-2" href="register.html">${t("Start Free")} <i class="bi bi-arrow-right"></i></a>
      <a class="btn btn-light btn-lg mb-2" href="#features">${t("See How It Works")}</a>
    </div>
    <div class="col-lg-6"><div class="demo-card">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center gap-2"><span class="avatar">DS</span>
          <div><div class="fw-semibold small">${DEMO_BUSINESS}</div>
          <div class="text-secondary small">${t("Demo food seller")} &middot; ${DEMO_LOCATION}</div></div></div>
        <span class="tag tag-demo">${t("Demo data")}</span>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-4"><div class="mini-kpi"><div class="label">${t("Current cash")}</div><div class="value">${formatRM(demo.start_sen)}</div></div></div>
        <div class="col-4"><div class="mini-kpi"><div class="label">${t("{days}-day income", { days: 30 })}</div><div class="value text-success">+${formatRM(demo.total_income_sen)}</div></div></div>
        <div class="col-4"><div class="mini-kpi"><div class="label">${t("{days}-day end", { days: 30 })}</div><div class="value">${formatRM(demo.end_sen)}</div></div></div>
      </div>
      ${raw(`<svg viewBox="0 0 ${chart.width} ${chart.height}" class="w-100" role="img"
        aria-label="${esc(t("A line chart of the demo business's cash balance over 30 days. It dips below zero in the middle of the month, then recovers."))}">
        <polygon points="${chart.area}" fill="rgba(29, 91, 214, 0.10)"></polygon>
        <line x1="12" x2="${chart.width - 12}" y1="${chart.zeroY}" y2="${chart.zeroY}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4 4"></line>
        <polyline points="${chart.line}" fill="none" stroke="#1d5bd6" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>
      </svg>`)}
      <div class="d-flex justify-content-between align-items-center mt-2">
        ${demo.shortfall ? html`<span class="tag tag-risk">${t("Shortfall risk")}</span>` : html`<span class="tag tag-ok">${t("On track")}</span>`}
        <a class="small fw-semibold text-decoration-none" href="register.html">${t("Open full dashboard")} <i class="bi bi-arrow-right"></i></a>
      </div>
    </div></div>
  </div></div></section>`);

  show("main", html`
  <section id="features" class="py-5">
    <div class="eyebrow mb-2">${t("Features")}</div>
    <h2 class="section-title mb-4">${t("Built around the decisions that matter this week.")}</h2>
    <div class="row g-3">${FEATURES.map(([icon, title, text]) => html`
      <div class="col-md-6 col-lg-4"><div class="card feature-card h-100 p-4"><span class="icon"><i class="bi ${icon}"></i></span>
      <h3 class="h5">${title}</h3><p class="text-secondary mb-0">${text}</p></div></div>`)}</div>
  </section>

  <section id="pricing" class="py-5">
    <div class="eyebrow mb-2">${t("Pricing")}</div>
    <h2 class="section-title mb-4">${t("Start with the visibility you need.")}</h2>
    <div class="row g-3">${PLAN_ORDER.map(planCard)}</div>
    <p class="text-secondary small mt-3 mb-0">${t("This is a prototype: you can switch plans in Settings to try each one, and no payment is taken.")}</p>
  </section>

  <section id="support" class="py-5">
    <div class="eyebrow mb-2">${t("Contact & support")}</div>
    <h2 class="section-title mb-4">${t("Questions? Talk to a person.")}</h2>
    <div class="row g-3">
      <div class="col-md-6"><div class="card h-100 p-4">
        <h3 class="h6">${t("Need help with your forecast?")}</h3>
        <p class="text-secondary">${t("Use the interactive demo to explore forecast timing, invoices, expenses, and scenarios. Create a free account and load the demo data in one click.")}</p>
        <div><a class="btn btn-primary" href="register.html">${t("Open forecast demo")}</a></div>
      </div></div>
      <div class="col-md-6"><div class="card h-100 p-4">
        <h3 class="h6">${t("Prototype transparency")}</h3>
        <p class="text-secondary mb-0">${t("Forecasts are estimates based on the numbers you enter. They are not bookkeeping, tax, or financial advice. This is a prototype, so please don't enter real bank details.")}</p>
      </div></div>
      <div class="col-md-6"><div class="card h-100 p-4">
        <h3 class="h6">${t("Is there a free trial?")}</h3>
        <p class="text-secondary mb-0">${t("Yes. Premium comes with a 1-month free trial, then {premium}/month. The Free plan stays free, and Basic is {basic}/month with no trial.",
          { premium: PLANS.premium.price, basic: PLANS.basic.price })}</p>
      </div></div>
    </div>
  </section>`);

  if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
});
