# Plan: SME CashFlow (Vercel + Supabase version)

## Architecture
- **Browser (frontend):** plain HTML pages, Bootstrap 5 and Chart.js from a CDN, and our JavaScript modules. Hosted for free on **Vercel** as a static site, with no build step.
- **Supabase (backend):** Auth handles sign-up and log-in with email and password. The **Postgres** database holds the data. **Row Level Security** gives each user only their own rows, and **database functions** handle actions that must happen all-or-nothing.
- The forecast is calculated in the browser (`js/cashflow.js`) from the user's own invoices and expenses.
- **English / Bahasa Melayu:** screen text goes through `t()` in `js/i18n.js`, with Malay translations in `js/i18n-ms.js`. The EN | BM choice is kept in the browser's `localStorage`. The database is the same in both languages.

## Database (`supabase/schema.sql`)
| Table | What it holds |
|---|---|
| profiles | business name, location, current cash (sen), plan, trial start/end, demo flag (created automatically at sign-up) |
| invoices | customer, amount (sen), due date, unpaid/paid, paid date |
| expenses | description, category, amount (sen), first due date, repeats (none/weekly/monthly) |
| uploads, import_rows | an uploaded CSV and its rows waiting for review |
| team_invites | name, role, invite code (max 10) |

Functions: `start_premium_trial()`, `mark_invoice_paid()`, `accept_import()`, `clear_my_data()`, plus a sign-up trigger and an invite-limit trigger.

## The 1-month Premium free trial
- On the website, **Start 1-Month Free Trial** opens sign-up with Premium chosen. The database starts a 30-day trial the moment the account is created.
- Existing users can start it once from **Settings, Your plan**.
- While the trial is active, the menu shows "Premium trial · N days left" and the dashboard shows when it ends and that Premium is RM39.90/month afterwards.
- Trial dates can only be written by the database function, so a user can't give themselves a second trial.
- After 30 days, the account stays on Premium at RM39.90/month (prototype: no payment). Switching plans during the trial doesn't restart it.

## SST and guided onboarding
- 8% SST is added to Basic (RM19.90 + RM1.59 = RM21.49/month), Premium (RM39.90 + RM3.19 = RM43.09/month) and guided onboarding (RM49 + RM3.92 = RM52.92, one-time). Free has no SST.
- The sign-up page shows an order summary that updates as the plan and onboarding change. Premium's first month is free, so only onboarding (if chosen) is due today.
- The onboarding choice is saved with the login (user metadata) and shown in Settings. Prototype: nothing is charged and no session is booked.
- The maths is `sstSen()` and `checkoutSummary()` in `js/plans.js` (tested).

## Assumptions
1. A prototype has no real payments: changing plan is free and instant.
2. Email and password login. Email confirmation can be turned off in Supabase for class demos.
3. "Today" is Malaysia time (UTC+8).
4. Overdue invoices are expected to be paid today in the forecast.
5. CSV import: up to 256 KB and 200 rows per file. The Free plan allows 2 uploads a month. Imported expenses are one-off and use the "Other" category.
6. Team invites are a demo: they create a code, but invited people can't log in yet.

## Version 2.0: AI advice and Admin Control Centre (20 Oct 2026)
Added after lecturer feedback that the app should show cyber security, admin, AI & routing, API, a live log, the release date and version, system health, code health, the server it runs on, and backend engineering.

- **AI advice (Dashboard → "Ask AI"):** the browser sends a forecast summary (numbers, dates and categories only) to our **Supabase Edge Function** `ai-insights` (Deno/TypeScript). The function checks the user is logged in, then calls the **Google Gemini API** (`gemini-3.5-flash-lite`) with the secret key stored in Supabase Secrets, and returns 3–4 tips in English or Bahasa Melayu. If it fails or takes over 30 seconds, `ruleInsights()` in `js/insights.js` gives built-in tips instead. Every AI request is logged (ok or fallback).
- **Admin Control Centre (`admin.html`):** 10 sections: Overview, System health, Server, API, AI & routing, Live log, Cyber security, Backend engineering, Code health, Releases. All data comes from admin-only database functions that check `is_admin()` inside the database.
- **Database upgrade (`supabase/upgrade_admin_ai.sql`):** `admins` and `app_events` tables (no direct access for users), triggers that write the live log (sign-ups, logins, plan changes, invoices, expenses, uploads, invites), and the functions `admin_overview`, `admin_users`, `admin_events`, `admin_security`, `admin_backend`, `health_ping` and `log_ai_request`.
- **Version and releases:** `js/version.js` (v2.0.0, 20 Oct 2026), shown in the footer and in the Admin Control Centre.
- **Cost stays RM0:** Gemini free tier, and Edge Functions are included in the Supabase free plan.
- Setup steps: `ADMIN_AND_AI_SETUP.md`.
