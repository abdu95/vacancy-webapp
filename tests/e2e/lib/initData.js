// Builds a Telegram Mini App `initData` string that passes app/auth.py's
// verify_init_data() against the real TELEGRAM_TOKEN, so e2e runs can call
// the actual deployed backend as a real (synthetic) user - not a mocked one.
// Mirrors auth.py's scheme exactly (https://core.telegram.org/bots/webapps#
// validating-data-received-via-the-mini-app), just run in reverse (signing
// instead of verifying).
const crypto = require("crypto");

function buildInitData(user, telegramToken) {
  const fields = {
    user: JSON.stringify(user),
    auth_date: String(Math.floor(Date.now() / 1000)),
  };

  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(telegramToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

module.exports = { buildInitData };
