// ── CV vs JD analysis + roadmap ──────────────────────────────────────
function looksLikeUrl(text) {
  return /^https?:\/\/\S+$/.test(text.trim());
}

async function analyzeCV() {
  const jd = document.getElementById("jd_text").value.trim();
  const btn = document.getElementById("analyze_btn");
  const resultEl = document.getElementById("analysis-result");

  if (!looksLikeUrl(jd) && jd.length < 100) {
    resultEl.innerHTML = `<div class="error">${escapeHtml(t("jd_too_short_web"))}</div>`;
    return;
  }

  btn.disabled = true;
  resultEl.innerHTML = `<div class="hint">${escapeHtml(t(looksLikeUrl(jd) ? "analyzing_link_message_web" : "analyzing_message_web"))}</div>`;

  try {
    const data = await callApi("/api/cv-jd-analysis", { jd });
    if (data.limit_reached) {
      document.getElementById("jd-input-box").hidden = true;
      resultEl.innerHTML = `<div class="prompt-block">${escapeHtml(t("analysis_limit_reached"))}</div>`;
      const buyBox = document.createElement("div");
      resultEl.appendChild(buyBox);
      await renderBuyChecks(buyBox);
      return;
    }
    state.jd = data.jd_text;
    state.analysisLevel = data.level.assessment;
    state.analysisRemaining = data.remaining;
    state.analysisQuota = data.quota;
    state.currentAnalysisId = data.analysis_id ?? null;
    updateChecksHeader(data.remaining, data.quota);
    document.getElementById("jd-input-box").hidden = true;
    renderAnalysisResult(data);
  } catch (err) {
    console.error("Analysis failed:", err);
    resultEl.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("analysis_failed_web")))}</div>`;
  } finally {
    btn.disabled = false;
  }
}

// Shared between the live analysis screen and the My Checks history detail
// view - same four cards either way, just fed live data vs. a saved row.
function analysisBlocksHtml(ats, xyz, tools, level) {
  const toolEmoji = { strong: "✅", mentioned: "🟡", not_found: "❌" };
  const toolLabelKey = { strong: "tool_strong", mentioned: "tool_mentioned", not_found: "tool_not_found" };

  const rewritesHtml = (xyz.rewrites || []).slice(0, 2).map(r => `
    <div class="card" style="margin-top:8px;">
      <p><i>${escapeHtml(t("before_label"))}</i> ${escapeHtml(r.original)}</p>
      <p><i>${escapeHtml(t("after_label"))}</i> ${escapeHtml(r.improved)}</p>
    </div>
  `).join("");

  const toolsHtml = Object.entries(tools || {}).map(([name, rating]) => `
    <div class="tool-row">
      <span>${toolEmoji[rating] || "•"} ${escapeHtml(name)}</span>
      <span>${escapeHtml(t(toolLabelKey[rating] || "tool_not_found"))}</span>
    </div>
  `).join("");

  return `
    <div class="card">
      <h3>${escapeHtml(t("ats_heading"))} — ${ats.score}/100</h3>
      <div class="score-bar"><div class="score-bar-fill" style="width:${ats.score}%;"></div></div>
      <div>✅ <b>${escapeHtml(t("matched_label"))}</b> ${escapeHtml((ats.matched || []).join(", ") || "—")}</div>
      <div>❌ <b>${escapeHtml(t("missing_label"))}</b> ${escapeHtml((ats.missing || []).join(", ") || "—")}</div>
      <p>${escapeHtml(ats.verdict || "")}</p>
    </div>
    <div class="card" style="margin-top:12px;">
      <h3>${escapeHtml(t("xyz_heading"))}</h3>
      <div>${escapeHtml(t("xyz_passing_label"))} ${(xyz.passing || []).length}</div>
      <div>${escapeHtml(t("xyz_failing_label"))} ${(xyz.failing || []).length}</div>
      ${rewritesHtml ? `<p style="margin-top:8px;"><b>${escapeHtml(t("xyz_rewrites_label"))}</b></p>${rewritesHtml}` : ""}
    </div>
    <div class="card" style="margin-top:12px;">
      <h3>${escapeHtml(t("tools_heading"))}</h3>
      ${toolsHtml}
    </div>
    <div class="card" style="margin-top:12px;">
      <h3>${escapeHtml(t("level_heading"))} — ${escapeHtml(level.assessment)}</h3>
      <p>${escapeHtml(level.reasoning || "")}</p>
    </div>
  `;
}

function renderAnalysisResult(data) {
  const el = document.getElementById("analysis-result");
  el.innerHTML = `
    ${analysisBlocksHtml(data.ats, data.xyz, data.tools, data.level)}
    <button id="get_roadmap_btn" onclick="startRoadmap()">${escapeHtml(t("get_roadmap_btn"))}</button>
    <div id="roadmap-area"></div>
  `;
  scrollToBottom();
}

// Must match app/prompts/analysis.py's ROADMAP_BLOCKS (Pre-Junior has
// 3 items, Junior/Mid/Senior have 4) - used only to show the carousel's
// total up front; the authoritative "is this the last one" signal is
// still the `is_last` flag the server returns with each item.
const ROADMAP_LENGTH_BY_LEVEL = { "Pre-Junior": 3, "Junior": 4, "Mid": 4, "Senior": 4 };
function roadmapTotalFor(level) {
  return ROADMAP_LENGTH_BY_LEVEL[level] || 4;
}

function startRoadmap() {
  // Disabled permanently, not just during this load - clicking it again
  // once the roadmap has started would only ever wipe cached progress
  // (state.roadmapItems reset to []), never help. Not re-enabled anywhere.
  const btn = document.getElementById("get_roadmap_btn");
  if (btn) btn.disabled = true;
  state.roadmapItems = [];
  state.roadmapIndex = -1;
  state.roadmapRequestSeq = (state.roadmapRequestSeq || 0) + 1;
  document.getElementById("roadmap-area").innerHTML = "";
  loadRoadmapItem(1);
}

// Horizontal carousel, same pattern as the vacancy carousel: fetched
// items are cached in state.roadmapItems so Prev (and re-visiting a
// Next you've already seen) is instant, only genuinely new items hit
// the API. Only the current item is ever shown - no accumulation.
//
// requestId/state.roadmapRequestSeq guards against a real bug users hit:
// with no guard, a second in-flight request for the same item (e.g. from
// an impatient double-click before disabling existed) could resolve
// *after* a newer one and silently overwrite state.roadmapIndex back to
// an earlier item - "Next got stuck" / "thrown back to 1/4 after a
// while". Any response that arrives once a newer request has already
// been issued is now just discarded, never applied.
async function loadRoadmapItem(item) {
  const requestId = ++state.roadmapRequestSeq;
  const cacheIndex = item - 1;
  if (state.roadmapItems[cacheIndex]) {
    state.roadmapIndex = cacheIndex;
    renderRoadmapCarousel();
    return;
  }

  const areaEl = document.getElementById("roadmap-area");
  areaEl.innerHTML = `<div class="hint">${escapeHtml(t("analyzing_message_web"))}</div>`;
  try {
    const data = await callApi("/api/roadmap-item", {
      jd: state.jd, level: state.analysisLevel, item, analysis_id: state.currentAnalysisId,
    });
    if (requestId !== state.roadmapRequestSeq) return; // superseded by a newer navigation - discard
    state.roadmapItems[cacheIndex] = data;
    state.roadmapIndex = cacheIndex;
    renderRoadmapCarousel();
  } catch (err) {
    if (requestId !== state.roadmapRequestSeq) return; // stale error, ignore too
    console.error("Roadmap item failed:", err);
    areaEl.innerHTML = `<div class="error">⚠️ ${escapeHtml(friendlyError(err, t("roadmap_failed_web")))}</div>`;
  }
}

function formatRoadmapText(raw) {
  const escaped = escapeHtml(raw || "");
  return escaped.split("\n").map(line => {
    const headerMatch = line.match(/^#{2,3}\s+(.*)/);
    if (headerMatch) return `<b>${headerMatch[1]}</b>`;
    return line.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }).join("\n");
}

// Shared between the live roadmap carousel and the My Checks history
// detail view (which lists every saved roadmap item, not one at a time).
function roadmapItemBodyHtml(data) {
  if (data.fixes) {
    return (data.fixes || []).map(f => `
      <div class="card" style="margin-top:8px;">
        <p><b>${escapeHtml(t("issue_label"))}</b> ${escapeHtml(f.issue)}</p>
        ${f.before ? `<p><i>${escapeHtml(t("before_label"))}</i> ${escapeHtml(f.before)}</p>` : ""}
        <p><i>${escapeHtml(t("after_label"))}</i> ${escapeHtml(f.after)}</p>
      </div>
    `).join("");
  }
  return `<div class="card" style="margin-top:8px;"><div class="roadmap-body">${formatRoadmapText(data.text)}</div></div>`;
}

function renderRoadmapCarousel() {
  const areaEl = document.getElementById("roadmap-area");
  const idx = state.roadmapIndex;
  const data = state.roadmapItems[idx];
  const item = idx + 1;
  const total = roadmapTotalFor(state.analysisLevel);
  const canPrev = idx > 0;
  const canNext = !data.is_last;

  areaEl.innerHTML = `
    <h3 style="margin-top:16px;">${escapeHtml(data.title)}</h3>
    ${roadmapItemBodyHtml(data)}
    <div class="nav-row">
      <button class="secondary" onclick="loadRoadmapItem(${item - 1})" ${canPrev ? '' : 'disabled'}>${escapeHtml(t("carousel_prev"))}</button>
      <span class="nav-counter">${item} / ${total}</span>
      <button class="secondary" onclick="loadRoadmapItem(${item + 1})" ${canNext ? '' : 'disabled'}>${escapeHtml(t("carousel_next"))}</button>
    </div>
    <div id="roadmap-done-area"></div>
  `;
  if (data.is_last) {
    renderRoadmapDone(document.getElementById("roadmap-done-area"));
  }
  scrollToBottom();
}

// The real next-step flow after finishing a roadmap: no dead end - tell
// the user exactly how many free checks they have left, and either offer
// to analyze another job or send them straight to buying more checks.
async function renderRoadmapDone(nextEl) {
  nextEl.innerHTML = `<div class="hint" style="margin-top:8px;">${escapeHtml(t("roadmap_done"))}</div><div id="post-roadmap-next"></div>`;
  const box = document.getElementById("post-roadmap-next");
  box.innerHTML = `<div class="hint">…</div>`;
  try {
    const q = await callApi("/api/quota-status", {});
    updateChecksHeader(q.remaining, q.quota);
    if (q.remaining <= 0) {
      box.innerHTML = `<div class="prompt-block">${escapeHtml(t("post_roadmap_no_checks"))}</div>`;
      const buyBox = document.createElement("div");
      box.appendChild(buyBox);
      await renderBuyChecks(buyBox);
    } else {
      box.innerHTML = `
        <div class="prompt-block">${escapeHtml(freeChecksLine(q.remaining))}</div>
        <button onclick="goToAnalysis()">${escapeHtml(t("analyze_another_btn"))}</button>
      `;
    }
  } catch (err) {
    console.error("Couldn't load quota status after roadmap:", err);
    box.innerHTML = `<button onclick="goToAnalysis()">${escapeHtml(t("analyze_another_btn"))}</button>`;
  }
  scrollToBottom();
}
