# Manual Test Checklist and Teacher Q&A

## Run it on your Mac
```
cd path/to/sme-cashflow-web
python3 -m http.server 8000
```
Open http://localhost:8000. The automatic tests are at http://localhost:8000/tests/ (expect **39 passed**).

## Click-by-click test (tick each box), on the live Vercel link too
- [ ] Home page shows the Dapur Seri demo (RM2,960, +RM12,722, RM4,082, Shortfall risk) and the three plans.
- [ ] Premium shows **First month free**, **Start 1-Month Free Trial** and "Then RM39.90/month after your 30-day trial." The FAQ says "Is there a free trial? Yes…".
- [ ] Click **Start 1-Month Free Trial**. Register opens with Premium already chosen.
- [ ] Sign-up order summary: Basic shows RM19.90 + RM1.59 SST = RM21.49 due today; Premium shows RM43.09/month incl. SST but RM0 due today (free trial); ticking **Add guided onboarding** adds RM49 + RM3.92 SST; Free shows RM0. Settings shows "+ 8% SST" on Basic and Premium, and the Account box says whether onboarding was requested.
- [ ] Register with a 5-character password: refused. With 8 or more characters, you land on the dashboard with "Your 1-month Premium free trial has started" and the menu shows "Premium trial · 30 days left".
- [ ] Log out, then log in with a wrong password: "Wrong email or password." Log in correctly.
- [ ] Settings, then **Load demo data**: the dashboard shows the shortfall warning with a low point of -RM2,168 and a chart.
- [ ] 7 / 30 / 90 day buttons work (90 days needs Premium or the trial).
- [ ] Invoices: add one, edit it, **Mark paid** (cash goes up by its amount), try to edit the paid one (refused), delete it.
- [ ] Type `<b>Hi</b>` as a customer name: it shows as text, not bold.
- [ ] Expenses: add a monthly expense; filter by category; delete it.
- [ ] Bad input ("abc", RM0, a negative amount) shows a clear message and saves nothing.
- [ ] Import: **Download a sample file**, upload it, untick one row, then **Add ticked rows**. Upload it again: the rows show **Possible duplicate** and start unticked.
- [ ] Scenarios: the "14 days late" and "Cut costs 10%" presets change the what-if line.
- [ ] Reports: monthly summary plus the detailed report; **Print or save as PDF** works.
- [ ] Team: prepare an invite (a code appears), then remove it.
- [ ] Settings, then switch to **Basic**: Scenarios and Team show the locked page; the Premium button now says "Switch back to Premium".
- [ ] Switch to **Free**: only the 7-day forecast; after 2 uploads this month, uploading is blocked.
- [ ] Register a second account: it can't see the first account's data, and it can start its own trial once.
- [ ] Settings, then **Clear all my data**: everything is removed and cash goes back to RM0.
- [ ] Phone check (open the Vercel link on your phone): nothing scrolls sideways and the menu opens.
- [ ] Language: click **BM** in the menu. Every page (menu, dashboard, forms, messages, dates like "27 Okt") is in Bahasa Melayu, and it stays in Malay on the next page and after logging out and in. Click **EN** to switch back. Your invoices, expenses and plan don't change.

- [ ] **AI advice (v2.0):** with demo data loaded, click **Ask AI** on the dashboard. 3–4 tips appear with the tag "AI · gemini-3.5-flash-lite". In BM, the tips are in Malay.
- [ ] **Admin (v2.0):** a normal account opening `/admin.html` sees "Admins only". An admin account sees the Admin Control Centre: System health all "Working", Security 11/11, Code health 39/39, and **Run live AI test** returns tips. Adding an invoice in another tab appears in the **Live log** within 5 seconds.

## Teacher questions and model answers
1. **Why Vercel and Supabase?** Vercel hosts the web pages for free with a public https link and redeploys automatically on every GitHub push. Supabase gives us login, a real Postgres database and security rules for free, so we don't run our own server.
2. **How do you stop one user seeing another's data?** Row Level Security in Supabase. Every table has a rule `user_id = auth.uid()`, so the database only returns or changes the logged-in user's rows. That holds even if someone edits the JavaScript in their browser.
3. **How does the free trial work, and can someone cheat it?** Choosing Premium at sign-up, or **Start 1-Month Free Trial** in Settings, calls a database function that sets a 30-day trial end date, once per account. Users have no permission to edit the trial dates directly, so they can't extend or repeat it.
4. **Why store money in sen (integers)?** Decimals like 0.1 can't be stored exactly by computers (0.1 + 0.2 = 0.30000000000000004). Whole sen are exact, so totals never drift.
5. **How is the forecast calculated?** Start with current cash. Each day, add invoices due that day and subtract expenses due that day; weekly and monthly ones repeat, and overdue invoices count as arriving today. The lowest balance is the low point, and any day below RM0 is a shortfall. Code: `buildForecast` in `js/cashflow.js`.
6. **Why review uploaded files before using them?** A wrong file could quietly ruin the forecast. Rows wait in `import_rows` until the user ticks them, and likely duplicates start unticked.
7. **How does the English / Bahasa Melayu switch work?** Every sentence is written in English inside `t("...")`. When BM is chosen, `t()` looks the sentence up in `js/i18n-ms.js` and shows the Malay version, falling back to English if one is missing. The choice is saved in the browser (`localStorage`). Only the screen text changes: saved data stays the same, so both languages share one database. An automatic test checks that every sentence has a translation.
8. **How does the AI work, and is the data safe?** The dashboard sends only the forecast numbers, dates and categories (no names, customer names or bank details) to our Supabase Edge Function. It checks the user is logged in, then calls the Google Gemini API with a secret key that never reaches the browser. If the AI fails or is slow, built-in rule-based tips are shown, so the feature never breaks. The forecast itself is calculated, not guessed by AI.
9. **What can the admin see, and who can be an admin?** Users and plans, the live event log, system health, server details, API requests, security checks, backend details, test results and the release history. Admin rights can only be given in the Supabase SQL Editor, and every admin function checks admin status inside the database, so editing the app's code can't unlock it.

## Honest limits
Payments, emails and team log-in are prototypes only. CSV import only (no PDF), and no payment reminders yet. Forecasts and AI tips are estimates, not financial advice. The Gemini free tier has daily limits.
