# Our Project Idea

## 1. App name
**SME CashFlow**: "Know Your Cash Before It Runs Out."

## 2. Team
| Member | Role | BMC Excel | Written report | Presentation |
|---|---|---|---|---|
| Camellia | CEO | Market Research, Market Segments, Channel Research | A. Introduction & Project Continuity; part of B. Market Research; C. Customer Segments & Channels | Introduction, market opportunity, target customers and channels |
| Kailin | Market Research | Primary Market Research, Survey Analysis | B. Primary Market Research: methodology, findings and interpretations | Survey findings, customer pains, gains and adoption intentions |
| Erynn and Berryl | CTO | SWOT Analysis, Value Proposition | C. Value Proposition, competitive differentiation; F. App concept and features | Value proposition, innovative features and competitor advantages |
| Xing Yi | Legal Member 1 | Key Resources | E. Business Registration, FinTech Licensing and Regulatory Authorities; C. Key Resources | Key resources, business infrastructure and regulatory requirements |
| Chloe | Legal Member 2 | Key Partnerships (in key resources sheet), Business Summary | E. PDPA, AML/KYC applicability and consumer protection; C. Key Partnerships | Key partnerships, customer trust, data protection and compliance |
| Yung Sang | CFO | Revenue Streams, Cost Structure, Variable Costs | D. Revenue assumptions, operating costs and profitability; C. Update the difference of BMC | Subscription pricing, projected revenue and cost structure |
| Dylan | Finance | Pro Forma Income Statement, Break-even, FCFF Valuation | D. Break-even analysis, 36-month FCFF valuation and funding strategy; C. Update the difference of BMC | Financial feasibility, valuation and funding |
| Berryl and Erynn | IT | Technology resources, app development assumptions and technical cost inputs | F. App Development, technical architecture, testing and implementation | App architecture, prototype and live demonstration |

The app itself (this repository) is built and demonstrated by the **IT** members, **Berryl and Erynn**.

## 3. The problem (2–3 sentences)
Malaysian micro-businesses (food sellers, small shops, service providers) keep their money records scattered across notebooks, chat messages and bank apps. Because of this they are often surprised when cash runs out a few days before a big customer payment arrives. SME CashFlow turns those scattered records into a simple, forward-looking cash-flow forecast, so the owner can see a shortfall coming and act early.

## 4. Who uses the app?
Owners and staff of Malaysian micro-SMEs. Each business owner has one account and sees only their own data. There is no admin. On the Premium plan an owner can prepare a demo invite for a team member.

## 5. Must-have features
1. **Cash-flow forecasting**: projected balance for the next 7, 30 or 90 days (depending on plan), with a chart and a "shortfall risk" warning.
2. **Invoice tracking**: record money customers owe, and mark an invoice as paid when the money arrives (this adds to current cash).
3. **Expense management**: add planned costs and recurring commitments (weekly or monthly) to the forecast.
4. **Document upload**: upload a CSV of records, **review** them first, and only then let them change the forecast.
5. **Detailed reports**: monthly summaries (Basic) and a detailed report with current cash, projected low point, overdue invoices and top costs (Premium).
6. **Plans**: Free (RM0), Basic (RM19.90/month + 8% SST, no trial) and Premium (RM39.90/month + 8% SST) that unlock different forecast lengths and features. **Premium comes with a 1-month (30-day) free trial**, once per account. For this prototype, no real payment is taken.

## 6. Nice-to-have features (only if there's time)
1. **Scenario planning** (Premium): "What if customers pay 14 days late?" and "What if we cut costs by 10%?", compared with the normal forecast.
2. **Team access** (Premium): prepare a demo invite for a team member.
3. **Demo data**: one click to load "Dapur Seri", a demo food seller in Petaling Jaya, to try the app.
4. **English / Bahasa Melayu**: an **EN | BM** switch in the menu on every page. The choice is remembered in the browser.

**Added in version 2.0 (after lecturer feedback on 20 Oct 2026):**
5. **AI cash-flow advice**: an "Ask AI" button on the dashboard sends the forecast numbers (no names or bank details) to the Google Gemini API through a Supabase Edge Function, and shows 3–4 practical tips. If the AI is unavailable, built-in rule-based tips are shown instead.
6. **Admin Control Centre** (team only): users and plans, live event log, system health, server details, API monitor, AI routing, security checks, backend details, automated test results and release history.

## 7. What data do we save?
- **User** (Supabase Auth): email and password (Supabase stores the password safely).
- **Profile**: business name, location, current cash (in sen), plan (free / basic / premium), when the Premium free trial started and ends, whether demo data is loaded.
- **Invoice**: customer, amount (in sen), due date, status (unpaid / paid), paid date.
- **Expense**: description, category, amount (in sen), first due date, repeats (one-off / weekly / monthly).
- **Upload**: file name, number of rows, status (pending review / done).
- **Imported row** (waiting for review): type (income / expense), description, amount, date, status (pending / accepted / rejected).
- **Team invite**: name, role (viewer / editor), invite code.
- **Event log** (v2.0, admins only): what happened (sign-up, login, invoice added, AI request…), when, by which user, and a short detail. Written by the database itself.
- **Admins** (v2.0): which accounts may open the Admin Control Centre.

## 8. Is data private or shared?
Private. Every record belongs to one user, and nobody else can see or change it. There is no shared or public data. Only team admins can see the admin overview and event log, and admin rights can only be given in the Supabase SQL Editor.

## 9. Pages we want
Home (landing page with features and pricing), Sign up, Log in, Dashboard (forecast), Invoices (list, add, edit), Expenses (list, add, edit), Import documents (upload and review), Scenarios (Premium), Reports (Basic and Premium), Team (Premium), Settings (profile, current cash, plan, demo data), Admin Control Centre (team admins only, v2.0).

## 10. Look and feel
- Main colour: **#1d5bd6** (blue), with navy **#0b1f3a** and mint **#6ee7b7** as accents. These match our website.
- Style words: clean, trustworthy, modern fintech. Plain, friendly wording for non-accountants. Amounts in **RM**.

## 11. Anything else the AI should know
- Our website (single page): https://wildcat-f1bwyd.my.canva.site/sme-cashflow. The app should match its wording, plans and prices.
- The demo business on the website is **Dapur Seri** (demo food seller, Petaling Jaya) with **RM2,960** current cash, **+RM12,722** 30-day income, **RM4,082** 30-day end balance, and a **shortfall risk** in the middle of the month. The demo data should reproduce exactly these numbers.
- Forecasts are estimates based on the numbers the user enters. They are **not** bookkeeping, tax or financial advice. Show this clearly.
- Money is stored as whole **sen** (integers), never as decimals.
- Dates use Malaysia time (UTC+8).
- Required setup from our lecturer: **frontend and deployment on Vercel (free plan)**, **backend and database on Supabase (free plan)**, delivered as an **app** people open in a browser through a link (it can be added to the phone home screen). No native mobile app.
