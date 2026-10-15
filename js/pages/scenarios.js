// Scenario planning (Premium): "What if customers pay late?" and "What if we cut costs?"
import { buildForecast, formatRM, shortDate } from "../cashflow.js";
import { loadForecastInputs } from "../db.js";
import { clampInt, horizonChoices, pickHorizon } from "../plans.js";
import {
  chartValues, drawChart, html, kpi, lockedCard, param, plural, runPage, show, startPage, t, th, todayISO, toneFor,
} from "../ui.js";

runPage(async () => {
  const { profile, plan } = await startPage("scenarios", { login: true });
  if (!plan.scenarios) {
    show("main", lockedCard(t("Scenario planning"), "Premium", plan));
    return;
  }
  const today = todayISO();
  const days = pickHorizon(param("days"), plan);
  const delay = clampInt(param("delay"), 0, 60);
  const cut = clampInt(param("cut"), 0, 50);
  const { invoices, expenses } = await loadForecastInputs();
  const base = buildForecast(profile.cash_sen, invoices, expenses, today, days);
  const whatIf = buildForecast(profile.cash_sen, invoices, expenses, today, days, delay, cut);
  const changed = delay > 0 || cut > 0;
  const diff = whatIf.low_sen - base.low_sen;

  show("main", html`
    <h1 class="h3 mb-1">${t("Scenario planning")}</h1>
    <p class="text-secondary small">${t("Try \"what if\" changes. Nothing is saved; your real records stay the same.")}</p>
    <div class="row g-3">
      <div class="col-lg-4"><div class="card p-4 h-100">
        <form id="scenario-form" method="get" action="scenarios.html">
          <div class="mb-3">
            <label class="form-label" for="days">${t("Forecast length")}</label>
            <select class="form-select" id="days" name="days">${horizonChoices(plan).filter((h) => h.allowed).map((h) =>
              html`<option value="${h.days}" ${h.days === days ? "selected" : ""}>${plural(h.days, "day")}</option>`)}</select>
          </div>
          <div class="mb-3">
            <label class="form-label" for="delay">${t("Customers pay late by")} <span class="range-value" id="delay-value">${plural(delay, "day")}</span></label>
            <input class="form-range" type="range" id="delay" name="delay" min="0" max="60" step="1" value="${delay}">
          </div>
          <div class="mb-3">
            <label class="form-label" for="cut">${t("Cut costs by")} <span class="range-value" id="cut-value">${cut}%</span></label>
            <input class="form-range" type="range" id="cut" name="cut" min="0" max="50" step="5" value="${cut}">
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-primary" type="submit">${t("Update forecast")}</button>
            <a class="btn btn-outline-secondary" href="scenarios.html?days=${days}&delay=14&cut=0">${t("{days} late", { days: plural(14, "day") })}</a>
            <a class="btn btn-outline-secondary" href="scenarios.html?days=${days}&delay=0&cut=10">${t("Cut costs {percent}%", { percent: 10 })}</a>
            ${changed ? html`<a class="btn btn-link" href="scenarios.html?days=${days}">${t("Reset")}</a>` : ""}
          </div>
        </form>
      </div></div>
      <div class="col-lg-8">
        <div class="row g-3 mb-3">
          <div class="col-sm-4">${kpi(t("Lowest point (now)"), formatRM(base.low_sen), toneFor(base.low_sen), t("on {date}", { date: shortDate(base.low_date) }))}</div>
          <div class="col-sm-4">${kpi(t("Lowest point (what-if)"), formatRM(whatIf.low_sen), toneFor(whatIf.low_sen), t("on {date}", { date: shortDate(whatIf.low_date) }))}</div>
          <div class="col-sm-4">${kpi(t("Days below RM0 (what-if)"), String(whatIf.negative_days), whatIf.negative_days ? "bad" : "good", t("now: {count}", { count: base.negative_days }))}</div>
        </div>
        ${changed ? html`<div class="alert ${diff < 0 ? "alert-warning" : "alert-success"} small" role="status">
          ${th("With these changes your lowest balance would be <strong>{amount}</strong>,", { amount: formatRM(whatIf.low_sen) })}
          ${diff === 0 ? t("the same as now.")
            : diff < 0 ? t("{amount} lower than now.", { amount: formatRM(Math.abs(diff)) })
            : t("{amount} higher than now.", { amount: formatRM(Math.abs(diff)) })}
          ${whatIf.shortfall ? t("You would go below RM0 on {days}.", { days: plural(whatIf.negative_days, "day") }) : t("You would stay above RM0.")}</div>`
        : html`<div class="alert alert-light small border">${t("Move the sliders or try a preset to compare with your current forecast.")}</div>`}
        <div class="card p-3"><div class="chart-box"><canvas id="forecast-chart" role="img" aria-label="${t("Line chart comparing your current forecast with the what-if forecast")}"></canvas></div></div>
      </div>
    </div>`);

  const form = document.getElementById("scenario-form");
  form.delay.addEventListener("input", () => { document.getElementById("delay-value").textContent = plural(Number(form.delay.value), "day"); });
  form.cut.addEventListener("input", () => { document.getElementById("cut-value").textContent = `${form.cut.value}%`; });

  drawChart("forecast-chart", base.points.map((p) => shortDate(p.date)), [
    { label: t("With your what-if changes"), data: chartValues(whatIf) },
    { label: t("Current forecast"), data: chartValues(base), dashed: true },
  ]);
});
