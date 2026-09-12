// CV upload (cv-gate) and My CVs (list/detail, switch active, delete).

// Shared by both upload screens (cv-gate's cv_file, My CVs' new_cv_file) -
// shows which file was actually picked, since the native file input's own
// button was replaced with a styled/translated trigger (see index.html).
function onFileChosen(inputId, nameElId) {
  const input = document.getElementById(inputId);
  const nameEl = document.getElementById(nameElId);
  const file = input.files[0];
  nameEl.textContent = file ? t("file_chosen_label", { name: file.name }) : t("no_file_chosen");
}

async function uploadCV() {
  const fileInput = document.getElementById("cv_file");
  const resultEl = document.getElementById("upload_result");
  const btn = document.getElementById("upload_btn");
  const file = fileInput.files[0];

  if (!file) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("choose_file_first"))}</div>`;
    return;
  }

  btn.disabled = true;
  resultEl.innerHTML = bigLoader("file-text", t("reading_cv"));
  scrollToBottom();

  const formData = new FormData();
  formData.append("init_data", tg.initData);
  formData.append("file", file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("/api/upload-cv", { method: "POST", body: formData, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("Upload failed:", res.status, body);
      const err = new Error(body.detail || "");
      if (res.status === 401) err.sessionExpired = true;
      throw err;
    }
    state.hasCv = true;
    if (state.postUploadDestination === "analysis") {
      state.postUploadDestination = null;
      document.getElementById("jd-input-box").hidden = false;
      document.getElementById("analysis-result").innerHTML = "";
      showScreen("analysis-screen");
      updateActiveCvIndicator();
    } else if (state.postUploadDestination === "vacancy") {
      state.postUploadDestination = null;
      showScreen("title-screen");
    } else if (state.postUploadDestination === "checkFit") {
      // Resume exactly where the user left off - back to the same
      // vacancy they were already looking at, straight into checking
      // fit, instead of dropping them back at a blank search screen.
      state.postUploadDestination = null;
      showScreen("search-screen");
      renderVacancyCard();
      likeVacancy();
      checkFit();
    } else {
      showScreen("home-screen");
    }
  } catch (err) {
    console.error("CV upload failed:", err);
    resultEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("upload_failed"))))}</div>`;
  } finally {
    clearTimeout(timeout);
    btn.disabled = false;
  }
}

// ── My CVs (mirrors the Applications list/detail pattern) ────────────
let allCvs = [];

async function showMyCvs() {
  showScreen("my-cvs-screen");
  document.getElementById("my-cvs-detail").hidden = true;
  document.getElementById("my-cvs-list-section").hidden = false;
  document.getElementById("my-cvs-upload-result").innerHTML = "";
  document.getElementById("new_cv_file").value = "";
  document.getElementById("new_cv_file_name").textContent = t("no_file_chosen");
  const listEl = document.getElementById("my-cvs-list");
  listEl.innerHTML = `<div class="hint">…</div>`;
  try {
    const data = await callApi("/api/cvs", {});
    allCvs = data.cvs || [];
    renderMyCvsList();
  } catch (err) {
    console.error("Loading CVs failed:", err);
    listEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("my_cvs_load_failed"))))}</div>`;
  }
}

// List shows filename, upload date, and - real tester feedback
// (2026-09-09): with several CVs saved, there was no way to tell which
// one was active without opening each one - a green highlight + badge for
// whichever is active. Everything else (position, the "use this CV"
// action) still lives behind the detail view, same split as the
// Applications list/detail.
function renderMyCvsList() {
  const listEl = document.getElementById("my-cvs-list");
  if (allCvs.length === 0) {
    listEl.innerHTML = `<div class="hint">${escapeHtml(t("my_cvs_empty"))}</div>`;
    return;
  }
  listEl.innerHTML = allCvs.map(cv => `
    <div class="card clickable ${cv.is_active ? "active-cv" : ""}" style="margin-bottom:8px;" onclick="openCvDetail(${cv.id})">
      <h3>${escapeHtml(cv.label)}</h3>
      <div class="company">${escapeHtml(new Date(cv.created_at).toLocaleDateString())}</div>
      ${cv.is_active ? `<div class="active-cv-badge icon-row">${iconRow("check", escapeHtml(t("my_cvs_active_badge")))}</div>` : ""}
    </div>
  `).join("");
}

function openCvDetail(cvId) {
  const cv = allCvs.find(c => c.id === cvId);
  if (!cv) return;
  document.getElementById("my-cvs-list-section").hidden = true;
  const detailEl = document.getElementById("my-cvs-detail");
  detailEl.hidden = false;

  detailEl.innerHTML = `
    <button class="back-btn" onclick="closeCvDetail()">${escapeHtml(t("back_link"))}</button>
    <div class="card" style="margin-top:12px;">
      <h3>${escapeHtml(cv.label)}</h3>
      <div class="company">${escapeHtml(new Date(cv.created_at).toLocaleDateString())}</div>
      ${cv.extracted_position ? `<div>${escapeHtml(t("my_cvs_position_label"))} <b>${escapeHtml(cv.extracted_position)}</b></div>` : ""}
      ${cv.is_active ? `<div style="margin-top:8px;"><b>${escapeHtml(t("my_cvs_active_badge"))}</b></div>` : ""}
    </div>
    ${cv.is_active ? "" : `<button class="secondary" onclick="activateCv(${cv.id})">${escapeHtml(t("my_cvs_set_active_btn"))}</button>`}
    <button class="danger icon-row" onclick="confirmDeleteCv(${cv.id})">${iconRow("trash-2", escapeHtml(t("delete_application_btn")))}</button>
    <div id="cv-detail-action-result"></div>
  `;
  scrollToBottom();
}

function closeCvDetail() {
  document.getElementById("my-cvs-detail").hidden = true;
  document.getElementById("my-cvs-list-section").hidden = false;
}

async function activateCv(cvId) {
  const el = document.getElementById("cv-detail-action-result");
  el.innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/cvs/set-active", { cv_id: cvId });
    await showMyCvs();
    openCvDetail(cvId);
  } catch (err) {
    console.error("Set active CV failed:", err);
    el.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("my_cvs_activate_failed"))))}</div>`;
  }
}

function confirmDeleteCv(cvId) {
  const el = document.getElementById("cv-detail-action-result");
  el.innerHTML = `
    <div class="prompt-block">${escapeHtml(t("delete_confirm"))}</div>
    <div class="row">
      <button class="danger" onclick="deleteCvNow(${cvId})">${escapeHtml(t("delete_confirm_yes"))}</button>
      <button class="secondary" onclick="document.getElementById('cv-detail-action-result').innerHTML=''">${escapeHtml(t("delete_confirm_no"))}</button>
    </div>
  `;
}

async function deleteCvNow(cvId) {
  const el = document.getElementById("cv-detail-action-result");
  el.innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/cvs/delete", { cv_id: cvId });
    await showMyCvs();
  } catch (err) {
    console.error("Delete CV failed:", err);
    el.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("delete_failed"))))}</div>`;
  }
}

async function uploadNewCv() {
  const fileInput = document.getElementById("new_cv_file");
  const resultEl = document.getElementById("my-cvs-upload-result");
  const btn = document.getElementById("upload_new_cv_btn");
  const file = fileInput.files[0];

  if (!file) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("choose_file_first"))}</div>`;
    return;
  }

  btn.disabled = true;
  resultEl.innerHTML = bigLoader("file-text", t("reading_cv"));
  scrollToBottom();

  const formData = new FormData();
  formData.append("init_data", tg.initData);
  formData.append("file", file);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch("/api/upload-cv", { method: "POST", body: formData, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("Upload failed:", res.status, body);
      const err = new Error(body.detail || "");
      if (res.status === 401) err.sessionExpired = true;
      throw err;
    }
    state.hasCv = true;
    fileInput.value = "";
    resultEl.innerHTML = "";
    showMyCvs();
  } catch (err) {
    console.error("CV upload failed:", err);
    resultEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("upload_failed"))))}</div>`;
  } finally {
    clearTimeout(timeout);
    btn.disabled = false;
  }
}
