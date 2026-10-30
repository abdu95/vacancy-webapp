// Drives the REAL deployed Mini App (app/static/*.js, unmodified) in a real
// Chromium browser via Playwright, as a synthetic Telegram user. Talks to
// the real production backend - only the Telegram.WebApp object itself is
// stubbed (there's no actual Telegram client in a plain browser), using a
// *validly signed* initData so app/auth.py's HMAC check passes for real.
//
// The frontend's whole Telegram.WebApp surface is 5 calls (see core.js /
// checks.js): ready(), expand(), initData, initDataUnsafe.user, openLink().
const { chromium } = require("playwright");
const { buildInitData } = require("./initData");

async function openApp({ user, telegramToken, webappUrl }) {
  const initData = buildInitData(user, telegramToken);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // The real index.html loads Telegram's own telegram-web-app.js first,
  // which (outside an actual Telegram client) would overwrite our stub
  // with an empty one. Block it so only our stub exists.
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
  );

  await page.addInitScript(
    ({ initData, user }) => {
      window.__openedLinks = [];
      window.Telegram = {
        WebApp: {
          initData,
          initDataUnsafe: { user },
          ready() {},
          expand() {},
          openLink(url) { window.__openedLinks.push(url); },
        },
      };
    },
    { initData, user }
  );

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(webappUrl, { waitUntil: "networkidle" });

  return { browser, page, consoleErrors, lastOpenedLink: () => page.evaluate(() => window.__openedLinks.at(-1)) };
}

module.exports = { openApp };
