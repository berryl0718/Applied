// Automatic checks for SME CashFlow's money, date, forecast, CSV and plan rules.
// Run them:  node tests/run.mjs   (or open tests/index.html in the browser)
// We fix "today" to 12 Oct 2026, so the numbers in these tests never change.
import * as cf from "../js/cashflow.js";
import {
  DEMO_CASH_SEN, ONBOARDING_SEN, PLANS, checkoutSummary, clampInt, demoForecast, demoRecords, horizonChoices,
  pickHorizon, planFor, sstSen, trialStatus,
} from "../js/plans.js";
import { equal, ok, test } from "./harness.js";
import { MS } from "../js/i18n-ms.js";
import { getLang, plural, setLang, t } from "../js/i18n.js";

// The tests check English text, whatever language this browser last picked.
setLang("en", { save: false });

const TODAY = "2026-10-12";
const day = (n) => cf.addDays(TODAY, n);
const inv = (customer, amount_sen, due_date) => ({ customer, amount_sen, due_date });
const exp = (description, amount_sen, due_date, recurrence = "none", category = "Other") =>
  ({ description, amount_sen, due_date, recurrence, category });

// ----- Money -----
test("parseAmount accepts sensible amounts", () => {
  const cases = [["1250.50", 125050], ["RM 1,250.50", 125050], ["rm10", 1000], ["0.005", 1],
    ["2960", 296000], ["  75 ", 7500], [".5", 50], ["1.004", 100]];
  for (const [text, sen] of cases) equal(cf.parseAmount(text), sen, text);
});
test("parseAmount rejects bad amounts", () => {
  for (const text of ["", "abc", "0", "-5", "NaN", "Infinity", "1e2", "99999999999", "1.2.3", "١٢٣", ".", "-", null]) {
    equal(cf.parseAmount(text), null, String(text));
  }
});
test("parseAmount allows negative and zero only when asked", () => {
  equal(cf.parseAmount("-12.5", { allowNegative: true }), -1250);
  equal(cf.parseAmount("0", { allowZero: true }), 0);
  equal(cf.parseAmount("-0", { allowZero: true, allowNegative: true }), 0);
});
test("formatRM", () => {
  const cases = [[296000, "RM2,960"], [125050, "RM1,250.50"], [-216800, "-RM2,168"], [5, "RM0.05"],
    [0, "RM0"], [123456789, "RM1,234,567.89"]];
  for (const [sen, text] of cases) equal(cf.formatRM(sen), text);
});
test("senToInput", () => {
  equal(cf.senToInput(125050), "1250.50");
  equal(cf.senToInput(5), "0.05");
  equal(cf.senToInput(-1250), "-12.50");
});

// ----- Dates -----
test("parseDate", () => {
  equal(cf.parseDate("2026-10-27"), "2026-10-27");
  for (const bad of ["2026-02-30", "27/10/2026", "", null, "1999-01-01", "hello"]) equal(cf.parseDate(bad), null, String(bad));
});
test("date labels", () => {
  equal(cf.shortDate("2026-10-07"), "7 Oct");
  equal(cf.prettyDate("2026-10-27"), "27 Oct 2026");
  equal(cf.monthLabel("2026-10"), "Oct 2026");
  equal(cf.prettyDate("not a date"), "");
  equal(cf.daysBetween("2026-10-12", "2026-11-12"), 31);
});
test("addMonths stays inside the month", () => {
  equal(cf.addMonths("2026-01-31", 1), "2026-02-28");
  equal(cf.addMonths("2028-01-31", 1), "2028-02-29"); // leap year
  equal(cf.addMonths("2026-12-15", 1), "2027-01-15");
  equal(cf.addMonths("2026-10-12", 3), "2027-01-12");
});
test("expenseDates: one-off, weekly, monthly", () => {
  const first = "2026-10-12";
  const last = "2026-10-30";
  equal(cf.expenseDates("2026-10-20", "none", first, last), ["2026-10-20"]);
  equal(cf.expenseDates("2026-11-20", "none", first, last), []);
  equal(cf.expenseDates("2026-10-01", "weekly", first, last), ["2026-10-15", "2026-10-22", "2026-10-29"]);
  equal(cf.expenseDates("2026-01-31", "monthly", "2026-02-01", "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);
});

// ----- The forecast -----
test("forecast finds the low point", () => {
  const f = cf.buildForecast(100000, [inv("A", 50000, day(2))], [exp("Rent", 180000, day(1))], TODAY, 7);
  equal(f.points.length, 8); // today + 7 days
  equal(f.low_sen, -80000);
  equal(f.low_date, day(1));
  equal(f.end_sen, -30000);
  equal(f.shortfall, true);
  equal(f.negative_days, 7);
  equal(f.first_negative_date, day(1));
  equal(f.total_income_sen, 50000);
  equal(f.total_expense_sen, 180000);
});
test("forecast without a shortfall", () => {
  const f = cf.buildForecast(500000, [inv("A", 10000, day(2))], [exp("Rent", 100000, day(3))], TODAY, 7);
  equal(f.shortfall, false);
  equal(f.first_negative_date, null);
  equal(f.low_sen, 410000); // after paying the rent on day 3
});
test("overdue invoices are expected today", () => {
  const f = cf.buildForecast(0, [inv("Late Co", 30000, day(-5))], [], TODAY, 7);
  equal(f.points[0].balance_sen, 30000);
  equal(f.overdue_count, 1);
  equal(f.overdue_sen, 30000);
  equal(f.events[0].overdue, true);
});
test("customers paying late can cause a shortfall", () => {
  const invoices = [inv("A", 100000, day(3))];
  const expenses = [exp("Supplier", 50000, day(5))];
  equal(cf.buildForecast(0, invoices, expenses, TODAY, 10).shortfall, false);
  const late = cf.buildForecast(0, invoices, expenses, TODAY, 10, 4);
  equal(late.shortfall, true);
  equal(late.low_sen, -50000);
});
test("cutting costs lowers the expenses", () => {
  equal(cf.buildForecast(0, [], [exp("Rent", 100000, day(2))], TODAY, 7, 0, 25).total_expense_sen, 75000);
  equal(cf.buildForecast(0, [], [exp("Rent", 100000, day(2))], TODAY, 7, 0, 500).total_expense_sen, 0);
});
test("forecast ignores things outside the period or broken", () => {
  const f = cf.buildForecast(1000, [inv("Far away", 99999, day(50)), inv("Broken", 5000, "not-a-date")],
    [exp("Last month", 5000, day(-20))], TODAY, 30);
  equal(f.events, []);
  equal(f.end_sen, 1000);
});
test("recurring expenses repeat in the forecast", () => {
  const f = cf.buildForecast(0, [], [exp("Supplier", 1000, day(1), "weekly")], TODAY, 30);
  equal(f.events.length, 5); // days 1, 8, 15, 22, 29
  equal(f.total_expense_sen, 5000);
});
test("monthly totals and labels", () => {
  const f = cf.buildForecast(0, [inv("A", 100, day(1)), inv("B", 200, day(25))], [exp("Rent", 50, day(2))], TODAY, 30);
  const months = cf.monthlyTotals(f.events);
  equal(months["2026-10"], { income_sen: 100, expense_sen: 50 });
  equal(months["2026-11"], { income_sen: 200, expense_sen: 0 });
  equal(Object.keys(months), ["2026-10", "2026-11"]);
  equal(cf.totalByLabel(f.events, "income"), [["B", 200], ["A", 100]]);
});
test("demo numbers match our website", () => {
  const f = demoForecast(TODAY);
  equal(f.start_sen, 296000);        // RM2,960
  equal(f.total_income_sen, 1272200); // +RM12,722
  equal(f.end_sen, 408200);          // RM4,082
  equal(f.shortfall, true);
  equal(f.low_sen, -216800);         // the dip in the middle of the month
  equal(f.low_date, "2026-10-27");
  equal(demoRecords(TODAY).invoices.length, 5);
  equal(DEMO_CASH_SEN, 296000);
});
test("sparkline has a point per day and a zero line inside the box", () => {
  const s = cf.sparkline(demoForecast(TODAY).points);
  equal(s.line.split(" ").length, 31);
  ok(s.zeroY > 12 && s.zeroY < 138, "zero line inside the chart");
});

// ----- CSV import -----
test("CSV import reads good rows and reports bad ones", () => {
  const text = "﻿Type, Description ,Amount,DATE\r\n"
    + `income,Kafe Bayu,"1,250.50",${day(5)}\r\n`
    + `bill,Gas refill,95,${day(3)}\r\n`
    + "\r\n"
    + "bonus,Nope,10,2026-10-20\r\n"
    + `income,,10,${day(1)}\r\n`
    + `income,Lim,abc,${day(1)}\r\n`
    + "income,Tan,10,2026-13-45\r\n";
  const { rows, problems } = cf.parseImportCsv(text);
  equal(rows.map((r) => r.kind), ["income", "expense"]);
  equal(rows[0].amount_sen, 125050);
  equal(rows[0].description, "Kafe Bayu");
  equal(problems.length, 4);
  ok(problems[0].startsWith("Line 5:"), problems[0]);
  ok(problems[3].startsWith("Line 8:"), problems[3]);
});
test("CSV import handles quotes and line breaks inside quotes", () => {
  const { rows, problems } = cf.parseImportCsv(`type,description,amount,date\nincome,"Lim ""Uncle"" Store",10,${day(2)}\nexpense,"Two\nlines",5,${day(2)}\nincome,Late,1,bad`);
  equal(rows[0].description, 'Lim "Uncle" Store');
  equal(rows[1].description, "Two\nlines");
  ok(problems[0].startsWith("Line 5:"), problems[0]);
});
test("CSV import rejects unusable files", () => {
  equal(cf.parseImportCsv("").problems, ["The file is empty."]);
  ok(cf.parseImportCsv("type,description,date\n").problems[0].includes("Missing column(s): amount"));
  ok(cf.parseImportCsv('type,description,amount,date\nincome,"oops,1,2026-10-20').problems[0].includes("valid CSV"));
});
test("CSV import stops at 200 rows", () => {
  const lines = ["type,description,amount,date"];
  for (let i = 0; i < 250; i += 1) lines.push(`income,Customer ${i},10,${day(2)}`);
  const { rows, problems } = cf.parseImportCsv(lines.join("\n"));
  equal(rows.length, cf.IMPORT_MAX_ROWS);
  ok(problems.some((p) => p.includes("first 200")));
});
test("the sample CSV file is valid", () => {
  const { rows, problems } = cf.parseImportCsv(cf.sampleImportCsv(TODAY));
  equal(rows.length, 4);
  equal(problems, []);
});

// ----- Plans and the free trial -----
test("plans match the website", () => {
  equal([PLANS.free.price, PLANS.basic.price, PLANS.premium.price], ["RM0", "RM19.90", "RM39.90"]);
  equal([PLANS.free.horizon, PLANS.basic.horizon, PLANS.premium.horizon], [7, 30, 90]);
  equal(planFor({ plan: "nonsense" }).key, "free");
});
test("horizon buttons and choosing a forecast length", () => {
  equal(horizonChoices(PLANS.basic).map((h) => h.allowed), [true, true, false]);
  equal(pickHorizon("90", PLANS.basic), 30);
  equal(pickHorizon("7", PLANS.basic), 7);
  equal(pickHorizon("abc", PLANS.free), 7);
  equal(pickHorizon("", PLANS.premium), 30);
  equal(pickHorizon("90", PLANS.premium), 90);
  equal(clampInt("99", 0, 60), 60);
  equal(clampInt("x", 0, 60), 0);
});
test("free trial: never started", () => {
  const t = trialStatus({ plan: "free", trial_started_at: null, trial_ends_at: null });
  equal([t.used, t.active, t.ended, t.daysLeft], [false, false, false, 0]);
});
test("free trial: active, with days left", () => {
  const now = new Date("2026-10-12T04:00:00Z");
  const profile = { plan: "premium", trial_started_at: "2026-10-02T04:00:00Z", trial_ends_at: "2026-11-01T04:00:00Z" };
  const t = trialStatus(profile, now);
  equal([t.used, t.active, t.ended, t.daysLeft], [true, true, false, 20]);
  // switched down to Basic during the trial: not active, but the window is still open
  const basic = trialStatus({ ...profile, plan: "basic" }, now);
  equal([basic.used, basic.active, basic.ended], [true, false, false]);
});
test("free trial: ended", () => {
  const t = trialStatus({ plan: "premium", trial_started_at: "2026-09-01T00:00:00Z", trial_ends_at: "2026-10-01T00:00:00Z" },
    new Date("2026-10-12T00:00:00Z"));
  equal([t.used, t.active, t.ended, t.daysLeft], [true, false, true, 0]);
});

// ----- SST (8%) and guided onboarding -----
test("SST: 8% on Basic, Premium and onboarding, rounded to the sen", () => {
  equal(sstSen(1990), 159);           // Basic RM19.90 -> SST RM1.59
  equal(sstSen(3990), 319);           // Premium RM39.90 -> SST RM3.19
  equal(sstSen(ONBOARDING_SEN), 392); // onboarding RM49 -> SST RM3.92
  equal(sstSen(0), 0);
  equal(PLANS.basic.price_sen + sstSen(PLANS.basic.price_sen), 2149);
  equal(PLANS.premium.price_sen + sstSen(PLANS.premium.price_sen), 4309);
});
test("SST: what is due today for each plan", () => {
  equal(checkoutSummary("free", false).today.total_sen, 0);
  equal(checkoutSummary("free", true).today.total_sen, 5292);       // onboarding only: RM49 + RM3.92
  equal(checkoutSummary("basic", false).today.total_sen, 2149);     // RM19.90 + RM1.59
  equal(checkoutSummary("basic", true).today, { plan_sen: 2149, sst_sen: 551, total_sen: 7441 });
  const premium = checkoutSummary("premium", false);
  equal([premium.trial, premium.today.total_sen, premium.monthly.total_sen], [true, 0, 4309]); // first month free
  equal(checkoutSummary("premium", true).today.total_sen, 5292);    // onboarding is still paid today
  equal(checkoutSummary("nonsense", false).plan, "free");
});

// ----- English / Bahasa Melayu -----
/** Run a check in Malay, then switch back to English for the other tests. */
function inMalay(check) {
  setLang("ms", { save: false });
  try { check(); } finally { setLang("en", { save: false }); }
}
test("language: English by default, Malay when chosen", () => {
  equal(getLang(), "en");
  equal(t("Dashboard"), "Dashboard");
  equal(t("on {date}", { date: "7 Oct" }), "on 7 Oct");
  equal(plural(1, "day"), "1 day");
  equal(plural(3, "day"), "3 days");
  inMalay(() => {
    equal(t("Dashboard"), "Papan Pemuka");
    equal(t("on {date}", { date: "7 Okt" }), "pada 7 Okt");
    equal(plural(3, "day"), "3 hari"); // Malay has no plural "s"
    equal(t("A sentence nobody translated"), "A sentence nobody translated"); // falls back to English
  });
});
test("language: Malay dates and CSV messages", () => {
  inMalay(() => {
    equal(cf.shortDate("2026-10-07"), "7 Okt");
    equal(cf.prettyDate("2026-08-27"), "27 Ogo 2026");
    equal(cf.monthLabel("2026-12"), "Dis 2026");
    equal(cf.parseImportCsv("").problems, ["Fail ini kosong."]);
    ok(cf.parseImportCsv("type,description,amount,date\nfoo,X,1,2026-10-20").problems[0].startsWith("Baris 2:"));
  });
  equal(cf.shortDate("2026-10-07"), "7 Oct"); // back to English
});
test("language: every English sentence has a Malay translation", async () => {
  // Every file with text on screen. Add new page files here too.
  const files = ["ui.js", "db.js", "cashflow.js", "plans.js", "pages/dashboard.js", "pages/expenses.js", "pages/home.js",
    "pages/import.js", "pages/invoices.js", "pages/login.js", "pages/notfound.js", "pages/register.js",
    "pages/reports.js", "pages/scenarios.js", "pages/settings.js", "pages/team.js", "insights.js"];
  const read = typeof window === "undefined"
    ? async (file) => (await import("node:fs")).readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8")
    : async (file) => (await fetch(`../js/${file}`)).text();
  const sentences = new Set();
  for (const file of files) {
    const source = await read(file);
    for (const m of source.matchAll(/\bth?\(\s*("(?:[^"\\]|\\.)*")/g)) sentences.add(JSON.parse(m[1]));
    for (const m of source.matchAll(/\bplural\([^,()]+(?:\([^()]*\))?,\s*("(?:[^"\\]|\\.)*")\)/g)) sentences.add(JSON.parse(m[1]));
  }
  // Saved values that are shown translated (categories, repeats, plan names and features, team roles)
  const { CATEGORIES, RECURRENCE_LABELS, TEAM_ROLES } = await import("../js/plans.js");
  [...CATEGORIES, ...Object.values(RECURRENCE_LABELS), ...Object.values(PLANS).flatMap((p) => [p.label, ...p.highlights]), ...TEAM_ROLES]
    .forEach((value) => sentences.add(value));
  ok(sentences.size > 300, `only found ${sentences.size} sentences: is the search still working?`);
  const missing = [...sentences].filter((sentence) => !MS[sentence]);
  equal(missing, [], "these sentences need a Malay translation in js/i18n-ms.js");
  // A translation must keep the same {blanks} and <tags> as the English sentence.
  const shape = (text) => [...(text.match(/\{\w+\}|<\/?\w+/g) || [])].sort();
  const broken = Object.entries(MS).filter(([en, ms]) => JSON.stringify(shape(en)) !== JSON.stringify(shape(ms)));
  equal(broken.map(([en]) => en), [], "these translations lost a {blank} or <tag>");
});

// ----- AI advice: what we send, and the built-in backup rules -----
import { adviceLines, aiSummary, ruleInsights } from "../js/insights.js";

test("AI summary sends numbers and categories only, never customer names", () => {
  setLang("en", { save: false });
  const f = demoForecast(TODAY);
  const summary = aiSummary(f, TODAY);
  const sent = JSON.stringify(summary);
  for (const name of ["Taman Desa", "Kafe Bayu", "Menara PJ", "Aisyah", "Mawar", "Ingredients supplier", "Shop lot"]) {
    ok(!sent.includes(name), `${name} must not be sent to the AI`);
  }
  equal(summary.low_sen, f.low_sen);
  ok(summary.events.every((e) => e.label === "Invoice" || ["Rent", "Stock / ingredients", "Wages", "Utilities"].includes(e.label)));
});
test("built-in rules: demo shortfall gives the gap, the biggest payment and the next invoice", () => {
  setLang("en", { save: false });
  const tips = ruleInsights(demoForecast(TODAY));
  ok(tips.length >= 2 && tips.length <= 4, `got ${tips.length} tips`);
  ok(tips[0].includes("-RM2,168") && tips[0].includes("RM2,168 more"), tips[0]);
  ok(tips.some((tip) => tip.startsWith("The biggest payment before then is")), "biggest payment tip");
  ok(tips.some((tip) => tip.includes("would help cover the gap")), "next invoice tip");
});
test("built-in rules: no shortfall and overdue invoices", () => {
  setLang("en", { save: false });
  const f = cf.buildForecast(500000, [inv("A", 30000, day(-3))], [exp("Rent", 100000, day(5))], TODAY, 7);
  const tips = ruleInsights(f);
  ok(tips[0].startsWith("No shortfall in the next 7 days."), tips[0]);
  ok(tips.some((tip) => tip.startsWith("1 overdue invoice worth RM300 is overdue")), tips.join(" | "));
  ok(tips.some((tip) => tip.includes("RM700 more than you receive")), tips.join(" | "));
});
test("built-in rules speak Malay too", () => {
  setLang("ms", { save: false });
  const tips = ruleInsights(demoForecast(TODAY));
  setLang("en", { save: false });
  ok(tips[0].startsWith("Tunai anda mungkin jatuh ke"), tips[0]);
});
test("AI reply is split into clean tips", () => {
  equal(adviceLines("- Chase **RM2,400** today\n\n* Delay rent\n1. Keep RM500 aside\n• Last one"),
    ["Chase RM2,400 today", "Delay rent", "Keep RM500 aside", "Last one"]);
  equal(adviceLines(""), []);
});
