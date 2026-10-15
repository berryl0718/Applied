// Import records from a CSV file. Nothing changes the forecast until the user
// reviews the rows and ticks the ones to keep.
import { formatRM, parseImportCsv, prettyDate, sampleImportCsv } from "../cashflow.js";
import {
  acceptImport, countUploadsSince, createUpload, getUpload, listExpenses, listInvoices, listPendingRows, listUploads,
} from "../db.js";
import {
  busy, clearMessages, flash, goTo, html, param, plural, runPage, show, showMessage, startPage, t, th, todayISO,
} from "../ui.js";

const MAX_FILE_BYTES = 256 * 1024; // 256 KB is about 2,000 rows

/** Keep file names simple and safe to show: letters, numbers, dots, dashes. */
export function safeFilename(name) {
  const cleaned = String(name).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 100);
  return cleaned || "upload.csv";
}

async function uploadView(plan) {
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01T00:00:00+08:00`; // the 1st of this month, Malaysia time
  const limit = plan.uploadsPerMonth; // null means unlimited
  const [used, history] = await Promise.all([countUploadsSince(monthStart), listUploads()]);
  const full = limit !== null && used >= limit;

  show("main", html`
    <h1 class="h3 mb-1">${t("Import records")}</h1>
    <p class="text-secondary small">${t("Upload a CSV file of money coming in and going out. You will review every row before anything changes your forecast.")}</p>
    <div class="row g-3">
      <div class="col-lg-7"><div class="card p-4 h-100">
        <h2 class="h6">${t("Upload a CSV file")}</h2>
        ${limit !== null ? html`<p class="small ${full ? "text-danger" : "text-secondary"}">
          ${t("The {plan} plan includes {count} a month. You have used {used}.", { plan: t(plan.label), count: plural(limit, "upload"), used })}
          ${full ? th("<a href=\"settings.html#plan\">Upgrade to Basic</a> for unlimited uploads.") : ""}</p>` : ""}
        <form id="upload-form" novalidate>
          <div class="mb-3">
            <label class="form-label" for="file">${t("CSV file (up to 256 KB)")}</label>
            <input class="form-control" id="file" name="file" type="file" accept=".csv,text/csv" ${full ? "disabled" : ""}>
          </div>
          <button class="btn btn-primary" type="submit" ${full ? "disabled" : ""}>${t("Read file")}</button>
        </form>
      </div></div>
      <div class="col-lg-5"><div class="card p-4 h-100">
        <h2 class="h6">${t("How the file should look")}</h2>
        <p class="small text-secondary mb-2">${th("The first row must be <code>type,description,amount,date</code>. Type is <strong>income</strong> or <strong>expense</strong>; dates look like {today}.", { today })}</p>
        <pre class="small bg-light p-2 rounded mb-3">type,description,amount,date
income,Kafe Bayu,620.50,${today}
expense,Gas cylinder refill,95.00,${today}</pre>
        <button class="btn btn-sm btn-outline-primary" type="button" id="sample-button"><i class="bi bi-download"></i> ${t("Download a sample file")}</button>
        <p class="small text-secondary mt-2 mb-0">${t("In Excel: File > Save As > CSV UTF-8.")}</p>
      </div></div>
    </div>
    <h2 class="h6 mt-4">${t("Recent uploads")}</h2>
    ${history.length ? html`<div class="card"><div class="table-responsive"><table class="table align-middle mb-0">
      <thead><tr><th>${t("File")}</th><th>${t("Rows")}</th><th>${t("Uploaded")}</th><th>${t("Status")}</th><th></th></tr></thead>
      <tbody>${history.map((u) => html`<tr>
        <td class="text-break">${u.filename}</td><td>${u.row_count}</td>
        <td class="text-nowrap">${prettyDate(u.created_at.slice(0, 10))}</td>
        <td>${u.status === "pending" ? html`<span class="badge status-unpaid badge-status">${t("Waiting for review")}</span>` : html`<span class="badge status-paid badge-status">${t("Reviewed")}</span>`}</td>
        <td class="text-end">${u.status === "pending" ? html`<a class="btn btn-sm btn-outline-primary" href="import.html?upload=${u.id}">${t("Review")}</a>` : ""}</td>
      </tr>`)}</tbody></table></div></div>`
    : html`<p class="text-secondary small">${t("No uploads yet.")}</p>`}`);

  document.getElementById("sample-button").addEventListener("click", () => {
    const blob = new Blob([sampleImportCsv(today)], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "sme-cashflow-sample.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  const form = document.getElementById("upload-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearMessages();
    const file = form.file.files[0];
    if (!file) return showMessage(t("Choose a CSV file first."), "danger");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return showMessage(t("Please upload a .csv file. In Excel: File > Save As > CSV UTF-8."), "danger");
    }
    if (file.size > MAX_FILE_BYTES) {
      return showMessage(t("That file is too big. Keep CSV files under 256 KB (about 2,000 rows)."), "danger");
    }
    return busy(form.querySelector("button"), async () => {
      if (limit !== null && (await countUploadsSince(monthStart)) >= limit) {
        return showMessage(t("The {plan} plan includes {count} a month. Upgrade to Basic for unlimited uploads.", { plan: t(plan.label), count: plural(limit, "upload") }), "warning");
      }
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        return showMessage(t("We could not read that file. In Excel, save it as 'CSV UTF-8' and try again."), "danger");
      }
      const { rows, problems } = parseImportCsv(text);
      if (!rows.length) return showMessage(problems[0] || t("We found no usable rows in that file."), "danger");
      const uploadId = await createUpload(safeFilename(file.name), rows);
      if (problems.length) {
        const more = problems.length > 3 ? ` ${t("(and {count} more)", { count: problems.length - 3 })}` : "";
        flash(`${t("{count} skipped.", { count: plural(problems.length, "row") })} ${problems.slice(0, 3).join(" ")}${more}`, "warning");
      }
      return goTo(`import.html?upload=${uploadId}`, t("File read. Nothing has changed yet. Review the rows below first."), "info");
    });
  });
}

async function reviewView(uploadId) {
  const upload = await getUpload(uploadId);
  if (!upload) return goTo("import.html", t("We couldn't find that upload."), "warning");
  if (upload.status !== "pending") return goTo("import.html", t("That upload has already been reviewed."), "info");

  const today = todayISO();
  const [rows, invoices, expenses] = await Promise.all([listPendingRows(uploadId), listInvoices(), listExpenses()]);
  // A row is a "possible duplicate" if the same name, amount and date is already saved.
  const key = (name, sen, date) => `${name}|${sen}|${date}`;
  const existing = new Set([
    ...invoices.map((i) => `income|${key(i.customer, i.amount_sen, i.due_date)}`),
    ...expenses.map((e) => `expense|${key(e.description, e.amount_sen, e.due_date)}`),
  ]);
  const review = rows.map((row) => ({
    row,
    duplicate: existing.has(`${row.kind}|${key(row.description, row.amount_sen, row.row_date)}`),
    past: row.row_date < today,
  }));

  show("main", html`
    <h1 class="h3 mb-1">${t("Review your upload")}</h1>
    <p class="text-secondary small">${t("{file}: tick the rows to add to your forecast. Untick anything that looks wrong. Possible duplicates start unticked.", { file: upload.filename })}</p>
    <form id="review-form">
      <div class="card mb-3"><div class="table-responsive"><table class="table align-middle mb-0">
        <thead><tr><th><span class="visually-hidden">${t("Keep")}</span></th><th>${t("Type")}</th><th>${t("Description")}</th><th class="text-end">${t("Amount")}</th><th>${t("Date")}</th><th>${t("Notes")}</th></tr></thead>
        <tbody>${review.map(({ row, duplicate, past }) => html`<tr>
          <td><input class="form-check-input" type="checkbox" name="accept" value="${row.id}" id="row-${row.id}" ${duplicate ? "" : "checked"}
              aria-label="${t("Add {item}", { item: row.description })}"></td>
          <td>${row.kind === "income" ? html`<span class="badge status-paid badge-status">${t("Money in")}</span>` : html`<span class="badge badge-soft">${t("Money out")}</span>`}</td>
          <td class="text-break"><label for="row-${row.id}">${row.description}</label></td>
          <td class="text-end amount">${formatRM(row.amount_sen)}</td>
          <td class="text-nowrap">${prettyDate(row.row_date)}</td>
          <td class="small">${duplicate ? html`<span class="text-danger">${t("Possible duplicate")}</span>` : ""}
            ${past ? html`<span class="text-secondary">${row.kind === "income" ? t("Overdue: expected today") : t("In the past: not in the forecast")}</span>` : ""}</td>
        </tr>`)}</tbody></table></div></div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-primary" type="submit">${t("Add ticked rows to my forecast")}</button>
        <button class="btn btn-outline-secondary" type="button" id="skip-all">${t("Skip all")}</button>
      </div>
    </form>`);

  const form = document.getElementById("review-form");
  const finish = (button, ids) => busy(button, async () => {
    const added = await acceptImport(uploadId, ids);
    goTo("dashboard.html", t("Added {count} to your forecast. Skipped {skipped}.", { count: plural(added, "record"), skipped: rows.length - added }));
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const ids = [...form.querySelectorAll("input[name=accept]:checked")].map((box) => Number(box.value));
    finish(form.querySelector("button[type=submit]"), ids);
  });
  document.getElementById("skip-all").addEventListener("click", (event) => finish(event.currentTarget, []));
  return undefined;
}

runPage(async () => {
  const { plan } = await startPage("import", { login: true });
  const uploadId = Number.parseInt(param("upload"), 10);
  if (uploadId) await reviewView(uploadId);
  else await uploadView(plan);
});
