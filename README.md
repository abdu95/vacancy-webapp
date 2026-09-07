# vacancy-webapp

AcceptedAI's Telegram Mini App — vacancy search, CV analysis, and application tracking.

Split out of `ae-coach-bot` on 2026-09-07 so this service can auto-deploy on push to Railway,
matching how `ae-coach-bot` and `payme-webhook` already deploy. Prior history for this code
lives in `ae-coach-bot`'s git log up to commit `2c30bba`.

Sister repos:
- `abdu95/ae-coach-bot` — the Telegram bot (launcher)
- `payme-webhook` — Payme payment callback handler

All three share one Postgres instance.
