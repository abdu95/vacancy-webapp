// ── Vacancy Alerts (Profile > Vacancy Alerts) ────────────────────────
async function showVacancyAlerts() {
  showScreen("vacancy-alerts-screen");
  document.getElementById("vacancy-alerts-result").innerHTML = "";
  const titleInput = document.getElementById("alerts_job_title");
  const locationInput = document.getElementById("alerts_location");
  const toggle = document.getElementById("alerts_enabled_toggle");
  titleInput.value = "";
  locationInput.value = "";
  toggle.checked = false;
  try {
    const saved = await callApi("/api/saved-search", {});
    // Pre-fill from a saved value, or fall back to whatever the user
    // last typed into the live vacancy search this session - a small
    // convenience so a returning user isn't stuck typing from scratch.
    titleInput.value = saved.job_title || state.jobTitle || "";
    locationInput.value = saved.location || "";
    toggle.checked = !!saved.alerts_enabled;
  } catch (err) {
    console.error("Loading saved search failed:", err);
    document.getElementById("vacancy-alerts-result").innerHTML =
      `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("vacancy_alerts_load_failed")))}</div>`;
  }
}

async function saveVacancyAlerts() {
  const jobTitle = document.getElementById("alerts_job_title").value.trim();
  const location = document.getElementById("alerts_location").value.trim();
  const alertsEnabled = document.getElementById("alerts_enabled_toggle").checked;
  const resultEl = document.getElementById("vacancy-alerts-result");
  const btn = document.getElementById("save_vacancy_alerts_btn");

  if (alertsEnabled && !jobTitle) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("vacancy_alerts_needs_title"))}</div>`;
    return;
  }

  btn.disabled = true;
  resultEl.innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/saved-search/save", { job_title: jobTitle, location, alerts_enabled: alertsEnabled });
    const message = alertsEnabled
      ? t("vacancy_alerts_saved_on", {
          job_title: jobTitle,
          where: location ? t("vacancy_alerts_where_suffix", { location }) : "",
        })
      : t("vacancy_alerts_saved_off", { job_title: jobTitle });
    resultEl.innerHTML = `<div class="hint">${escapeHtml(message)}</div>`;
  } catch (err) {
    console.error("Saving alert settings failed:", err);
    resultEl.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("vacancy_alerts_save_failed")))}</div>`;
  } finally {
    btn.disabled = false;
  }
}
