// ── Icon set ─────────────────────────────────────────────────────────
// Real user feedback: people didn't like the emoji sprinkled through
// button labels and status messages. Replaced with this small outline
// SVG set instead - same stroke conventions (24x24 viewBox, currentColor,
// stroke-width 2, round caps/joins) as the bottom tab bar icons already
// in index.html, so the two icon systems read as one.
const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  "bar-chart": '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>',
  "clipboard-list": '<rect x="7" y="3" width="10" height="4" rx="1"/><path d="M6 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  "refresh-cw": '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  "trash-2": '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  "credit-card": '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  "thumbs-up": '<path d="M7 10v11"/><path d="M18.5 10H21a2 2 0 0 1 2 2.24l-1.3 8A2 2 0 0 1 19.72 22H7V10l4-8a2 2 0 0 1 2 2v6h5.5z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  "edit-3": '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  "alert-triangle": '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  "alert-circle": '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  "dot-circle": '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};

function icon(name) {
  const inner = ICON_PATHS[name];
  if (!inner) return "";
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

// Icon shown ahead of a translated label, keyed by the label's i18n key -
// used by setIconText() below and by applyStaticTranslations() in i18n.js.
const KEY_ICON = {
  nav_applications: "clipboard-list",
  upload_cv_btn: "file-text",
  choose_file_btn: "paperclip",
  type_own: "edit-3",
  suggest_from_cv: "sparkles",
  suggest_different: "refresh-cw",
  search_btn: "search",
  reading_cv: "file-text",
  analyzing_cv: "sparkles",
  open_link_btn: "link",
  copy_url_btn: "copy",
  match_my_cv_btn: "target",
  searching_message: "search",
  yes_like_it: "thumbs-up",
  search_again_btn: "refresh-cw",
  search_cap_new_title_btn: "search",
  search_cap_alerts_btn: "bell",
  search_cap_analyze_btn: "bar-chart",
  apply_directly: "check-circle",
  check_cv_fit: "bar-chart",
  checking_fit: "bar-chart",
  apply_anyway: "check-circle",
  get_recommendations: "edit-3",
  working_out_fixes: "edit-3",
  apply_now: "check-circle",
  improve_cv_btn: "file-text",
  upload_improved_btn: "file-text",
  reading_updated_cv: "file-text",
  check_match_again: "bar-chart",
  saved_confirmation: "check-circle",
  view_my_applications: "clipboard-list",
  delete_application_btn: "trash-2",
  status_updated: "check-circle",
  xyz_passing_label: "check-circle",
  xyz_failing_label: "x-circle",
  get_roadmap_btn: "map",
  roadmap_done: "check-circle",
  analysis_limit_reached: "alert-circle",
  buy_custom_btn: "hash",
  checkout_confirmed: "check-circle",
  profile_buy_more_btn: "credit-card",
  profile_my_cvs_btn: "file-text",
  profile_applications_btn: "clipboard-list",
  profile_my_checks_btn: "bar-chart",
  profile_vacancy_alerts_btn: "bell",
  vacancy_alerts_toggle_label: "bell",
  analyze_another_btn: "bar-chart",
  analyze_btn: "sparkles",
  active_cv_indicator: "file-text",
  analyzing_message_web: "sparkles",
  analyzing_link_message_web: "link",
  home_analyze_option: "bar-chart",
  home_vacancy_option: "search",
};

// Sets an element's contents to an icon + translated label in one call -
// the icon comes from KEY_ICON, falling back to plain text if the key
// has none. Used in place of `el.textContent = t(key)` wherever the
// label used to carry a leading emoji.
function setIconText(elId, key, vars) {
  const el = document.getElementById(elId);
  const label = escapeHtml(t(key, vars));
  const name = KEY_ICON[key];
  el.innerHTML = name ? `${icon(name)}${label}` : label;
  el.classList.add("icon-row");
}

// Same idea for a one-off HTML string built inline (error banners, status
// rows) rather than a translated label pulled straight from I18N.
function iconRow(name, html) {
  return `${icon(name)}<span>${html}</span>`;
}
