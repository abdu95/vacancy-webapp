require("dotenv").config();
const { openApp } = require("./lib/browser");
const { makeTestUser } = require("./lib/testUser");
const { decodeOrderIdFromCheckoutUrl, completeSandboxPayment } = require("./lib/paymeSandbox");

(async () => {
  const user = makeTestUser("payment");
  const { browser, page, consoleErrors, lastOpenedLink } = await openApp({
    user,
    telegramToken: process.env.TELEGRAM_TOKEN,
    webappUrl: process.env.WEBAPP_URL,
  });

  await page.waitForTimeout(1000);

  const before = await page.evaluate(() => callApi("/api/quota-status", {}));
  console.log("Quota before:", before);

  // Real navigation, like a user would: open the checks screen, click
  // "buy more" (renders the buy-checks box), then a quantity preset.
  await page.evaluate(() => window.showChecksScreen());
  await page.waitForTimeout(800);
  await page.click("#checks-content button.secondary");
  await page.waitForTimeout(500);
  await page.evaluate(() => window.buyChecks(1));
  await page.waitForTimeout(1000);

  const checkoutUrl = await lastOpenedLink();
  console.log("Checkout URL opened:", checkoutUrl ? "yes" : "NO - FAILED");
  if (!checkoutUrl) throw new Error("buyChecks() never called tg.openLink()");

  const orderId = decodeOrderIdFromCheckoutUrl(checkoutUrl);
  const amount = 1 * before.price_per_check_tiyin;
  console.log("Decoded order:", { orderId, amount });

  const { performed } = await completeSandboxPayment({
    webhookUrl: process.env.PAYME_WEBHOOK_URL,
    testKey: process.env.PAYME_TEST_KEY,
    orderId,
    amount,
  });
  console.log("Payme sandbox PerformTransaction result:", performed);

  const after = await page.evaluate(() => callApi("/api/quota-status", {}));
  console.log("Quota after:", after);
  console.log("Console errors:", consoleErrors);

  const ok = after.remaining === before.remaining + 1;
  console.log(ok ? "PASS: quota credited correctly after sandbox payment" : "FAIL: quota not credited as expected");

  await browser.close();
  process.exit(ok ? 0 : 1);
})();
