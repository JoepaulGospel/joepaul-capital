# Joepaul Capital Terminal

**Discipline. Strategy. Freedom.**

A private, single-user trading performance and financial goal-tracking platform.
Dark institutional design, accurate financial calculations, weekly manual updates,
interactive calendar, countdown, notes, and full JSON export/import backups.

Built as a **zero-install static website** — no Node.js, no build step, no frameworks.
Plain HTML + CSS + JavaScript (ES modules) backed by **Supabase**
(database + authentication + row-level security) and hosted free on **Netlify**.

---

## 1. Stack

| Layer    | Choice                                            | Why |
|----------|---------------------------------------------------|-----|
| Frontend | Plain HTML / CSS / vanilla JS (ES modules)        | Nothing to install or build; edit any file directly |
| Backend  | Supabase (Postgres + Auth + RLS)                  | Real database, real auth, phone + computer access |
| Hosting  | Netlify (free tier)                               | Drag-and-drop or GitHub auto-deploy |
| Charts   | Hand-built SVG (no library)                       | Nothing extra to load or maintain |
| Tests    | Browser test runner (`tests/finance.test.html`)   | No test framework needed |

## 2. Folder structure

```
joepaul-capital/
├── index.html              # Dashboard — cards, progress, countdown, chart
├── calendar.html           # Interactive monthly calendar
├── goals.html              # Goal detail, milestones, pace projection
├── notes.html              # Personal notes
├── settings.html           # Weekly update form, history, preferences, export/import
├── login.html              # Magic-link sign in
├── css/
│   └── styles.css          # Design system (navy/gold/ivory)
├── js/
│   ├── config.js           # ← the ONLY file you edit (paste Supabase keys)
│   ├── supabase.js         # Database connection
│   ├── auth.js             # Session guard, magic-link sign in/out
│   ├── db.js               # All database access (one place)
│   ├── finance.js          # All calculations (pure, tested)
│   ├── ui.js               # Sidebar, toast, formatting helpers
│   ├── dashboard.js        # Dashboard rendering + equity chart + countdown
│   ├── calendar.js         # Calendar CRUD
│   ├── goals.js            # Milestones + projection + countdown
│   ├── notes.js            # Notes CRUD
│   ├── settings.js         # Weekly update flow + history + backup
│   └── login.js            # Login form
├── tests/
│   └── finance.test.html   # 25+ calculation tests — open in browser
├── supabase/
│   └── schema.sql          # Run once in Supabase SQL Editor
└── README.md
```

## 3. Setup (one time, ~30 minutes, all in a browser)

### Step 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **Start your project** (free).
2. Create a new project (choose a password for the database — save it somewhere).
3. Open **SQL Editor** → **New query** → paste the **entire contents of
   `supabase/schema.sql`** → click **Run**. You should see "Success".

This creates the four tables, security policies, the new-user trigger, and the
server functions that keep your dashboard and ledger in sync.

### Step 2 — Connect the website

1. In Supabase: **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open `js/config.js` and paste them:

```js
export const SUPABASE_URL = 'https://xyzcompany.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

These keys are safe in frontend code — access is enforced by the row-level
security policies from `schema.sql`, not by hiding keys.

### Step 3 — Configure authentication

1. In Supabase: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Netlify URL (from Step 4 — you can update this after deploying).
3. Add to **Redirect URLs**: your Netlify URL **and** `https://your-site.netlify.app/**`
   (wildcard covers the magic-link return).
4. **Authentication** → **Sign In / Providers**: keep **Email** enabled.
   Magic link needs no extra provider setup.

### Step 4 — Deploy to Netlify (two options)

**Option A — drag and drop (fastest, no GitHub):**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the whole `joepaul-capital` folder onto the page.
3. You get a live URL immediately, e.g. `https://random-name.netlify.app`.
4. Go back to Supabase Step 3 and set this URL.

**Option B — GitHub auto-deploy (better long term):**
1. Create a GitHub repository, upload these files.
2. In Netlify: **Add new site** → **Import an existing project** → pick the repo.
3. Build settings: leave blank (static site). Deploy.

### Step 5 — Create your account and lock the door

1. Visit your live URL → enter your email → click the magic link in your inbox.
2. You are the only user. To stop anyone else from ever signing up:
   **Supabase → Authentication → Sign In / Providers → Email →
   disable "Allow new users to sign up"** (turn it back on temporarily if you ever
   need a second account).

## 4. Using the terminal

- **Weekly rhythm (every week):** Settings → fill the **Weekly Update** form →
  **Save Update**. The dashboard, goals, and countdown update instantly, and the
  entry is permanently recorded in **Update History**.
- **Made a mistake?** Settings → Update History → **Edit** on any entry.
  Corrections never erase history; the dashboard re-syncs from your newest entry.
- **Calendar:** click any day to add an event (trading day, weekly review, deposit,
  milestone, important event). Click an event chip to edit or delete.
- **Notes:** weekly reviews, lessons, observations.
- **Goals:** milestone tracker and pace projection.
- **Backup:** Settings → **Export JSON** after every weekly update. Keep the files
  in cloud storage. **Import JSON** restores from a backup file.

## 5. Financial formulas (single source: `js/finance.js`)

| Metric | Formula | Notes |
|--------|---------|-------|
| Total made | realized profit + prop payouts | Sources kept separate everywhere to prevent double-counting |
| Credited toward goal | total made (+ deposits only if enabled in Settings) | Deposits are **never** counted as profit |
| Remaining | max(0, target − credited) | Floored at zero |
| Progress % | credited ÷ target × 100 | Bar capped at 100%; actual % shown if exceeded |
| Return on capital | realized profit ÷ deposited × 100 | Simple measure — **not** money-/time-weighted; null when no deposits |
| Drawdown | (peak − current) ÷ peak × 100 | Personal peak-to-equity measure, unrelated to prop-firm daily limits |

All functions reject NaN/Infinity and clamp to safe ranges. New equity highs
auto-update peak equity on save. Run the tests: open `tests/finance.test.html`
from any hosted copy of the site.

## 6. Data & security model

- `current_state` — one row per user; the latest figures (dashboard reads this).
- `weekly_updates` — append-mostly ledger; your audit trail and chart source.
- `events`, `notes` — calendar and notes.
- Every table has **row-level security**: `user_id = auth.uid()`. Nobody can read
  or write your data, with or without your keys.
- Saving a weekly update writes the ledger and current state **atomically** in a
  single server-side transaction (`save_weekly_update` in `schema.sql`).
- **Backups:** export JSON weekly (manual). Supabase free tier retains daily
  database backups for 7 days; paid plans extend this. Your JSON export is the
  authoritative personal backup.

## 7. Important limitation (stated honestly)

This is a real database with real authentication and real access controls — but
the browser frontend cannot keep secrets, so the security boundary is Supabase's
RLS, which is correctly configured here. Do not store broker credentials or
API keys anywhere in this project. This platform tracks numbers you enter
manually; it does not connect to brokers or live market data by design.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Red "Setup needed" banner | `js/config.js` still has placeholder values — paste real keys and redeploy |
| Magic link lands on wrong page | Supabase → Authentication → URL Configuration → check Site URL and redirect URLs |
| "Email not confirmed" | In Supabase → Authentication → Policies, disable "Confirm email" for magic link, or click the confirmation link in the first email |
| Page blank after login | Hard-refresh once; check browser console; verify `schema.sql` ran successfully |
| Changes don't appear | The dashboard always re-reads on load — refresh the page |

## 9. Acceptance checklist

1. ✅ Weekly update saved/edited without touching code (Settings page)
2. ✅ Cards recalculate from the saved values
3. ✅ Calendar add/edit/delete works
4. ✅ Countdown uses the target date from Settings
5. ✅ Drawdown reacts to equity/peak changes
6. ✅ Full update history preserved; corrections never erase records
7. ✅ Refresh never loses data (Postgres, not browser storage)
8. ✅ Export/import JSON verified
9. ✅ Responsive: mobile hamburger sidebar, desktop fixed sidebar
10. ✅ Invalid inputs and division by zero rejected safely (tested)
11. ✅ No install/build step — deploy and run
12. ✅ Auth + row-level security + server-side transactions enforced
