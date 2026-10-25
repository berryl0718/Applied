// Every conversation with Supabase (login + database) lives in this one file.
// Pages call these functions instead of talking to Supabase directly.
//
// Security note: we never have to add "WHERE user_id = me" for safety. The
// database's Row Level Security rules (supabase/schema.sql) already make sure
// each user can only see and change their own rows. We still filter by the
// user where it makes the meaning clearer.
import { supabase } from "./supabase-client.js";
import { t } from "./i18n.js";

/** Supabase answers {data, error}. Turn an error into a normal JavaScript error. */
function check({ data, error }) {
  if (error) throw new Error(friendlyError(error));
  return data;
}

/** Turn database error text into something a business owner can understand. */
export function friendlyError(error) {
  const message = String(error?.message || error || t("Something went wrong."));
  if (/invalid login credentials/i.test(message)) return t("Wrong email or password.");
  if (/email not confirmed/i.test(message)) return t("Please confirm your email first (check your inbox), then log in.");
  if (/user already registered/i.test(message)) return t("That email already has an account. Try logging in.");
  if (/password should be at least/i.test(message)) return t("Password must be at least 8 characters.");
  if (/rate limit/i.test(message)) return t("Too many attempts. Please wait a minute and try again.");
  if (/violates check constraint/i.test(message)) return t("One of the values is not allowed. Please check the form.");
  if (/failed to fetch|network/i.test(message)) return t("Can't reach the server. Check your internet connection.");
  return message; // already translated by us, or a technical message from Supabase
}

// ---------------------------------------------------------------------------
// Log in / sign up
// ---------------------------------------------------------------------------
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Create an account. The database turns the chosen plan into a profile row
 *  (and starts the 30-day free trial when the plan is "premium").
 *  Returns true if the user is logged in straight away, false if they must
 *  confirm their email first. */
export async function signUp({ email, password, businessName, plan, onboarding = false }) {
  const data = check(await supabase.auth.signUp({
    email,
    password,
    options: {
      // "onboarding": did they ask for guided onboarding? Kept with the login (shown in Settings).
      data: { business_name: businessName, plan, onboarding },
      emailRedirectTo: new URL("dashboard.html", window.location.href).href,
    },
  }));
  return Boolean(data.session);
}

export async function signIn(email, password) {
  check(await supabase.auth.signInWithPassword({ email, password }));
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------------------
// Profile (business name, current cash, plan, free trial)
// ---------------------------------------------------------------------------
export async function getProfile() {
  return check(await supabase.from("profiles").select("*").single());
}

export async function updateProfile(userId, fields) {
  check(await supabase.from("profiles").update(fields).eq("id", userId));
}

/** Start the 1-month Premium free trial (once per account). */
export async function startTrial() {
  return check(await supabase.rpc("start_premium_trial"));
}

// ---------------------------------------------------------------------------
// Invoices (money coming in)
// ---------------------------------------------------------------------------
export async function listInvoices() {
  return check(await supabase.from("invoices").select("*")
    .order("due_date", { ascending: true }).order("id", { ascending: false }).limit(1000));
}

export async function getInvoice(id) {
  return check(await supabase.from("invoices").select("*").eq("id", id).maybeSingle());
}

export async function addInvoice({ customer, amount_sen, due_date }) {
  check(await supabase.from("invoices").insert({ customer, amount_sen, due_date }));
}

export async function updateInvoice(id, { customer, amount_sen, due_date }) {
  // "status = unpaid": a paid invoice can never be changed by mistake.
  const rows = check(await supabase.from("invoices").update({ customer, amount_sen, due_date })
    .eq("id", id).eq("status", "unpaid").select("id"));
  if (!rows.length) throw new Error(t("Paid invoices can't be edited. Delete it and add a new one instead."));
}

/** Mark paid and add the money to current cash (one database step). Returns the amount added. */
export async function markInvoicePaid(id, paidDate) {
  return check(await supabase.rpc("mark_invoice_paid", { p_invoice_id: id, p_paid_date: paidDate }));
}

export async function deleteInvoice(id) {
  check(await supabase.from("invoices").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Expenses (money going out)
// ---------------------------------------------------------------------------
export async function listExpenses() {
  return check(await supabase.from("expenses").select("*")
    .order("due_date", { ascending: true }).order("id", { ascending: false }).limit(1000));
}

export async function getExpense(id) {
  return check(await supabase.from("expenses").select("*").eq("id", id).maybeSingle());
}

export async function addExpense(item) {
  const { description, category, amount_sen, due_date, recurrence } = item;
  check(await supabase.from("expenses").insert({ description, category, amount_sen, due_date, recurrence }));
}

export async function updateExpense(id, item) {
  const { description, category, amount_sen, due_date, recurrence } = item;
  check(await supabase.from("expenses").update({ description, category, amount_sen, due_date, recurrence })
    .eq("id", id));
}

export async function deleteExpense(id) {
  check(await supabase.from("expenses").delete().eq("id", id));
}

/** Everything the forecast needs: unpaid invoices and all expenses. */
export async function loadForecastInputs() {
  const [invoices, expenses] = await Promise.all([
    supabase.from("invoices").select("customer, amount_sen, due_date").eq("status", "unpaid"),
    supabase.from("expenses").select("description, category, amount_sen, due_date, recurrence"),
  ]);
  return { invoices: check(invoices), expenses: check(expenses) };
}

/** How many invoices + expenses the user has (0 means a brand-new account). */
export async function countRecords() {
  const [invoices, expenses] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }),
    supabase.from("expenses").select("id", { count: "exact", head: true }),
  ]);
  if (invoices.error || expenses.error) throw new Error(friendlyError(invoices.error || expenses.error));
  return (invoices.count || 0) + (expenses.count || 0);
}

/** Paid invoices, for "money received" in the reports. */
export async function listPaidInvoices() {
  return check(await supabase.from("invoices").select("amount_sen, paid_date").eq("status", "paid"));
}

// ---------------------------------------------------------------------------
// CSV uploads (with a review step)
// ---------------------------------------------------------------------------
export async function listUploads() {
  return check(await supabase.from("uploads").select("*").order("id", { ascending: false }).limit(10));
}

/** How many files were uploaded since a moment in time (for the Free plan limit). */
export async function countUploadsSince(isoTimestamp) {
  const result = await supabase.from("uploads").select("id", { count: "exact", head: true })
    .gte("created_at", isoTimestamp);
  if (result.error) throw new Error(friendlyError(result.error));
  return result.count || 0;
}

/** Save the file's good rows for review. Nothing changes the forecast yet. Returns the upload id. */
export async function createUpload(filename, rows) {
  const upload = check(await supabase.from("uploads")
    .insert({ filename, row_count: rows.length }).select("id").single());
  const result = await supabase.from("import_rows")
    .insert(rows.map((r) => ({ upload_id: upload.id, ...r })));
  if (result.error) {
    await supabase.from("uploads").delete().eq("id", upload.id); // tidy up, then report
    throw new Error(friendlyError(result.error));
  }
  return upload.id;
}

export async function getUpload(id) {
  return check(await supabase.from("uploads").select("*").eq("id", id).maybeSingle());
}

export async function listPendingRows(uploadId) {
  return check(await supabase.from("import_rows").select("*")
    .eq("upload_id", uploadId).eq("status", "pending").order("id"));
}

/** Ticked rows become invoices/expenses; the rest are skipped. Returns how many were added. */
export async function acceptImport(uploadId, rowIds) {
  return check(await supabase.rpc("accept_import", { p_upload_id: uploadId, p_row_ids: rowIds }));
}

// ---------------------------------------------------------------------------
// Team invites (Premium prototype)
// ---------------------------------------------------------------------------
export async function listInvites() {
  return check(await supabase.from("team_invites").select("*").order("id", { ascending: false }));
}

export async function addInvite(name, role, code) {
  check(await supabase.from("team_invites").insert({ name, role, code }));
}

export async function deleteInvite(id) {
  check(await supabase.from("team_invites").delete().eq("id", id));
}

// ---------------------------------------------------------------------------
// Demo data and clean-up
// ---------------------------------------------------------------------------
export async function loadDemoData(userId, demo) {
  check(await supabase.from("invoices").insert(demo.invoices));
  check(await supabase.from("expenses").insert(demo.expenses));
  await updateProfile(userId, {
    business_name: demo.businessName, location: demo.location, cash_sen: demo.cashSen, demo_data: true,
  });
}

export async function clearMyData() {
  check(await supabase.rpc("clear_my_data"));
}

// ---------------------------------------------------------------------------
// AI advice (Supabase Edge Function "ai-insights" -> Google Gemini API)
// ---------------------------------------------------------------------------
const AI_TIMEOUT_MS = 30000;

/** Ask the AI for advice. Returns {advice, model, ms}. Throws if the AI can't answer. */
export async function askAI(summary, lang) {
  const started = performance.now();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("The AI took too long to answer.")), AI_TIMEOUT_MS));
  const { data, error } = await Promise.race([
    supabase.functions.invoke("ai-insights", { body: { summary, lang } }),
    timeout,
  ]);
  if (error) {
    let detail = error.message;
    try { detail = (await error.context?.json())?.error || detail; } catch { /* keep the first message */ }
    throw new Error(detail);
  }
  if (!data?.advice) throw new Error(data?.error || "The AI returned no advice.");
  return { advice: data.advice, model: data.model, ms: Math.round(performance.now() - started) };
}

/** Is the AI function deployed and does it have its key? (does not call Google) */
export async function pingAI() {
  const { data, error } = await supabase.functions.invoke("ai-insights", { body: { ping: true } });
  if (error) throw new Error(error.message);
  return data;
}

/** Record an AI request in the live log ("ok" or "fallback"). Never throws. */
export async function logAiRequest(status, ms, model) {
  try {
    await supabase.rpc("log_ai_request", { p_status: status, p_ms: Math.round(ms), p_model: model ?? null });
  } catch { /* the log is optional */ }
}

// ---------------------------------------------------------------------------
// Admin Control Centre (each function checks "admin?" inside the database)
// ---------------------------------------------------------------------------
/** True if this user is an admin. False if not, or if the upgrade SQL hasn't been run. */
export async function isAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

export async function healthPing() {
  return check(await supabase.rpc("health_ping"));
}

export async function adminOverview() {
  return check(await supabase.rpc("admin_overview"));
}

export async function adminUsers() {
  return check(await supabase.rpc("admin_users"));
}

export async function adminEvents(afterId = 0, limit = 50) {
  return check(await supabase.rpc("admin_events", { p_after_id: afterId, p_limit: limit }));
}

export async function adminSecurity() {
  return check(await supabase.rpc("admin_security"));
}

export async function adminBackend() {
  return check(await supabase.rpc("admin_backend"));
}
