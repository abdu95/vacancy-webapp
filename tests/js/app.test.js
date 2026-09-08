const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, flush, defaultFetchMock } = require("./helpers");

// Top-level `function` declarations in app.js attach to `window` (so
// window.pickTitle(...) etc. work and correctly mutate the module's
// internal state via closure), but `const state = {...}` / `let
// currentLang` do NOT become window properties - that's normal JS
// scoping for indirect eval, not a jsdom quirk. So these tests never
// read/write `window.state` or `window.currentLang` directly; every
// precondition is set by driving the same functions a real user would
// trigger (pickTitle, analyzeCV, uploadCV, ...), and every assertion is
// on observable DOM/API-call behavior - which is what actually matters.

// ── Pure logic ────────────────────────────────────────────────────────

test("looksLikeUrl distinguishes a bare URL from JD text", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock() });
  await flush();
  const { window } = dom;
  assert.equal(window.looksLikeUrl("https://boards.greenhouse.io/acme/jobs/1"), true);
  assert.equal(window.looksLikeUrl("http://example.com"), true);
  assert.equal(window.looksLikeUrl("We are looking for a Data Analyst..."), false);
  assert.equal(window.looksLikeUrl("check out https://example.com for details"), false);
});

test("t() renders the language the backend reports, not just English", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "ru" }) }) });
  await flush();
  const { window } = dom;
  assert.equal(window.t("get_roadmap_btn"), "🗺 Получить план");
});

test("a failed first load shows a retry button, not a dead end", async () => {
  let attempts = 0;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => {
        attempts += 1;
        return attempts === 1 ? { status: 500, body: {} } : { has_cv: false, lang: "en" };
      },
    }),
  });
  await flush();
  const { document, window } = dom.window;

  const gate = document.getElementById("loading-gate");
  assert.match(gate.innerHTML, /error/, "the first failed load should show an error");
  const retryBtn = gate.querySelector("button");
  assert.ok(retryBtn, "a retry button should be offered, not just a dead-end message");

  retryBtn.click();
  await flush();
  assert.equal(attempts, 2, "clicking retry should re-issue the same request");
  assert.equal(document.getElementById("welcome-screen").hidden, false, "a successful retry should route normally");
});

test("t() interpolates {vars} into the template", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { window } = dom;
  assert.equal(window.t("buy_custom_total", { amount: "10,000" }), "Total: 10,000 UZS");
});

test("checksLabel pluralizes in English", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { window } = dom;
  assert.equal(window.checksLabel(1), "1 check");
  assert.equal(window.checksLabel(5), "5 checks");
});

test("checksLabel and freeChecksLine use Russian's real 3-form plural rule, not a simple one/other split", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "ru" }) }) });
  await flush();
  const { window } = dom;
  // 1 -> nominative singular ("проверка"); 2-4 -> "few" ("проверки");
  // 5+ (and 11-14, which are irregular exceptions to the 2-4 rule) -> "проверок"
  assert.equal(window.checksLabel(1), "1 проверка");
  assert.equal(window.checksLabel(2), "2 проверки");
  assert.equal(window.checksLabel(3), "3 проверки");
  assert.equal(window.checksLabel(4), "4 проверки");
  assert.equal(window.checksLabel(5), "5 проверок");
  assert.equal(window.checksLabel(11), "11 проверок", "11-14 are exceptions to the 2-4 rule even though they end in 1-4");
  assert.equal(window.checksLabel(21), "21 проверка", "21 ends in 1 (and isn't 11) - back to the singular form");

  assert.match(window.freeChecksLine(1), /осталась 1 бесплатная проверка/);
  assert.match(window.freeChecksLine(2), /осталось 2 бесплатные проверки/);
  assert.match(window.freeChecksLine(6), /осталось 6 бесплатных проверок/);
});

test("formatRoadmapText converts markdown headers/bold and escapes raw HTML", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock() });
  await flush();
  const { window } = dom;
  const out = window.formatRoadmapText("### Target Companies\n**Bold text** and <script>alert(1)</script>");
  assert.match(out, /<b>Target Companies<\/b>/);
  assert.match(out, /<b>Bold text<\/b>/);
  assert.ok(!out.includes("<script>"), "a raw script tag must come out escaped");
});

// ── Routing: welcome vs home, first-run flow ─────────────────────────────

test("checkCVAndRoute shows welcome-screen for a brand-new user (no CV), not a forced upload", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: false, lang: "en" }) }) });
  await flush();
  const { document } = dom.window;
  assert.equal(document.getElementById("welcome-screen").hidden, false);
  assert.equal(document.getElementById("home-screen").hidden, true);
  assert.equal(document.getElementById("cv-gate").hidden, true, "CV upload must not be forced as step 1 anymore");
});

test("checkCVAndRoute skips welcome and shows home-screen directly for a returning user", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { document } = dom.window;
  assert.equal(document.getElementById("home-screen").hidden, false);
  assert.equal(document.getElementById("welcome-screen").hidden, true);
});

test("each home-screen button has its own intro label above it, not one shared generic hint - real user feedback (Mavlyuda)", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { document } = dom.window;
  assert.equal(document.getElementById("home-vacancy-label").textContent, "Search for a vacancy");
  assert.equal(document.getElementById("home-analyze-label").textContent, "Or analyze your CV");

  // Each label must sit directly before its own button, not be a single
  // shared hint floating above both - verifies actual DOM order.
  const children = [...document.getElementById("home-screen").children];
  assert.equal(children[0].id, "home-vacancy-label");
  assert.equal(children[1].tagName, "BUTTON");
  assert.ok(children[1].contains(document.getElementById("home-vacancy-option")), "the vacancy button (right after its label) must be the vacancy-search option");
  assert.equal(children[2].id, "home-analyze-label");
  assert.equal(children[3].tagName, "BUTTON");
  assert.ok(children[3].contains(document.getElementById("home-analyze-option")), "the analyze button (right after its label) must be the CV-analysis option");
});

test("welcome-screen's continue button reveals the home-screen options", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: false, lang: "en" }) }) });
  await flush();
  const { document } = dom.window;
  document.getElementById("welcome-continue-btn").onclick();
  assert.equal(document.getElementById("home-screen").hidden, false);
});

test("the welcome screen states the free-check count up front, not just hidden behind the header badge", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: false, lang: "en" }),
      "/api/quota-status": () => ({ remaining: 2, quota: 2, price_per_check_tiyin: 1000000 }),
    }),
  });
  await flush(6);
  const { document } = dom.window;
  assert.match(
    document.getElementById("welcome-body").textContent,
    /2 free CV-vs-job analyses/,
    "a brand-new user should see the free-check count on the very first screen, not discover it later",
  );
});

// ── Inline CV-upload gating (asked only when the chosen path needs it) ──

test("goToAnalysis routes to cv-gate (not straight to the JD box) when no CV is on file", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: false, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  assert.equal(document.getElementById("cv-gate").hidden, false);
  assert.equal(document.getElementById("analysis-screen").hidden, true);
});

test("goToVacancySearch goes straight to title-screen even with no CV on file - typing your own title needs no CV", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: false, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  assert.equal(document.getElementById("title-screen").hidden, false, "search must not be gated behind a CV upload");
  assert.equal(document.getElementById("cv-gate").hidden, true);
});

test("suggesting titles from the CV routes to cv-gate when no CV is on file yet", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: false, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.suggestTitles();
  assert.equal(document.getElementById("cv-gate").hidden, false, "suggest-from-CV is the one step in this flow that actually needs a CV");
});

test("checking a vacancy's fit routes to cv-gate when no CV is on file, and resumes checkFit after upload", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: false, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://x", summary: "..." }] }),
      "/api/upload-cv": () => ({ saved: true }),
      "/api/score-vacancy": () => ({ score: 80, matched: ["SQL"], missing: [], verdict: "Good fit." }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.pickTitle("Data Analyst");
  await window.search();
  window.likeVacancy();
  window.checkFit();
  assert.equal(document.getElementById("cv-gate").hidden, false, "check-fit needs a CV even though search itself didn't");

  const file = new window.File(["cv text"], "resume.pdf", { type: "application/pdf" });
  Object.defineProperty(document.getElementById("cv_file"), "files", { value: [file] });
  await window.uploadCV();
  await flush();
  assert.equal(document.getElementById("search-screen").hidden, false, "should resume on the same vacancy, not bounce to home");
  assert.match(document.getElementById("action-area").innerHTML, /Good fit\./, "checkFit should have re-run automatically after upload");
});

test("a vacancy card offers Open link / Copy URL / Match my CV immediately, before deciding to 'like' it - closes the vacancy-search-to-CV-analysis loop", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://boards.greenhouse.io/acme/jobs/1", summary: "..." }] }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.pickTitle("Data Analyst");
  await window.search();

  const cardHtml = document.getElementById("result").innerHTML;
  assert.match(cardHtml, /href="https:\/\/boards\.greenhouse\.io\/acme\/jobs\/1"/, "Open link must point at the real posting URL");
  // Short, one-line labels on purpose (real feedback: two-line button text
  // didn't match the single-line height of the buttons below it).
  assert.match(cardHtml, />🔗 Open</);
  assert.match(cardHtml, />📋 Copy</);
  assert.match(cardHtml, /Match my CV/);
  // Not gated behind "like it" - the decision block is still showing
  // (untouched), these 3 buttons are available regardless.
  assert.equal(document.getElementById("vacancy-decision").hidden, false);
});

test("Copy URL copies the vacancy's real link to the clipboard and confirms it, mentioning where to paste it", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://boards.greenhouse.io/acme/jobs/1", summary: "..." }] }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.pickTitle("Data Analyst");
  await window.search();

  let copiedText = null;
  window.navigator.clipboard = { writeText: (text) => { copiedText = text; return Promise.resolve(); } };

  await window.copyVacancyUrl();
  assert.equal(copiedText, "https://boards.greenhouse.io/acme/jobs/1");
  assert.match(document.getElementById("copy-url-result").innerHTML, /paste it into Analyze/i);
});

test("Copy URL shows a friendly error if the clipboard write fails, instead of silently doing nothing", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://x", summary: "..." }] }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.pickTitle("Data Analyst");
  await window.search();

  window.navigator.clipboard = { writeText: () => Promise.reject(new Error("denied")) };
  await window.copyVacancyUrl();
  assert.match(document.getElementById("copy-url-result").innerHTML, /error/);
});

test("Match my CV on the card runs a fit check directly, without requiring 'like it' first", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://x", summary: "..." }] }),
      "/api/score-vacancy": () => ({ score: 80, matched: ["SQL"], missing: [], verdict: "Good fit." }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.pickTitle("Data Analyst");
  await window.search();

  assert.equal(document.getElementById("vacancy-decision").hidden, false, "sanity check: 'like it' was never clicked");
  await window.checkFit();
  assert.match(document.getElementById("action-area").innerHTML, /Good fit\./, "checkFit should work immediately from the card, not only after liking the vacancy");
});

test("goToAnalysis skips cv-gate and opens the JD box directly once a CV is on file", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  assert.equal(document.getElementById("analysis-screen").hidden, false);
  assert.equal(document.getElementById("jd-input-box").hidden, false);
});

test("uploading a CV after goToAnalysis lands on the analysis screen (not home)", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: false, lang: "en" }),
      "/api/upload-cv": () => ({ saved: true }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis(); // no CV yet -> lands on cv-gate
  const file = new window.File(["cv text"], "resume.pdf", { type: "application/pdf" });
  Object.defineProperty(document.getElementById("cv_file"), "files", { value: [file] });
  await window.uploadCV();
  await flush();
  assert.equal(document.getElementById("analysis-screen").hidden, false);
  assert.equal(document.getElementById("home-screen").hidden, true);
});

test("uploading a CV after being gated by suggest-from-CV lands back on the title screen (not home)", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: false, lang: "en" }),
      "/api/upload-cv": () => ({ saved: true }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToVacancySearch();
  window.suggestTitles(); // the one action in this screen that needs a CV
  const file = new window.File(["cv text"], "resume.pdf", { type: "application/pdf" });
  Object.defineProperty(document.getElementById("cv_file"), "files", { value: [file] });
  await window.uploadCV();
  await flush();
  assert.equal(document.getElementById("title-screen").hidden, false);
  assert.equal(document.getElementById("home-screen").hidden, true);
});

// ── Per-title vacancy-search cap (the escape valve is a new title, not a wait) ─

test("the 3-search cap is per job title: picking a different title gives a fresh 3, not a wall you have to wait out", async () => {
  let searchCalls = 0;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => {
        searchCalls += 1;
        return { vacancies: [{ title: "Data Analyst", company: `Co${searchCalls}`, location: "Remote", url: "https://x", summary: "..." }] };
      },
    }),
  });
  await flush();
  const { document, window } = dom.window;

  window.pickTitle("Data Analyst");
  document.getElementById("location").value = "Remote";
  await window.search();
  await window.search();
  await window.search();
  assert.equal(searchCalls, 3, "3 searches should have hit the API");

  const resultHtml = document.getElementById("result").innerHTML;
  assert.match(resultHtml, /backToTitleScreen\(\)/, "hitting the cap should offer trying a different title");
  assert.match(resultHtml, /showVacancyAlerts\(\)/, "hitting the cap should also nudge toward daily alerts");

  // A different title is the deliberate escape valve, not a bypassable
  // loophole - "come back tomorrow" was replaced with this on purpose.
  window.pickTitle("Backend Engineer");
  document.getElementById("location").value = "Remote";
  await window.search();
  assert.equal(searchCalls, 4, "a new title should get a fresh 3 searches");
});

test("liking a vacancy hides the like/search-again/carousel/analyze-CV decision block, leaving only the current step's buttons", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://x", summary: "..." }] }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.pickTitle("Data Analyst");
  await window.search();

  assert.equal(document.getElementById("vacancy-decision").hidden, false);
  window.likeVacancy();
  assert.equal(document.getElementById("vacancy-decision").hidden, true,
    "the like-it/search-again/carousel-nav block must disappear once the user commits to a vacancy");
  assert.match(document.getElementById("action-area").innerHTML, /checkFit\(\)/,
    "the current step's buttons (apply/check fit) must be visible");
});

test("hitting the search cap shows a call-to-action into the paid analysis flow", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/search": () => ({ vacancies: [{ title: "Data Analyst", company: "Acme", location: "Remote", url: "https://x", summary: "..." }] }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.pickTitle("Data Analyst");
  await window.search();
  await window.search();
  await window.search();
  const resultHtml = document.getElementById("result").innerHTML;
  assert.match(resultHtml, /goToAnalysis\(\)/, "the cap-hit card must offer a button into the analysis flow");
});

// ── Double back-button fix on the applications detail view ──────────────

test("opening an application detail hides the screen-level back button; closing restores it", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/applications": () => ({
        applications: [{ id: 1, title: "Data Analyst", company: "Acme", location: "Remote", url: "https://x", match_score: 80, status: "applied", created_at: new Date().toISOString() }],
      }),
    }),
  });
  await flush();
  const { document, window } = dom.window;

  await window.showApplications();
  assert.equal(document.getElementById("btn-applications-back").hidden, false);

  window.openApplicationDetail(1);
  assert.equal(document.getElementById("btn-applications-back").hidden, true,
    "only the detail view's own back button should show while viewing one application");
  assert.equal(document.getElementById("application-detail").hidden, false);

  window.closeApplicationDetail();
  assert.equal(document.getElementById("btn-applications-back").hidden, false);
  assert.equal(document.getElementById("application-detail").hidden, true);
});

// ── Roadmap: items append instead of replacing each other ───────────────

const FAKE_ANALYSIS = {
  limit_reached: false, remaining: 2, quota: 3, jd_text: "resolved jd text", analysis_id: 42,
  ats: { score: 70, matched: ["SQL"], missing: ["dbt"], verdict: "Decent." },
  xyz: { passing: [], failing: [], rewrites: [] },
  tools: { SQL: "strong" },
  level: { assessment: "Junior", reasoning: "Some production experience." },
};

async function runAnalysis(window, document) {
  document.getElementById("jd_text").value = "x".repeat(150);
  await window.analyzeCV();
}

const ROADMAP_RESPONSES = {
  1: { title: "CV Fixes", fixes: [{ issue: "x", before: "", after: "y" }], is_last: false },
  2: { title: "Phone Screen Prep", text: "### Phone Screen Strategy\nSay hi.", is_last: false },
  3: { title: "Technical Interview Prep", text: "### Technical Interview Prep\nStudy SQL.", is_last: false },
  4: { title: "Target Companies", text: "### Target Companies\nAcme.", is_last: true },
};

function loadRoadmapDom() {
  let fetchCount = 0;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => FAKE_ANALYSIS,
      "/api/roadmap-item": (body) => { fetchCount += 1; return ROADMAP_RESPONSES[body.item]; },
      "/api/quota-status": () => ({ remaining: 1, quota: 3, price_per_check_tiyin: 1000000 }),
    }),
  });
  return { dom, getFetchCount: () => fetchCount };
}

test("the roadmap shows one item at a time (carousel), not all of them stacked", async () => {
  const { dom } = loadRoadmapDom();
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);

  window.startRoadmap();
  await flush();
  const area = document.getElementById("roadmap-area");
  assert.match(area.innerHTML, /CV Fixes/);
  assert.ok(!area.innerHTML.includes("Phone Screen Strategy"), "later items must not be visible yet");
  assert.match(area.innerHTML, /1 \/ 4/, "counter should show step 1 of 4 for a Junior roadmap");
});

test("clicking Next fetches and shows the next item, replacing the previous one", async () => {
  const { dom } = loadRoadmapDom();
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  window.startRoadmap();
  await flush();

  window.loadRoadmapItem(2);
  await flush();
  const area = document.getElementById("roadmap-area");
  assert.match(area.innerHTML, /Phone Screen Strategy/);
  assert.ok(!area.innerHTML.includes("CV Fixes"), "item 1 should no longer be shown once on item 2");
  assert.match(area.innerHTML, /2 \/ 4/);
});

test("Prev returns to an already-fetched item instantly, without a new API call", async () => {
  const { dom, getFetchCount } = loadRoadmapDom();
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  window.startRoadmap();
  await flush();
  window.loadRoadmapItem(2);
  await flush();
  // 3, not 2: items 1 and 2 each fetched once, plus item 2's render chains
  // into a background prefetch of item 3 - the same "one ahead" mechanism
  // exercised in the dedicated prefetch test above. Nothing below this
  // point should add a 4th call.
  assert.equal(getFetchCount(), 3, "items 1 and 2 should each have been fetched once (plus item 2 prefetching item 3)");

  window.loadRoadmapItem(1); // Prev
  await flush();
  const area = document.getElementById("roadmap-area");
  assert.match(area.innerHTML, /CV Fixes/);
  assert.match(area.innerHTML, /1 \/ 4/);
  assert.equal(getFetchCount(), 3, "going back to item 1 must be served from cache, not re-fetched");

  window.loadRoadmapItem(2); // forward again - also cached
  await flush();
  assert.equal(getFetchCount(), 3, "revisiting item 2 must also be served from cache");
});

test("the next roadmap item is prefetched in the background while the current one is on screen - Next doesn't wait, and doesn't double-fetch", async () => {
  const callsPerItem = {};
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => FAKE_ANALYSIS,
      "/api/roadmap-item": (body) => {
        callsPerItem[body.item] = (callsPerItem[body.item] || 0) + 1;
        return ROADMAP_RESPONSES[body.item];
      },
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);

  window.startRoadmap();
  await flush(6); // let item 1 render AND its background prefetch of item 2 resolve
  assert.deepEqual(callsPerItem, { 1: 1, 2: 1 }, "item 2 should already be fetched in the background before Next is ever clicked");
  assert.match(document.getElementById("roadmap-area").innerHTML, /CV Fixes/, "the visible screen must still show item 1 - prefetching must not jump the UI ahead");

  window.loadRoadmapItem(2);
  await flush();
  // Item 3 shows up here too: rendering item 2 (is_last: false) chains into
  // prefetching item 3, the same mechanism one item ahead - intended, every
  // "Next" should feel instant, not just the first one. The actual point of
  // this assertion is item 2 staying at exactly 1 - reusing its prefetch,
  // never fetching it a second time.
  assert.deepEqual(callsPerItem, { 1: 1, 2: 1, 3: 1 }, "clicking Next must reuse item 2's prefetch rather than re-fetching it");
  assert.match(document.getElementById("roadmap-area").innerHTML, /Phone Screen Strategy/);
});

test("Prev is disabled on the first item; Next is disabled on the last", async () => {
  const { dom } = loadRoadmapDom();
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  window.startRoadmap();
  await flush();

  const navButtons = () => document.getElementById("roadmap-area").querySelectorAll(".nav-row button");
  assert.equal(navButtons()[0].disabled, true, "Prev must be disabled on item 1");
  assert.equal(navButtons()[1].disabled, false);

  window.loadRoadmapItem(2);
  await flush();
  window.loadRoadmapItem(3);
  await flush();
  window.loadRoadmapItem(4);
  await flush(5);
  assert.equal(navButtons()[0].disabled, false, "Prev must be enabled once past item 1");
  assert.equal(navButtons()[1].disabled, true, "Next must be disabled on the last item");
});

test("each roadmap-item request threads the analysis_id through, for My Checks history", async () => {
  const seenAnalysisIds = [];
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => FAKE_ANALYSIS,
      "/api/roadmap-item": (body) => {
        seenAnalysisIds.push(body.analysis_id);
        return ROADMAP_RESPONSES[body.item];
      },
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  window.startRoadmap();
  await flush();
  window.loadRoadmapItem(2);
  await flush();
  // 3 calls, not 2: item 1, item 2, and item 2's render chaining into a
  // background prefetch of item 3 - every one of them must still carry
  // the same analysis_id, which is what this test actually checks.
  assert.deepEqual(seenAnalysisIds, [42, 42, 42], "every roadmap-item call, including background prefetches, should carry the analysis_id from the initial analysis response");
});

test("the 'Get Roadmap' button disables itself immediately and stays disabled - real bug: it was clickable through its own load, letting an impatient double-click fire two concurrent requests", async () => {
  const { dom } = loadRoadmapDom();
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  const btn = document.getElementById("get_roadmap_btn");
  assert.equal(btn.disabled, false, "enabled before the first click");
  window.startRoadmap();
  assert.equal(btn.disabled, true, "must disable synchronously on click, before the fetch even resolves - that's the whole point");
  await flush();
  assert.equal(btn.disabled, true, "must stay disabled once the roadmap has loaded - clicking it again would only wipe cached progress, never help");
});

test("a stale roadmap-item response (from a request superseded by a newer one) never overwrites the carousel - the actual root cause of 'Next got stuck' / 'thrown back to 1/4'", async () => {
  // A fetch mock with fine-grained control over WHEN each request resolves,
  // so we can force the exact out-of-order scenario reported: an earlier
  // request (item 1) resolving AFTER a later one (item 3) already rendered.
  const pendingResolvers = {}; // item number -> resolve function
  const fetchImpl = async (url, opts = {}) => {
    const pathname = new URL(url, "https://example.com/").pathname;
    if (pathname === "/api/cv-status") return { ok: true, status: 200, json: async () => ({ has_cv: true, lang: "en" }) };
    if (pathname === "/api/cv-jd-analysis") return { ok: true, status: 200, json: async () => FAKE_ANALYSIS };
    if (pathname === "/api/roadmap-item") {
      const body = JSON.parse(opts.body);
      const result = await new Promise((resolve) => { pendingResolvers[body.item] = resolve; });
      return { ok: true, status: 200, json: async () => result };
    }
    throw new Error(`No mock for ${pathname}`);
  };

  const dom = loadApp({ fetchImpl });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  document.getElementById("jd_text").value = "x".repeat(150);
  await window.analyzeCV();
  await flush();

  window.startRoadmap(); // dispatches the request for item 1, still pending
  await flush();
  window.loadRoadmapItem(3); // user (or a duplicate click) jumps to item 3, also still pending
  await flush();

  // The LATER request (item 3) resolves first...
  pendingResolvers[3]({ title: "Technical Interview Prep", text: "Item 3 content", is_last: false });
  await flush();
  assert.match(document.getElementById("roadmap-area").innerHTML, /Item 3 content/);

  // ...then the STALE, superseded item-1 request finally arrives late.
  pendingResolvers[1]({ title: "CV Fixes", fixes: [], is_last: false });
  await flush();
  assert.match(document.getElementById("roadmap-area").innerHTML, /Item 3 content/,
    "a late-arriving stale response must be discarded, not silently snap the carousel back to an earlier item");
});

// ── Post-roadmap flow: no more dead end ──────────────────────────────────

test("finishing the roadmap with checks remaining offers 'analyze another job'", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => FAKE_ANALYSIS,
      "/api/roadmap-item": () => ({ title: "Target Companies", text: "Acme.", is_last: true }),
      "/api/quota-status": () => ({ remaining: 2, quota: 3, price_per_check_tiyin: 1000000 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  window.startRoadmap();
  await flush(6);

  const area = document.getElementById("roadmap-area");
  assert.match(area.innerHTML, /Analyze another job/);
  assert.equal(document.getElementById("nav-checks").textContent, "🎫 2 checks", "header badge should refresh after roadmap completion");
});

test("finishing the roadmap at zero checks routes straight into buying more", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => FAKE_ANALYSIS,
      "/api/roadmap-item": () => ({ title: "Target Companies", text: "Acme.", is_last: true }),
      "/api/quota-status": () => ({ remaining: 0, quota: 3, price_per_check_tiyin: 1000000 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  window.startRoadmap();
  await flush(6);

  assert.ok(document.getElementById("buy-checks-box"), "a buy-checks box should render when out of free checks");
});

// ── Checks-remaining visibility in the header ────────────────────────────

test("a successful analysis updates the header checks badge", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => FAKE_ANALYSIS,
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  assert.equal(document.getElementById("nav-checks").textContent, "🎫 2 checks");
});

test("hitting the free-check limit during analysis shows the buy-checks flow, not the results", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cv-jd-analysis": () => ({ limit_reached: true, remaining: 0, quota: 3 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.goToAnalysis();
  await runAnalysis(window, document);
  assert.ok(document.getElementById("buy-checks-box"), "should route straight to buying more checks");
  assert.equal(document.getElementById("jd-input-box").hidden, true);
});

// ── Buy-checks screen: 2 presets + a custom-amount stepper ───────────────

test("the buy-checks screen offers exactly 2 presets (1 and 10 checks), not a wall of options", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/quota-status": () => ({ remaining: 0, quota: 3, price_per_check_tiyin: 1000000 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showChecksScreen();
  const buttons = [...document.querySelectorAll("#buy-checks-box button")].map(b => b.textContent);
  assert.equal(buttons.filter(t => /check/.test(t)).length, 2, `expected exactly 2 check-quantity presets, got: ${buttons}`);
  assert.ok(buttons.some(t => /^1 check/.test(t)), "1-check preset missing");
  assert.ok(buttons.some(t => /^10 checks/.test(t)), "10-check preset missing");
});

test("the custom-amount stepper defaults to 1, and +/- adjust both the count and the shown price", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/quota-status": () => ({ remaining: 0, quota: 3, price_per_check_tiyin: 1000000 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showChecksScreen();
  window.showCustomChecksInput();

  const input = document.getElementById("custom_checks_input");
  const priceEl = document.getElementById("custom-checks-price");
  assert.equal(input.value, "1", "stepper should default to 1, not an empty box");
  assert.equal(priceEl.textContent, "Total: 10,000 UZS");

  window.adjustCustomChecks(1);
  assert.equal(input.value, "2");
  assert.equal(priceEl.textContent, "Total: 20,000 UZS", "price should recompute on every +/- click");

  window.adjustCustomChecks(-1);
  window.adjustCustomChecks(-1);
  assert.equal(input.value, "1", "should clamp at the minimum of 1, not go to 0 or negative");
  assert.equal(priceEl.textContent, "Total: 10,000 UZS");
});

test("buying checks shows a reassurance message and a real way to check payment status, not a dead end after openLink", async () => {
  let quotaCalls = 0;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/quota-status": () => {
        quotaCalls += 1;
        // Calls 1-3: showChecksScreen's own fetch, renderBuyChecks's price
        // fetch, buyChecks's "before" snapshot - all still unpaid (0).
        // Call 4+: checkPaymentStatus, simulating the payment having landed.
        return { remaining: quotaCalls >= 4 ? 3 : 0, quota: 3, price_per_check_tiyin: 1000000 };
      },
      "/api/checkout": () => ({ checkout_url: "https://checkout.paycom.uz/xyz", amount: 1000000, checks: 1 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showChecksScreen();

  await window.buyChecks(1);
  assert.equal(window.__lastOpenedLink, "https://checkout.paycom.uz/xyz", "must still hand off to the real checkout URL");
  const box = document.getElementById("buy-checks-box");
  assert.match(box.innerHTML, /Payme/, "should reassure the user before/after the external handoff, not just silently open a link");
  assert.ok(box.querySelector("button"), "should offer a way to check payment status, not strand the user");

  await window.checkPaymentStatus(0);
  assert.match(
    document.getElementById("checkout-status-result").innerHTML,
    /Payment received/,
    "once the remaining count actually goes up, it should say so - not leave the user guessing",
  );
});

test("checking payment status before it's actually landed says so plainly, not a false positive", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/quota-status": () => ({ remaining: 0, quota: 3, price_per_check_tiyin: 1000000 }),
      "/api/checkout": () => ({ checkout_url: "https://checkout.paycom.uz/xyz", amount: 1000000, checks: 1 }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showChecksScreen();
  await window.buyChecks(1);

  await window.checkPaymentStatus(0);
  assert.match(
    document.getElementById("checkout-status-result").innerHTML,
    /Not confirmed yet/,
    "must not falsely claim success when the remaining count hasn't actually moved",
  );
});

// ── My CVs ────────────────────────────────────────────────────────────

const FAKE_CVS = [
  { id: 2, label: "resume_v2.pdf", is_active: true, extracted_position: "Data Analyst", created_at: "2026-09-07T00:00:00" },
  { id: 1, label: "resume_v1.pdf", is_active: false, extracted_position: null, created_at: "2026-09-01T00:00:00" },
];

test("My CVs list shows only filename and date - no position/active/actions until you open one", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cvs": () => ({ cvs: FAKE_CVS }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyCvs();
  const html = document.getElementById("my-cvs-list").innerHTML;
  assert.match(html, /resume_v2\.pdf/);
  assert.match(html, /resume_v1\.pdf/);
  assert.match(html, /openCvDetail\(1\)/, "each row must be clickable into a detail view");
  assert.ok(!html.includes("Data Analyst"), "the list itself must not show the extracted position");
  assert.ok(!html.includes("activateCv"), "the list itself must not show activate/delete actions");
});

test("opening a CV's detail shows filename, date, extracted position, and 'use this CV' only if inactive", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cvs": () => ({ cvs: FAKE_CVS }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyCvs();

  window.openCvDetail(1); // inactive CV, no extracted position
  let html = document.getElementById("my-cvs-detail").innerHTML;
  assert.match(html, /resume_v1\.pdf/);
  assert.match(html, /activateCv\(1\)/, "an inactive CV must offer 'use this CV'");
  assert.match(html, /confirmDeleteCv\(1\)/, "delete must always be offered");
  assert.equal(document.getElementById("my-cvs-list-section").hidden, true);

  window.closeCvDetail();
  assert.equal(document.getElementById("my-cvs-list-section").hidden, false);

  window.openCvDetail(2); // active CV, has an extracted position
  html = document.getElementById("my-cvs-detail").innerHTML;
  assert.match(html, /Data Analyst/, "the extracted position must show in the detail view");
  assert.ok(!html.includes("activateCv(2)"), "an already-active CV must not offer to activate itself");
});

test("activating a CV from its detail view calls set-active", async () => {
  let setActiveCalledWith = null;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cvs": () => ({ cvs: FAKE_CVS }),
      "/api/cvs/set-active": (body) => { setActiveCalledWith = body.cv_id; return { updated: true }; },
    }),
  });
  await flush();
  const { window } = dom.window;
  await window.showMyCvs();
  window.openCvDetail(1);
  await window.activateCv(1);
  assert.equal(setActiveCalledWith, 1);
});

test("deleting a CV from its detail view requires confirmation before calling the delete endpoint", async () => {
  let deleteCalled = false;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cvs": () => ({ cvs: FAKE_CVS }),
      "/api/cvs/delete": () => { deleteCalled = true; return { deleted: true }; },
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyCvs();
  window.openCvDetail(1);

  window.confirmDeleteCv(1);
  assert.equal(deleteCalled, false, "delete must not fire before confirmation");
  assert.match(document.getElementById("cv-detail-action-result").innerHTML, /deleteCvNow\(1\)/);

  await window.deleteCvNow(1);
  assert.equal(deleteCalled, true);
});

test("uploading a new CV from the My CVs screen refreshes the list instead of navigating away", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/cvs": () => ({ cvs: FAKE_CVS }),
      "/api/upload-cv": () => ({ saved: true }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyCvs();
  const file = new window.File(["cv text"], "new_resume.pdf", { type: "application/pdf" });
  Object.defineProperty(document.getElementById("new_cv_file"), "files", { value: [file] });
  await window.uploadNewCv();
  await flush();
  assert.equal(document.getElementById("my-cvs-screen").hidden, false, "should stay on My CVs, not navigate to home");
});

// ── Bottom tab bar ────────────────────────────────────────────────────

test("checks-remaining and Profile are two separate screens, not bundled together", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;

  window.showProfile();
  assert.equal(document.getElementById("profile-screen").hidden, false);
  assert.equal(document.getElementById("checks-screen").hidden, true);
  assert.match(document.getElementById("profile-screen").innerHTML, /showMyCvs\(\)/);
  assert.match(document.getElementById("profile-screen").innerHTML, /showApplications\(\)/);
  assert.ok(!document.getElementById("profile-screen").innerHTML.includes("renderBuyChecks"),
    "Profile itself must not render the checks-remaining/buy-more UI - that lives on checks-screen only");

  await window.showChecksScreen();
  assert.equal(document.getElementById("checks-screen").hidden, false);
  assert.equal(document.getElementById("profile-screen").hidden, true);
});

test("tapping each tab shows the right screen and highlights only that tab", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;

  const activeTabId = () => [...document.querySelectorAll(".tab-btn")].find(b => b.classList.contains("active"))?.id;

  window.activateTab("search");
  assert.equal(document.getElementById("title-screen").hidden, false);
  assert.equal(activeTabId(), "tab-search");

  window.activateTab("analyze");
  assert.equal(document.getElementById("analysis-screen").hidden, false);
  assert.equal(activeTabId(), "tab-analyze");

  window.activateTab("profile");
  assert.equal(document.getElementById("profile-screen").hidden, false);
  assert.equal(activeTabId(), "tab-profile");

  window.activateTab("home");
  assert.equal(document.getElementById("home-screen").hidden, false);
  assert.equal(activeTabId(), "tab-home");
});

test("Home's shortcut buttons highlight the same tab that tapping the tab bar directly would", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: true, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;

  window.goToVacancySearch(); // Home screen's "Find vacancies" button calls this directly
  assert.equal(document.getElementById("tab-search").classList.contains("active"), true);

  window.goToAnalysis(); // Home screen's "Analyze CV" button
  assert.equal(document.getElementById("tab-analyze").classList.contains("active"), true);
});

test("the tab bar is hidden during welcome/loading but visible everywhere else, including cv-gate", async () => {
  const dom = loadApp({ fetchImpl: defaultFetchMock({ "/api/cv-status": () => ({ has_cv: false, lang: "en" }) }) });
  await flush();
  const { document, window } = dom.window;
  assert.equal(document.getElementById("tab-bar").hidden, true, "hidden on welcome-screen");

  window.showScreen("cv-gate");
  assert.equal(document.getElementById("tab-bar").hidden, false, "visible on cv-gate so users can navigate away mid-upload");
});

// ── My Checks (analysis history) ─────────────────────────────────────────

const FAKE_CHECKS = [
  {
    id: 2,
    jd_text: "Senior Data Analyst at Acme Corp, remote, own the whole reporting stack end to end.",
    level: { assessment: "Mid" },
    created_at: "2026-09-07T00:00:00",
  },
  {
    id: 1,
    jd_text: "Junior BI Developer",
    level: { assessment: "Junior" },
    created_at: "2026-09-01T00:00:00",
  },
];

const FAKE_CHECK_DETAIL = {
  id: 1,
  jd_text: "Junior BI Developer",
  ats: { score: 62, matched: ["SQL"], missing: ["Tableau"], verdict: "Decent start." },
  xyz: { passing: [], failing: [], rewrites: [] },
  tools: { SQL: "strong", Tableau: "not_found" },
  level: { assessment: "Junior", reasoning: "Early career." },
  roadmap_items: {
    "1": { title: "CV Fixes", fixes: [{ issue: "No metrics", before: "Did dashboards", after: "Built 5 dashboards used by 3 teams" }] },
    "2": { title: "Phone Screen Prep", text: "### Phone Screen Strategy\nOpening line: say hi." },
  },
  created_at: "2026-09-01T00:00:00",
};

test("My Checks list shows a JD preview, level, and date - each card opens its detail view", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/checks": () => ({ checks: FAKE_CHECKS }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyChecks();
  const html = document.getElementById("my-checks-list").innerHTML;
  assert.match(html, /Senior Data Analyst/);
  assert.match(html, /Mid/);
  assert.match(html, /openCheckDetail\(1\)/);
});

test("an empty check history explains why and offers a button straight into the analysis flow", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/checks": () => ({ checks: [] }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyChecks();
  const html = document.getElementById("my-checks-list").innerHTML;
  assert.match(html, /haven't checked a CV yet/i);
  assert.match(html, /onclick="goToAnalysis\(\)"/);

  window.document.getElementById("my-checks-list").querySelector("button").click();
  assert.equal(document.getElementById("analysis-screen").hidden, false, "the CTA button must actually navigate to the analysis screen");
});

test("opening a check's detail shows the full JD, ATS/XYZ/Tools/Level, and every saved roadmap item", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/checks": () => ({ checks: FAKE_CHECKS }),
      "/api/checks/get": () => FAKE_CHECK_DETAIL,
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyChecks();
  await window.openCheckDetail(1);
  const html = document.getElementById("my-checks-detail").innerHTML;
  assert.match(html, /Junior BI Developer/);
  assert.match(html, /62\/100/);
  assert.match(html, /CV Fixes/);
  assert.match(html, /Phone Screen Strategy/);
  assert.equal(document.getElementById("my-checks-list-section").hidden, true, "list must hide while detail is open");
});

test("closing a check's detail restores the list", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/checks": () => ({ checks: FAKE_CHECKS }),
      "/api/checks/get": () => FAKE_CHECK_DETAIL,
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyChecks();
  await window.openCheckDetail(1);
  window.closeCheckDetail();
  assert.equal(document.getElementById("my-checks-detail").hidden, true);
  assert.equal(document.getElementById("my-checks-list-section").hidden, false);
});

test("deleting a check requires confirmation before calling the delete endpoint", async () => {
  let deleteCalled = false;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/checks": () => ({ checks: FAKE_CHECKS }),
      "/api/checks/get": () => FAKE_CHECK_DETAIL,
      "/api/checks/delete": () => { deleteCalled = true; return { deleted: true }; },
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showMyChecks();
  await window.openCheckDetail(1);

  window.confirmDeleteCheck(1);
  assert.equal(deleteCalled, false, "delete must not fire before confirmation");
  assert.match(document.getElementById("check-detail-action-result").innerHTML, /deleteCheckNow\(1\)/);

  await window.deleteCheckNow(1);
  assert.equal(deleteCalled, true);
});

// ── Vacancy Alerts (Profile > Vacancy Alerts) ────────────────────────

test("Vacancy Alerts screen pre-fills from saved criteria", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: "Data Analyst", location: "Tashkent", alerts_enabled: true }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showVacancyAlerts();
  assert.equal(document.getElementById("alerts_job_title").value, "Data Analyst");
  assert.equal(document.getElementById("alerts_location").value, "Tashkent");
  assert.equal(document.getElementById("alerts_enabled_toggle").checked, true);
});

test("Vacancy Alerts screen falls back to the last live search's title when nothing is saved yet", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: null, location: null, alerts_enabled: false }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.pickTitle("Data Analyst"); // the real action that sets state.jobTitle during a live search
  await window.showVacancyAlerts();
  assert.equal(document.getElementById("alerts_job_title").value, "Data Analyst");
  assert.equal(document.getElementById("alerts_enabled_toggle").checked, false, "no saved criteria means alerts must not silently turn on");
});

test("saving alerts with the toggle on but no job title is rejected client-side, no API call made", async () => {
  let saveCalled = false;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: null, location: null, alerts_enabled: false }),
      "/api/saved-search/save": () => { saveCalled = true; return { saved: true }; },
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showVacancyAlerts();
  document.getElementById("alerts_job_title").value = "";
  document.getElementById("alerts_enabled_toggle").checked = true;
  await window.saveVacancyAlerts();
  assert.equal(saveCalled, false, "must not call the API with alerts on and no title");
  assert.match(document.getElementById("vacancy-alerts-result").innerHTML, /job title/i);
});

test("saving valid alert settings calls the API with the trimmed values and confirms", async () => {
  let savedBody = null;
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: null, location: null, alerts_enabled: false }),
      "/api/saved-search/save": (body) => { savedBody = body; return { saved: true }; },
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showVacancyAlerts();
  document.getElementById("alerts_job_title").value = "Data Analyst";
  document.getElementById("alerts_location").value = "Tashkent";
  document.getElementById("alerts_enabled_toggle").checked = true;
  await window.saveVacancyAlerts();
  assert.equal(savedBody.job_title, "Data Analyst");
  assert.equal(savedBody.location, "Tashkent");
  assert.equal(savedBody.alerts_enabled, true);
  const html = document.getElementById("vacancy-alerts-result").innerHTML;
  assert.match(html, /Data Analyst/, "confirmation must repeat back which job title was saved");
  assert.match(html, /Tashkent/, "confirmation must repeat back which location was saved");
  assert.match(html, /once a day/i, "confirmation must say how often alerts fire");
  assert.match(html, /09:00/, "confirmation must say roughly when alerts fire");
});

test("saving with alerts off confirms without implying a notification schedule", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: null, location: null, alerts_enabled: false }),
      "/api/saved-search/save": () => ({ saved: true }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showVacancyAlerts();
  document.getElementById("alerts_job_title").value = "Data Analyst";
  document.getElementById("alerts_enabled_toggle").checked = false;
  await window.saveVacancyAlerts();
  const html = document.getElementById("vacancy-alerts-result").innerHTML;
  assert.match(html, /Data Analyst/);
  assert.match(html, /off/i);
  assert.ok(!html.includes("once a day"), "must not claim a notification schedule when alerts are off");
});

test("saving with no location doesn't leave a dangling 'in' in the confirmation", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: null, location: null, alerts_enabled: false }),
      "/api/saved-search/save": () => ({ saved: true }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  await window.showVacancyAlerts();
  document.getElementById("alerts_job_title").value = "Data Analyst";
  document.getElementById("alerts_location").value = "";
  document.getElementById("alerts_enabled_toggle").checked = true;
  await window.saveVacancyAlerts();
  const html = document.getElementById("vacancy-alerts-result").innerHTML;
  assert.match(html, /Data Analyst/);
  assert.ok(!/\bin\s*,/.test(html) && !html.includes(" in -"), "an empty location must not leave a dangling 'in'");
});

test("Vacancy Alerts is reachable as Profile's 4th menu item and highlights the Profile tab", async () => {
  const dom = loadApp({
    fetchImpl: defaultFetchMock({
      "/api/cv-status": () => ({ has_cv: true, lang: "en" }),
      "/api/saved-search": () => ({ job_title: null, location: null, alerts_enabled: false }),
    }),
  });
  await flush();
  const { document, window } = dom.window;
  window.showVacancyAlerts();
  await flush();
  assert.equal(document.getElementById("vacancy-alerts-screen").hidden, false);
  assert.ok(document.getElementById("tab-profile").classList.contains("active"), "Profile tab should stay highlighted");
});
