# vacancy-webapp

AcceptedAI's Telegram Mini App — vacancy search, CV analysis, and application tracking.

Split out of `ae-coach-bot` on 2026-09-07 so this service can auto-deploy on push to Railway,
matching how `ae-coach-bot` and `payme-webhook` already deploy. Prior history for this code
lives in `ae-coach-bot`'s git log up to commit `2c30bba`.

Sister repos:
- `abdu95/ae-coach-bot` — the Telegram bot (launcher)
- `payme-webhook` — Payme payment callback handler

All three share one Postgres instance.

## Layout

```
server.py            entrypoint shim (`uvicorn server:app`) - re-exports app/main.py's app
app/
  main.py            FastAPI app + all routes
  db.py              Postgres access (schema itself is owned by ae-coach-bot's bot/state.py)
  services/          one module per feature: CV parsing/analysis/fixes, vacancy sourcing
                      (Greenhouse), CV-position/job-title inference, JD-link fetching, scoring
  prompts/           Claude prompt text, kept next to the engine (cv_analysis.py) that uses it
  static/            the Mini App itself (index.html/app.js/style.css), served at /static
scripts/             one-off maintenance scripts (e.g. syncing greenhouse_companies.csv into
                     the DB) - not imported by the app, run manually
tests/               Python backend tests (pytest-less, plain assert scripts, run individually)
tests/js/            JS frontend tests (Node's built-in test runner + jsdom) - see tests/js/README.md
```
