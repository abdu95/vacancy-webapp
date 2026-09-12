// Application tracking: list/filter/sort, detail view, status changes, delete.

function statusLabel(status) {
  const key = "status_" + status;
  return I18N[key] ? t(key) : status;
}

// ── Applications ─────────────────────────────────────────────────────
let allApplications = [];

async function showApplications() {
  showScreen("applications-screen");
  document.getElementById("application-detail").hidden = true;
  document.getElementById("applications-list").hidden = false;
  document.getElementById("applications-controls").hidden = false;
  document.getElementById("btn-applications-back").hidden = false;
  const listEl = document.getElementById("applications-list");
  listEl.innerHTML = '<div class="hint">…</div>';

  try {
    const data = await callApi("/api/applications", {});
    allApplications = data.applications || [];
    renderApplications();
  } catch (err) {
    console.error("Loading applications failed:", err);
    listEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("applications_load_failed"))))}</div>`;
  }
}

function renderApplications() {
  const listEl = document.getElementById("applications-list");
  if (allApplications.length === 0) {
    listEl.innerHTML = `<div class="hint">${escapeHtml(t("no_applications"))}</div>`;
    return;
  }

  const filterVal = document.getElementById("applications-filter").value;
  const sortVal = document.getElementById("applications-sort").value;

  let apps = allApplications.slice();
  if (filterVal && filterVal !== "all") apps = apps.filter(a => a.status === filterVal);
  if (sortVal === "score") {
    apps.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  } else {
    apps.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (apps.length === 0) {
    listEl.innerHTML = `<div class="hint">${escapeHtml(t("no_applications_match_filter"))}</div>`;
    return;
  }

  listEl.innerHTML = apps.map(a => {
    const date = new Date(a.created_at).toLocaleDateString();
    const status = statusLabel(a.status);
    const scoreLine = (a.match_score !== null && a.match_score !== undefined)
      ? `<div>${a.match_score}${escapeHtml(t("match_suffix"))}</div>` : "";
    return `
      <div class="card clickable" style="margin-bottom:8px;" onclick="openApplicationDetail(${a.id})">
        <h3>${escapeHtml(a.title)}</h3>
        <div class="company">${escapeHtml(a.company)}${a.location ? " · " + escapeHtml(a.location) : ""}</div>
        ${scoreLine}
        <div>${escapeHtml(t("status_label_prefix"))} <b>${escapeHtml(status)}</b> · ${escapeHtml(date)}</div>
      </div>
    `;
  }).join("");
}

function openApplicationDetail(id) {
  const app = allApplications.find(a => a.id === id);
  if (!app) return;
  document.getElementById("applications-list").hidden = true;
  document.getElementById("applications-controls").hidden = true;
  document.getElementById("btn-applications-back").hidden = true;
  const detailEl = document.getElementById("application-detail");
  detailEl.hidden = false;

  const statusOrder = ["applied", "phone_screen", "tech_interview", "offer", "rejected", "ghosted"];
  detailEl.innerHTML = `
    <button class="back-btn" onclick="closeApplicationDetail()">${escapeHtml(t("back_link"))}</button>
    <div class="card" style="margin-top:12px;">
      <h3>${escapeHtml(app.title)}</h3>
      <div class="company">${escapeHtml(app.company)}${app.location ? " · " + escapeHtml(app.location) : ""}</div>
      ${(app.match_score !== null && app.match_score !== undefined) ? `<div>${app.match_score}${escapeHtml(t("match_suffix"))}</div>` : ""}
      ${app.url ? `<a href="${app.url}" target="_blank">${escapeHtml(t("view_posting"))}</a>` : ""}
    </div>
    <div class="prompt-block">${escapeHtml(t("update_status_prompt"))}</div>
    <div id="status-buttons">
      ${statusOrder.map(s => `
        <button class="${s === app.status ? '' : 'secondary'}" style="margin-top:8px;" onclick="setApplicationStatus(${app.id}, '${s}')">${escapeHtml(statusLabel(s))}</button>
      `).join("")}
    </div>
    <button class="danger icon-row" onclick="confirmDeleteApplication(${app.id})">${iconRow("trash-2", escapeHtml(t("delete_application_btn")))}</button>
    <div id="detail-action-result"></div>
  `;
  scrollToBottom();
}

function closeApplicationDetail() {
  document.getElementById("application-detail").hidden = true;
  document.getElementById("applications-list").hidden = false;
  document.getElementById("applications-controls").hidden = false;
  document.getElementById("btn-applications-back").hidden = false;
}

async function setApplicationStatus(id, status) {
  const resultEl = document.getElementById("detail-action-result");
  resultEl.innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/applications/update-status", { application_id: id, status });
    const app = allApplications.find(a => a.id === id);
    if (app) app.status = status;
    openApplicationDetail(id);
    document.getElementById("detail-action-result").innerHTML = `<div class="hint icon-row">${iconRow("check-circle", escapeHtml(t("status_updated")))}</div>`;
  } catch (err) {
    console.error("Status update failed:", err);
    resultEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("status_update_failed"))))}</div>`;
  }
}

function confirmDeleteApplication(id) {
  const resultEl = document.getElementById("detail-action-result");
  resultEl.innerHTML = `
    <div class="prompt-block">${escapeHtml(t("delete_confirm"))}</div>
    <div class="row">
      <button class="danger" onclick="deleteApplicationNow(${id})">${escapeHtml(t("delete_confirm_yes"))}</button>
      <button class="secondary" onclick="document.getElementById('detail-action-result').innerHTML=''">${escapeHtml(t("delete_confirm_no"))}</button>
    </div>
  `;
  scrollToBottom();
}

async function deleteApplicationNow(id) {
  const resultEl = document.getElementById("detail-action-result");
  resultEl.innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/applications/delete", { application_id: id });
    allApplications = allApplications.filter(a => a.id !== id);
    closeApplicationDetail();
    renderApplications();
  } catch (err) {
    console.error("Delete failed:", err);
    resultEl.innerHTML = `<div class="error icon-row-top">${iconRow("alert-triangle", escapeHtml(friendlyError(err, t("delete_failed"))))}</div>`;
  }
}
