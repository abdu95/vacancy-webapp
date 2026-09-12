// Job-title selection, the vacancy search carousel, and the post-"like
// it" decision flow (apply directly / check fit / get recommendations /
// improve CV) - one continuous feature, split from the rest of app.js
// but kept together here since each step leads into the next.

function showManualTitle() {
  document.getElementById("suggested-titles-box").hidden = true;
  document.getElementById("manual-title-box").hidden = false;
}

async function suggestTitles() {
  if (!state.hasCv) {
    state.postUploadDestination = "vacancy";
    showScreen("cv-gate");
    return;
  }
  document.getElementById("manual-title-box").hidden = true;
  const box = document.getElementById("suggested-titles-box");
  const chipsEl = document.getElementById("title-chips");
  const errEl = document.getElementById("title-error");
  box.hidden = false;
  errEl.innerHTML = "";
  chipsEl.innerHTML = `<div class="hint icon-row">${iconRow("sparkles", escapeHtml(t("analyzing_cv")))}</div>`;

  try {
    const data = await callApi("/api/suggest-titles", {});
    chipsEl.innerHTML = "";
    for (const title of data.titles) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = title;
      chip.onclick = () => pickTitle(title);
      chipsEl.appendChild(chip);
    }
  } catch (err) {
    console.error("Suggest titles failed:", err);
    chipsEl.innerHTML = "";
    errEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("suggestions_failed"))))}</div>`;
  }
}

function pickTitle(title) {
  if (!title) {
    document.getElementById("title-error").innerHTML = `<div class="error">${escapeHtml(t("enter_title_first"))}</div>`;
    return;
  }
  state.jobTitle = title;
  state.seenCompanies = [];
  state.vacancies = [];
  state.vacancyIndex = -1;
  state.improveCount = 0;
  state.lastSearchLocation = null;
  // The free-search cap is per title, not a hard daily wall: picking a
  // (new or different) title always starts with a fresh MAX_SEARCHES -
  // trying another title is the escape valve, not "come back tomorrow".
  state.searchCount = 0;
  document.getElementById("chosen-title-label").textContent = title;
  document.getElementById("result").innerHTML = "";
  showScreen("search-screen");
}

function backToTitleScreen() {
  showScreen("title-screen");
}

// Opened from a tapped vacancy-alert message's button (see core.js's
// checkCVAndRoute, which calls this for a ?alert_batch=<id> URL) - shows
// the exact vacancies that digest sent, same carousel as a live search,
// so the button leads somewhere specific instead of a bare home screen.
// Silently leaves the user on whatever screen checkCVAndRoute already
// picked if the batch is gone (old link, already expired) or the fetch
// fails - this is a bonus landing, not a blocking step.
async function openAlertBatch(batchId) {
  try {
    const data = await callApi("/api/alert-batch", { batch_id: batchId });
    if (!data.vacancies || data.vacancies.length === 0) return;
    state.jobTitle = data.job_title || "";
    state.seenCompanies = data.vacancies.map(v => v.company);
    state.vacancies = data.vacancies;
    state.vacancyIndex = 0;
    state.improveCount = 0;
    state.searchCount = 0;
    state.lastSearchLocation = data.location || null;
    document.getElementById("chosen-title-label").textContent = state.jobTitle;
    document.getElementById("location").value = (data.location && data.location !== "Any") ? data.location : "";
    showScreen("search-screen");
    renderVacancyCard();
  } catch (err) {
    console.error("Couldn't load alert batch, staying on the default screen:", err);
  }
}
// ── Search / vacancy carousel ────────────────────────────────────────
async function search() {
  const location = document.getElementById("location").value.trim() || "Any";
  const resultEl = document.getElementById("result");
  const btn = document.getElementById("search_btn");

  if (!tg || !tg.initData) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("open_from_bot"))}</div>`;
    return;
  }

  // Real bug (2026-09-10): changing location and searching again never
  // cleared the previous location's accumulated results. A location that
  // genuinely has nothing (0 new matches) fell through to the "no NEW
  // matches, here's what you already had" branch below and kept showing
  // the OLD location's card with no indication the new search found
  // nothing - e.g. switching from "Tashkent" (had a result) to "Europe"
  // (has none) silently kept showing the Tashkent card. A changed
  // location is a fresh search intent, same as picking a new title
  // already resets everything for (see pickTitle).
  if (location !== state.lastSearchLocation) {
    state.vacancies = [];
    state.seenCompanies = [];
    state.vacancyIndex = -1;
    state.searchCount = 0;
    state.lastSearchLocation = location;
  }

  if (state.searchCount >= MAX_SEARCHES) {
    resultEl.innerHTML = `<div class="hint">${escapeHtml(t("search_limit_session"))}</div>${searchCapCta()}`;
    return;
  }

  btn.disabled = true;
  resultEl.innerHTML = `<div class="hint icon-row">${iconRow("search", escapeHtml(t("searching_message", { title: state.jobTitle, location: location })))}</div>`;

  try {
    const data = await callApi("/api/search", {
      job_title: state.jobTitle,
      location: location,
      seen_companies: state.seenCompanies,
    });
    state.searchCount += 1;
    const newVacancies = data.vacancies || [];

    if (newVacancies.length === 0 && state.vacancies.length === 0) {
      resultEl.innerHTML = `<div class="hint">${escapeHtml(t("no_match_found"))}</div>`;
      return;
    }

    if (newVacancies.length > 0) {
      const startIndex = state.vacancies.length;
      state.vacancies.push(...newVacancies);
      for (const v of newVacancies) state.seenCompanies.push(v.company);
      state.vacancyIndex = startIndex;
    } else {
      resultEl.innerHTML = `<div class="hint">${escapeHtml(t("no_more_new_matches"))}</div>`;
    }
    state.improveCount = 0;
    renderVacancyCard();
  } catch (err) {
    console.error("Search error:", err);
    resultEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("search_failed"))))}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function currentVacancy() {
  return state.vacancies[state.vacancyIndex];
}

function showVacancy(index) {
  if (index < 0 || index >= state.vacancies.length) return;
  state.vacancyIndex = index;
  state.improveCount = 0;
  renderVacancyCard();
}

// Closes the loop between vacancy search and CV analysis (real user
// feedback: no way to take a vacancy found here into the deeper
// CV-vs-job analysis) - copies the posting's URL so it can be pasted
// into the Analyze tab's JD box, which already accepts a link.
async function copyVacancyUrl() {
  const url = currentVacancy().url;
  const resultEl = document.getElementById("copy-url-result");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      // Fallback for WebViews without the async Clipboard API.
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    resultEl.innerHTML = `<div class="hint">${escapeHtml(t("copy_url_success"))}</div>`;
  } catch (err) {
    console.error("Copy vacancy URL failed:", err);
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("copy_url_failed"))}</div>`;
  }
}

function renderVacancyCard() {
  const resultEl = document.getElementById("result");
  const total = state.vacancies.length;
  if (total === 0) {
    resultEl.innerHTML = `<div class="hint">${escapeHtml(t("no_match_found"))}</div>`;
    return;
  }
  const v = currentVacancy();
  const canSearchAgain = state.searchCount < MAX_SEARCHES;
  const canPrev = state.vacancyIndex > 0;
  const canNext = state.vacancyIndex < total - 1;

  resultEl.innerHTML = `
    <div class="card">
      <h3>${escapeHtml(v.title)}</h3>
      <div class="company">${escapeHtml(v.company)} · ${escapeHtml(v.location)}</div>
      <p>${escapeHtml(v.summary)}</p>
      <div class="row">
        <a class="btn-link icon-row" href="${escapeHtml(v.url)}" target="_blank">${iconRow("link", escapeHtml(t("open_link_btn")))}</a>
        <button class="secondary icon-row" onclick="copyVacancyUrl()">${iconRow("copy", escapeHtml(t("copy_url_btn")))}</button>
      </div>
      <button class="icon-row" onclick="checkFit()">${iconRow("target", escapeHtml(t("match_my_cv_btn")))}</button>
      <div id="copy-url-result"></div>
    </div>
    <div id="vacancy-decision">
      ${total > 1 ? `
        <div class="nav-row">
          <button class="secondary" onclick="showVacancy(${state.vacancyIndex - 1})" ${canPrev ? '' : 'disabled'}>${escapeHtml(t("carousel_prev"))}</button>
          <span class="nav-counter">${state.vacancyIndex + 1} / ${total}</span>
          <button class="secondary" onclick="showVacancy(${state.vacancyIndex + 1})" ${canNext ? '' : 'disabled'}>${escapeHtml(t("carousel_next"))}</button>
        </div>
      ` : ''}
      <div class="prompt-block">${escapeHtml(t("like_this_one"))}</div>
      <div class="row">
        <button class="icon-row" onclick="likeVacancy()">${iconRow("thumbs-up", escapeHtml(t("yes_like_it")))}</button>
        ${canSearchAgain ? `<button class="secondary icon-row" onclick="search()">${iconRow("refresh-cw", escapeHtml(t("search_again_btn")))}</button>` : ''}
      </div>
      ${!canSearchAgain ? `<div class="hint" style="margin-top:8px;">${escapeHtml(t("search_limit_title"))}</div>${searchCapCta()}` : ''}
    </div>
    <div id="action-area"></div>
  `;
  scrollToBottom();
}

function searchCapCta() {
  return `
    <div class="prompt-block">${escapeHtml(t("search_cap_prompt"))}</div>
    <button class="icon-row" onclick="backToTitleScreen()">${iconRow("search", escapeHtml(t("search_cap_new_title_btn")))}</button>
    <button class="secondary icon-row" onclick="showVacancyAlerts()">${iconRow("bell", escapeHtml(t("search_cap_alerts_btn")))}</button>
    <button class="secondary icon-row" onclick="goToAnalysis()">${iconRow("bar-chart", escapeHtml(t("search_cap_analyze_btn")))}</button>
  `;
}

function actionArea() {
  return document.getElementById("action-area");
}

function likeVacancy() {
  state.improveCount = 0;
  // Once committed to this vacancy, the "like it / search again / switch
  // vacancy / analyze CV instead" decision no longer applies - hide it so
  // only the buttons relevant to the current step (apply / check fit /
  // etc.) are visible, instead of stacking on top of stale ones.
  document.getElementById("vacancy-decision").hidden = true;
  actionArea().innerHTML = `
    <div class="prompt-block">${escapeHtml(t("how_proceed"))}</div>
    <div class="row">
      <button class="icon-row" onclick="applyDirectly()">${iconRow("check-circle", escapeHtml(t("apply_directly")))}</button>
      <button class="secondary icon-row" onclick="checkFit()">${iconRow("bar-chart", escapeHtml(t("check_cv_fit")))}</button>
    </div>
  `;
  scrollToBottom();
}
async function applyDirectly() {
  actionArea().innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/apply", { vacancy: currentVacancy(), score: null });
    renderSaved();
  } catch (err) {
    console.error("Apply failed:", err);
    actionArea().innerHTML = `
      <div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("apply_failed"))))}</div>
      <button onclick="applyDirectly()">${escapeHtml(t("retry_btn"))}</button>
    `;
  }
  scrollToBottom();
}

async function checkFit() {
  // The one step in "find a vacancy first" that actually needs a CV -
  // gate right here, not before search, so the ask only shows up once
  // the user has already found something worth comparing against.
  if (!state.hasCv) {
    state.postUploadDestination = "checkFit";
    showScreen("cv-gate");
    return;
  }
  actionArea().innerHTML = `<div class="hint icon-row">${iconRow("bar-chart", escapeHtml(t("checking_fit")))}</div>`;
  try {
    const score = await callApi("/api/score-vacancy", { vacancy: currentVacancy() });
    state.lastScore = score;
    renderScoreResult(score);
  } catch (err) {
    console.error("Scoring failed:", err);
    actionArea().innerHTML = `
      <div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("scoring_failed"))))}</div>
      <button onclick="checkFit()">${escapeHtml(t("retry_btn"))}</button>
    `;
  }
  scrollToBottom();
}

function renderScoreResult(score) {
  const matched = (score.matched || []).join(", ") || "—";
  const missing = (score.missing || []).join(", ") || "—";
  actionArea().innerHTML = `
    <div class="card" style="margin-top:16px;">
      <h3>${escapeHtml(t("match_heading", { score: score.score }))}</h3>
      <p>${escapeHtml(score.verdict || "")}</p>
      <div class="icon-row-top">${iconRow("check-circle", `<b>${escapeHtml(t("matched_label"))}</b> ${escapeHtml(matched)}`)}</div>
      <div class="icon-row-top">${iconRow("x-circle", `<b>${escapeHtml(t("missing_label"))}</b> ${escapeHtml(missing)}`)}</div>
    </div>
    <div class="row">
      <button class="icon-row" onclick="applyDirectly()">${iconRow("check-circle", escapeHtml(t("apply_anyway")))}</button>
      ${state.improveCount < MAX_IMPROVES ? `<button class="secondary icon-row" onclick="showLevelPicker()">${iconRow("edit-3", escapeHtml(t("get_recommendations")))}</button>` : ''}
    </div>
  `;
  scrollToBottom();
}

function showLevelPicker() {
  actionArea().insertAdjacentHTML("beforeend", `
    <div class="prompt-block">${escapeHtml(t("level_question"))}</div>
    <div class="row">
      <button onclick="getRecommendations('Junior')">Junior</button>
      <button onclick="getRecommendations('Mid')">Mid</button>
      <button onclick="getRecommendations('Senior')">Senior</button>
    </div>
  `);
  scrollToBottom();
}

async function getRecommendations(level) {
  actionArea().innerHTML = `<div class="hint icon-row">${iconRow("edit-3", escapeHtml(t("working_out_fixes")))}</div>`;
  try {
    const data = await callApi("/api/cv-recommendations", { vacancy: currentVacancy(), level });
    renderRecommendations(data.fixes);
  } catch (err) {
    console.error("Recommendations failed:", err);
    // Real user feedback: a failed first attempt was a dead end -
    // getRecommendations() overwrites actionArea() (including the level
    // picker that triggered it) the moment it starts, so without a
    // retry here, recovering meant leaving this vacancy and re-running
    // "Match my CV" from scratch just to get back to a level picker.
    actionArea().innerHTML = `
      <div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("recommendations_failed"))))}</div>
      <button onclick="getRecommendations('${level}')">${escapeHtml(t("retry_btn"))}</button>
    `;
  }
  scrollToBottom();
}

function renderRecommendations(fixes) {
  const cards = (fixes || []).map(f => `
    <div class="card" style="margin-top:8px;">
      <p><b>${escapeHtml(t("issue_label"))}</b> ${escapeHtml(f.issue)}</p>
      ${f.before ? `<p><i>${escapeHtml(t("before_label"))}</i> ${escapeHtml(f.before)}</p>` : ""}
      <p><i>${escapeHtml(t("after_label"))}</i> ${escapeHtml(f.after)}</p>
    </div>
  `).join("");

  actionArea().innerHTML = `
    ${cards}
    <div class="prompt-block">${escapeHtml(t("ready_to_apply"))}</div>
    <div class="row">
      <button class="icon-row" onclick="applyDirectly()">${iconRow("check-circle", escapeHtml(t("apply_now")))}</button>
      ${state.improveCount < MAX_IMPROVES ? `<button class="secondary icon-row" onclick="showImproveUpload()">${iconRow("file-text", escapeHtml(t("improve_cv_btn")))}</button>` : ''}
    </div>
  `;
  scrollToBottom();
}

function showImproveUpload() {
  actionArea().innerHTML = `
    <div class="hint">${escapeHtml(t("upload_updated_cv"))}</div>
    <input type="file" id="improve_cv_file" accept=".pdf,.docx" />
    <button class="icon-row" onclick="uploadImprovedCV()">${iconRow("file-text", escapeHtml(t("upload_improved_btn")))}</button>
    <div id="improve_result"></div>
  `;
  scrollToBottom();
}

async function uploadImprovedCV() {
  const fileInput = document.getElementById("improve_cv_file");
  const resultEl = document.getElementById("improve_result");
  const file = fileInput.files[0];
  if (!file) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("choose_file_first"))}</div>`;
    return;
  }

  resultEl.innerHTML = `<div class="hint icon-row">${iconRow("file-text", escapeHtml(t("reading_updated_cv")))}</div>`;
  const formData = new FormData();
  formData.append("init_data", tg.initData);
  formData.append("file", file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("/api/upload-cv", { method: "POST", body: formData, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("Improved CV upload failed:", res.status, body);
      const err = new Error(body.detail || "");
      if (res.status === 401) err.sessionExpired = true;
      throw err;
    }
    state.improveCount += 1;
    renderPostImproveChoice();
  } catch (err) {
    console.error("Improved CV upload failed:", err);
    resultEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("upload_failed"))))}</div>`;
  } finally {
    clearTimeout(timeout);
  }
}

function renderPostImproveChoice() {
  if (state.improveCount >= MAX_IMPROVES) {
    actionArea().innerHTML = `
      <div class="hint">${escapeHtml(t("improve_limit_reached"))}</div>
      <button class="icon-row" onclick="applyDirectly()">${iconRow("check-circle", escapeHtml(t("apply_now")))}</button>
    `;
    scrollToBottom();
    return;
  }
  actionArea().innerHTML = `
    <div class="prompt-block">${escapeHtml(t("improve_choice"))}</div>
    <div class="row">
      <button class="icon-row" onclick="applyDirectly()">${iconRow("check-circle", escapeHtml(t("apply_now")))}</button>
      <button class="secondary icon-row" onclick="checkFit()">${iconRow("bar-chart", escapeHtml(t("check_match_again")))}</button>
    </div>
  `;
  scrollToBottom();
}

function renderSaved() {
  actionArea().innerHTML = `
    <div class="hint icon-row">${iconRow("check-circle", escapeHtml(t("saved_confirmation")))}</div>
    <button class="secondary icon-row" onclick="showApplications()">${iconRow("clipboard-list", escapeHtml(t("view_my_applications")))}</button>
  `;
  scrollToBottom();
}
