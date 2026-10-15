// The dashboard: the cash-flow forecast, warnings, numbers, chart and what's coming up.
import { buildForecast, formatRM, shortDate } from "../cashflow.js";
import { countRecords, loadForecastInputs } from "../db.js";
import { horizonChoices, pickHorizon } from "../plans.js";
import {
  chartValues, drawChart, html, kpi, param, plural, runPage, show, startPage, t, th, todayISO, toneFor, trialBanner,
} from "../ui.js";

runPage(async () => {
  const { profile, plan, trial } = await startPage("dashboard", { login: true });
  const today = todayISO();
  const days = pickHorizon(param("days"), plan);
  const hasData = (await countRecords()) > 0;

  const title = html`<div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
    <div>
      <h1 class="h3 mb-1">${t("Dashboard")} ${profile.demo_data ? html`<span class="tag tag-demo ms-2 align-middle">${t("Demo data")}</span>` : ""}</h1>
      <div class="text-secondary small">${profile.business_name
        ? html`${profile.business_name}${profile.location ? html` &middot; ${profile.location}` : ""}`
        : t("Welcome!")}</div>
    </div>
    <div class="btn-group" role="group" aria-label="${t("Forecast length")}">${horizonChoices(plan).map((h) => (h.allowed
      ? html`<a class="btn btn-sm ${h.days === days ? "btn-primary" : "btn-outline-primary"}" href="dashboard.html?days=${h.days}">${plural(h.days, "day")}</a>`
      : html`<a class="btn btn-sm btn-outline-secondary" href="settings.html#plan" title="${t("Upgrade your plan to unlock the {days}-day forecast", { days: h.days })}"><i class="bi bi-lock-fill"></i> ${plural(h.days, "day")}</a>`))}
    </div></div>`;

  if (!hasData) {
    show("main", html`${title}${trialBanner(trial, profile)}
      <div class="card p-4 mb-3">
        <h2 class="h5">${t("Let's build your first forecast")}</h2>
        <ol class="text-secondary">
          <li>${th("Type in how much cash you have right now in <a href=\"settings.html\">Settings</a>.")}</li>
          <li>${th("Add the <a href=\"invoices.html?new=1\">invoices</a> customers still owe you.")}</li>
          <li>${th("Add your <a href=\"expenses.html?new=1\">expenses</a>, including the ones that repeat every week or month.")}</li>
        </ol>
        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-primary" href="invoices.html?new=1">${t("Add an invoice")}</a>
          <a class="btn btn-outline-primary" href="expenses.html?new=1">${t("Add an expense")}</a>
          <a class="btn btn-outline-primary" href="import.html">${t("Upload a CSV")}</a>
          <a class="btn btn-outline-secondary" href="settings.html#demo">${t("Try it with demo data")}</a>
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
          ${th("<strong>Shortfall risk:</strong> your balance could drop to <strong>{amount}</strong> on {date}", { amount: formatRM(f.low_sen), date: shortDate(f.low_date) })}${f.low_in_days > 0
            ? ` ${t("({days} from now)", { days: plural(f.low_in_days, "day") })}` : ""}.
          ${t("It first goes below RM0 on {date}, and stays below zero on {days} in this period.", { date: shortDate(f.first_negative_date), days: plural(f.negative_days, "day") })}
          ${t("Chasing late invoices or moving a cost to later can help.")}</div></div>`
      : html`<div class="alert alert-success d-flex gap-2 align-items-start" role="status">
          <i class="bi bi-check-circle-fill mt-1"></i><div>${th("<strong>On track:</strong> no shortfall expected in the next {days}.", { days: plural(days, "day") })}
          ${t("Your lowest point is {amount} on {date}.", { amount: formatRM(f.low_sen), date: shortDate(f.low_date) })}</div></div>`}
    ${f.overdue_count ? html`<div class="alert alert-warning d-flex gap-2 align-items-start" role="status">
          <i class="bi bi-clock-history mt-1"></i><div>${th("<strong>{count}</strong> worth {amount}.", { count: plural(f.overdue_count, "overdue invoice"), amount: formatRM(f.overdue_sen) })}
          ${t("The forecast expects this money today, so it is only as good as your follow-up.")}
          <a href="invoices.html?status=overdue">${t("Review overdue invoices")}</a></div></div>` : ""}

    <div class="row g-3 mb-3">
      <div class="col-6 col-lg-3">${kpi(t("Current cash"), formatRM(f.start_sen), toneFor(f.start_sen))}</div>
      <div class="col-6 col-lg-3">${kpi(t("{days}-day income", { days }), `+${formatRM(f.total_income_sen)}`, "good")}</div>
      <div class="col-6 col-lg-3">${kpi(t("{days}-day end", { days }), formatRM(f.end_sen), toneFor(f.end_sen))}</div>
      <div class="col-6 col-lg-3">${kpi(t("Lowest point"), formatRM(f.low_sen), toneFor(f.low_sen), t("on {date}", { date: shortDate(f.low_date) }))}</div>
    </div>

    <div class="row g-3">
      <div class="col-lg-8"><div class="card p-3 h-100">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h2 class="h6 m-0">${t("Projected balance, next {days}", { days: plural(days, "day") })}</h2>
          ${f.shortfall ? html`<span class="tag tag-risk">${t("Shortfall risk")}</span>` : html`<span class="tag tag-ok">${t("On track")}</span>`}
        </div>
        <div class="chart-box"><canvas id="forecast-chart" role="img" aria-label="${t("Line chart of your projected cash balance")}"></canvas></div>
        <p class="text-secondary small mt-2 mb-0">${t("The red line is RM0. When the blue line is below it, you are out of cash.")}</p>
      </div></div>
      <div class="col-lg-4">
        <div class="card p-3 mb-3">
          <h2 class="h6">${t("Coming up")}</h2>
          ${upcoming.length ? upcoming.map((e) => html`<div class="event-row">
              <div class="min-w-0"><div class="text-break fw-semibold small">${e.label}${e.overdue ? html` <span class="badge status-overdue badge-status">${t("Overdue")}</span>` : ""}</div>
              <div class="text-secondary small">${shortDate(e.date)} &middot; ${e.kind === "income" ? t("Money in") : t("Money out")}</div></div>
              <div class="amount ${e.kind === "income" ? "event-in" : "event-out"}">${e.kind === "income" ? "+" : "-"}${formatRM(e.amount_sen)}</div>
            </div>`) : html`<p class="text-secondary small mb-0">${t("Nothing is due in this period.")}</p>`}
        </div>
        ${plan.horizon < 90 ? html`<div class="card p-3">
          <h2 class="h6">${t("Want to see further ahead?")}</h2>
          <p class="text-secondary small">${plan.horizon === 7
            ? t("Free shows the next 7 days. Basic adds a 30-day forecast, and Premium adds 90 days and scenario planning.")
            : t("Premium adds a 90-day forecast, scenario planning, detailed reports and team access.")}
            ${trial.used ? "" : t("Premium comes with a 1-month free trial.")}</p>
          <a class="btn btn-sm btn-outline-primary" href="settings.html#plan">${trial.used ? t("See plans") : t("Start free trial")}</a>
        </div>` : ""}
      </div>
    </div>`);

  drawChart("forecast-chart", f.points.map((p) => shortDate(p.date)),
    [{ label: t("Projected balance"), data: chartValues(f) }]);
});
