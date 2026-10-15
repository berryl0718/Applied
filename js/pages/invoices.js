// Invoices: money customers owe you. Add, edit, mark as paid, delete, search.
import { addDays, formatRM, parseAmount, parseDate, prettyDate, senToInput } from "../cashflow.js";
import { addInvoice, deleteInvoice, getInvoice, listInvoices, markInvoicePaid, updateInvoice } from "../db.js";
import { busy, clearMessages, goTo, html, param, plural, runPage, show, showMessage, startPage, t, th, todayISO } from "../ui.js";

/** Check the form. Returns {item, error}. The database checks again, too. */
export function readInvoiceForm(form) {
  const customer = form.customer.value.trim();
  const amount_sen = parseAmount(form.amount.value);
  const due_date = parseDate(form.due_date.value);
  let error = "";
  if (!customer || customer.length > 80) error = t("Enter the customer's name (80 characters or less).");
  else if (amount_sen === null) error = t("Enter an amount above RM0, like 1250 or 1250.50.");
  else if (!due_date) error = t("Choose a valid due date.");
  return { item: { customer, amount_sen, due_date }, error };
}

function invoiceForm(item, isNew) {
  return html`<div class="card p-4 mb-4 form-card" id="invoice-form-card">
    <h2 class="h5">${isNew ? t("Add an invoice") : t("Edit invoice")}</h2>
    <p class="text-secondary small">${t("Money a customer owes you. It is added to your forecast on the due date.")}</p>
    <form id="invoice-form" novalidate>
      <div class="mb-3">
        <label class="form-label" for="customer">${t("Customer")}</label>
        <input class="form-control" id="customer" name="customer" required maxlength="80" value="${item.customer}">
      </div>
      <div class="row g-3 mb-3">
        <div class="col-sm-6">
          <label class="form-label" for="amount">${t("Amount")}</label>
          <div class="input-group"><span class="input-group-text">RM</span>
          <input class="form-control" id="amount" name="amount" inputmode="decimal" required maxlength="20" value="${item.amount}" placeholder="1250.00"></div>
        </div>
        <div class="col-sm-6">
          <label class="form-label" for="due_date">${t("Due date")}</label>
          <input class="form-control" id="due_date" name="due_date" type="date" required value="${item.due_date}">
        </div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" type="submit">${isNew ? t("Add invoice") : t("Save changes")}</button>
        <a class="btn btn-outline-secondary" href="invoices.html">${t("Cancel")}</a>
      </div>
    </form></div>`;
}

runPage(async () => {
  await startPage("invoices", { login: true });
  const today = todayISO();
  const search = param("q").trim();
  const status = ["paid", "unpaid", "overdue"].includes(param("status")) ? param("status") : "";
  const editId = Number.parseInt(param("edit"), 10);

  // The add / edit form (only shown when asked for)
  let formPart = "";
  let editing = null;
  if (editId) {
    editing = await getInvoice(editId);
    if (!editing) return goTo("invoices.html", t("We couldn't find that invoice."), "warning");
    if (editing.status === "paid") {
      return goTo("invoices.html", t("Paid invoices can't be edited. If you made a mistake, delete it and add a new one."), "warning");
    }
    formPart = invoiceForm({ customer: editing.customer, amount: senToInput(editing.amount_sen), due_date: editing.due_date }, false);
  } else if (param("new")) {
    formPart = invoiceForm({ customer: "", amount: "", due_date: addDays(today, 14) }, true);
  }

  const all = await listInvoices();
  const unpaid = all.filter((i) => i.status === "unpaid");
  const overdue = unpaid.filter((i) => i.due_date < today);
  const sum = (rows) => rows.reduce((total, i) => total + i.amount_sen, 0);

  let rows = all;
  if (search) rows = rows.filter((i) => i.customer.toLowerCase().includes(search.toLowerCase()));
  if (status === "paid") rows = rows.filter((i) => i.status === "paid");
  if (status === "unpaid") rows = rows.filter((i) => i.status === "unpaid");
  if (status === "overdue") rows = rows.filter((i) => i.status === "unpaid" && i.due_date < today);
  rows = [...rows].sort((a, b) => (a.status === "paid") - (b.status === "paid") || (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : b.id - a.id));

  const badge = (i) => {
    if (i.status === "paid") return html`<span class="badge status-paid badge-status">${t("Paid")} ${i.paid_date ? prettyDate(i.paid_date) : ""}</span>`;
    if (i.due_date < today) return html`<span class="badge status-overdue badge-status">${t("Overdue")}</span>`;
    return html`<span class="badge status-unpaid badge-status">${t("Unpaid")}</span>`;
  };

  show("main", html`
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><h1 class="h3 m-0">${t("Invoices")}</h1><p class="text-secondary small mb-0">${t("Money your customers owe you.")}</p></div>
      ${formPart ? "" : html`<a class="btn btn-primary" href="invoices.html?new=1"><i class="bi bi-plus-lg"></i> ${t("Add invoice")}</a>`}
    </div>
    ${formPart}
    <div class="row g-3 mb-3">
      <div class="col-sm-6"><div class="card p-3"><div class="kpi-label">${t("Still to collect")}</div>
        <div class="kpi-value">${formatRM(sum(unpaid))}</div><div class="small text-secondary">${plural(unpaid.length, "unpaid invoice")}</div></div></div>
      <div class="col-sm-6"><div class="card p-3"><div class="kpi-label">${t("Overdue")}</div>
        <div class="kpi-value ${overdue.length ? "bad" : ""}">${formatRM(sum(overdue))}</div><div class="small text-secondary">${t("{count} past the due date", { count: plural(overdue.length, "invoice") })}</div></div></div>
    </div>
    <form class="row g-2 mb-3" method="get" action="invoices.html" role="search">
      <div class="col-sm-6"><label class="visually-hidden" for="q">${t("Search customers")}</label>
        <input class="form-control" id="q" name="q" value="${search}" placeholder="${t("Search customers")}" maxlength="80"></div>
      <div class="col-sm-4"><label class="visually-hidden" for="status">${t("Status")}</label>
        <select class="form-select" id="status" name="status">
          ${[["", t("All invoices")], ["unpaid", t("Unpaid")], ["overdue", t("Overdue")], ["paid", t("Paid")]].map(([value, label]) =>
            html`<option value="${value}" ${value === status ? "selected" : ""}>${label}</option>`)}
        </select></div>
      <div class="col-sm-2 d-grid"><button class="btn btn-outline-primary" type="submit">${t("Filter")}</button></div>
    </form>
    ${rows.length ? html`<div class="card"><div class="table-responsive"><table class="table align-middle mb-0">
      <thead><tr><th>${t("Customer")}</th><th class="text-end">${t("Amount")}</th><th>${t("Due")}</th><th>${t("Status")}</th><th class="text-end">${t("Actions")}</th></tr></thead>
      <tbody>${rows.map((i) => html`<tr>
        <td class="text-break fw-semibold">${i.customer}</td>
        <td class="text-end amount">${formatRM(i.amount_sen)}</td>
        <td class="text-nowrap">${prettyDate(i.due_date)}</td>
        <td>${badge(i)}</td>
        <td class="text-end text-nowrap">
          ${i.status === "unpaid" ? html`
            <button class="btn btn-sm btn-success" data-action="paid" data-id="${i.id}" data-amount="${i.amount_sen}">${t("Mark paid")}</button>
            <a class="btn btn-sm btn-outline-primary" href="invoices.html?edit=${i.id}">${t("Edit")}</a>` : ""}
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${i.id}">${t("Delete")}</button>
        </td></tr>`)}
      </tbody></table></div></div>`
    : html`<div class="text-center text-secondary py-5 border rounded bg-white">${all.length
        ? t("No invoices match your search.")
        : th("No invoices yet. <a href=\"invoices.html?new=1\">Add your first one</a>.")}</div>`}`);

  // Saving the add / edit form
  const form = document.getElementById("invoice-form");
  if (form) {
    form.customer.focus();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearMessages();
      const { item, error } = readInvoiceForm(form);
      if (error) return showMessage(error, "danger");
      return busy(form.querySelector("button[type=submit]"), async () => {
        if (editing) {
          await updateInvoice(editing.id, item);
          goTo("invoices.html", t("Invoice updated."));
        } else {
          await addInvoice(item);
          goTo("invoices.html", t("Invoice added to your forecast."));
        }
      });
    });
  }

  // The buttons in the table
  document.querySelector("main").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.dataset.id);
    if (button.dataset.action === "paid") {
      if (!window.confirm(t("Mark this invoice as paid? {amount} will be added to your current cash.", { amount: formatRM(Number(button.dataset.amount)) }))) return;
      busy(button, async () => {
        const added = await markInvoicePaid(id, today);
        if (added > 0) goTo(window.location.href, t("Marked as paid. {amount} was added to your current cash.", { amount: formatRM(added) }));
        else goTo(window.location.href, t("That invoice was already marked as paid."), "info");
      });
    } else if (button.dataset.action === "delete") {
      if (!window.confirm(t("Delete this invoice? This cannot be undone."))) return;
      busy(button, async () => {
        await deleteInvoice(id);
        goTo("invoices.html", t("Invoice deleted."), "info");
      });
    }
  });
});
