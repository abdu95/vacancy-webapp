// Browser (non-Telegram) mode - web.js plus core.js's IS_WEB routing. Same
// real index.html + scripts as app.test.js, loaded with empty initData (what
// telegram-web-app.js gives a plain browser) and a stand-in for Google's
// sign-in SDK.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, flush, makeFetchMock } = require("./helpers");

const visible = (window, id) => !window.document.getElementById(id).hidden;

function fakeGoogle(window) {
  window.__google = { initialized: null, rendered: 0, disabledAutoSelect: false };
  window.google = {
    accounts: {
      id: {
        initialize(opts) { window.__google.initialized = opts; },
        renderButton() { window.__google.rendered += 1; },
        disableAutoSelect() { window.__google.disabledAutoSelect = true; },
      },
    },
  };
}

// A browser user's backend: 401 until signed in, then onboarding, then the app.
function webBackend({ signedIn = false, onboarded = false, remaining = 10, waitlisted = false } = {}) {
  const calls = [];
  const me = () => ({ name: "Sarah", language: onboarded ? "en" : null, email: "sarah@example.com",
                      channel: "web", waitlisted, needs_onboarding: !onboarded });
  const fetch = makeFetchMock({
    "/api/me": () => (signedIn ? me() : { status: 401, body: { detail: "Not signed in" } }),
    "/api/web-config": () => ({ google_client_id: "test-client-id", web_free_limit: 10 }),
    "/api/auth/google": (body) => { calls.push(["google", body]); signedIn = true; return { needs_onboarding: true, name: "Sarah" }; },
    "/api/onboarding": (body) => { calls.push(["onboarding", body]); onboarded = true; return { ok: true }; },
    "/api/cv-status": (body) => { calls.push(["cv-status", body]); return { has_cv: false, lang: "en", name: "Sarah" }; },
    "/api/quota-status": () => ({ remaining, quota: 10, price_per_check_tiyin: 1000000, channel: "web" }),
    "/api/waitlist": () => { calls.push(["waitlist"]); return { joined: true, already: false }; },
    "/api/auth/logout": () => { calls.push(["logout"]); return { ok: true }; },
  });
  return { fetch, calls };
}

test("browserLanguage maps navigator.language onto the app's three languages", async () => {
  const dom = loadApp({ initData: "", fetchImpl: webBackend().fetch, beforeScripts: fakeGoogle });
  await flush();
  const { browserLanguage } = dom.window;
  assert.equal(browserLanguage("uz-UZ"), "uz");
  assert.equal(browserLanguage("uz"), "uz");
  assert.equal(browserLanguage("ru-RU"), "ru");
  assert.equal(browserLanguage("en-US"), "en");
  assert.equal(browserLanguage("de-DE"), "en");
  assert.equal(browserLanguage(""), "en");
  assert.equal(browserLanguage(undefined), "en");
});

test("?lang= from the landing page wins over the browser's language", async () => {
  const dom = loadApp({ initData: "", url: "https://app.chashma.uz/?lang=ru", navigatorLanguage: "en-US",
                        fetchImpl: webBackend().fetch, beforeScripts: fakeGoogle });
  await flush();
  assert.equal(dom.window.initialWebLanguage(), "ru");
});

test("a signed-out browser visitor sees the Chashma sign-in screen with Google's button", async () => {
  const dom = loadApp({ initData: "", navigatorLanguage: "uz-UZ", fetchImpl: webBackend().fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  assert.ok(visible(window, "signin-screen"));
  assert.ok(!visible(window, "tab-bar"), "no tab bar before sign-in");
  assert.equal(window.document.title, "Chashma");
  assert.match(window.document.getElementById("signin-title").textContent, /Chashma/);
  assert.match(window.document.getElementById("signin-body").textContent, /10/);
  assert.equal(window.__google.initialized.client_id, "test-client-id");
  assert.ok(window.__google.rendered >= 1, "Google button rendered");
  assert.equal(window.document.getElementById("signin-lang-select").value, "uz", "language preselected from the browser");
});

test("Google sign-in -> onboarding (name prefilled, language from browser) -> the app", async () => {
  const backend = webBackend();
  const dom = loadApp({ initData: "", navigatorLanguage: "ru-RU", fetchImpl: backend.fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  await window.__google.initialized.callback({ credential: "google-id-token" });
  await flush(5);
  assert.deepEqual(backend.calls[0], ["google", { credential: "google-id-token" }]);
  assert.ok(visible(window, "onboarding-screen"));
  assert.equal(window.document.getElementById("onboarding-name").value, "Sarah");
  assert.equal(window.document.getElementById("onboarding-lang-select").value, "ru");
  assert.equal(window.document.getElementById("onboarding-continue-btn").textContent, "Продолжить");

  window.document.getElementById("onboarding-name").value = "Sarah K";
  window.document.getElementById("onboarding-lang-select").value = "en";
  await window.submitOnboarding();
  await flush(8);
  const onboarding = backend.calls.find(c => c[0] === "onboarding")[1];
  assert.deepEqual({ name: onboarding.name, language: onboarding.language }, { name: "Sarah K", language: "en" });
  assert.equal(onboarding.init_data, "", "web requests carry no Telegram initData");
  assert.ok(visible(window, "welcome-screen"), "lands in the app after onboarding");
  assert.equal(backend.calls.find(c => c[0] === "cv-status")[1].init_data, "");
});

test("onboarding requires a name", async () => {
  const dom = loadApp({ initData: "", fetchImpl: webBackend({ signedIn: true }).fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  assert.ok(visible(window, "onboarding-screen"));
  window.document.getElementById("onboarding-name").value = "   ";
  await window.submitOnboarding();
  assert.match(window.document.getElementById("onboarding-result").textContent, /name/i);
});

test("a signed-in, onboarded browser user goes straight to the app, branded Chashma", async () => {
  const dom = loadApp({ initData: "", fetchImpl: webBackend({ signedIn: true, onboarded: true }).fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  assert.ok(visible(window, "welcome-screen"));
  const welcome = window.document.getElementById("welcome-body").textContent;
  assert.match(welcome, /Chashma/);
  assert.doesNotMatch(welcome, /Accepted ?AI/, "web mode never says AcceptedAI");
});

test("out of checks, a browser user is offered the waitlist instead of Payme", async () => {
  const backend = webBackend({ signedIn: true, onboarded: true, remaining: 0 });
  const dom = loadApp({ initData: "", fetchImpl: backend.fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  await window.showChecksScreen();
  await flush(5);
  const content = window.document.getElementById("checks-content");
  assert.ok(window.document.getElementById("waitlist-btn"), "waitlist button shown");
  assert.ok(!content.querySelector("#buy-checks-box"), "no buy-checks box");
  assert.doesNotMatch(content.textContent, /UZS/);
  await window.joinWaitlist();
  assert.ok(backend.calls.some(c => c[0] === "waitlist"));
  assert.match(window.document.getElementById("waitlist-box").textContent, /waitlist/i);
});

test("with checks left, a browser user isn't offered any purchase", async () => {
  const dom = loadApp({ initData: "", fetchImpl: webBackend({ signedIn: true, onboarded: true, remaining: 4 }).fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  await window.showChecksScreen();
  await flush(3);
  assert.equal(window.document.getElementById("checks-content").querySelectorAll("button").length, 0);
});

test("Profile in browser mode hides Vacancy Alerts and offers sign-out", async () => {
  const backend = webBackend({ signedIn: true, onboarded: true });
  const dom = loadApp({ initData: "", fetchImpl: backend.fetch, beforeScripts: fakeGoogle });
  await flush(8);
  const { window } = dom;
  window.showProfile();
  assert.ok(window.document.getElementById("profile-vacancy-alerts-btn").hidden);
  assert.match(window.document.getElementById("profile-web-account").textContent, /sarah@example\.com/);
  assert.ok(window.document.getElementById("signout-btn"));
});

test("inside Telegram nothing of browser mode appears", async () => {
  const calls = [];
  const dom = loadApp({
    fetchImpl: makeFetchMock({
      "/api/cv-status": (body) => { calls.push(body); return { has_cv: true, lang: "en" }; },
      "/api/quota-status": () => ({ remaining: 3, quota: 3, price_per_check_tiyin: 1000000, channel: "telegram" }),
    }),
  });
  await flush(8);
  const { window } = dom;
  assert.ok(visible(window, "home-screen"));
  assert.ok(!visible(window, "signin-screen"));
  assert.notEqual(window.document.title, "Chashma");
  assert.equal(calls[0].init_data, "mock_init_data");
  window.showProfile();
  assert.ok(!window.document.getElementById("profile-vacancy-alerts-btn").hidden, "Telegram users keep Vacancy Alerts");
  assert.ok(window.document.getElementById("profile-web-account").hidden);
});
