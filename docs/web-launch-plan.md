# Web version launch plan

Goal: the same `vacancy-webapp` serves both the Telegram Mini App and a normal
browser version at `app.chashma.uz`, with Sign in with Google. Telegram users must
notice nothing.

Decisions (2026-10-19):
- Web users and Telegram users are **separate accounts** at launch. Linking comes later (TODO.md).
- Web users get **10 free checks**. After that they see **Join waitlist**, with no payments yet.
- Email alerts are postponed (TODO.md). The alerts screen is hidden for web users.
- Name comes from Google (`given_name`, editable). Language defaults from
  `navigator.language` (`uz*`→uz, `ru*`→ru, else en) and is confirmed on one screen.

Status key: ☐ todo · ☑ done

---

## Phase 0: Safety net (before touching the schema)

1. ☑ **Staging environment on Railway**, created 2026-10-19 as a duplicate of production with
   these overrides: `TELEGRAM_TOKEN`/`BOT_TOKEN` set to a placeholder until the `@chashma_stage_bot`
   token is pasted in, `BOT_USERNAME=chashma_stage_bot`, `VACANCY_ALERTS_ENABLED=0`,
   `PAYME_KEY=disabled-in-staging`, the webapp's `DATABASE_URL` set to `${{Postgres.DATABASE_URL}}`
   (prod's is a hard-coded literal), and the bot's `MINI_APP_URL` set to
   `https://vacancy-webapp-staging.up.railway.app`. Payme sandbox is at
   `https://payme-webhook-staging.up.railway.app`. Both environments deploy from the same
   branches, so every push deploys to staging too.
   Original instructions: Duplicate the project's environment (bot,
   webapp, payme-webhook, Postgres) as `staging`. Point a test Telegram bot at the
   staging webapp so the Mini App can be tested without touching prod.
   ⚠ Before the staging bot starts, create a **separate test bot in BotFather** and put
   its token in staging's `TELEGRAM_TOKEN` (bot and webapp). A copied prod token would
   make the staging bot fight the prod bot for updates, and real users' messages would land on staging.
   Staging's payme-webhook uses only `PAYME_TEST_KEY`.
   ⚠ Staging's database is a copy of prod, so it contains real users' Telegram IDs.
   The daily vacancy-alerts loop must be **off** in staging, or it messages real people.
2. ☑ **Restore a prod copy into staging Postgres.** Done 2026-10-19, and staging's row counts equal prod's.
   How: `railway ssh -s Postgres -e production -- 'pg_dump -U "$POSTGRES_USER" -d "$PGDATABASE" --clean --if-exists --no-owner --no-privileges' > prod.sql`,
   then strip the `payme_credentials` rows (a row there overrides `PAYME_KEY`, so it would put
   the live key into staging), then pipe into `railway ssh -s Postgres -e staging -- 'psql ... -v ON_ERROR_STOP=1 --single-transaction'`
   with an environment-name guard. Delete the local dump afterwards, since it has real CVs.
   Original instructions: Run `pg_dump` on prod, then
   `pg_restore` into staging. Every migration step is rehearsed here first.
3. ☑ **Record the live `orders` schema.** Done 2026-10-19: `orders` and `payme_transactions`
   were created by hand in prod and are now declared in `schema.py` exactly as they are live
   (a no-op in prod).
4. ☑ **Baseline numbers**, taken 2026-10-19 from prod (read-only), to compare against after every step:

   | table | rows | | table | rows |
   |---|---|---|---|---|
   | users | 217 | | events | 814 |
   | user_state | 212 | | orders | 16 |
   | cvs | 66 | | payme_transactions | 6 |
   | cv_analyses | 33 | | greenhouse_companies | 128 |
   | applications | 23 | | alerted_vacancies | 54 |

   Findings:
   - **1 orphan order:** `orders.id = 3`, `telegram_id 99999003`, pending, 2026-08-13, with
     1 Payme transaction (an early Payme test). It is kept, not deleted. Step 1.2 must first
     run `INSERT INTO users (telegram_id) SELECT DISTINCT telegram_id FROM orders o WHERE
     NOT EXISTS (...) ON CONFLICT DO NOTHING` (same for `events`), so every row gets a `user_id`.
   - **3 users with negative `telegram_id`** are the e2e harness's test users
     (`e2e_test_smoke_*`, `e2e_test_payment_*`). They're harmless, and the migration treats them like anyone else.
   - Prod Postgres is **18.6**, and the local test server matches it (`postgresql@18`).
   - Prod Postgres has no public address. Read-only queries run inside the webapp
     container via `railway ssh --service vacancy-webapp -- "python -" < script.py`.

   Queries used:
   ```sql
   SELECT 'users', count(*) FROM users
   UNION ALL SELECT 'cvs', count(*) FROM cvs
   UNION ALL SELECT 'applications', count(*) FROM applications
   UNION ALL SELECT 'cv_analyses', count(*) FROM cv_analyses
   UNION ALL SELECT 'alerted_vacancies', count(*) FROM alerted_vacancies
   UNION ALL SELECT 'events', count(*) FROM events
   UNION ALL SELECT 'orders', count(*) FROM orders;
   -- orphans: rows whose telegram_id has no users row (events/orders have no FK)
   SELECT count(*) FROM events e WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.telegram_id = e.telegram_id);
   SELECT count(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.telegram_id = o.telegram_id);
   ```
   Decide what to do with any orphans before step 1.3. Usually that means creating a
   bare `users` row for them, so `user_id` can be filled in.
5. ☑ **Real-Postgres test harness.** `ae-coach-bot/bot/tests/integration/`:
   - `_pg.py` gives each test a throwaway local database and refuses non-local hosts.
   - `schema_snapshot.py` takes a structure-only snapshot. `prod_schema.json` is prod's, captured 2026-10-19.
   - `test_schema_matches_prod.py`: a fresh `init_db()` equals prod, re-running it is a
     no-op, the legacy backfills run once, and the one-active-CV rule, users FK and orders defaults hold.

   Every Phase 1 migration test builds on this.
6. ☑ **All existing suites green** (2026-10-19): webapp Python (13 files), JS 83/83, bot 4 files,
   payme 15/15. Two stale tests were fixed on the way: `test_webapp_cv.py` didn't mock the new
   `get_user_name`, and `test_launcher_flow.py`'s fake callback had no `delete_message`.
   `tests/e2e/smoke.js` hasn't been run yet; run it against staging once that exists.

---

## Phase 1: Internal user ID

Target end state:
```
users:  id BIGSERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NULL, email TEXT UNIQUE NULL, google_sub TEXT UNIQUE NULL, ...
cvs / applications / cv_analyses / alerted_vacancies / events / orders:
        user_id BIGINT NOT NULL REFERENCES users(id)
```
`user_state` (bot-only Telegram session table, keyed by telegram id) stays as it is.

Naming hazard: today the bot's code calls Telegram IDs `user_id` (for example
`join_waitlist(user_id, ...)` and `user_state.user_id`). In step 1.4, rename those
parameters to `telegram_id` **before** introducing the new `user_id`, or the two
will get mixed up.

The rollout uses "expand, switch, contract" in three deploys, so the three services
keep working while each step lands.

### Step 1.1: Rename (code only, no behavior change)
- ☑ In `ae-coach-bot`, rename variables and params that hold a Telegram ID from
  `user_id` to `telegram_id`. Pure rename, done 2026-10-19 (`fb7d57e`): 48 lines in `bot.py`,
  `state/session.py` and `state/accounts.py`. The SQL column `user_state.user_id` is untouched.
- ☑ Tests: all bot tests pass, plus the new `integration/test_bot_db_functions.py` (real SQL
  for get/reset/_save, waitlist, quota, source, events, orders), which passes identically before and after.
- ☑ Manual `/start` + `/reset` on staging (2026-10-19): events logged, existing user row updated, no duplicate user. Pushed to prod.

**Deploying to staging only.** Both environments deploy from the same branch on push, so to
try code on staging first, upload the local tree:
`railway up -p 3fd8cbee-097a-460a-8d24-fdf5cf5a8862 -e staging -s <service> --ci`
(run it from that service's repo). Push to prod only after staging passes.

### Step 1.2: Expand (DB only, shipped from `ae-coach-bot/bot/state/schema.py`)
All statements are idempotent (`IF NOT EXISTS`), because `init_db` runs on every startup.
- ☐ `ALTER TABLE users ADD COLUMN IF NOT EXISTS id BIGSERIAL;` Postgres fills existing rows.
- ☐ `CREATE UNIQUE INDEX IF NOT EXISTS users_id_key ON users (id);`
- ☐ For each child table: `ADD COLUMN IF NOT EXISTS user_id BIGINT` and an index on it.
- ☐ Backfill (safe to re-run):
  `UPDATE cvs c SET user_id = u.id FROM users u WHERE u.telegram_id = c.telegram_id AND c.user_id IS NULL;`
  (same for each child table).
- ☐ A `BEFORE INSERT` trigger on each child table that fills `user_id` from `telegram_id`
  when it is NULL. This is what keeps **old code** in the webapp and payme-webhook
  working unchanged: they keep inserting `telegram_id` only.
- ☐ `ALTER TABLE <child> ALTER COLUMN telegram_id DROP NOT NULL` (needed later for web users).

Tests (integration, real Postgres):
- ☐ Create the **old** schema and insert fixture data (2 users, CVs, an active CV,
  applications, analyses, alerts, events, orders, plus an orphan event), then run the
  new `init_db`. Every child row has `user_id` = its owner's `users.id`, and row counts are unchanged.
- ☐ Run `init_db` twice: no error, nothing changes on the second run.
- ☐ Paste in today's real INSERT statements from `app/db/*.py`, `bot/state/*.py` and
  `payme-webhook/main.py` and run them: the trigger fills `user_id`.
- ☐ `idx_cvs_one_active_per_user` still blocks two active CVs.
- Rehearse on staging (the prod copy), then rerun the Phase 0.4 queries and add
  `SELECT count(*) FROM <child> WHERE user_id IS NULL` (must be 0, or exactly the orphans).
- Deploy order: bot only. Run the smoke test, then manually check Mini App CVs, history and applications.

### Step 1.3: Switch (code in all three services)
- ☐ **webapp:** `authenticate()` returns `{"user_id": users.id, "telegram_id": ..., ...}`.
  `ensure_user` returns the id (`... RETURNING id`). Every function in `app/db/*.py`
  takes `user_id` and filters on it (about 88 references). Inserts write both
  `user_id` and `telegram_id`.
- ☐ **bot:** turn `update.effective_user.id` into `users.id` once per update with a
  helper (`get_or_create_user_id(telegram_id)`), then use `user_id` for every `users`
  or child-table query. Telegram sends (`chat_id`) keep using `telegram_id`.
- ☐ **payme-webhook:** `orders` lookups and `credit_user` / `reverse_credit` use
  `user_id`. The Telegram notification looks up `telegram_id` from `users`.
- ☐ Vacancy alerts loop: `list_users_with_alerts_enabled` returns `user_id` and
  `telegram_id`, and skips users with no `telegram_id` (web users until email exists).

Tests:
- ☐ Update existing mocked tests to the new signatures. The behavior they assert must not change.
- ☐ New: two users' data never mixes (user A cannot read, activate or delete B's CV,
  analysis, application or alert batch by ID). Cover every route that takes an ID.
- ☐ Quota: `checks_used` increments on the right row, and `quota_override` still wins.
- ☐ payme-webhook: the full existing suite, plus credit and reverse on a `user_id`-keyed order.
- Deploy in any order (both columns stay filled). Staging first, then prod, then smoke tests
  (`smoke.js`, `smoke-payment.js`), then a manual pass with your own Telegram account.

### Step 1.4: Contract (DB, shipped from `schema.py`, guarded so it runs once)
- ☐ Child tables: `user_id SET NOT NULL`, add FK `REFERENCES users(id)`, drop the old
  FK to `users(telegram_id)`.
- ☐ `users`: drop PK on `telegram_id`, add `PRIMARY KEY (id)`, add `UNIQUE (telegram_id)`,
  `telegram_id DROP NOT NULL`. The `ON CONFLICT (telegram_id)` upserts in the webapp
  and payme-webhook keep working, because a UNIQUE constraint is enough for them.
- ☐ Rebuild `idx_cvs_one_active_per_user` on `(user_id)`.
- ☐ Drop the triggers. Leave the child `telegram_id` columns in place (removed later, see TODO.md).

Tests:
- ☐ Insert a user with `telegram_id NULL` works, and two such users don't collide.
- ☐ Inserting a CV for a non-existent `user_id` is rejected (FK).
- ☐ `ensure_user` / `credit_user` upserts still work for Telegram users.
- ☐ Rerun the full Phase 0.6 suite plus the Phase 0.4 counts on staging, then prod.
- ☐ For 3 days after the prod deploy, check Railway logs for SQL errors and the counts once a day.

Before every prod step: take a Railway Postgres backup or `pg_dump`.

---

## Phase 2: Sign in with Google

### Step 2.1: Google Cloud setup (manual, your account)
- ☐ Create a Google Cloud project, e.g. "Accepted AI".
- ☐ OAuth consent screen: type External, app name, support email, privacy policy URL
  (Phase 6), authorized domain `chashma.uz`. Scopes are only `openid email profile`,
  which are non-sensitive, so Google's security review isn't needed.
- ☐ While the app is in **Testing** status, add `abdumalik2014@gmail.com` (and one
  second account to test isolation) as test users.
- ☐ OAuth Client ID, type "Web application". Authorized JavaScript origins:
  `http://localhost:8000`, the staging URL, and `https://app.chashma.uz`. No redirect URI
  or client secret is needed for the Google Identity Services button (ID-token flow).
- ☐ Railway env var `GOOGLE_CLIENT_ID` (staging and prod), plus `SESSION_SECRET`.
- ☐ At public launch: set consent-screen status to **In production**.

### Step 2.2: Schema (`schema.py`)
- ☐ `users`: `email TEXT UNIQUE`, `google_sub TEXT UNIQUE`, `signup_channel TEXT`
  (`'telegram'` or `'web'`; backfill existing rows as `'telegram'`).
- ☐ `web_sessions`: `token_hash TEXT PRIMARY KEY, user_id BIGINT REFERENCES users(id),
  created_at, expires_at, last_seen_at`. A random 32-byte token goes in the cookie and
  only its SHA-256 hash is stored, so sessions can be revoked and a DB leak doesn't leak sessions.

### Step 2.3: Backend (`vacancy-webapp`)
- ☐ `POST /api/auth/google {credential}`: check the token with
  `google.oauth2.id_token.verify_oauth2_token(credential, requests.Request(), GOOGLE_CLIENT_ID)`
  (signature, `aud`, `iss`, `exp`) and require `email_verified`.
  - Look up the user by `google_sub`, or create one: `telegram_id NULL`, `email`,
    `name = given_name`, `signup_channel='web'`, `quota_override = 10`.
  - Create a session and set the cookie `session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30d`.
  - Return `{needs_onboarding: language IS NULL, name}`.
- ☐ `POST /api/onboarding {name, language}`, `GET /api/me`, `POST /api/auth/logout`
  (deletes the session row and clears the cookie).
- ☐ `authenticate()` becomes a FastAPI dependency `current_user(request)`:
  Telegram `initData` present → Telegram path (unchanged); otherwise a valid session cookie;
  otherwise 401. Every route switches to `Depends(current_user)`.
- ☐ CSRF: SameSite=Lax, plus reject state-changing requests whose `Origin` isn't an allowed origin.
- ☐ Simple rate limit on `/api/auth/google` (per IP).
- ☐ Quota exhausted: web users get `{"action": "waitlist"}` instead of the Payme purchase.
  `POST /api/waitlist` sets `joined_waitlist`. The Telegram flow is unchanged.

### Step 2.4: Frontend (`app/static`)
- ☐ No `window.Telegram.WebApp.initData` → web mode. Replace the `open_from_bot` screen with the sign-in screen.
- ☐ Sign-in screen: Google Identity Services button (`accounts.google.com/gsi/client`).
- ☐ Onboarding screen: name prefilled (editable) and a language toggle prefilled from
  `navigator.language`, with one Continue button.
- ☐ `tg.openLink` → `window.open(url, '_blank', 'noopener')`; `tg.showAlert` → in-app modal.
- ☐ Web mode hides the Checks purchase screen and Vacancy Alerts. Profile shows email
  and Sign out. Out of checks shows Join waitlist.
- ☐ Desktop layout: center the app in a column about 520px wide.

### Tests for Phase 2
Automated (`tests/test_web_auth.py`, with Google's verifier mocked):
- ☐ Valid token → user created (`telegram_id NULL`, quota 10) and the cookie is set.
- ☐ Same `google_sub` twice → same user, no duplicate.
- ☐ Wrong `aud`, expired, bad signature or `email_verified=false` → 401, no user created.
- ☐ No cookie, tampered cookie, expired session or logged-out session → 401 on every API route.
- ☐ Telegram `initData` requests behave exactly as before (the existing suite passes unchanged).
- ☐ Web user A cannot see B's data (reuse the Phase 1.3 isolation tests with cookies).
- ☐ Web user: analysis 10 works, analysis 11 → waitlist. A Telegram user still gets `FREE_LIMIT`.
- ☐ `Origin: https://evil.example` POST → rejected.

JS (`tests/js`):
- ☐ Language mapping: `uz-UZ`→uz, `ru`→ru, `en-US`→en, `de`→en, missing→en.
- ☐ Without `Telegram.WebApp` → sign-in screen. With it → the normal Mini App flow (no sign-in screen).

Manual with your Google account (in order: localhost, then staging, then prod):
- ☐ Sign in, onboarding (check the language default), upload a CV, run an analysis,
  search, save an application, then log out.
- ☐ Sign in again: all your data is still there. Try a private window too.
- ☐ Chrome desktop, Safari on iPhone, Chrome on Android.
- ☐ Second Google account: sees none of the first account's data.
- ☐ Your Telegram Mini App at the same time: nothing changed, and Payme still works.
- ☐ Only then invite the US tester.

---

## Phase 3: Domain and landing page
- ☐ Railway custom domain `app.chashma.uz` (CNAME in Cloudflare DNS, DNS-only/grey cloud,
  so Railway can issue the certificate).
- ☐ Keep the current Railway URL working for the Telegram Mini App (no change for the bot).
### Landing page (`AE COACH chashma website`): ship together with the web launch
Do these only once `app.chashma.uz` is live, so the site never links to something
that doesn't exist yet. All three languages (`src/content/en.json`, `ru.json`, `uz.json`):
- ☐ **Rebrand: every "Accepted AI" becomes "Chashma"** across the site copy, meta tags,
  JSON-LD and aria-labels. This also resolves the brand-mismatch item in the site's TODO.md.
- ☐ **Second button "Use in browser"** next to the Telegram button in the hero
  (`hero_4`), plans (`plans_14`) and final CTA (`final_cta_3`). Telegram stays the primary
  button, and the nav (`nav_4`) keeps Telegram only. Wire it in `script.js` the same way as
  `data-bot`: a `data-web` attribute whose href is set to `https://app.chashma.uz/?lang=<pageLang>`.
  It opens in the same tab.
- ☐ **Free-checks note** (`hero_5`): "2 free analyses in Telegram · 10 in web · UZ / RU / EN"
  (translated for ru and uz).
- ☐ **Drop "Telegram-only" claims:**
  - `head_3` / `head_6` meta description and `hero_3` lede: "all inside one Telegram app"
    becomes "in Telegram or your browser".
  - `how_it_works_4`: "Tap once on Telegram — no downloads, no separate account" becomes
    "Open it in Telegram or your browser — no downloads".
  - `hero_ss_2` caption "without leaving Telegram": reword to be channel-neutral.
  - Testimonials stay as written (they're real quotes).
- ☐ Rebuild (`npm run build`) and check all 3 language pages plus both buttons on mobile.

### Web app branding
- ☐ `app.chashma.uz` shows only **Chashma**: page title, sign-in screen, onboarding,
  the Google consent screen app name, and emails later. Web-mode-only strings in `i18n.js`;
  the Telegram Mini App keeps its current name for now (see TODO.md).

## Phase 6: Launch basics
- ☐ Privacy policy and terms pages (required by the Google consent screen, and you store CVs).
- ☐ Cost guard: the per-account quota plus a per-IP limit on new web signups per day.
- ☐ `events` gets the channel (`web` / `telegram`) so the funnels can be compared.
- ☐ Check that vacancy search gives US users useful results (Greenhouse; hh.uz is UZ-only).
