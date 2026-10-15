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

## Assumptions
1. A prototype has no real payments: changing plan is free and instant.
2. Email and password login. Email confirmation can be turned off in Supabase for class demos.
3. "Today" is Malaysia time (UTC+8).
4. Overdue invoices are expected to be paid today in the forecast.
5. CSV import: up to 256 KB and 200 rows per file. The Free plan allows 2 uploads a month. Imported expenses are one-off and use the "Other" category.
6. Team invites are a demo: they create a code, but invited people can't log in yet.
