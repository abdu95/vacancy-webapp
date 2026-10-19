# TODO

Deferred from the web launch plan (docs/web-launch-plan.md, 2026-10-19).

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
