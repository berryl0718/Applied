// Plans, the free trial, choices for forms, and the demo business.
// Plain functions only (no Supabase), so they can be tested in tests/.
import { addDays, buildForecast } from "./cashflow.js";

export const APP_NAME = "SME CashFlow";

export const CATEGORIES = ["Rent", "Stock / ingredients", "Wages", "Utilities",
  "Loan / financing", "Marketing", "Other"];
export const RECURRENCES = ["none", "weekly", "monthly"];
export const RECURRENCE_LABELS = { none: "One-off", weekly: "Every week", monthly: "Every month" };
export const TEAM_ROLES = ["viewer", "editor"];
export const MAX_TEAM_INVITES = 10;
export const HORIZONS = [7, 30, 90]; // forecast lengths, in days
export const TRIAL_DAYS = 30;        // "1-month free trial" on our website

// The three plans from our website. Prices are shown only: no money is taken.
export const PLANS = {
  free: {
    key: "free", label: "Free", price: "RM0", horizon: 7, uploadsPerMonth: 2,
    summaries: false, scenarios: false, detailed: false, team: false,
    highlights: ["Manual entry", "7-day forecast", "Limited document uploads"],
  },
  basic: {
    key: "basic", label: "Basic", price: "RM19.90", horizon: 30, uploadsPerMonth: null,
    summaries: true, scenarios: false, detailed: false, team: false,
    highlights: ["30-day forecast", "Document uploads", "Monthly summaries"],
  },
  premium: {
    key: "premium", label: "Premium", price: "RM39.90", horizon: 90, uploadsPerMonth: null,
    summaries: true, scenarios: true, detailed: true, team: true,
    highlights: ["90-day forecast", "Scenario planning", "Detailed reports", "Team access"],
  },
};
export const PLAN_ORDER = ["free", "basic", "premium"];

/** The plan object for a profile row (falls back to Free). */
export function planFor(profile) {
  return PLANS[profile?.plan] || PLANS.free;
}

/** Where the 1-month Premium free trial stands for this profile.
 *    used     - has this account ever started the trial?
 *    active   - is the user on Premium AND still inside the 30 days?
 *    daysLeft - whole days left (rounded up), 0 when not active
 *    endsAt   - when the trial ends (a Date), or null */
export function trialStatus(profile, now = new Date()) {
  const used = Boolean(profile?.trial_started_at);
  const endsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const inWindow = Boolean(endsAt) && now < endsAt;
  const active = used && inWindow && profile.plan === "premium";
  const daysLeft = active ? Math.ceil((endsAt - now) / 86_400_000) : 0;
  return { used, active, daysLeft, endsAt, ended: used && !inWindow };
}

/** The 7 / 30 / 90 day buttons, and which ones this plan may use. */
export function horizonChoices(plan) {
  return HORIZONS.map((days) => ({ days, allowed: days <= plan.horizon }));
}

/** Which forecast length to show. Falls back to the plan's best (up to 30). */
export function pickHorizon(raw, plan) {
  const fallback = Math.min(plan.horizon, 30);
  const wanted = Number.parseInt(raw, 10);
  return HORIZONS.includes(wanted) && wanted <= plan.horizon ? wanted : fallback;
}

/** Turn text into a whole number between low and high (or the fallback). */
export function clampInt(raw, low, high, fallback = 0) {
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, low), high);
}

// ---------------------------------------------------------------------------
// The demo business from our website: "Dapur Seri", a food seller in Petaling Jaya.
// Each item says "this many days from today", so the demo is never out of date.
// With these numbers the 30-day forecast is exactly what the website shows:
//   cash RM2,960 -> income +RM12,722 -> end balance RM4,082, dipping below zero in between.
// ---------------------------------------------------------------------------
export const DEMO_BUSINESS = "Dapur Seri";
export const DEMO_LOCATION = "Petaling Jaya";
export const DEMO_CASH_SEN = 296000;
export const DEMO_INVOICES = [
  // [customer, amount in sen, due in N days]
  ["Taman Desa school catering", 240000, 3],
  ["Kafe Bayu", 187200, 10],
  ["Corporate lunch - Menara PJ", 345000, 18],
  ["Aisyah wedding order", 280000, 24],
  ["Mawar Convenience Store", 220000, 27],
];
export const DEMO_EXPENSES = [
  // [description, category, amount in sen, repeats, first due in N days]
  ["Ingredients supplier", "Stock / ingredients", 110000, "weekly", 1],
  ["Shop lot rent", "Rent", 320000, "monthly", 4],
  ["Staff wages", "Wages", 240000, "monthly", 12],
  ["Electricity and water", "Utilities", 50000, "monthly", 9],
];

/** The demo invoices and expenses with real dates, ready to save or to forecast. */
export function demoRecords(today) {
  return {
    invoices: DEMO_INVOICES.map(([customer, amount_sen, inDays]) =>
      ({ customer, amount_sen, due_date: addDays(today, inDays) })),
    expenses: DEMO_EXPENSES.map(([description, category, amount_sen, recurrence, inDays]) =>
      ({ description, category, amount_sen, recurrence, due_date: addDays(today, inDays) })),
  };
}

/** The Dapur Seri 30-day forecast for the home page (worked out live, not typed in). */
export function demoForecast(today) {
  const { invoices, expenses } = demoRecords(today);
  return buildForecast(DEMO_CASH_SEN, invoices, expenses, today, 30);
}
