// Expenses: money going out. One-off, weekly or monthly. Add, edit, delete, search.
import { formatRM, parseAmount, parseDate, prettyDate, senToInput } from "../cashflow.js";
import { addExpense, deleteExpense, getExpense, listExpenses, updateExpense } from "../db.js";
import { CATEGORIES, RECURRENCE_LABELS, RECURRENCES } from "../plans.js";
import { busy, clearMessages, goTo, html, param, runPage, show, showMessage, startPage, t, th, todayISO } from "../ui.js";

/** Check the form. Returns {item, error}. The database checks again, too. */
export function readExpenseForm(form) {
  const description = form.description.value.trim();
  const category = form.category.value;
  const amount_sen = parseAmount(form.amount.value);
  const due_date = parseDate(form.due_date.value);
  const recurrence = form.recurrence.value;
  let error = "";
  if (!description || description.length > 80) error = t("Describe the expense (80 characters or less).");
  else if (!CATEGORIES.includes(category)) error = t("Pick a category.");
  else if (amount_sen === null) error = t("Enter an amount above RM0, like 320 or 320.50.");
  else if (!due_date) error = t("Choose a valid date.");
  else if (!RECURRENCES.includes(recurrence)) error = t("Choose how often it repeats.");
  return { item: { description, category, amount_sen, due_date, recurrence }, error };
}

function expenseForm(item, isNew) {
  return html`<div class="card p-4 mb-4 form-card">
    <h2 class="h5">${isNew ? t("Add an expense") : t("Edit expense")}</h2>
    <p class="text-secondary small">${t("A cost you will pay. If it repeats, the first date is when it is next due.")}</p>
    <form id="expense-form" novalidate>
      <div class="mb-3">
        <label class="form-label" for="description">${t("Description")}</label>
        <input class="form-control" id="description" name="description" required maxlength="80" value="${item.description}" placeholder="${t("e.g. {example}", { example: t("Shop lot rent") })}">
      </div>
      <div class="row g-3 mb-3">
        <div class="col-sm-6">
          <label class="form-label" for="category">${t("Category")}</label>
          <select class="form-select" id="category" name="category">${CATEGORIES.map((c) =>
            html`<option value="${c}" ${c === item.category ? "selected" : ""}>${t(c)}</option>`)}</select>
        </div>
        <div class="col-sm-6">
          <label class="form-label" for="amount">${t("Amount")}</label>
          <div class="input-group"><span class="input-group-text">RM</span>
          <input class="form-control" id="amount" name="amount" inputmode="decimal" required maxlength="20" value="${item.amount}" placeholder="320.00"></div>
        </div>
        <div class="col-sm-6">
          <label class="form-label" for="due_date">${t("Due date (first time)")}</label>
          <input class="form-control" id="due_date" name="due_date" type="date" required value="${item.due_date}">
        </div>
        <div class="col-sm-6">
          <label class="form-label" for="recurrence">${t("Repeats")}</label>
          <select class="form-select" id="recurrence" name="recurrence">${RECURRENCES.map((r) =>
            html`<option value="${r}" ${r === item.recurrence ? "selected" : ""}>${t(RECURRENCE_LABELS[r])}</option>`)}</select>
        </div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-primary" type="submit">${isNew ? t("Add expense") : t("Save changes")}</button>
        <a class="btn btn-outline-secondary" href="expenses.html">${t("Cancel")}</a>
      </div>
    </form></div>`;
}

runPage(async () => {
  await startPage("expenses", { login: true });
  const search = param("q").trim();
  const category = CATEGORIES.includes(param("category")) ? param("category") : "";
  const editId = Number.parseInt(param("edit"), 10);

  let formPart = "";
  let editing = null;
  if (editId) {
    editing = await getExpense(editId);
    if (!editing) return goTo("expenses.html", t("We couldn't find that expense."), "warning");
    formPart = expenseForm({ ...editing, amount: senToInput(editing.amount_sen) }, false);
  } else if (param("new")) {
    formPart = expenseForm({ description: "", category: "Other", amount: "", due_date: todayISO(), recurrence: "none" }, true);
  }

  const all = await listExpenses();
  let rows = all;
  if (search) rows = rows.filter((e) => e.description.toLowerCase().includes(search.toLowerCase()));
  if (category) rows = rows.filter((e) => e.category === category);

  show("main", html`
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div><h1 class="h3 m-0">${t("Expenses")}</h1><p class="text-secondary small mb-0">${t("Money going out, including weekly and monthly costs.")}</p></div>
      ${formPart ? "" : html`<a class="btn btn-primary" href="expenses.html?new=1"><i class="bi bi-plus-lg"></i> ${t("Add expense")}</a>`}
    </div>
    ${formPart}
    <form class="row g-2 mb-3" method="get" action="expenses.html" role="search">
      <div class="col-sm-6"><label class="visually-hidden" for="q">${t("Search expenses")}</label>
        <input class="form-control" id="q" name="q" value="${search}" placeholder="${t("Search expenses")}" maxlength="80"></div>
      <div class="col-sm-4"><label class="visually-hidden" for="filter-category">${t("Category")}</label>
        <select class="form-select" id="filter-category" name="category">
          <option value="">${t("All categories")}</option>
          ${CATEGORIES.map((c) => html`<option value="${c}" ${c === category ? "selected" : ""}>${t(c)}</option>`)}
        </select></div>
      <div class="col-sm-2 d-grid"><button class="btn btn-outline-primary" type="submit">${t("Filter")}</button></div>
    </form>
    ${rows.length ? html`<div class="card"><div class="table-responsive"><table class="table align-middle mb-0">
      <thead><tr><th>${t("Description")}</th><th>${t("Category")}</th><th class="text-end">${t("Amount")}</th><th>${t("Due")}</th><th>${t("Repeats")}</th><th class="text-end">${t("Actions")}</th></tr></thead>
      <tbody>${rows.map((e) => html`<tr>
        <td class="text-break fw-semibold">${e.description}</td>
        <td><span class="badge badge-soft">${t(e.category)}</span></td>
        <td class="text-end amount">${formatRM(e.amount_sen)}</td>
        <td class="text-nowrap">${prettyDate(e.due_date)}</td>
        <td>${RECURRENCE_LABELS[e.recurrence] ? t(RECURRENCE_LABELS[e.recurrence]) : e.recurrence}</td>
        <td class="text-end text-nowrap">
          <a class="btn btn-sm btn-outline-primary" href="expenses.html?edit=${e.id}">${t("Edit")}</a>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${e.id}">${t("Delete")}</button>
        </td></tr>`)}
      </tbody></table></div></div>`
    : html`<div class="text-center text-secondary py-5 border rounded bg-white">${all.length
        ? t("No expenses match your search.")
        : th("No expenses yet. <a href=\"expenses.html?new=1\">Add your first one</a>.")}</div>`}`);

  const form = document.getElementById("expense-form");
  if (form) {
    form.description.focus();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearMessages();
      const { item, error } = readExpenseForm(form);
      if (error) return showMessage(error, "danger");
      return busy(form.querySelector("button[type=submit]"), async () => {
        if (editing) {
          await updateExpense(editing.id, item);
          goTo("expenses.html", t("Expense updated."));
        } else {
          await addExpense(item);
          goTo("expenses.html", t("Expense added to your forecast."));
        }
      });
    });
  }

  document.querySelector("main").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action=delete]");
    if (!button) return;
    if (!window.confirm(t("Delete this expense? This cannot be undone."))) return;
    busy(button, async () => {
      await deleteExpense(Number(button.dataset.id));
      goTo("expenses.html", t("Expense deleted."), "info");
    });
  });
});
