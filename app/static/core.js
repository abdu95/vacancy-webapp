// Shared app bootstrap: Telegram WebApp handle, global `state`, screen
// routing, and the utilities every feature file calls (callApi,
// friendlyError, escapeHtml, scrollToBottom, checks-header helpers).
// Split out of one 1897-line app.js (2026-09-07) into index.html's other
// <script> files (i18n.js, cv-upload.js, my-cvs, analysis.js,
// vacancy-search.js, applications.js, checks.js, vacancy-alerts.js) -
// no bundler, so these are plain scripts sharing one global scope, not
// ES modules. Function declarations are hoisted-equivalent across
// script tags (whichever loads first still defines a global everyone
// else can call later, since nothing here runs a cross-file function at
// its own top level - only inside onclick handlers / async callbacks,
// by which point every script has finished loading). The one real
// ordering constraint: i18n.js's `t()`/`I18N` must load BEFORE this
// file, because checkCVAndRoute() below calls t() synchronously in its
// very first branch (no Telegram context) - so index.html loads i18n.js
// first and this file last.
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  jobTitle: "", seenCompanies: [], searchCount: 0, lastSearchLocation: null,
  vacancies: [], vacancyIndex: -1, improveCount: 0,
  jd: "", analysisLevel: "", analysisRemaining: null, analysisQuota: null, currentAnalysisId: null,
  hasCv: false, postUploadDestination: null,
  roadmapItems: [], roadmapIndex: -1, roadmapRequestSeq: 0, roadmapPrefetch: {},
};
const MAX_SEARCHES = 3;
const MAX_IMPROVES = 2;
const CHECK_QUANTITY_PRESETS = [1, 10];
const MIN_CHECKS_PURCHASE = 1;
const MAX_CHECKS_PURCHASE = 100;

const ALL_SCREENS = [
  "loading-gate", "welcome-screen", "cv-gate", "home-screen", "checks-screen",
  "profile-screen", "my-cvs-screen", "my-checks-screen", "vacancy-alerts-screen", "analysis-screen",
  "title-screen", "search-screen", "applications-screen",
];

// Maps a screen to the bottom tab it belongs to, so the right tab stays
// highlighted regardless of how the screen was reached (tapping a tab
// directly, or tapping one of Home's two shortcut buttons, which lead
// to the exact same screens). Screens with no entry here (cv-gate,
// checks-screen) don't change which tab is shown as active.
const SCREEN_TO_TAB = {
  "home-screen": "home",
  "title-screen": "search", "search-screen": "search",
  "analysis-screen": "analyze",
  "profile-screen": "profile", "my-cvs-screen": "profile",
  "my-checks-screen": "profile", "applications-screen": "profile",
  "vacancy-alerts-screen": "profile",
};

const HIDE_TAB_BAR_ON = new Set(["loading-gate", "welcome-screen"]);

function showScreen(id) {
  for (const s of ALL_SCREENS) {
    document.getElementById(s).hidden = (s !== id);
  }
  document.getElementById("tab-bar").hidden = HIDE_TAB_BAR_ON.has(id);
  const tab = SCREEN_TO_TAB[id];
  if (tab) {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
  }
}

// Single entry point for the bottom tab bar - each tab just re-runs the
// same navigation a Home-screen shortcut button would, so both paths
// into Search/Analyze always agree on where they land.
function activateTab(tab) {
  if (tab === "home") goHome();
  else if (tab === "search") goToVacancySearch();
  else if (tab === "analyze") goToAnalysis();
  else if (tab === "profile") showProfile();
}

function goHome() { showScreen("home-screen"); }

// Deliberately does NOT gate on hasCv: the point of leading with vacancy
// search is to let a brand-new user see real value (actual matching
// postings) before asking for anything as sensitive as a CV upload.
// Typing your own job title needs no CV at all; "check fit" and
// "suggest titles from my CV" are the only two steps in this flow that
// actually need one, and each gates for it individually, right when
// it's needed - not before search even starts.
function goToVacancySearch() {
  showScreen("title-screen");
}

function goToAnalysis() {
  if (!state.hasCv) {
    state.postUploadDestination = "analysis";
    showScreen("cv-gate");
    return;
  }
  document.getElementById("jd-input-box").hidden = false;
  document.getElementById("analysis-result").innerHTML = "";
  showScreen("analysis-screen");
  updateActiveCvIndicator();
}

// Shows which CV will actually be used, since with multiple saved CVs
// there was previously no way to tell from the Analyze screen itself -
// tapping it goes straight to My CVs to switch. Best-effort: a failed
// fetch just leaves the indicator hidden rather than blocking analysis.
async function updateActiveCvIndicator() {
  const btn = document.getElementById("active-cv-indicator");
  btn.hidden = true;
  try {
    const data = await callApi("/api/cvs", {});
    const active = (data.cvs || []).find(cv => cv.is_active);
    if (!active) return;
    btn.textContent = t("active_cv_indicator", { label: active.label });
    btn.hidden = false;
  } catch (err) {
    console.error("Couldn't load the active CV indicator:", err);
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
}

function updateChecksHeader(remaining) {
  const badge = document.getElementById("nav-checks");
  badge.textContent = `🎫 ${checksLabel(remaining)}`;
  badge.hidden = false;
}

async function refreshChecksHeader() {
  try {
    const q = await callApi("/api/quota-status", {});
    updateChecksHeader(q.remaining, q.quota);
    return q;
  } catch (err) {
    console.error("Couldn't load quota status for header:", err);
    return null;
  }
}

async function checkCVAndRoute() {
  if (!tg || !tg.initData) {
    document.getElementById("loading-gate").innerHTML =
      `<div class="error">${escapeHtml(t("open_from_bot"))}</div>`;
    return;
  }
  try {
    const res = await fetch("/api/cv-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData }),
    });
    if (!res.ok) throw new Error("status check failed");
    const data = await res.json();
    currentLang = data.lang || "en";
    applyStaticTranslations();
    state.hasCv = data.has_cv;

    const userInfo = tg.initDataUnsafe?.user;
    if (userInfo) {
      document.getElementById("greeting").textContent = t("greeting", { name: userInfo.first_name });
    }

    showScreen(data.has_cv ? "home-screen" : "welcome-screen");
    const q = await refreshChecksHeader();
    // State the free-check count up front, right on the first screen a
    // new user sees - previously invisible until they opened the checks
    // badge or hit the wall mid-analysis.
    if (!data.has_cv && q) {
      const bodyEl = document.getElementById("welcome-body");
      bodyEl.textContent = `${bodyEl.textContent} ${t("welcome_free_checks_line", { quota: q.quota })}`;
    }
  } catch (err) {
    console.error("CV status check failed:", err);
    document.getElementById("loading-gate").innerHTML = `
      <div class="error">⚠️ ${escapeHtml(friendlyError(err, t("couldnt_load_profile")))}</div>
      <button onclick="checkCVAndRoute()">${escapeHtml(t("retry_btn"))}</button>
    `;
  }
}
checkCVAndRoute();

// Profile is now a plain hub tab: My CVs / My Checks / My Applications.
// Checks-remaining lives on its own screen (checks-screen, behind the
// header's 🔔), not bundled in here - they're two different things.
function showProfile() {
  showScreen("profile-screen");
}
async function callApi(path, body, btn) {
  if (btn) btn.disabled = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: tg.initData, ...body }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error("API call failed:", path, res.status, errBody);
      const err = new Error(errBody.detail || "");
      if (res.status === 401) err.sessionExpired = true;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
    if (btn) btn.disabled = false;
  }
}

// Maps any thrown error into a specific, non-technical message. Never
// shows raw server/network text to the user (that goes to console only).
// Note: `fallback` is already-localized text from the call site; only
// backend `detail` strings (err.message) remain English-only for now.
function friendlyError(err, fallback) {
  if (err && err.name === "AbortError") return t("err_timeout");
  if (err instanceof TypeError) return t("err_network");
  if (err && err.sessionExpired) return t("err_session_expired");
  if (err && typeof err.message === "string" && err.message.trim()) return err.message;
  return fallback || t("err_generic");
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}
