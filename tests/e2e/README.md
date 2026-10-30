# E2E harness (persona + QA simulators)

Drives the **real deployed Mini App** (`app/static/*.js`, unmodified) in a real
Chromium browser via Playwright, as a synthetic Telegram user, talking to the
**real production backend**. Nothing here is mocked except the
`Telegram.WebApp` object itself (there's no real Telegram client in a plain
browser) - and even that carries a genuinely HMAC-signed `initData`, so it
passes `app/auth.py`'s real signature check.

Two consumers of this harness:
- `.claude/agents/user-simulator.md` - persona-driven walkthrough, reports on friction and conversion.
- `.claude/agents/qa-tester.md` - test-case-driven bug hunting.

## Why this is safe to run against production

- **Synthetic users only.** `lib/testUser.js` generates negative
  `telegram_id`s. Real Telegram user ids are always positive, so these can
  never collide with a real user's row. Names/usernames are tagged
  `E2E_TEST_*` so they're trivially greppable for manual cleanup later.
- **Sandbox payment key only.** `pull-env.sh` pulls `PAYME_TEST_KEY` from
  payme-webhook, never `PAYME_KEY` (the live key) - it isn't fetched, so no
  script in this directory can trigger a real charge even by mistake.
  `lib/paymeSandbox.js` replays the exact JSON-RPC sequence
  (`CheckPerformTransaction` -> `CreateTransaction` -> `PerformTransaction`)
  Payme's own sandbox sends on a successful test payment - this is also how
  Payme itself certifies a merchant's webhook, so it's a faithful test of the
  real integration, not a fake stand-in for it.
- **Real Anthropic API calls cost real money.** Any run that exercises CV
  upload/analysis calls Claude for real. Keep persona/test runs deliberate,
  not looped.

## Setup (once per session - Railway env vars can rotate)

```bash
cd tests/e2e
./pull-env.sh     # pulls TELEGRAM_TOKEN, BOT_USERNAME, WEBAPP_URL, PAYME_TEST_KEY, PAYME_WEBHOOK_URL into a gitignored .env
npm install
npx playwright install chromium
```

## Building a script

```js
require("dotenv").config();
const { openApp } = require("./lib/browser");
const { makeTestUser } = require("./lib/testUser");
const { decodeOrderIdFromCheckoutUrl, completeSandboxPayment } = require("./lib/paymeSandbox");

const user = makeTestUser("persona1");
const { browser, page, consoleErrors, lastOpenedLink } = await openApp({
  user,
  telegramToken: process.env.TELEGRAM_TOKEN,
  webappUrl: process.env.WEBAPP_URL,
});

// ... click through the app like a real user would, e.g.:
// await page.click("#nav-checks");
// await page.waitForSelector("#some-screen:not([hidden])");

// To complete a sandbox payment after clicking "buy":
const checkoutUrl = await lastOpenedLink();
const orderId = decodeOrderIdFromCheckoutUrl(checkoutUrl);
await completeSandboxPayment({
  webhookUrl: process.env.PAYME_WEBHOOK_URL,
  testKey: process.env.PAYME_TEST_KEY,
  orderId,
  amount: /* the `amount` field from the /api/checkout response */,
});

await browser.close();
```

`consoleErrors` accumulates any JS console errors/exceptions seen during the
run - always check it's empty (or explain what's in it) before calling a run
clean.

## Cleaning up test users

Test rows are tagged (`E2E_TEST_*` name/username, negative `telegram_id`) and
harmless to leave, but if you want to remove them:

```sql
DELETE FROM users WHERE telegram_id < 0;
```

(Cascades depend on FK setup in `ae-coach-bot`'s schema - check before running
broadly. Not run automatically by anything in this directory.)
