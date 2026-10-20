// Cash-flow advice: the AI summary we send, and the built-in backup rules.
//
// aiSummary()     - the forecast as numbers, dates and categories only. This is
//                   all the AI ever sees: no names, customers or bank details.
// ruleInsights()  - 2 to 4 tips worked out by fixed rules. Used when the AI
//                   can't answer (no internet, Google busy, free limit reached),
//                   so the dashboard always has advice.
// Plain functions (no Supabase), so tests/ can check them.
import { addDays, formatRM, shortDate } from "./cashflow.js";
import { plural, t } from "./i18n.js";

/** The forecast, made safe to send to the AI: customer names become "Invoice". */
export function aiSummary(f, today) {
  return {
    today,
    days: f.days,
    start_sen: f.start_sen,
    end_sen: f.end_sen,
    low_sen: f.low_sen,
    low_date: f.low_date,
    first_negative_date: f.first_negative_date,
    negative_days: f.negative_days,
    total_income_sen: f.total_income_sen,
    total_expense_sen: f.total_expense_sen,
    overdue_count: f.overdue_count,
    overdue_sen: f.overdue_sen,
    events: f.events.slice(0, 25).map((e) => ({
      date: e.date,
      kind: e.kind,
      amount_sen: e.amount_sen,
      label: e.kind === "income" ? "Invoice" : e.category || "Other",
      overdue: Boolean(e.overdue),
    })),
  };
}

/** Advice from fixed rules (the backup when the AI is unavailable). */
export function ruleInsights(f) {
  const tips = [];
  if (f.shortfall) {
    tips.push(t("Your cash could fall to {amount} on {date}. You need about {gap} more by then to stay above RM0.",
      { amount: formatRM(f.low_sen), date: shortDate(f.low_date), gap: formatRM(-f.low_sen) }));

    // The biggest payment in the 7 days up to the lowest point.
    const before = f.events.filter((e) => e.kind === "expense" && e.date <= f.low_date && e.date >= addDays(f.low_date, -7));
    const biggest = before.sort((a, b) => b.amount_sen - a.amount_sen)[0];
    if (biggest) {
      tips.push(t("The biggest payment before then is {label} ({amount}) on {date}. Ask if it can be paid a few days later.",
        { label: biggest.label, amount: formatRM(biggest.amount_sen), date: shortDate(biggest.date) }));
    }

    // The first money coming in after the lowest point: asking for it earlier closes the gap.
    const next = f.events.find((e) => e.kind === "income" && e.date > f.low_date);
    if (next) {
      tips.push(t("{label} ({amount}) is due on {date}. Asking for it before {low} would help cover the gap.",
        { label: next.label, amount: formatRM(next.amount_sen), date: shortDate(next.date), low: shortDate(f.low_date) }));
    }
  } else {
    tips.push(t("No shortfall in the next {days}. Your lowest point is {amount} on {date}.",
      { days: plural(f.days, "day"), amount: formatRM(f.low_sen), date: shortDate(f.low_date) }));
  }

  if (f.overdue_count) {
    tips.push(t("{count} worth {amount} is overdue. Follow up today: the forecast expects this money now.",
      { count: plural(f.overdue_count, "overdue invoice"), amount: formatRM(f.overdue_sen) }));
  }
  if (tips.length < 4 && f.total_expense_sen > f.total_income_sen) {
    tips.push(t("You plan to pay out {amount} more than you receive in this period.",
      { amount: formatRM(f.total_expense_sen - f.total_income_sen) }));
  }
  return tips.slice(0, 4);
}

/** Split the AI's reply into tips: one per line, without "- " or "* " in front. */
export function adviceLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

