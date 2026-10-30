require("dotenv").config();
const { openApp } = require("./lib/browser");
const { makeTestUser } = require("./lib/testUser");

(async () => {
  const user = makeTestUser("smoke");
  console.log("Test user:", user);

  const { browser, page, consoleErrors } = await openApp({
    user,
    telegramToken: process.env.TELEGRAM_TOKEN,
    webappUrl: process.env.WEBAPP_URL,
  });

  await page.waitForTimeout(1500);
  const bodyText = await page.textContent("body");
  console.log("Console errors:", consoleErrors);
  console.log("Body snippet:", bodyText.slice(0, 300).replace(/\s+/g, " "));
  await page.screenshot({ path: "smoke.png" });

  await browser.close();
})();
