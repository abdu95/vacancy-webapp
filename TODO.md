# TODO

Deferred from the web launch plan (docs/web-launch-plan.md, 2026-10-19).

- [ ] **Commit the pre-existing uncommitted work in this repo** (left out of the
      2026-10-19 commits on purpose, since it wasn't part of that work):
      - `.claude/agents/` (`qa-tester.md`, `user-simulator.md`): the QA/persona subagents.
      - `tests/e2e/`: the Playwright smoke/payment harness. `.env` and `node_modules/`
        are already gitignored; check nothing secret is in the other files before committing.
      - `tests/test_ai_utils.py`: **review first, don't just commit.** The uncommitted
        change *deletes* the `with_language_for_fixes` regression test (the 2026-09-26
        mixed-language CV-fix bug, fixed in `821dfc2`). This is probably accidental, so
        `git checkout tests/test_ai_utils.py` is likely the right move.

- [ ] **Stop logging the bot token (security).** The prod bot's Railway logs print the
      full Telegram token on every poll (`httpx` logs each `POST .../bot<TOKEN>/getUpdates`
      URL at INFO). Anyone who can read the logs can control the bot. Fix:
      `logging.getLogger("httpx").setLevel(logging.WARNING)` in `ae-coach-bot/bot/bot.py`,
      then rotate the token in BotFather (`/revoke`) and update `TELEGRAM_TOKEN` in
      ae-coach-bot and vacancy-webapp and `BOT_TOKEN` in payme-webhook.
- [ ] **Prod vacancy-webapp `DATABASE_URL` is a hard-coded literal** (the other services
      use `${{Postgres.DATABASE_URL}}`). Switch it to the reference so a password rotation
      or environment copy can't leave it pointing at the wrong database. Staging already uses the reference.
- [ ] **Staging deploy branch.** Staging currently deploys from the same branches as prod
      (main/master). Consider a `staging` branch so changes land there first.
- [ ] **Email channel for web users.** Provider (Resend/Postmark), SPF/DKIM/DMARC on
      the domain, one-click unsubscribe + `List-Unsubscribe` header. Vacancy alerts
      route by channel (Telegram if `telegram_id`, else email). Then un-hide Vacancy
      Alerts in web mode.
- [ ] **"Connect Telegram" (account linking).** Let one person link their web and
      Telegram accounts (Telegram Login Widget on web, or "Connect Google" inside the
      Mini App) and merge their CVs/history/quota onto one `users` row.
- [ ] **International payments for web users.** Payme is UZ-only. Look at a merchant of
      record (Paddle / Lemon Squeezy, confirm they accept an Uzbekistan seller). Until
      then web users get 10 free checks, then Join waitlist.
- [ ] **Drop legacy `telegram_id` columns** from child tables (cvs, applications,
      cv_analyses, alerted_vacancies, events, orders) once Phase 1 has been stable for a few weeks.
- [ ] **Rebrand the Telegram Mini App and bot from "Accepted AI" to "Chashma"**: bot
      messages (`ae-coach-bot/bot/i18n.py`), Mini App strings (`app/static/i18n.js`),
      BotFather name/description. The website and app.chashma.uz are rebranded as part of
      the web launch; this is the remaining Telegram side.
- [ ] **Microservices (later).** Revisit once web is live. Phase 1 (internal user ID)
      is the prerequisite, because it removes the Telegram ID as the thing tying all services together.
