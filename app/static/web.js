// Browser (non-Telegram) mode, at app.chashma.uz: Sign in with Google,
// the one-screen onboarding (name + language), sign-out, and the waitlist
// that replaces buying checks for web users (Payme takes Uzbek cards only).
// Loaded before core.js; core.js's IS_WEB decides whether any of this runs.
// Inside Telegram none of it is reached - every request carries initData.

const WEB_LANGS = ["en", "uz", "ru"];
const WEB_LANG_NAMES = { en: "English", uz: "O'zbekcha", ru: "Русский" };
let webFreeLimit = 10;  // replaced by /api/web-config's value once loaded

// navigator.language ("uz-UZ", "ru", "en-US", "de"...) -> one of our three.
function browserLanguage(navLang) {
  const code = String(navLang || "").toLowerCase();
  if (code.startsWith("uz")) return "uz";
  if (code.startsWith("ru")) return "ru";
  return "en";
}

// The landing page's "Use in browser" button passes ?lang=<page language>,
// which wins over the browser's own setting.
function initialWebLanguage() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  return WEB_LANGS.includes(fromUrl) ? fromUrl : browserLanguage(navigator.language);
}

function languageSelectHtml(id, selected) {
  return `<select id="${id}">${WEB_LANGS.map(code =>
    `<option value="${code}"${code === selected ? " selected" : ""}>${WEB_LANG_NAMES[code]}</option>`
  ).join("")}</select>`;
}

// Resolves true once a signed-in, onboarded user can see the app; false
// when it has shown the sign-in or onboarding screen instead (each of
// those calls checkCVAndRoute() again when done).
async function ensureWebSession() {
  const res = await fetch("/api/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.status === 401) {
    await showSignIn();
    return false;
  }
  if (!res.ok) throw new Error("account check failed");
  const me = await res.json();
  state.webAccount = me;
  if (me.needs_onboarding) {
    showOnboarding(me.name);
    return false;
  }
  return true;
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Google sign-in"));
    document.head.appendChild(s);
  });
}

function renderSignInTexts() {
  document.getElementById("signin-title").textContent = t("signin_title");
  document.getElementById("signin-body").textContent = t("signin_body", { quota: webFreeLimit });
  document.getElementById("signin-lang").innerHTML = languageSelectHtml("signin-lang-select", currentLang);
  document.getElementById("signin-lang-select").onchange = (e) => {
    currentLang = e.target.value;
    renderSignInTexts();
    renderGoogleButton();
  };
}

function renderGoogleButton() {
  const el = document.getElementById("google-signin-btn");
  el.innerHTML = "";
  if (!(window.google && window.google.accounts && window.google.accounts.id)) return;
  window.google.accounts.id.renderButton(el, {
    theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: currentLang,
  });
}

async function showSignIn() {
  currentLang = initialWebLanguage();
  renderSignInTexts();
  document.getElementById("signin-error").innerHTML = "";
  showScreen("signin-screen");
  try {
    const [config] = await Promise.all([
      fetch("/api/web-config").then(r => r.json()),
      loadGoogleScript(),
    ]);
    webFreeLimit = config.web_free_limit;
    renderSignInTexts();
    window.google.accounts.id.initialize({
      client_id: config.google_client_id,
      callback: onGoogleCredential,
      ux_mode: "popup",
    });
    renderGoogleButton();
  } catch (err) {
    console.error("Google sign-in setup failed:", err);
    showSignInError(t("signin_failed"));
  }
}

function showSignInError(message) {
  document.getElementById("signin-error").innerHTML =
    `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(message))}</div>`;
}

async function onGoogleCredential(response) {
  document.getElementById("signin-error").innerHTML = `<div class="hint">…</div>`;
  try {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.detail || t("signin_failed"));
    document.getElementById("signin-error").innerHTML = "";
    if (body.needs_onboarding) showOnboarding(body.name);
    else checkCVAndRoute();
  } catch (err) {
    console.error("Google sign-in failed:", err);
    showSignInError(friendlyError(err, t("signin_failed")));
  }
}

function renderOnboardingTexts() {
  document.getElementById("onboarding-title").textContent = t("onboarding_title");
  document.getElementById("onboarding-name-label").textContent = t("onboarding_name_label");
  document.getElementById("onboarding-lang-label").textContent = t("onboarding_lang_label");
  document.getElementById("onboarding-continue-btn").textContent = t("onboarding_continue");
}

function showOnboarding(suggestedName) {
  currentLang = initialWebLanguage();
  document.getElementById("onboarding-name").value = suggestedName || "";
  document.getElementById("onboarding-lang").innerHTML = languageSelectHtml("onboarding-lang-select", currentLang);
  document.getElementById("onboarding-lang-select").onchange = (e) => {
    currentLang = e.target.value;
    renderOnboardingTexts();
  };
  document.getElementById("onboarding-result").innerHTML = "";
  renderOnboardingTexts();
  showScreen("onboarding-screen");
}

async function submitOnboarding() {
  const btn = document.getElementById("onboarding-continue-btn");
  const resultEl = document.getElementById("onboarding-result");
  const name = document.getElementById("onboarding-name").value.trim();
  if (!name) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("onboarding_name_required"))}</div>`;
    return;
  }
  try {
    await callApi("/api/onboarding", { name, language: document.getElementById("onboarding-lang-select").value }, btn);
    checkCVAndRoute();
  } catch (err) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(friendlyError(err))}</div>`;
  }
}

// Profile extras for browser users: who's signed in, language, sign out.
function renderWebProfile() {
  const box = document.getElementById("profile-web-account");
  const me = state.webAccount || {};
  box.hidden = false;
  box.innerHTML = `
    <div class="hint">${escapeHtml(t("profile_signed_in_as", { email: me.email || "" }))}</div>
    <label for="profile-lang-select">${escapeHtml(t("onboarding_lang_label"))}</label>
    ${languageSelectHtml("profile-lang-select", currentLang)}
    <button class="secondary" id="signout-btn" onclick="signOut()">${escapeHtml(t("signout_btn"))}</button>
  `;
  document.getElementById("profile-lang-select").onchange = async (e) => {
    try {
      await callApi("/api/onboarding", { name: me.name || "", language: e.target.value });
      location.reload();
    } catch (err) {
      console.error("Couldn't change language:", err);
    }
  };
}

async function signOut() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    location.href = "/";
  }
}

// Shown wherever a Telegram user would get the buy-checks box.
function renderWaitlist(containerEl) {
  const already = state.webAccount && state.webAccount.waitlisted;
  containerEl.innerHTML = `
    <div id="waitlist-box">
      <div class="prompt-block">${escapeHtml(t(already ? "waitlist_joined" : "waitlist_intro"))}</div>
      ${already ? "" : `<button id="waitlist-btn" onclick="joinWaitlist()">${escapeHtml(t("waitlist_btn"))}</button>`}
    </div>
  `;
  scrollToBottom();
}

async function joinWaitlist() {
  const btn = document.getElementById("waitlist-btn");
  try {
    await callApi("/api/waitlist", {}, btn);
    if (state.webAccount) state.webAccount.waitlisted = true;
    document.getElementById("waitlist-box").innerHTML =
      `<div class="prompt-block">${escapeHtml(t("waitlist_joined"))}</div>`;
  } catch (err) {
    document.getElementById("waitlist-box").insertAdjacentHTML(
      "beforeend", `<div class="error">${escapeHtml(friendlyError(err))}</div>`);
  }
}
