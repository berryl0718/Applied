// The dashboard: the cash-flow forecast, warnings, numbers, chart and what's coming up.
import { buildForecast, formatRM, shortDate } from "../cashflow.js";
import { countRecords, loadForecastInputs } from "../db.js";
import { horizonChoices, pickHorizon } from "../plans.js";
import {
  chartValues, drawChart, html, kpi, param, plural, runPage, show, startPage, todayISO, toneFor, trialBanner,
} from "../ui.js";

runPage(async () => {
  const { profile, plan, trial } = await startPage("dashboard", { login: true });
  const today = todayISO();
  const days = pickHorizon(param("days"), plan);
  const hasData = (await countRecords()) > 0;

  const title = html`<div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
    <div>
      <h1 class="h3 mb-1">Dashboard ${profile.demo_data ? html`<span class="tag tag-demo ms-2 align-middle">Demo data</span>` : ""}</h1>
      <div class="text-secondary small">${profile.business_name
        ? html`${profile.business_name}${profile.location ? html` &middot; ${profile.location}` : ""}`
        : "Welcome!"}</div>
    </div>
    <div class="btn-group" role="group" aria-label="Forecast length">${horizonChoices(plan).map((h) => (h.allowed
      ? html`<a class="btn btn-sm ${h.days === days ? "btn-primary" : "btn-outline-primary"}" href="dashboard.html?days=${h.days}">${h.days} days</a>`
      : html`<a class="btn btn-sm btn-outline-secondary" href="settings.html#plan" title="Upgrade your plan to unlock the ${h.days}-day forecast"><i class="bi bi-lock-fill"></i> ${h.days} days</a>`))}
    </div></div>`;

  if (!hasData) {
    show("main", html`${title}${trialBanner(trial, profile)}
      <div class="card p-4 mb-3">
        <h2 class="h5">Let's build your first forecast</h2>
        <ol class="text-secondary">
          <li>Type in how much cash you have right now in <a href="settings.html">Settings</a>.</li>
          <li>Add the <a href="invoices.html?new=1">invoices</a> customers still owe you.</li>
          <li>Add your <a href="expenses.html?new=1">expenses</a>, including the ones that repeat every week or month.</li>
        </ol>
        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-primary" href="invoices.html?new=1">Add an invoice</a>
          <a class="btn btn-outline-primary" href="expenses.html?new=1">Add an expense</a>
          <a class="btn btn-outline-primary" href="import.html">Upload a CSV</a>
          <a class="btn btn-outline-secondary" href="settings.html#demo">Try it with demo data</a>
        </div>
      </div>`);
    return;
  }

  const { invoices, expenses } = await loadForecastInputs();
  const f = buildForecast(profile.cash_sen, invoices, expenses, today, days);
  const upcoming = f.events.slice(0, 8);

  show("main", html`${title}${trialBanner(trial, profile)}
    ${f.shortfall
      ? html`<div class="alert alert-danger d-flex gap-2 align-items-start" role="alert">
          <i class="bi bi-exclamation-triangle-fill mt-1"></i><div>
          <strong>Shortfall risk:</strong> your balance could drop to <strong>${formatRM(f.low_sen)}</strong>
          on ${shortDate(f.low_date)}${f.low_in_days > 0 ? ` (${plural(f.low_in_days, "day")} from now)` : ""}.
          It first goes below RM0 on ${shortDate(f.first_negative_date)}, and stays below zero on ${plural(f.negative_days, "day")} in this period.
          Chasing late invoices or moving a cost to later can help.</div></div>`
      : html`<div class="alert alert-success d-flex gap-2 align-items-start" role="status">
          <i class="bi bi-check-circle-fill mt-1"></i><div><strong>On track:</strong> no shortfall expected in the next ${days} days.
          Your lowest point is ${formatRM(f.low_sen)} on ${shortDate(f.low_date)}.</div></div>`}
    ${f.overdue_count ? html`<div class="alert alert-warning d-flex gap-2 align-items-start" role="status">
          <i class="bi bi-clock-history mt-1"></i><div><strong>${plural(f.overdue_count, "overdue invoice")}</strong>
          worth ${formatRM(f.overdue_sen)}. The forecast expects this money today, so it is only as good as your follow-up.
          <a href="invoices.html?status=overdue">Review overdue invoices</a></div></div>` : ""}

    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3">${kpi("Current cash", formatRM(f.start_sen), toneFor(f.start_sen))}</div>
      <div class="col-6 col-lg-3">${kpi(`${days}-day income`, `+${formatRM(f.total_income_sen)}`, "good")}</div>
      <div class="col-6 col-lg-3">${kpi(`${days}-day end`, formatRM(f.end_sen), toneFor(f.end_sen))}</div>
      <div class="col-6 col-lg-3">${kpi("Lowest point", formatRM(f.low_sen), toneFor(f.low_sen), `on ${shortDate(f.low_date)}`)}</div>
    </div>

    <div class="row g-3">
      <div class="col-lg-8"><div class="card p-3 h-100">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h2 class="h6 m-0">Projected balance, next ${days} days</h2>
          ${f.shortfall ? html`<span class="tag tag-risk">Shortfall risk</span>` : html`<span class="tag tag-ok">On track</span>`}
        </div>
        <div class="chart-box"><canvas id="forecast-chart" role="img" aria-label="Line chart of your projected cash balance"></canvas></div>
        <p class="text-secondary small mt-2 mb-0">The red line is RM0. When the blue line is below it, you are out of cash.</p>
      </div></div>
      <div class="col-lg-4">
        <div class="card p-3 mb-3">
          <h2 class="h6">Coming up</h2>
          ${upcoming.length ? upcoming.map((e) => html`<div class="event-row">
              <div class="min-w-0"><div class="text-break fw-semibold small">${e.label}${e.overdue ? html` <span class="badge status-overdue badge-status">Overdue</span>` : ""}</div>
              <div class="text-secondary small">${shortDate(e.date)} &middot; ${e.kind === "income" ? "Money in" : "Money out"}</div></div>
              <div class="amount ${e.kind === "income" ? "event-in" : "event-out"}">${e.kind === "income" ? "+" : "-"}${formatRM(e.amount_sen)}</div>
            </div>`) : html`<p class="text-secondary small mb-0">Nothing is due in this period.</p>`}
        </div>
        ${plan.horizon < 90 ? html`<div class="card p-3">
          <h2 class="h6">Want to see further ahead?</h2>
          <p class="text-secondary small">${plan.horizon === 7
            ? "Free shows the next 7 days. Basic adds a 30-day forecast, and Premium adds 90 days and scenario planning."
            : "Premium adds a 90-day forecast, scenario planning, detailed reports and team access."}
            ${trial.used ? "" : " Premium comes with a 1-month free trial."}</p>
          <a class="btn btn-sm btn-outline-primary" href="settings.html#plan">${trial.used ? "See plans" : "Start free trial"}</a>
        </div>` : ""}
      </div>
    </div>`);

  drawChart("forecast-chart", f.points.map((p) => shortDate(p.date)),
    [{ label: "Projected balance", data: chartValues(f) }]);
});
