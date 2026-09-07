// Checks-remaining screen, My Checks (analysis history), and buy-checks
// (2 presets + custom-amount stepper) - grouped together since the
// checks screen embeds the buy-checks flow directly.

async function showChecksScreen() {
  showScreen("checks-screen");
  const contentEl = document.getElementById("checks-content");
  contentEl.innerHTML = `<div class="hint">…</div>`;
  try {
    const q = await callApi("/api/quota-status", {});
    updateChecksHeader(q.remaining, q.quota);
    contentEl.innerHTML = `
      <div class="card">
        <div>${escapeHtml(freeChecksLine(q.remaining))}</div>
      </div>
    `;
    if (q.remaining <= 0) {
      const buyBox = document.createElement("div");
      buyBox.style.marginTop = "12px";
      contentEl.appendChild(buyBox);
      await renderBuyChecks(buyBox);
    } else {
      const btn = document.createElement("button");
      btn.className = "secondary";
      btn.textContent = t("profile_buy_more_btn");
      btn.onclick = async () => {
        const buyBox = document.createElement("div");
        contentEl.appendChild(buyBox);
        await renderBuyChecks(buyBox);
      };
      contentEl.appendChild(btn);
    }
  } catch (err) {
    console.error("Couldn't load checks status:", err);
    contentEl.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("couldnt_load_profile")))}</div>`;
  }
}

// ── My Checks (analysis history, mirrors the My CVs/Applications list/detail pattern) ──
let allChecks = [];

async function showMyChecks() {
  showScreen("my-checks-screen");
  document.getElementById("my-checks-detail").hidden = true;
  document.getElementById("my-checks-list-section").hidden = false;
  const listEl = document.getElementById("my-checks-list");
  listEl.innerHTML = `<div class="hint">…</div>`;
  try {
    const data = await callApi("/api/checks", {});
    allChecks = data.checks || [];
    renderMyChecksList();
  } catch (err) {
    console.error("Loading checks failed:", err);
    listEl.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("my_checks_load_failed")))}</div>`;
  }
}

function jdPreview(jdText) {
  const oneLine = (jdText || "").replace(/\s+/g, " ").trim();
  return oneLine.length > 70 ? oneLine.slice(0, 70) + "…" : oneLine;
}

function renderMyChecksList() {
  const listEl = document.getElementById("my-checks-list");
  if (allChecks.length === 0) {
    listEl.innerHTML = `
      <div class="prompt-block">${escapeHtml(t("my_checks_empty"))}</div>
      <button onclick="goToAnalysis()">${escapeHtml(t("home_analyze_option"))}</button>
    `;
    return;
  }
  listEl.innerHTML = allChecks.map(c => `
    <div class="card clickable" style="margin-bottom:8px;" onclick="openCheckDetail(${c.id})">
      <h3>${escapeHtml(jdPreview(c.jd_text))}</h3>
      <div class="company">${escapeHtml(new Date(c.created_at).toLocaleDateString())} — ${escapeHtml(c.level.assessment)}</div>
    </div>
  `).join("");
}

async function openCheckDetail(analysisId) {
  document.getElementById("my-checks-list-section").hidden = true;
  const detailEl = document.getElementById("my-checks-detail");
  detailEl.hidden = false;
  detailEl.innerHTML = `<div class="hint">…</div>`;
  try {
    const check = await callApi("/api/checks/get", { analysis_id: analysisId });
    renderCheckDetail(check);
  } catch (err) {
    console.error("Loading check detail failed:", err);
    detailEl.innerHTML = `
      <button class="back-btn" onclick="closeCheckDetail()">${escapeHtml(t("back_link"))}</button>
      <div class="error" style="margin-top:12px;">⚠️ ${escapeHtml(friendlyError(err, t("my_checks_load_failed")))}</div>
    `;
  }
}

function renderCheckDetail(check) {
  const detailEl = document.getElementById("my-checks-detail");
  const roadmapKeys = Object.keys(check.roadmap_items || {}).map(Number).sort((a, b) => a - b);
  const roadmapHtml = roadmapKeys.map(item => {
    const itemData = check.roadmap_items[item];
    return `
      <h3 style="margin-top:16px;">${escapeHtml(itemData.title)}</h3>
      ${roadmapItemBodyHtml(itemData)}
    `;
  }).join("");

  detailEl.innerHTML = `
    <button class="back-btn" onclick="closeCheckDetail()">${escapeHtml(t("back_link"))}</button>
    <div class="card" style="margin-top:12px;">
      <div class="company">${escapeHtml(new Date(check.created_at).toLocaleDateString())}</div>
      <div class="roadmap-body">${escapeHtml(check.jd_text)}</div>
    </div>
    ${analysisBlocksHtml(check.ats, check.xyz, check.tools, check.level)}
    ${roadmapHtml}
    <button class="danger" style="margin-top:16px;" onclick="confirmDeleteCheck(${check.id})">${escapeHtml(t("delete_application_btn"))}</button>
    <div id="check-detail-action-result"></div>
  `;
  scrollToBottom();
}

function closeCheckDetail() {
  document.getElementById("my-checks-detail").hidden = true;
  document.getElementById("my-checks-list-section").hidden = false;
}

function confirmDeleteCheck(analysisId) {
  const el = document.getElementById("check-detail-action-result");
  el.innerHTML = `
    <div class="prompt-block">${escapeHtml(t("delete_confirm"))}</div>
    <div class="row">
      <button class="danger" onclick="deleteCheckNow(${analysisId})">${escapeHtml(t("delete_confirm_yes"))}</button>
      <button class="secondary" onclick="document.getElementById('check-detail-action-result').innerHTML=''">${escapeHtml(t("delete_confirm_no"))}</button>
    </div>
  `;
}

async function deleteCheckNow(analysisId) {
  const el = document.getElementById("check-detail-action-result");
  el.innerHTML = `<div class="hint">${escapeHtml(t("saving"))}</div>`;
  try {
    await callApi("/api/checks/delete", { analysis_id: analysisId });
    await showMyChecks();
  } catch (err) {
    console.error("Delete check failed:", err);
    el.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("delete_failed")))}</div>`;
  }
}
// Russian needs 3 plural forms (1 проверка / 2 проверки / 5 проверок),
// not the simple one/other split English and Uzbek get away with -
// English still needs *a* split (1 check vs N checks), Uzbek needs
// none (no grammatical number agreement on nouns after numerals).
// Returns a CLDR-style category name matching the *_one/_few/_many
// i18n key suffixes below.
function pluralCategory(n) {
  if (currentLang === "ru") {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "many";
}

function freeChecksLine(n) {
  return t(`free_checks_left_${pluralCategory(n)}`, { remaining: n });
}

// ── Buy checks (flexible pay-per-check pricing) ──────────────────────
function checksLabel(n) {
  return `${n} ${t(`checks_word_${pluralCategory(n)}`)}`;
}

let _buyChecksPriceTiyin = 1000000;

async function renderBuyChecks(containerEl) {
  containerEl.innerHTML = `<div id="buy-checks-box"><div class="hint">…</div></div>`;
  const box = document.getElementById("buy-checks-box");
  try {
    const q = await callApi("/api/quota-status", {});
    _buyChecksPriceTiyin = q.price_per_check_tiyin;
  } catch (err) {
    console.error("Couldn't load price, using fallback:", err);
  }
  const amountFor = n => Math.round(n * _buyChecksPriceTiyin / 100).toLocaleString();
  box.innerHTML = `
    <div class="prompt-block">${escapeHtml(t("buy_checks_intro", { price: (_buyChecksPriceTiyin / 100).toLocaleString() }))}</div>
    ${CHECK_QUANTITY_PRESETS.map(n => `<button onclick="buyChecks(${n})">${escapeHtml(checksLabel(n))} — ${amountFor(n)} UZS</button>`).join("")}
    <button class="secondary" onclick="showCustomChecksInput()">${escapeHtml(t("buy_custom_btn"))}</button>
    <div id="buy-checks-extra"></div>
  `;
  scrollToBottom();
}

function showCustomChecksInput() {
  document.getElementById("buy-checks-extra").innerHTML = `
    <div class="hint">${escapeHtml(t("buy_custom_prompt"))}</div>
    <div class="qty-stepper">
      <button type="button" class="qty-btn" onclick="adjustCustomChecks(-1)">−</button>
      <input type="number" id="custom_checks_input" min="${MIN_CHECKS_PURCHASE}" max="${MAX_CHECKS_PURCHASE}" value="1" oninput="onCustomChecksInput()" />
      <button type="button" class="qty-btn" onclick="adjustCustomChecks(1)">+</button>
    </div>
    <div class="hint" id="custom-checks-price"></div>
    <button onclick="submitCustomChecks()">${escapeHtml(t("buy_custom_confirm"))}</button>
    <div id="custom-checks-error"></div>
  `;
  updateCustomChecksPrice();
  scrollToBottom();
}

function clampCustomChecks(val) {
  if (!Number.isInteger(val)) val = MIN_CHECKS_PURCHASE;
  return Math.min(MAX_CHECKS_PURCHASE, Math.max(MIN_CHECKS_PURCHASE, val));
}

function updateCustomChecksPrice() {
  const input = document.getElementById("custom_checks_input");
  const priceEl = document.getElementById("custom-checks-price");
  if (!input || !priceEl) return;
  const n = clampCustomChecks(parseInt(input.value, 10));
  const amount = Math.round(n * _buyChecksPriceTiyin / 100).toLocaleString();
  priceEl.textContent = t("buy_custom_total", { amount });
}

function adjustCustomChecks(delta) {
  const input = document.getElementById("custom_checks_input");
  input.value = clampCustomChecks(parseInt(input.value, 10) + delta);
  updateCustomChecksPrice();
}

function onCustomChecksInput() {
  updateCustomChecksPrice();
}

function submitCustomChecks() {
  const val = parseInt(document.getElementById("custom_checks_input").value, 10);
  const errEl = document.getElementById("custom-checks-error");
  if (!Number.isInteger(val) || val < MIN_CHECKS_PURCHASE || val > MAX_CHECKS_PURCHASE) {
    errEl.innerHTML = `<div class="error">${escapeHtml(t("buy_custom_invalid"))}</div>`;
    return;
  }
  buyChecks(val);
}

async function buyChecks(checks) {
  const box = document.getElementById("buy-checks-box");
  box.innerHTML = `<div class="hint">${escapeHtml(t("checkout_opening"))}</div>`;
  try {
    const data = await callApi("/api/checkout", { checks });
    if (tg && tg.openLink) {
      tg.openLink(data.checkout_url);
    } else {
      window.open(data.checkout_url, "_blank");
    }
  } catch (err) {
    console.error("Checkout failed:", err);
    box.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("checkout_failed")))}</div>`;
  }
}
