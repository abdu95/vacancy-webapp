// Simulates what Payme's own sandbox servers do when a test payment is
// completed: call payme-webhook's JSON-RPC methods directly, authenticated
// with PAYME_TEST_KEY (never PAYME_KEY - that constant doesn't exist
// anywhere in this directory). This is how Payme itself certifies a
// merchant's webhook, so it's a faithful (and, unlike scripting Payme's
// hosted checkout.paycom.uz page, stable) way to test the payment leg
// end-to-end: order creation -> webhook -> DB credit -> quota bump.
const crypto = require("crypto");

function decodeOrderIdFromCheckoutUrl(checkoutUrl) {
  const b64 = checkoutUrl.replace("https://checkout.paycom.uz/", "");
  const raw = Buffer.from(b64, "base64").toString("utf8");
  const match = raw.match(/ac\.order_id=(\d+)/);
  if (!match) throw new Error(`Could not find order_id in checkout_url: ${raw}`);
  return Number(match[1]);
}

async function rpc(webhookUrl, testKey, method, params) {
  const id = Math.floor(Math.random() * 1e6);
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + Buffer.from(`Paycom:${testKey}`).toString("base64"),
    },
    body: JSON.stringify({ id, method, params }),
  });
  const body = await res.json();
  if (body.error) {
    throw new Error(`Payme ${method} failed: ${JSON.stringify(body.error)}`);
  }
  return body.result;
}

/** Runs the real Check -> Create -> Perform sequence Payme's sandbox sends on a successful test payment. */
async function completeSandboxPayment({ webhookUrl, testKey, orderId, amount }) {
  const account = { order_id: String(orderId) };
  const paymeId = crypto.randomBytes(12).toString("hex");
  const time = Date.now();

  await rpc(webhookUrl, testKey, "CheckPerformTransaction", { account, amount });
  const created = await rpc(webhookUrl, testKey, "CreateTransaction", { id: paymeId, time, amount, account });
  const performed = await rpc(webhookUrl, testKey, "PerformTransaction", { id: paymeId });

  return { paymeId, created, performed };
}

module.exports = { decodeOrderIdFromCheckoutUrl, completeSandboxPayment, rpc };
