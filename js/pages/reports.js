// Reports: a monthly summary (Basic and Premium) and a detailed report (Premium).
import { buildForecast, formatRM, monthLabel, shortDate, totalByLabel, monthlyTotals } from "../cashflow.js";
import { listPaidInvoices, loadForecastInputs } from "../db.js";
import { html, kpi, lockedCard, plural, runPage, show, startPage, t, todayISO, toneFor } from "../ui.js";

const listCard = (title, rows, empty, tone = "") => html`<div class="col-md-6"><div class="card p-3 h-100">
  <h3 class="h6">${title}</h3>
  ${rows.length ? rows.map(([name, sen]) => html`<div class="event-row"><span class="text-break small">${name}</span>
    <span class="amount fw-bold ${tone}">${formatRM(sen)}</span></div>`) : html`<p class="text-secondary small mb-0">${empty}</p>`}
  </div></div>`;

runPage(async () => {
  const { profile, plan } = await startPage("reports", { login: true });
  if (!plan.summaries) {
    show("main", lockedCard(t("Reports"), "Basic", plan));
    return;
  }
  const today = todayISO();
  const [{ invoices, expenses }, paid] = await Promise.all([loadForecastInputs(), listPaidInvoices()]);
  const f = buildForecast(profile.cash_sen, invoices, expenses, today, plan.horizon);

  const expected = monthlyTotals(f.events);
  const received = {};
  for (const invoice of paid) {
    if (!invoice.paid_date) continue;
    const key = invoice.paid_date.slice(0, 7);
    received[key] = (received[key] || 0) + invoice.amount_sen;
  }
  const months = [...new Set([...Object.keys(expected), ...Object.keys(received)])].sort().map((key) => {
    const income = expected[key]?.income_sen || 0;
    const expense = expected[key]?.expense_sen || 0;
    return { key, received: received[key] || 0, income, expense, net: income - expense };
  });

  const detail = plan.detailed ? {
    topCosts: totalByLabel(f.events, "expense").slice(0, 5),
    byCategory: totalByLabel(f.events, "expense", "category"),
    topCustomers: totalByLabel(f.events, "income").slice(0, 5),
    overdue: f.events.filter((e) => e.overdue).map((e) => [e.label, e.amount_sen]),
  } : null;

  show("main", html`
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><h1 class="h3 m-0">${t("Reports")}</h1>
        <p class="text-secondary small mb-0">${t("{business}: cash position and projected low point, as of {date}.", { business: profile.business_name || t("Your business"), date: shortDate(today) })}</p></div>
      <button type="button" class="btn btn-outline-primary no-print" id="print-button"><i class="bi bi-printer"></i> ${t("Print or save as PDF")}</button>
    </div>

    <h2 class="h6">${t("Monthly summary")}</h2>
    ${months.length ? html`<div class="card mb-2"><div class="table-responsive"><table class="table align-middle mb-0">
      <thead><tr><th>${t("Month")}</th><th class="text-end">${t("Received (paid invoices)")}</th><th class="text-end">${t("Expected in")}</th><th class="text-end">${t("Expected out")}</th><th class="text-end">${t("Expected net")}</th></tr></thead>
      <tbody>${months.map((m) => html`<tr>
        <td class="fw-semibold">${monthLabel(m.key)}</td>
        <td class="text-end amount">${formatRM(m.received)}</td>
        <td class="text-end amount">${formatRM(m.income)}</td>
        <td class="text-end amount">${formatRM(m.expense)}</td>
        <td class="text-end amount fw-bold ${m.net < 0 ? "text-danger" : ""}">${formatRM(m.net)}</td></tr>`)}
      </tbody></table></div></div>
      <p class="text-secondary small">${t("\"Expected\" figures cover the next {days} of your forecast, so the first and last months may be partial.", { days: plural(f.days, "day") })}</p>`
    : html`<div class="text-center text-secondary py-4 border rounded bg-white mb-3">${t("Nothing to summarise yet. Add some invoices and expenses first.")}</div>`}

    ${detail ? html`
      <h2 class="h6 mt-4">${t("Detailed report: next {days}", { days: plural(f.days, "day") })}</h2>
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3">${kpi(t("Current cash"), formatRM(f.start_sen), toneFor(f.start_sen))}</div>
        <div class="col-6 col-lg-3">${kpi(t("Projected low point"), formatRM(f.low_sen), toneFor(f.low_sen), t("on {date}", { date: shortDate(f.low_date) }))}</div>
        <div class="col-6 col-lg-3">${kpi(t("Days below RM0"), String(f.negative_days), f.negative_days ? "bad" : "good")}</div>
        <div class="col-6 col-lg-3">${kpi(t("Balance at the end"), formatRM(f.end_sen), toneFor(f.end_sen))}</div>
      </div>
      <div class="row g-3">
        ${listCard(t("Biggest costs coming up"), detail.topCosts, t("No costs in this period."))}
        ${listCard(t("Costs by category"), detail.byCategory.map(([category, sen]) => [t(category), sen]), t("No costs in this period."))}
        ${listCard(t("Customers expected to pay the most"), detail.topCustomers, t("No money expected in this period."), "event-in")}
        ${listCard(t("Overdue invoices"), detail.overdue, t("Nothing is overdue. Well done!"))}
      </div>`
    : html`<div class="card p-4 mt-4 no-print">
      <h2 class="h6">${t("Want the detailed report?")}</h2>
      <p class="text-secondary small mb-3">${t("Premium adds your projected low point, days below RM0, biggest costs, costs by category, top customers and overdue invoices. It comes with a 1-month free trial.")}</p>
      <div><a class="btn btn-outline-primary btn-sm" href="settings.html#plan">${t("See plans")}</a></div></div>`}`);

  document.getElementById("print-button").addEventListener("click", () => window.print());
});
