# SME CashFlow

**Know Your Cash Before It Runs Out.**
A cash-flow forecasting web app for Malaysian micro-businesses (food sellers, small shops, service providers).
BFM3130 Entrepreneurship in FinTech · group assignment prototype.

- **Frontend and hosting:** Vercel (free plan). The pages are plain HTML, CSS and JavaScript, so there is no build step.
- **Backend and database:** Supabase (free plan). It handles login (email and password) and a Postgres database, with Row Level Security so every user only sees their own data.
- **Format:** a web app that works in any browser, on laptops and phones, through one link.

---

## What the app does

| Feature | Plan |
|---|---|
| Cash-flow forecast with a chart and a shortfall warning: 7 days (Free), 30 days (Basic), 90 days (Premium) | All |
| Invoice tracking: add, edit, search, mark as paid (adds the money to current cash), see overdue invoices | All |
| Expense management: one-off, weekly or monthly costs, by category | All |
| Document upload: import a CSV, **review the rows first**, possible duplicates start unticked | Free: 2 a month; Basic and Premium: unlimited |
| Monthly summary report (print or save as PDF) | Basic, Premium |
| Detailed report: low point, days below RM0, top costs, costs by category, top customers, overdue invoices | Premium |
| Scenario planning: "customers pay 14 days late", "cut costs by 10%", compared with the normal forecast | Premium |
| Team access: prepare an invite code for a team member (prototype: no email is sent) | Premium |
| **1-month free trial of Premium** (once per account), then RM39.90/month | Premium |
| One-click demo business "Dapur Seri" (Petaling Jaya): RM2,960 cash, +RM12,722 income, RM4,082 at day 30, a dip to -RM2,168 | All |

Plans: **Free RM0**, **Basic RM19.90/month** (no trial), **Premium RM39.90/month** (first month free).
This is a prototype, so no payment is ever taken and you can switch plans in Settings.

---

## Set it up, step by step (about 30 minutes, Mac)

You need free accounts on **GitHub**, **Supabase** and **Vercel**. Sign up for Supabase and Vercel with your GitHub account, which is the easiest way.

### Step 1: Create the Supabase project (database and login)
1. Go to <https://supabase.com>, then **Sign in** and click **New project**.
2. Give it a name (`sme-cashflow`), make a database password (save it somewhere), and pick the region **Southeast Asia (Singapore)**. Click **Create new project** and wait about 2 minutes.

### Step 2: Create the tables
1. In your Supabase project, click **SQL Editor** in the left menu, then **New query**.
2. Open the file `supabase/schema.sql` from this folder (in VS Code), select everything (**Cmd + A**), copy it and paste it into Supabase.
3. Click **Run**. You should see "Success. No rows returned".

### Step 3: Make sign-up easy for the demo
Supabase sends a "confirm your email" message by default. The free plan can only send a few emails per hour, which can block a class demo. Turn the confirmation off:
1. Go to **Authentication**, then **Sign In / Providers** (or **Providers**), then **Email**.
2. Turn **Confirm email** off and click **Save**.

(The app works with it on too. It then shows "Check your email" after sign-up.)

### Step 4: Connect the app to Supabase
1. In Supabase, click **Project Settings** (the gear icon), then **API Keys**. You can also click **Connect** at the top.
2. Copy the **Project URL**, which looks like `https://abcdefgh.supabase.co`.
3. Copy the **Publishable key** (`sb_publishable_...`). If your project shows the older **anon public** key instead, use that.
4. In VS Code, open `js/config.js` and paste both values between the quotes:
   ```js
   export const SUPABASE_URL = "https://abcdefgh.supabase.co";
   export const SUPABASE_KEY = "sb_publishable_xxxxxxxx";
   ```
   These two values are meant to be public. **Never** paste the *secret* or *service_role* key into the app.

### Step 5: Try it on your Mac
In the VS Code terminal (**Terminal**, then **New Terminal**), inside this folder:
```
python3 -m http.server 8000
```
Open <http://localhost:8000>, then register, go to **Settings**, click **Load demo data** and look at the dashboard. Stop the server with **Control + C**.

Run the automatic tests: open <http://localhost:8000/tests/> while the server is running. You should see **29 passed, 0 failed**. If you have Node.js installed, you can also run `node tests/run.mjs`.

### Step 6: Put the code on GitHub
1. On <https://github.com>, click **New repository**, name it `sme-cashflow`, leave it empty and click **Create repository**.
2. In the VS Code terminal (replace `YOUR-USERNAME`):
   ```
   git init
   git add .
   git commit -m "SME CashFlow web app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/sme-cashflow.git
   git push -u origin main
   ```

### Step 7: Deploy on Vercel
1. Go to <https://vercel.com>, then **Add New…**, then **Project**, then **Import** your `sme-cashflow` repository.
2. **Framework Preset:** `Other`. Leave the Build Command and Output Directory empty.
3. Click **Deploy**. After about 30 seconds you get a link like `https://sme-cashflow.vercel.app`.

Every time you `git push`, Vercel updates the site automatically.

### Step 8: Tell Supabase your website address
1. In Supabase, go to **Authentication**, then **URL Configuration**.
2. Set **Site URL** to your Vercel link, for example `https://sme-cashflow.vercel.app`.
3. Under **Redirect URLs**, add `https://sme-cashflow.vercel.app/**` and `http://localhost:8000/**`. Click **Save**.

### Step 9: Check the live site
Open your Vercel link on your phone, register a new account, load the demo data and check the numbers match the website (RM2,960, +RM12,722, RM4,082).

> **Note:** on the free plan, Supabase pauses a project after about a week with no activity. If the app says it can't reach the server, open your Supabase dashboard and click **Restore project**. Open the app the day before you present.

---

## How the code is organised

```
index.html, login.html, register.html, dashboard.html, invoices.html, expenses.html,
import.html, scenarios.html, reports.html, team.html, settings.html, 404.html   ← the pages
css/style.css            ← colours and layout (brand blue #1d5bd6, navy #0b1f3a, mint #6ee7b7)
js/config.js             ← your Supabase URL and public key (Step 4)
js/supabase-client.js    ← connects to Supabase
js/db.js                 ← every database and login call, in one place
js/cashflow.js           ← money, dates, the forecast and CSV reading (pure logic, tested)
js/plans.js              ← plans, the free trial, the demo business (tested)
js/ui.js                 ← menu, messages, safe HTML, the chart, the login check
js/pages/*.js            ← one script per page
supabase/schema.sql      ← tables, security rules and database functions (Step 2)
tests/                   ← automatic tests (open /tests/ in the browser)
vercel.json              ← security headers for Vercel
```

**How the forecast works:** start with today's cash. For each day, add the unpaid invoices due that day and subtract the expenses due that day. Weekly and monthly expenses repeat, and overdue invoices are expected today. The lowest balance is the "low point"; any day below RM0 is a shortfall. See `buildForecast` in `js/cashflow.js`.

**Security choices**
- Row Level Security: each table only returns rows where `user_id` is the logged-in user, so editing the JavaScript can't show someone else's data.
- Database checks: amounts, dates, categories and text lengths are checked again by the database.
- The free trial can only be started once, by a database function. Users can't edit the trial dates themselves.
- Money is stored as whole sen (integers), never as decimals.
- Everything users type is escaped before it is shown, which blocks HTML or script injection.
- Vercel sends a Content Security Policy and other security headers (`vercel.json`).

**Honest limits (prototype):** no real payments, no emails for team invites, team members can't log in yet, and forecasts are estimates, not financial advice.

**Who did what:** _(fill in your team's names and roles)_
