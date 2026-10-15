// Money, date and forecast helpers for SME CashFlow.
//
// There is no Supabase and no web page code in this file on purpose: these are
// plain functions, so they are easy to read, explain and test (see tests/).
//
// IMPORTANT: money is always kept as whole SEN (RM 1 = 100 sen) in a whole number.
// Computers cannot store numbers like 0.1 exactly (0.1 + 0.2 = 0.30000000000000004),
// but whole numbers are always exact, so we never lose a sen.
//
// Dates are kept as text like "2026-10-27" (year-month-day). Text in this form
// sorts in date order, so "2026-10-03" < "2026-10-27" works as expected.
import { getLang, t } from "./i18n.js";

export const MAX_AMOUNT_SEN = 1_000_000_000; // RM 10,000,000 (a sanity limit)
export const IMPORT_MAX_ROWS = 200;
const REQUIRED_IMPORT_COLUMNS = ["type", "description", "amount", "date"];
const INCOME_WORDS = new Set(["income", "invoice", "in", "sale"]);
const EXPENSE_WORDS = new Set(["expense", "bill", "out", "cost"]);
const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ms: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"],
};
const monthName = (m) => MONTHS[getLang()][m - 1];

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Turn what a person typed ("RM 1,250.50") into whole sen (125050).
 *  Returns null when the text is not a sensible amount. */
export function parseAmount(text, { allowNegative = false, allowZero = false } = {}) {
  const cleaned = String(text ?? "").toUpperCase().replace(/RM/g, "").replace(/[,\s]/g, "");
  if (!cleaned || cleaned.length > 20) return null;
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match || (match[2] === "" && !match[3])) return null;
  const [, sign, whole, decimals = ""] = match;
  // Work in whole numbers: "1250.505" -> 125050 sen, rounding half up on the 3rd decimal.
  let sen = BigInt(whole || "0") * 100n + BigInt((decimals + "00").slice(0, 2));
  if (decimals.length > 2 && Number(decimals[2]) >= 5) sen += 1n;
  if (sign === "-") sen = -sen;
  if (sen > BigInt(MAX_AMOUNT_SEN) || sen < -BigInt(MAX_AMOUNT_SEN)) return null;
  const value = Number(sen);
  if (value < 0 && !allowNegative) return null;
  if (value === 0 && !allowZero) return null;
  return value === 0 ? 0 : value; // never return -0
}

/** 125050 -> "RM1,250.50".  296000 -> "RM2,960".  -216800 -> "-RM2,168". */
export function formatRM(sen) {
  sen = Math.trunc(Number(sen) || 0);
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  let text = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (cents) text += "." + String(cents).padStart(2, "0");
  return `${sign}RM${text}`;
}

/** 125050 -> "1250.50" (the text we put back into a form field). */
export function senToInput(sen) {
  sen = Math.trunc(Number(sen) || 0);
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Dates (always "YYYY-MM-DD" text; the maths is done in UTC so time zones never shift a day)
// ---------------------------------------------------------------------------
function toUTC(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fromUTC(date) {
  return date.toISOString().slice(0, 10);
}

/** "2026-10-27" -> "2026-10-27". Returns null if it is not a real date (or not 2000-2100). */
export function parseDate(text) {
  const value = String(text ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  if (y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null; // e.g. 2026-02-30
  }
  return value;
}

export function addDays(iso, days) {
  const date = toUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUTC(date);
}

/** How many days from a to b. daysBetween("2026-10-12", "2026-10-15") = 3 */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** Move a date forward by whole months. 31 Jan + 1 month = 28 Feb (or 29). */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index % 12; // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUTC(new Date(Date.UTC(year, month, Math.min(d, lastDay))));
}

/** "2026-10-27" -> "27 Oct 2026" */
export function prettyDate(iso) {
  if (!parseDate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${monthName(m)} ${y}`;
}

/** "2026-10-27" -> "27 Oct" */
export function shortDate(iso) {
  if (!parseDate(iso)) return "";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${monthName(m)}`;
}

/** "2026-10" -> "Oct 2026" */
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${monthName(m)} ${y}`;
}

/** Every day an expense is paid between firstDay and lastDay (both included).
 *  recurrence is "none" (once), "weekly" or "monthly". */
export function expenseDates(due, recurrence, firstDay, lastDay) {
  const dates = [];
  if (recurrence === "weekly") {
    let current = due;
    if (current < firstDay) {
      // Jump straight to the first repeat that is not in the past.
      const weeks = Math.floor(daysBetween(current, firstDay) / 7);
      current = addDays(current, 7 * weeks);
      if (current < firstDay) current = addDays(current, 7);
    }
    while (current <= lastDay) {
      dates.push(current);
      current = addDays(current, 7);
    }
  } else if (recurrence === "monthly") {
    for (let step = 0; ; step += 1) {
      // Always count from the ORIGINAL date, so the 31st of the month stays correct.
      const current = addMonths(due, step);
      if (current > lastDay) break;
      if (current >= firstDay) dates.push(current);
    }
  } else if (firstDay <= due && due <= lastDay) {
    dates.push(due); // one-off
  }
  return dates;
}

// ---------------------------------------------------------------------------
// The forecast
// ---------------------------------------------------------------------------

/** Predict the bank balance for every day from today to today + days.
 *
 *  cashSen    - cash in the bank right now (sen)
 *  invoices   - the UNPAID invoices: {customer, amount_sen, due_date}
 *  expenses   - every expense: {description, category, amount_sen, due_date, recurrence}
 *  delayDays  - what if customers pay this many days late?
 *  cutPercent - what if we cut our costs by this percent?
 */
export function buildForecast(cashSen, invoices, expenses, today, days, delayDays = 0, cutPercent = 0) {
  cutPercent = Math.min(Math.max(Math.trunc(cutPercent) || 0, 0), 100);
  delayDays = Math.max(Math.trunc(delayDays) || 0, 0);
  const lastDay = addDays(today, days);
  const events = [];
  let overdueCount = 0;
  let overdueSen = 0;

  for (const invoice of invoices) {
    const due = parseDate(invoice.due_date);
    if (!due) continue;
    const isOverdue = due < today;
    if (isOverdue) {
      overdueCount += 1;
      overdueSen += invoice.amount_sen;
    }
    // Money that is already late is expected "today", never in the past.
    let expected = addDays(due, delayDays);
    if (expected < today) expected = today;
    if (expected <= lastDay) {
      events.push({
        date: expected, kind: "income", label: invoice.customer, category: "Invoices",
        amount_sen: invoice.amount_sen, overdue: isOverdue,
      });
    }
  }

  for (const expense of expenses) {
    const due = parseDate(expense.due_date);
    if (!due) continue;
    // Whole sen only: round down, like the database would.
    const amount = Math.floor((expense.amount_sen * (100 - cutPercent)) / 100);
    for (const when of expenseDates(due, expense.recurrence, today, lastDay)) {
      events.push({
        date: when, kind: "expense", label: expense.description,
        category: expense.category || "Other", amount_sen: amount, overdue: false,
      });
    }
  }

  // Sort by date; on the same day, money in comes before money out (only affects the list).
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === "income" ? 0 : 1) - (b.kind === "income" ? 0 : 1)));

  const changeByDay = new Map();
  for (const event of events) {
    const sign = event.kind === "income" ? 1 : -1;
    changeByDay.set(event.date, (changeByDay.get(event.date) || 0) + sign * event.amount_sen);
  }

  const points = [];
  let balance = cashSen;
  for (let offset = 0; offset <= days; offset += 1) {
    const day = addDays(today, offset);
    balance += changeByDay.get(day) || 0;
    points.push({ date: day, balance_sen: balance });
  }

  let lowest = points[0];
  for (const point of points) if (point.balance_sen < lowest.balance_sen) lowest = point; // the first lowest day
  const negative = points.filter((p) => p.balance_sen < 0);
  const sum = (kind) => events.filter((e) => e.kind === kind).reduce((total, e) => total + e.amount_sen, 0);

  return {
    days,
    start_sen: cashSen,
    points,
    events,
    end_sen: points[points.length - 1].balance_sen,
    low_sen: lowest.balance_sen,
    low_date: lowest.date,
    low_in_days: daysBetween(today, lowest.date),
    total_income_sen: sum("income"),
    total_expense_sen: sum("expense"),
    negative_days: negative.length,
    first_negative_date: negative.length ? negative[0].date : null,
    shortfall: negative.length > 0,
    overdue_count: overdueCount,
    overdue_sen: overdueSen,
  };
}

/** Group forecast events by month: {"2026-10": {income_sen, expense_sen}} (in month order). */
export function monthlyTotals(events) {
  const months = {};
  for (const event of events) {
    const key = event.date.slice(0, 7);
    months[key] ??= { income_sen: 0, expense_sen: 0 };
    months[key][event.kind === "income" ? "income_sen" : "expense_sen"] += event.amount_sen;
  }
  return Object.fromEntries(Object.entries(months).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Add up forecast events of one kind by label (or category). Biggest first: [[name, sen], ...] */
export function totalByLabel(events, kind, key = "label") {
  const totals = new Map();
  for (const event of events) {
    if (event.kind === kind) totals.set(event[key], (totals.get(event[key]) || 0) + event.amount_sen);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/** The numbers for a small SVG line (used for the demo card on the home page). */
export function sparkline(points, width = 480, height = 150, pad = 12) {
  const values = points.map((p) => p.balance_sen);
  const low = Math.min(...values, 0); // always show the zero line
  const high = Math.max(...values, 0);
  const span = high - low || 1;
  const yOf = (value) => Math.round((pad + ((high - value) / span) * (height - 2 * pad)) * 10) / 10;
  const step = (width - 2 * pad) / Math.max(values.length - 1, 1);
  const xOf = (i) => Math.round((pad + i * step) * 10) / 10;
  const line = values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${xOf(values.length - 1)},${height - pad}`;
  return { line, area, zeroY: yOf(0), width, height };
}

// ---------------------------------------------------------------------------
// Reading an uploaded CSV file
// ---------------------------------------------------------------------------

/** Split CSV text into records. Handles "quoted, values" and "" inside quotes.
 *  Returns [{line, fields}] where line is the line number the record starts on. */
export function parseCsv(text) {
  const records = [];
  let fields = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        if (ch === "\n") line += 1;
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      fields.push(field); field = "";
      records.push({ line: recordLine, fields });
      fields = [];
      line += 1;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("unclosed quote");
  if (field !== "" || fields.length) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  return records;
}

/** Read an uploaded CSV file's text.
 *  Returns {rows, problems}:
 *    rows     - good rows: {kind: "income"|"expense", description, amount_sen, row_date}
 *    problems - plain messages (in the chosen language) about rows we had to skip */
export function parseImportCsv(text) {
  text = String(text ?? "").replace(/^﻿/, ""); // remove Excel's hidden first character
  let records;
  try {
    records = parseCsv(text);
  } catch {
    return { rows: [], problems: [t("That file does not look like a valid CSV.")] };
  }
  records = records.filter((r) => r.fields.some((f) => f.trim() !== ""));
  if (!records.length) return { rows: [], problems: [t("The file is empty.")] };

  const headers = records[0].fields.map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_IMPORT_COLUMNS.filter((name) => !headers.includes(name));
  if (missing.length) {
    return {
      rows: [],
      problems: [t("Missing column(s): {columns}. The first row must be: type, description, amount, date", { columns: missing.join(", ") })],
    };
  }
  const column = (name) => headers.indexOf(name);

  const rows = [];
  const problems = [];
  for (const record of records.slice(1)) {
    if (rows.length >= IMPORT_MAX_ROWS) {
      problems.push(t("Only the first {count} rows were read.", { count: IMPORT_MAX_ROWS }));
      break;
    }
    const get = (name) => (record.fields[column(name)] ?? "").trim();
    const where = t("Line {line}", { line: record.line });

    const typeWord = get("type").toLowerCase();
    let kind;
    if (INCOME_WORDS.has(typeWord)) kind = "income";
    else if (EXPENSE_WORDS.has(typeWord)) kind = "expense";
    else { problems.push(t("{where}: type must be income or expense.", { where })); continue; }

    const description = get("description");
    if (!description || description.length > 80) {
      problems.push(t("{where}: description must be 1-80 characters.", { where })); continue;
    }
    const amountSen = parseAmount(get("amount"));
    if (amountSen === null) { problems.push(t("{where}: amount must be above 0, like 1250.50.", { where })); continue; }
    const rowDate = parseDate(get("date"));
    if (!rowDate) { problems.push(t("{where}: date must look like 2026-10-27.", { where })); continue; }

    rows.push({ kind, description, amount_sen: amountSen, row_date: rowDate });
  }
  return { rows, problems };
}

/** A small example file people can download, with dates that are always in the future. */
export function sampleImportCsv(today) {
  return [
    "type,description,amount,date",
    `income,Mawar Convenience Store,1850.00,${addDays(today, 5)}`,
    `income,Kafe Bayu,620.50,${addDays(today, 12)}`,
    `expense,Gas cylinder refill,95.00,${addDays(today, 3)}`,
    `expense,Packaging supplies,430.00,${addDays(today, 9)}`,
    "",
  ].join("\n");
}
