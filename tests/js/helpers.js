const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const STATIC_DIR = path.resolve(__dirname, "..", "..", "app", "static");

// The app's JS was one 1897-line app.js until 2026-09-07, split into
// these 8 files (loaded by index.html as plain <script src> tags, no
// bundler - see core.js's header comment for why load order mostly
// doesn't matter except i18n.js-before-core.js). Kept in this exact
// order here too, so the eval'd code sees the same load order the real
// page does.
const APP_SCRIPTS = [
  "i18n.js", "checks.js", "vacancy-alerts.js", "cv-upload.js",
  "applications.js", "vacancy-search.js", "analysis.js", "core.js",
];

/**
 * Loads the REAL index.html + the app's JS files (not a rewritten copy)
 * into a jsdom window, with Telegram.WebApp and fetch mocked. Strips
 * <script src> / <link> tags before parsing so jsdom never tries to
 * fetch the external telegram-web-app.js or our own JS/CSS over the
 * network - the app's scripts are injected as real <script> elements
 * (in the same order index.html loads them) after the mocks are in
 * place, so core.js's top-level checkCVAndRoute() call hits the mock
 * fetch.
 *
 * Deliberately NOT window.eval() per file: confirmed empirically that
 * jsdom does not share top-level let/const bindings across separate
 * eval() calls the way real <script> tags share them across a page (a
 * const declared in one file's eval was ReferenceError-undefined from
 * another file's eval, even though function declarations - which
 * attach to the global object - worked fine either way). Real inserted
 * <script> elements (this file's approach) don't have that gap, since
 * jsdom's runScripts: "dangerously" executes them the same way a
 * browser would.
 */
function loadApp({ user = { id: 777, first_name: "Test", username: "testuser" }, fetchImpl } = {}) {
  let rawHtml = fs.readFileSync(path.join(STATIC_DIR, "index.html"), "utf8");
  rawHtml = rawHtml.replace(/<script[^>]*><\/script>/g, "");
  rawHtml = rawHtml.replace(/<link[^>]*>/g, "");

  // "dangerously" (safe here - we've stripped every <script>/<link> tag
  // above, so nothing auto-executes at parse time) is needed so inline
  // onclick="..." HTML attributes get wired up as real event handlers,
  // not just "outside-only" which only lets us eval() code manually.
  const dom = new JSDOM(rawHtml, { url: "https://example.com/", runScripts: "dangerously" });
  const { window } = dom;

  window.Telegram = {
    WebApp: {
      initData: "mock_init_data",
      initDataUnsafe: { user },
      ready() {},
      expand() {},
      openLink(url) { window.__lastOpenedLink = url; },
    },
  };

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
  // jsdom doesn't implement scrollTo (irrelevant for these tests, just noisy)
  window.scrollTo = () => {};

  window.fetch = fetchImpl || defaultFetchMock();

  for (const file of APP_SCRIPTS) {
    const scriptEl = window.document.createElement("script");
    scriptEl.textContent = fs.readFileSync(path.join(STATIC_DIR, file), "utf8");
    window.document.body.appendChild(scriptEl);
  }

  return dom;
}

/** Waits for pending microtasks/timers (checkCVAndRoute etc. are async). */
function flush(times = 3) {
  return new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n += 1;
      if (n >= times) return resolve();
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  });
}

/**
 * Builds a fetch mock from a map of { "/api/path": handler(body) -> respBody }.
 * handler may return a plain object (200 OK) or { status, body } for errors.
 * FormData bodies (multipart uploads) are not JSON-parsed - handlers for
 * those paths receive `null` as the body.
 */
function makeFetchMock(handlers) {
  return async (url, opts = {}) => {
    const pathname = new URL(url, "https://example.com/").pathname;
    const handler = handlers[pathname];
    if (!handler) {
      throw new Error(`No mock registered for ${pathname}`);
    }
    let body = null;
    if (opts.body && typeof opts.body === "string") {
      try { body = JSON.parse(opts.body); } catch { body = null; }
    }
    const result = await handler(body);
    const status = result && result.status ? result.status : 200;
    const payload = result && result.status ? result.body : result;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    };
  };
}

function defaultFetchMock(overrides = {}) {
  return makeFetchMock({
    "/api/cv-status": () => ({ has_cv: false, lang: "en" }),
    "/api/quota-status": () => ({ remaining: 3, quota: 3, price_per_check_tiyin: 1000000 }),
    ...overrides,
  });
}

module.exports = { loadApp, flush, makeFetchMock, defaultFetchMock };
