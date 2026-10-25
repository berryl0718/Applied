# Admin Control Centre and AI advice: setup (about 10 minutes)

Version 2.0 adds:
- **Admin Control Centre** (`admin.html`): users, live log, system health, server, API monitor, AI & routing, cyber security, backend, code health and releases.
- **AI cash-flow advice** on the dashboard ("Ask AI"), using the Google Gemini API through a Supabase Edge Function. If the AI can't answer, the app shows built-in rule-based tips instead.

Everything stays on free plans (RM0).

## Step 1: Update the database
1. Supabase → **SQL Editor** → **New query**.
2. Paste all of `supabase/upgrade_admin_ai.sql` and click **Run**. You should see "Success".

## Step 2: Make yourself admin
1. Open the app and log in with your own account.
2. Go to `/admin.html` (for example `https://smecashflow-two.vercel.app/admin.html`).
3. It says "Admins only" and shows one SQL command with **your email already filled in**. Copy it.
4. Paste it into a new Supabase SQL Editor query and click **Run**.
5. Refresh `/admin.html`. The Control Centre opens. Settings now also has an "Open Admin Control Centre" button.

## Step 3: Get a free Gemini API key
1. Go to <https://aistudio.google.com> and sign in with a Google account.
2. Click **Get API key** → **Create API key**. Copy it (it starts with `AIza`).
3. Keep it secret: never put it in the app's code or on GitHub.

## Step 4: Add the AI function to Supabase (no terminal)
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `ai-insights`.
3. Delete the sample code, paste all of `supabase/functions/ai-insights/index.ts`, and click **Deploy function**.
4. Supabase → **Edge Functions** → **Secrets** → **Add new secret**:
   - Name: `GEMINI_API_KEY`
   - Value: your key from Step 3
   - Click **Save**.

## Step 5: Check it
1. Open `/admin.html` → **System health**: every row should say "Working".
2. **AI & routing** → **Run live AI test**: you should get tips from Gemini in a few seconds.
3. On the dashboard (with demo data), click **Ask AI**.

If the AI test fails, the error message says why (key missing, function not deployed, or Google's free limit reached). Users still get the built-in tips.

## Notes
- The Gemini free tier has daily limits, which is plenty for a demo. On the free tier Google may use what is sent to improve its models, so the app only sends forecast numbers, dates and categories: no names, emails or bank details.
- Optional: to choose a specific model, add a secret `GEMINI_MODEL` (for example `gemini-3.8-flash`). The default is `gemini-3.5-flash-lite`, which answers in about a second; the bigger Flash models were too slow on the free tier.
- After changing code, run `node scripts/code-stats.mjs` so Code health shows the new line counts.
