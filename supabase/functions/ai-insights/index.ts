// SME CashFlow: AI cash-flow advice (Supabase Edge Function "ai-insights").
//
// The route a request takes:
//   phone / browser  ->  Supabase (checks the user is logged in)  ->  THIS function
//   ->  Google Gemini API  ->  back to the app.
//
// Why a function in the middle? The Gemini API key is a secret. It is stored in
// Supabase (Edge Functions -> Secrets -> GEMINI_API_KEY) and only this server
// code can read it. It is never sent to the browser.
//
// Privacy: the app sends only forecast NUMBERS, dates and categories. No names,
// emails, customer names or bank details are sent to Google.
//
// Deploy (no terminal needed): Supabase -> Edge Functions -> Deploy a new
// function -> Via Editor -> name it "ai-insights" -> paste this file -> Deploy.

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// "gemini-flash-latest" always points to Google's newest Flash model.
// To pin a model, add a secret GEMINI_MODEL (for example "gemini-2.5-flash").
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
const TIMEOUT_MS = 15000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Keep only the numbers and short labels we expect, so nothing else can be sent on.
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
const txt = (v: unknown, max = 40) => (typeof v === "string" ? v.slice(0, max) : "");
const rm = (sen: number) => (sen < 0 ? "-RM" : "RM") + (Math.abs(sen) / 100).toLocaleString("en-MY", { maximumFractionDigits: 2 });

function buildPrompt(s: Record<string, unknown>, lang: string) {
  const events = Array.isArray(s.events) ? s.events.slice(0, 25) : [];
  const lines = events.map((e: Record<string, unknown>) =>
    `- ${txt(e.date, 10)}: ${e.kind === "income" ? "money in" : "money out"} ${rm(num(e.amount_sen))} (${txt(e.label)})${e.overdue ? " [overdue]" : ""}`);
  return [
    "You are a friendly cash-flow adviser for a Malaysian micro-business (for example a small food seller).",
    `Reply in ${lang === "ms" ? "Bahasa Melayu" : "simple English"}.`,
    "Give 3 or 4 short, practical tips as bullet points starting with '- '. Each tip must mention a real amount or date from the data.",
    "Focus on avoiding a cash shortage: what to chase, what to delay, how much is needed and by when.",
    "Do not invent numbers. Do not give legal, tax or investment advice. No greeting, no headings, no bold text.",
    "",
    `Today: ${txt(s.today, 10)}. Forecast length: ${num(s.days)} days.`,
    `Cash now: ${rm(num(s.start_sen))}. Cash at the end: ${rm(num(s.end_sen))}.`,
    `Money in: ${rm(num(s.total_income_sen))}. Money out: ${rm(num(s.total_expense_sen))}.`,
    `Lowest balance: ${rm(num(s.low_sen))} on ${txt(s.low_date, 10)}.`,
    s.first_negative_date
      ? `Balance first goes below RM0 on ${txt(s.first_negative_date, 10)} and is negative on ${num(s.negative_days)} days.`
      : "The balance never goes below RM0.",
    `Overdue invoices: ${num(s.overdue_count)} worth ${rm(num(s.overdue_sen))}.`,
    "Upcoming money in and out:",
    ...lines,
  ].join("\n");
}

// Only logged-in users of our app may use this function. We ask Supabase Auth
// "who owns this login token?"; a missing, fake or expired token is refused.
// (So the dashboard setting "Verify JWT with legacy secret" can stay OFF.)
async function isLoggedIn(req: Request) {
  const token = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const url = Deno.env.get("SUPABASE_URL");
  if (!url || !token.startsWith("Bearer ")) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: token, apikey } });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
  if (!(await isLoggedIn(req))) return reply({ error: "Please log in first." }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Send JSON." }, 400);
  }

  // Health check used by the Admin Control Centre (does not call Google).
  if (body.ping) {
    return reply({
      ok: true,
      function: "ai-insights",
      model: MODEL,
      key_set: GEMINI_KEY.length > 0,
      region: Deno.env.get("SB_REGION") ?? null,
      runtime: `Deno ${Deno.version.deno}`,
      time: new Date().toISOString(),
    });
  }

  if (!GEMINI_KEY) return reply({ error: "GEMINI_API_KEY is not set in Supabase secrets." }, 503);
  const summary = body.summary as Record<string, unknown> | undefined;
  if (!summary || typeof summary !== "object") return reply({ error: "Missing forecast summary." }, 400);

  const started = Date.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(summary, txt(body.lang, 2)) }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json();
    if (!res.ok) {
      return reply({ error: data?.error?.message ?? `Gemini answered ${res.status}`, ms: Date.now() - started }, 502);
    }
    const advice = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "").join("").trim();
    if (!advice) return reply({ error: "Gemini returned no text.", ms: Date.now() - started }, 502);
    return reply({ advice: advice.slice(0, 3000), model: MODEL, ms: Date.now() - started });
  } catch (error) {
    return reply({ error: String(error), ms: Date.now() - started }, 504);
  }
});
