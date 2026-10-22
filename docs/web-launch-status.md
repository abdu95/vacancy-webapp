# Web version: status

Where the browser version of Chashma (Sign in with Google, no Telegram needed) stands.
The full step-by-step plan, with the details behind each item, is in
[web-launch-plan.md](web-launch-plan.md). Smaller deferred work is in [../TODO.md](../TODO.md).

Last updated: 2026-10-22

---

## Done

### Safety net (Phase 0)
- **Staging environment** on Railway: a full copy of prod with real data, its own test bot
  (`@chashma_stage_bot`), alerts switched off, and no live Payme key. Every change is tried there first.
- **Real-database tests** in all three repos, plus a saved copy of prod's database structure
  that the tests compare against.
- **Backups:** Railway's built-in backups need the Pro plan, so we make our own with `pg_dump` into
  `ae coach bot/chashma-backups/` and test-restore each one. One was taken before every prod change.
- **Security fixes found along the way:**
  - The bot token was being written to Railway's logs. That's fixed, and you rotated the token.
  - The payment tables existed only in prod. They're now defined in code.

### Internal user ID (Phase 1), live in prod
- Every user now has an internal ID, and all their data (CVs, analyses, applications, alerts,
  events, orders) is linked to it instead of to their Telegram ID.
- The database can now hold users without a Telegram account.
- Rolled out in four steps, each tested on staging and backed up first. No data was lost,
  and Telegram users noticed nothing.

### Sign in with Google (Phase 2), built and on staging, **not in prod yet**
- **Google Cloud:** project "Chashma", owned by `chashmauz1@gmail.com`, with your personal Gmail as a
  backup owner. It's in Testing mode, so only listed test users can sign in.
- **Sign-in:** "Continue with Google", then one onboarding screen (name from Google, language from the
  browser or the `?lang=` link), then the app.
- **Web users** get 10 free checks, then a "Join the waitlist" button (no payments on the web yet).
- **Web mode:** branded "Chashma" only, with Vacancy Alerts hidden. Profile shows your email, a language
  picker and Sign out. On a laptop the navigation is at the top; on phones it stays at the bottom.
- **Security:** Google's token is verified, sessions expire after 30 days and are stored only as hashes,
  requests from other websites are blocked, and sign-in attempts are rate-limited. Web users and Telegram
  users can never see each other's data.
- **You tested it on staging** and it worked.

---

## Left to do

### Next: put the web version live on `app.chashma.uz`
⚠ The Phase 2 code is committed **on this Mac only**: `ae-coach-bot` is 1 commit ahead of GitHub,
and `vacancy-webapp` is 4 ahead. The bot must be pushed and deployed **before** the webapp, or sign-in
breaks in prod. Let Claude do the push.

1. **Domain:** Claude adds `app.chashma.uz` in Railway, then you add the CNAME record it gives
   in Cloudflare (DNS only, grey cloud).
2. **Google:** you add `https://app.chashma.uz` to the client's allowed origins, and add the US tester's
   Gmail as a test user.
3. **Prod rollout (Claude):** set `GOOGLE_CLIENT_ID` on prod, take a backup, push the bot, then the
   webapp, and check everything after each step.
4. **Your check** on `https://app.chashma.uz`, plus a quick check that the Telegram bot still works.
5. **Invite the tester:** send them `https://app.chashma.uz/?lang=en`.

### Before opening sign-in to everyone
- Privacy policy and Terms pages on `chashma.uz`. Google requires them, and you store CVs.
- Switch the Google app from Testing to **In production**, so any Google account can sign in.
- Landing page: rebrand "Accepted AI" to "Chashma", add the "Use in browser" button, and change the
  note to "2 free analyses in Telegram · 10 in web".
- Cost guard: a daily limit on new web sign-ups per IP address.

### Later (in TODO.md)
- Email channel: vacancy alerts and payment receipts by email for web users.
- "Connect Telegram": let one person link their web and Telegram accounts.
- International payments for web users (Payme only takes Uzbek cards).
- Rebrand the Telegram bot and Mini App to Chashma.
- Clean up the old per-row `telegram_id` columns and the compatibility code, once things have
  been stable for a few weeks.
- Fix the e2e payment test's outdated Payme sandbox key.
- Point prod webapp's `DATABASE_URL` at the Postgres service reference instead of a fixed value.
- Your own uncommitted work in this repo (`.claude/agents/`, `tests/e2e/`, and `tests/test_ai_utils.py`,
  which deletes a regression test and probably shouldn't be committed as is).
- Microservices: revisit after the web launch.
