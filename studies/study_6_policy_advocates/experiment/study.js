/*******************************************************
 * Policy Advocacy Study — Cognition.run (jsPsych 8.x)
 * Adapted from legal advocacy dossier design
 * Version: policy_advocacy_v1.27
 *
 * Active design:
 *  - One random policy per participant.
 *  - Random assignment to argue for or against the policy.
 *  - Claim-warrant judgments before and after the dossier task.
 *  - Quantitative belief questions before and after the dossier task.
 *  - Policy-support priors and posteriors.
 *  - Dossier task: claims grouped by whether they support or oppose the policy;
 *    facts grouped by whether they support or oppose the associated claim.
 *  - For each claim, each side is shown as 0 or up to 2 facts. Exposure is randomized
 *    between supports-claim only, opposes-claim only, and both sides.
 *  - Fact cards include Open / Insert / Attach / Show source mechanics.
 *  - Demographics battery at end.
 *******************************************************/

(function () {
  "use strict";

  /* ==================== CONFIG ==================== */

  const CFG = {
    study_id: "policy_advocacy_carbon_pricing_forced",
    js_version: "policy_advocacy_v1_35_carbon_pricing_bonus_clarified",
    stimuli_path: "stimuli/policy_advocacy_stimuli.json",
    forced_policy_id: "carbon_pricing",
    prolific_completion_code: "C1379C4O",
    min_argument_words: 100,
    preview_min_argument_words: 0,
    show_progress_bar: true,
    ask_claim_warranted: true,
    facts_per_side: 2,
    bonus_max: 2.00
  };

  const PROLIFIC_REDIRECT_URL =
    `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(CFG.prolific_completion_code)}`;

  const URL_PARAMS = new URLSearchParams(window.location.search);
  const PREVIEW_MODE = false;

  /* ==================== ERROR HANDLER ==================== */

  function escapeHtml(x) {
    return String(x === null || x === undefined ? "" : x)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cleanParticipantText(x) {
    return String(x === null || x === undefined ? "" : x)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\bSource:\s*/g, "Source: ");
  }

  function escapeClean(x) {
    return escapeHtml(cleanParticipantText(x));
  }

  function showFatalError(err) {
    const msg = (err && (err.stack || err.message)) || String(err);
    const html = `
      <div style="font-family: Arial, sans-serif; padding:16px; max-width:1100px; margin:0 auto;">
        <h2>Script error</h2>
        <pre style="white-space:pre-wrap; background:#f7f7f7; padding:12px; border-radius:10px; border:1px solid #eee;">${escapeHtml(msg)}</pre>
        <div style="margin-top:10px; font-size:13px; color:#555;">If this persists, copy the error above and send it to the researcher.</div>
      </div>`;
    try { document.body.innerHTML = html; } catch (_) { try { alert(msg); } catch (__) {} }
  }

  window.onerror = function (_message, _source, _lineno, _colno, error) {
    showFatalError(error || _message);
    return true;
  };
  window.addEventListener("unhandledrejection", (event) => showFatalError(event.reason || event));

  /* ==================== UTILITIES ==================== */

  function shuffle(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function wordCount(text) {
    const s = String(text || "").trim();
    if (!s) return 0;
    return s.split(/\s+/).filter(Boolean).length;
  }

  function safeId(s) {
    return String(s || "x").replace(/[^A-Za-z0-9_\-]/g, "_");
  }

  function escapeRegex(s) {
    return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function nowMs() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  function writeDataRow(jsPsych, row) {
    try {
      if (jsPsych && jsPsych.data && typeof jsPsych.data.write === "function") {
        jsPsych.data.write(row); return true;
      }
      if (jsPsych && jsPsych.data && typeof jsPsych.data.addData === "function") {
        jsPsych.data.addData(row); return true;
      }
    } catch (_) {}
    return false;
  }

  function addDataProperties(jsPsych, obj) {
    try { jsPsych.data.addProperties(obj); } catch (_) {}
  }

  function valenceLabel(v) {
    const s = String(v || "").toLowerCase();
    if (s === "pro") return "Supports the policy";
    if (s === "con") return "Opposes the policy";
    return "Claim";
  }

  function roleLabel(role) {
    return role === "support" ? "support the policy" : "oppose the policy";
  }

  function roleActionLabel(role) {
    return role === "support" ? "argue in favor of" : "argue against";
  }

  function roleDirectionLabel(role) {
    return role === "support" ? "in favor of" : "against";
  }

  function factClaimSide(f) {
    const s = String(f.side_relative_to_claim || "").toLowerCase();
    if (s.includes("support")) return "supports_claim";
    if (s.includes("oppose")) return "opposes_claim";
    return "unknown";
  }

  function factPolicySide(f) {
    const s = String(f.fact_relation_to_policy || "").toLowerCase();
    if (s.includes("support")) return "supports_policy";
    if (s.includes("oppose")) return "opposes_policy";
    return "unknown";
  }

  function numberOrNull(x) {
    const s = String(x === null || x === undefined ? "" : x).trim();
    if (s === "") return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  /* ==================== CSS + UI HELPERS ==================== */

  const BASE_CSS = `
  <style>
    .page, .page * { text-align: left; box-sizing: border-box; }
    .page { max-width: 1120px; margin: 0 auto; padding: 0 14px 76px; font-family: Arial, sans-serif; color:#111; }
    .textPage { max-width: 840px; margin: 0 auto; padding-top: 0; }
    .jspsych-display-element { width:100% !important; }
    .jspsych-content-wrapper { width:100% !important; max-width:1120px !important; margin:0 auto !important; padding:0 14px !important; align-items:flex-start !important; justify-content:flex-start !important; }
    .jspsych-content { width:100% !important; max-width:1120px !important; margin:0 auto !important; padding-top:52px !important; }
    .title { font-size:24px; font-weight:800; margin:6px 0 20px; text-align:center !important; width:100%; }
    .subtitle { font-size:16px; font-weight:800; margin:0 0 8px; }
    .instructions { font-size:16px; line-height:1.45; margin:18px auto 14px; color:#111; max-width:860px; }
    .muted { font-size:13px; color:#555; margin-top:6px; }
    .noteLine { font-size:13px; color:#555; margin-top:10px; }
    .hr { height:1px; background:#eee; margin:14px 0; }
    .btn { border:1px solid #aaa; background:#f7f7f7; border-radius:12px; padding:9px 11px; cursor:pointer; font-size:15px; }
    .btn.small { padding:7px 9px; font-size:13px; }
    .btn:hover { filter:brightness(0.98); }
    .btn:disabled { opacity:.45; cursor:not-allowed; }
    .continueBtn { width:auto; min-width:120px; padding:10px 16px; font-size:16px; border-radius:14px; position:fixed; bottom:18px; right:18px; z-index:50; box-shadow:0 4px 14px rgba(0,0,0,.18); max-width:220px; white-space:nowrap; display:inline-block; }
    .backBtn { position:fixed; bottom:18px; left:18px; width:auto; display:inline-block; min-width:140px; max-width:260px; white-space:nowrap; z-index:50; }
    .box { border:1px solid #ddd; border-radius:14px; padding:12px; background:#fafafa; margin:12px 0; }
    .s1Header { background:rgba(0,0,0,.07); border:1px solid rgba(0,0,0,.14); padding:12px 14px; border-radius:14px; margin:10px 6px 24px 6px; }
    .s1Header .title { font-size:20px; font-weight:800; margin-bottom:2px; }
    .orientationLine { max-width:980px; margin:-8px auto 16px; font-size:13px; color:#444; text-align:center !important; line-height:1.35; }
    .policySummary { border:1px solid #ddd; border-radius:14px; padding:14px; background:#fff; margin:12px auto; max-width:860px; }
    .sectionHeader { font-weight:900; font-size:15px; margin:18px 0 8px; padding:8px 10px; border-radius:12px; }
    .sectionHeader.proPolicy { background:#e8f5ee; border:1px solid #cce7d7; }
    .sectionHeader.conPolicy { background:#fff2df; border:1px solid #f2d6aa; }
    .claimCard { border:1px solid #e5e5e5; border-radius:14px; padding:12px; background:#fff; margin:10px 0; }
    .claimText { font-size:15px; line-height:1.4; }
    .claimTag { color:#555; font-size:13px; font-weight:700; margin-bottom:5px; }
    .sidePill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:800; line-height:1.2; border:1px solid rgba(0,0,0,.15); background:rgba(0,0,0,.04); }
    .pillPro { background:#e8f5ee; border-color:#cce7d7; }
    .pillCon { background:#fff2df; border-color:#f2d6aa; }
    .probList { margin-top:10px; padding:8px 10px; border:1px solid rgba(0,0,0,.06); border-radius:16px; overflow:hidden; background:rgba(0,0,0,.012); }
    .quantClaimBlock { border:1px solid #e5e5e5; border-radius:14px; background:#fff; margin:12px 0; overflow:hidden; }
    .quantClaimHeader { padding:12px 14px; background:#fafafa; border-bottom:1px solid #eaeaea; }
    .quantClaimHeader .claimTag { margin-bottom:4px; }
    .activationClaimBlock { border:1px solid #e5e5e5; border-radius:14px; background:#fff; margin:12px 0; overflow:hidden; }
    .activationClaimHeader { padding:12px 14px; background:#fafafa; border-bottom:1px solid #eaeaea; }

    .probRow { display:flex; justify-content:space-between; gap:14px; border-bottom:1px solid rgba(0,0,0,.06); padding:13px 12px; align-items:flex-start; }
    .probRow:last-child { border-bottom:none; }
    .sliderPrompt { flex:1 1 auto; min-width:0; max-width:760px; padding-right:12px; }
    .probInputBox { min-width:190px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .probInput { width:160px; padding:8px 10px; border-radius:12px; border:1px solid rgba(0,0,0,.22); font-size:16px; text-align:left !important; }
    .probInputHint { font-size:12px; color:#555; text-align:right !important; }
    .rangeError { display:none; font-size:12px; color:#9a3a00; text-align:right !important; max-width:190px; line-height:1.25; }
    .probInput.invalidInput { border-color:#b85c00; background:#fff8ef; }
    .infoBtn { margin-top:8px; }
    .bonusDetails { display:inline-block; margin-left:8px; vertical-align:baseline; margin-top:6px; border:none; padding:0; background:transparent; }
    .bonusDetails summary { display:inline-block; cursor:pointer; font-weight:900; font-size:12px; line-height:1.2; border:1px solid #d5d5d5; background:#f3f3f3; border-radius:10px; padding:5px 8px; list-style:none; color:#555; }
    .bonusDetails summary:hover { background:#ececec; }
    .bonusDetails summary::-webkit-details-marker { display:none; }
    .bonusDetails summary::marker { content:""; }
    .bonusDetailsText { font-size:13px; line-height:1.45; margin-top:8px; color:#333; border:1px solid #ddd; border-radius:12px; padding:10px 12px; background:#fafafa; max-width:760px; }
    .bonusDetails.compact { margin-top:6px; }

    .bonusDetails.inlineBonus { display:inline-block; margin-left:8px; margin-top:0; vertical-align:baseline; }
    .bonusDetails.inlineBonus summary { padding:2px 7px; font-size:11px; font-weight:700; border-radius:8px; }
    .bonusDetails.inlineBonus .bonusDetailsText { background:#fafafa; border:1px solid #ddd; max-width:450px; }
    .inlineBonusBtn { display:inline-block; margin-left:6px; vertical-align:baseline; padding:2px 7px; font-size:11px; font-weight:700; border-radius:8px; border:1px solid #d5d5d5; background:#f3f3f3; color:#555; cursor:pointer; line-height:1.2; }
    .inlineBonusBtn:hover { background:#ececec; }
    .inlineBonusPanel { display:none; margin-top:8px; color:#333; border:1px solid #ddd; border-radius:12px; padding:10px 12px; background:#fafafa; max-width:450px; font-size:13px; line-height:1.45; }
    .layoutRow { display:flex; gap:16px; align-items:flex-start; flex-wrap:nowrap; }
    .colLeft { flex:1 1 0; min-width:0; }
    .colRight { flex:0 0 430px; max-width:430px; }
    .evidenceGrid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:16px; align-items:start; }
    .evidencePanel { border:1px solid #ddd; border-radius:16px; background:#fafafa; padding:12px; }
    .evidencePanel.supportPanel { background:#f6fbf8; }
    .evidencePanel.opposePanel { background:#fff9f1; }
    .evidencePanelTitle { font-weight:900; font-size:16px; margin:0 0 10px; text-align:center !important; }
    .factSubgroup { border:1px solid #e5e5e5; border-radius:14px; background:#fff; padding:8px 10px; margin:10px 0; }
    textarea { width:100%; min-height:240px; font-size:15px; line-height:1.4; padding:12px; border-radius:14px; border:1px solid #ccc; }
    .wc { margin-top:8px; font-size:13px; color:#444; }
    .requirementBox { margin-top:10px; border:1px solid #ddd; border-radius:14px; padding:10px 12px; background:#fff; font-size:13px; color:#333; max-width:520px; }
    .requirementTitle { font-weight:900; margin-bottom:6px; }
    .requirementLine { margin-top:4px; }
    .reqStatus { display:inline-block; min-width:18px; font-weight:900; }
    .reqMet { color:#19733a; }
    .reqMissing { color:#9a3a00; }
    .factGroupLabel { font-size:13px; font-weight:900; margin:10px 0 4px; padding:6px 8px; border-radius:10px; }
    .factGroupLabel.supportsClaim { background:#edf7ff; border:1px solid #cfe7fa; }
    .factGroupLabel.opposesClaim { background:#fff4f4; border:1px solid #f2cccc; }
    .factCard { border:1px solid #ddd; border-radius:14px; padding:10px 12px; margin:8px 0; background:#fff; }
    .factHeader { display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .factTitle { font-size:14px; font-weight:900; }
    .factHeaderRight { display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .factBody, .sourceBody { margin-top:10px; padding-top:10px; border-top:1px solid #eee; display:none; }
    .factText { font-size:14px; line-height:1.45; }
    .sourceBody { font-size:13px; color:#333; word-break:break-word; background:#fafafa; border-radius:10px; padding:10px; border:1px solid #eee; }
    .attachWrap { font-size:13px; display:flex; gap:6px; align-items:center; }
    .previewBox { border:1px solid #ddd; border-radius:14px; padding:12px; background:#fff; margin:10px 0; }
    .previewTitle { font-weight:800; margin-bottom:6px; }
    .activationRow { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:14px 12px; border-bottom:1px solid rgba(0,0,0,.06); }
    .demoGrid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; max-width:860px; margin:0 auto; }
    .demoItem { border:1px solid #ddd; border-radius:14px; padding:12px; background:#fff; }
    .demoItem label { display:block; font-weight:800; margin-bottom:6px; }
    .demoItem input, .demoItem select { width:100%; padding:8px 10px; border:1px solid #bbb; border-radius:10px; font-size:15px; }
    @media (max-width: 980px) {
      .layoutRow { flex-direction:column !important; }
      .colRight { order:-1 !important; flex:1 1 auto; max-width:none; width:100%; }
      .probRow { flex-direction:column; align-items:stretch; }
      .probInputBox { align-items:flex-start; }
      .demoGrid { grid-template-columns:1fr; }
      .evidenceGrid { grid-template-columns:1fr; }
    }
  </style>`;

  function pageHtml(inner) { return `${BASE_CSS}<div class="page">${inner}</div>`; }

  function continueButtonHtml(label = "Continue", opts = {}) {
    const id = opts.id || "go";
    const disabled = opts.disabled ? " disabled" : "";
    return `<button id="${escapeHtml(id)}" class="btn continueBtn"${disabled}>${escapeHtml(label)}</button>`;
  }

  function textPageHtml(title, bodyHtml, buttonLabel = "Continue") {
    return pageHtml(`
      <div class="textPage">
        ${title ? `<div class="title">${escapeHtml(title)}</div>` : ""}
        <div class="instructions">${bodyHtml}</div>
      </div>
      ${continueButtonHtml(buttonLabel)}
    `);
  }

  function orientationLineHtml(plan, includeRole = false) {
    const policy = plan.policy || {};
    const rolePart = includeRole ? ` &nbsp;|&nbsp; Your task: argue to <b>${escapeHtml(roleLabel(plan.advocate_position))}</b>` : "";
    return `<div class="orientationLine">Policy: ${escapeHtml(policy.policy_name || policy.policy_id)}${rolePart}</div>`;
  }

  function addClickFinish(jsPsych, payload = {}) {
    const btn = document.getElementById("go");
    if (btn) btn.addEventListener("click", () => jsPsych.finishTrial(payload));
  }

  /* ==================== STIMULI + RANDOMIZATION ==================== */

  async function loadStimuli() {
    const res = await fetch(CFG.stimuli_path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${CFG.stimuli_path}: HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.policies) || !data.policies.length) {
      throw new Error("Stimuli JSON must contain a non-empty top-level policies array.");
    }
    data.policies.forEach((p) => {
      p.claims = Array.isArray(p.claims) ? p.claims : [];
      p.claims.forEach((cl) => {
        cl.facts = Array.isArray(cl.facts) ? cl.facts : [];
        cl.quantitative_questions = Array.isArray(cl.quantitative_questions) ? cl.quantitative_questions : [];
      });
    });
    return data;
  }

  function sampleFactsForPolicy(policy) {
    const claims = policy.claims || [];
    const claim_order = shuffle(claims.map(c => c.claim_id));
    const claimById = Object.fromEntries(claims.map(c => [c.claim_id, c]));
    const shown_facts_by_claim = {};
    const sampler_side_selections = [];
    const sampler_schema_warnings = [];
    const facts_flat = [];

    claim_order.forEach((claim_id) => {
      const cl = claimById[claim_id] || {};
      const supports = shuffle((cl.facts || []).filter(f => factClaimSide(f) === "supports_claim")).slice(0, CFG.facts_per_side);
      const opposes = shuffle((cl.facts || []).filter(f => factClaimSide(f) === "opposes_claim")).slice(0, CFG.facts_per_side);
      if (supports.length < CFG.facts_per_side || opposes.length < CFG.facts_per_side) {
        sampler_schema_warnings.push({ claim_id, n_supports_claim_facts: supports.length, n_opposes_claim_facts: opposes.length });
      }
      const r = Math.random();
      const showSupports = r < 1 / 3 || r >= 2 / 3;
      const showOpposes = r >= 1 / 3;
      const picked = [];
      if (showSupports) supports.forEach(f => picked.push({ ...f, _picked_claim_side: "supports_claim" }));
      if (showOpposes) opposes.forEach(f => picked.push({ ...f, _picked_claim_side: "opposes_claim" }));
      shown_facts_by_claim[claim_id] = shuffle(picked);
      sampler_side_selections.push({
        claim_id,
        exposure_condition: showSupports && showOpposes ? "both_sides" : (showSupports ? "supports_claim_only" : "opposes_claim_only"),
        supports_claim_seen: showSupports ? 1 : 0,
        opposes_claim_seen: showOpposes ? 1 : 0,
        supports_claim_fact_ids: supports.map(f => f.fact_id),
        opposes_claim_fact_ids: opposes.map(f => f.fact_id)
      });
    });

    claim_order.forEach((cid) => (shown_facts_by_claim[cid] || []).forEach(f => facts_flat.push(f)));
    facts_flat.forEach((f, idx) => { f._fn = idx + 1; });
    const fnById = {};
    facts_flat.forEach(f => { fnById[f.fact_id] = f._fn; });
    Object.keys(shown_facts_by_claim).forEach((cid) => {
      shown_facts_by_claim[cid] = shown_facts_by_claim[cid].map(f => ({ ...f, _fn: fnById[f.fact_id] }));
    });

    return {
      claim_order,
      shown_facts_by_claim,
      facts_flat,
      facts_shown_ids: facts_flat.map(f => f.fact_id),
      sampler_side_selections,
      sampler_schema_warnings
    };
  }

  function assignFactDisplayLabels(plan) {
    const labelById = {};
    claimDisplayOrder(plan).forEach((claim_id) => {
      const claimNum = claimDisplayIndex(plan)[claim_id];
      const facts = plan.shown_facts_by_claim[claim_id] || [];
      facts.forEach((f, idx) => {
        labelById[f.fact_id] = `${claimNum}${String.fromCharCode(65 + idx)}`;
      });
    });
    plan.facts_flat.forEach(f => { f._flabel = labelById[f.fact_id] || String(f._fn); });
    Object.keys(plan.shown_facts_by_claim).forEach((cid) => {
      plan.shown_facts_by_claim[cid] = (plan.shown_facts_by_claim[cid] || []).map(f => ({ ...f, _flabel: labelById[f.fact_id] || String(f._fn) }));
    });
    plan.fact_display_labels = labelById;
  }

  function makePlan(policy) {
    const advocate_position = Math.random() < 0.5 ? "support" : "oppose";
    const plan = { policy, advocate_position, dossier_pass_counter: 0, ...sampleFactsForPolicy(policy) };
    assignFactDisplayLabels(plan);
    return plan;
  }

  /* ==================== SIMPLE PAGES ==================== */

  function consentScreen(jsPsych) {
    return {
      type: jsPsychHtmlButtonResponse,
      stimulus: `${BASE_CSS}
        <div class="page">
          <div class="title">Consent to Participate in Research</div>
          <div class="box" style="max-height:360px; overflow-y:auto; background:#fff;">
            <div class="instructions" style="margin-top:0;">
              <p><b>Title of Research:</b> Computational Cognitive Science</p>
              <p><b>Principal Investigator:</b> Thomas Griffiths, Department of Psychology, Princeton University</p>
              <p>You are being invited to take part in a research study on human judgment and decision-making.</p>
              <p>You will read about a policy proposal, answer questions about factual claims related to it, review evidence, and prepare a short policy argument.</p>
              <p>Risks are minimal. Participation is voluntary, and you may withdraw at any time.</p>
              <p>By clicking <b>"I consent"</b>, you indicate that you voluntarily agree to participate.</p>
            </div>
          </div>
          <div class="instructions" style="text-align:center;">Do you consent to participate in this study?</div>
        </div>`,
      choices: ["I do NOT consent", "I consent"],
      on_finish: (data) => {
        data.page_type = "consent";
        if (data.response === 0) jsPsych.endExperiment("No consent");
      },
      data: { page_type: "consent" }
    };
  }

  function overviewScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Overview", `
        <p>In this study, you will review materials about a public policy proposal.</p>
        <p>You will first answer several questions about the policy issue. You will then prepare a short argument either <b>for</b> or <b>against</b> the policy, and afterward answer several follow-up questions.</p>
        <p>You can earn up to <b>$${CFG.bonus_max.toFixed(2)}</b> in bonuses.</p>
      `),
      on_load: () => addClickFinish(jsPsych, { page_type: "overview" })
    };
  }

  function initialQuestionsTransitionScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Questions", `
        <p>Before reviewing additional information, we would like your views about the policy issue.</p>
      `),
      on_load: () => addClickFinish(jsPsych, { page_type: "initial_questions_transition", policy_id: plan.policy.policy_id })
    };
  }

  function postQuestionsTransitionScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Questions", `
        <p>Now that you have reviewed the materials and written your argument, we would like your current views about the policy issue.</p>
      `),
      on_load: () => addClickFinish(jsPsych, { page_type: "post_questions_transition", policy_id: plan.policy.policy_id })
    };
  }

  function quantitativeQuestionsTransitionScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Factual Estimates", `
        <p>Before reviewing additional information, we would like your best estimates of several measurable real-world outcomes related to this policy.</p>
        <p><b>You can earn up to $0.50 based on how close your estimates are to the correct answers.</b></p>
      `),
      on_load: () => addClickFinish(jsPsych, {
        page_type: "pre_quantitative_questions_transition",
        policy_id: plan.policy.policy_id
      })
    };
  }

  function finalQuestionsTransitionScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Final Questions", `
        <p>A few final questions before you finish.</p>
      `),
      on_load: () => addClickFinish(jsPsych, { page_type: "final_questions_transition", policy_id: plan.policy.policy_id })
    };
  }

  function policyOverviewScreen(jsPsych, plan) {
    const p = plan.policy;
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">Policy Overview</div></div>
        ${orientationLineHtml(plan)}
        <div class="policySummary">
          <div class="subtitle">Policy proposal</div>
          <p>${escapeHtml(p.proposal_text)}</p>
          <div class="subtitle" style="margin-top:12px;">Summary of the debate</div>
          <p>${escapeHtml(p.debate_summary)}</p>
        </div>
        ${continueButtonHtml()}
      `),
      on_load: () => addClickFinish(jsPsych, { page_type: "policy_overview", policy_id: p.policy_id, advocate_position: plan.advocate_position })
    };
  }

  function roleTransitionScreen(jsPsych, plan) {
    const p = plan.policy;
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Your Advocacy Task", `
        <p>You have been assigned to <b>${escapeHtml(roleActionLabel(plan.advocate_position))}</b> the following policy proposal:</p>
        <div class="box"><b>${escapeHtml(p.proposal_text)}</b></div>
        <p>You will review some facts about the policy and then write your argument, using any of the facts you wish.</p>
        <p>The reviewer will read your argument and the facts you include before reporting their judgments about the policy and the related claims.</p>
        <p><b>You can earn up to $1.00 based on how strongly the reviewer ${plan.advocate_position === "support" ? "supports" : "opposes"} the policy after reading your argument.</b></p>
      `),
      on_load: () => addClickFinish(jsPsych, {
        page_type: "role_transition",
        policy_id: p.policy_id,
        advocate_position: plan.advocate_position
      })
    };
  }

  function groupedClaimsForDisplay(plan) {
    const claimById = Object.fromEntries((plan.policy.claims || []).map(c => [c.claim_id, c]));
    const groups = { Pro: [], Con: [] };
    (plan.claim_order || []).forEach(cid => {
      const cl = claimById[cid];
      if (!cl) return;
      if (String(cl.claim_valence_for_policy || "").toLowerCase() === "pro") groups.Pro.push(cl);
      else groups.Con.push(cl);
    });
    return groups;
  }

  function claimDisplayOrder(plan) {
    const groups = groupedClaimsForDisplay(plan);
    return groups.Pro.concat(groups.Con).map(cl => cl.claim_id);
  }

  function claimDisplayIndex(plan) {
    const out = {};
    claimDisplayOrder(plan).forEach((cid, i) => { out[cid] = i + 1; });
    return out;
  }

  function claimsGroupedHtml(plan) {
    const displayIndex = claimDisplayIndex(plan);
    const groups = groupedClaimsForDisplay(plan);
    function renderGroup(label, arr, cls) {
      if (!arr.length) return "";
      return `<div class="sectionHeader ${cls}">${label}</div>` + arr.map((cl) => `
        <div class="claimCard" data-claim_id="${escapeHtml(cl.claim_id)}">
          <div class="claimTag">Claim ${displayIndex[cl.claim_id]}</div>
          <div class="claimText">${escapeClean(cl.claim_text)}</div>
        </div>`).join("\n");
    }
    return renderGroup("Claims that support the proposed policy", groups.Pro, "proPolicy") + renderGroup("Claims that oppose the proposed policy", groups.Con, "conPolicy");
  }

  function claimsOverviewScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">Claims About the Policy</div></div>
        ${orientationLineHtml(plan)}
        <div class="instructions">The following are commonly debated claims related to the proposed policy. They are grouped by whether they tend to support or oppose the policy proposal.</div>
        ${claimsGroupedHtml(plan)}
        ${continueButtonHtml()}
      `),
      on_load: () => addClickFinish(jsPsych, { page_type: "claims_overview", policy_id: plan.policy.policy_id, claim_order: plan.claim_order })
    };
  }

  /* ==================== BELIEF PAGES ==================== */

  function quantBeliefScreen(jsPsych, plan, phase) {
    const p = plan.policy;
    const claimById = Object.fromEntries((p.claims || []).map(c => [c.claim_id, c]));
    const displayIndex = claimDisplayIndex(plan);
    const title = phase === "pre" ? "Factual Estimates" : "Current Factual Estimates";
    const instructions = phase === "pre"
      ? "Please provide your best estimates for these measurable real-world outcomes."
      : "Please provide your current estimates for these measurable real-world outcomes.";

    function renderQuestion(claim, q, idx) {
      const min = q.allowed_min === null || q.allowed_min === undefined ? "" : q.allowed_min;
      const max = q.allowed_max === null || q.allowed_max === undefined ? "" : q.allowed_max;
      const qText = cleanParticipantText(q.question_text || "").replace(/Click here to see (the source and assumptions that will be used for benchmarking|the source and assumptions that will be used to calculate the benchmark|how the benchmark is calculated|how the correct answer is determined)\.?/gi, "").trim();
      return `
        <div class="probRow" data-question_id="${escapeHtml(q.question_id)}">
          <div class="sliderPrompt">
            <div>${escapeClean(qText)}</div>
          </div>
          <div class="probInputBox">
            <input class="probInput quantInput" type="number" step="any" min="${escapeHtml(min)}" max="${escapeHtml(max)}" placeholder="${escapeHtml(min)}–${escapeHtml(max)}" data-claim_id="${escapeHtml(claim.claim_id)}" data-question_id="${escapeHtml(q.question_id)}" data-units="${escapeHtml(q.units_label || "numeric answer")}">
            <div class="probInputHint">Units: ${escapeClean(q.units_label || "numeric answer")}</div>
            <div class="probInputHint">Allowed range: ${escapeHtml(min)}–${escapeHtml(max)}</div>
            <div class="rangeError" id="rangeError_${escapeHtml(safeId(q.question_id))}"></div>
          </div>
        </div>`;
    }

    let qCounter = 0;
    const sections = claimDisplayOrder(plan).map(cid => {
      const cl = claimById[cid];
      if (!cl || !(cl.quantitative_questions || []).length) return "";
      const questionRows = (cl.quantitative_questions || []).map(q => renderQuestion(cl, q, qCounter++)).join("\n");
      return `
        <div class="quantClaimBlock" data-claim_id="${escapeHtml(cl.claim_id)}">
          <div class="quantClaimHeader">
            <div class="claimTag">Claim ${displayIndex[cl.claim_id]}</div>
            <div class="claimText">${escapeClean(cl.claim_text || "")}</div>
          </div>
          ${questionRows}
        </div>`;
    }).join("\n");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">${escapeHtml(title)}</div></div>
        <div class="instructions"><p>${escapeClean(instructions)}</p><p><b>You can earn up to $0.50 based on how close your estimates are to the correct answers.</b></p></div>
        <div class="probList">${sections}</div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const inputs = Array.from(document.querySelectorAll(".quantInput"));
        const go = document.getElementById("go");
        function validationState(x) {
          const raw = String(x.value || "").trim();
          const minRaw = String(x.getAttribute("min") || "").trim();
          const maxRaw = String(x.getAttribute("max") || "").trim();
          const min = minRaw === "" ? null : Number(minRaw);
          const max = maxRaw === "" ? null : Number(maxRaw);
          const units = x.dataset.units || "";
          const rangeText = `${minRaw} to ${maxRaw}`;
          const unitsText = units ? ` Units: ${units}.` : "";
          if (PREVIEW_MODE && raw === "") return { ok: true, message: "" };
          if (raw === "") return { ok: false, message: `Please enter a number in the allowed range: ${rangeText}.${unitsText}` };
          const v = Number(raw);
          if (!Number.isFinite(v)) return { ok: false, message: `Please enter a number in the allowed range: ${rangeText}.${unitsText}` };
          if (min !== null && Number.isFinite(min) && v < min) return { ok: false, message: `Please enter a number in the allowed range: ${rangeText}.${unitsText}` };
          if (max !== null && Number.isFinite(max) && v > max) return { ok: false, message: `Please enter a number in the allowed range: ${rangeText}.${unitsText}` };
          return { ok: true, message: "" };
        }
        function valid(x) { return validationState(x).ok; }
        function showInputError(x, force = false) {
          const state = validationState(x);
          const qid = x.dataset.question_id || "";
          const el = document.getElementById(`rangeError_${safeId(qid)}`);
          const shouldShow = !state.ok && (force || String(x.value || "").trim() !== "" || x.dataset.touched === "1");
          x.classList.toggle("invalidInput", shouldShow);
          if (el) {
            el.textContent = shouldShow ? state.message : "";
            el.style.display = shouldShow ? "block" : "none";
          }
          return state.ok;
        }
        function updateGate() {
          inputs.forEach(x => showInputError(x, false));
          if (go) go.disabled = !inputs.every(valid);
        }
        inputs.forEach(x => {
          x.addEventListener("input", () => { x.dataset.touched = "1"; updateGate(); });
          x.addEventListener("blur", () => { x.dataset.touched = "1"; showInputError(x, true); updateGate(); });
        });
        updateGate();
        go.addEventListener("click", () => {
          const allValid = inputs.map(x => showInputError(x, true)).every(Boolean);
          if (!allValid) { updateGate(); return; }
          const responses = inputs.map(x => {
            const claim_id = x.dataset.claim_id;
            const question_id = x.dataset.question_id;
            const cl = claimById[claim_id] || {};
            const q = (cl.quantitative_questions || []).find(z => z.question_id === question_id) || {};
            const response = numberOrNull(x.value);
            const benchmark = numberOrNull(q.benchmark_value);
            const abs_error = response !== null && benchmark !== null ? Math.abs(response - benchmark) : null;
            return {
              page_type: `${phase}_quant_belief_row`, phase, policy_id: p.policy_id,
              claim_id, question_id, claim_text: cl.claim_text || "", question_text: q.question_text || "",
              response, units_label: q.units_label || "", allowed_min: q.allowed_min, allowed_max: q.allowed_max,
              benchmark_value: benchmark, benchmark_units: q.benchmark_units || "", abs_error,
              higher_value_supports_claim: q.higher_value_supports_claim,
              higher_value_supports_policy: q.higher_value_supports_policy
            };
          });
          responses.forEach(r => writeDataRow(jsPsych, r));
          jsPsych.finishTrial({
            page_type: `${phase}_quant_beliefs`, phase, policy_id: p.policy_id, responses
          });
        });
      }
    };
  }

  function claimWarrantedScreen(jsPsych, plan, phase) {
    const p = plan.policy;
    const claimById = Object.fromEntries((p.claims || []).map(c => [c.claim_id, c]));
    const displayIndex = claimDisplayIndex(plan);
    const title = phase === "pre" ? "Claim Judgments" : "Current Claim Judgments";
    const groups = groupedClaimsForDisplay(plan);
    function renderGroup(label, arr, cls) {
      if (!arr.length) return "";
      return `<div class="sectionHeader ${cls}">${label}</div>` + arr.map((cl) => `
        <div class="probRow">
          <div class="sliderPrompt">
            <div class="claimTag">Claim ${displayIndex[cl.claim_id]}</div>
            <div class="claimText">${escapeHtml(cl.claim_text)}</div>
          </div>
          <div class="probInputBox">
            <input class="probInput warrantInput" type="number" min="0" max="100" step="1" placeholder="0–100" data-claim_id="${escapeHtml(cl.claim_id)}">
          </div>
        </div>`).join("\n");
    }
    const rows = renderGroup("Claims that support the proposed policy", groups.Pro, "proPolicy") + renderGroup("Claims that oppose the proposed policy", groups.Con, "conPolicy");
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">${escapeHtml(title)}</div></div>
        <div class="instructions">${phase === "pre" ? "Before reviewing additional information, please indicate how warranted each claim seems." : "Now that you have reviewed the materials and written your argument, please indicate how warranted each claim seems."}</div>
        <div class="box" style="max-width:860px; margin:10px auto 12px; background:#fff;"><b>Scale:</b> 0 = not warranted at all; 100 = completely warranted.</div>
        <div class="probList">${rows}</div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const inputs = Array.from(document.querySelectorAll(".warrantInput"));
        const go = document.getElementById("go");
        function valid(x) { if (PREVIEW_MODE && String(x.value || "").trim() === "") return true; const v = Number(x.value); return String(x.value || "").trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100; }
        function updateGate() { if (go) go.disabled = !inputs.every(valid); }
        inputs.forEach(x => x.addEventListener("input", updateGate));
        updateGate();
        go.addEventListener("click", () => {
          const responses = inputs.map(x => {
            const cl = claimById[x.dataset.claim_id] || {};
            return { page_type: `${phase}_claim_warranted_row`, phase, policy_id: p.policy_id, claim_id: x.dataset.claim_id, claim_text: cl.claim_text || "", response: numberOrNull(x.value) };
          });
          responses.forEach(r => writeDataRow(jsPsych, r));
          jsPsych.finishTrial({ page_type: `${phase}_claim_warranted`, phase, policy_id: p.policy_id, responses });
        });
      }
    };
  }

  function policySupportScreen(jsPsych, plan, phase) {
    const p = plan.policy;
    const title = phase === "pre" ? "Policy View" : "Current Policy View";
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">${escapeHtml(title)}</div></div>
        <div class="instructions">Please indicate your view of the proposed policy.</div>
        <div class="policySummary"><b>${escapeHtml(p.proposal_text)}</b></div>
        <div class="probList">
          <div class="probRow">
            <div class="sliderPrompt">Overall, do you support or oppose this policy?</div>
            <div class="probInputBox"><input id="own_support" class="probInput" type="number" min="0" max="100" step="1" placeholder="0–100"><div class="probInputHint">0 = strongly oppose; 100 = strongly support</div></div>
          </div>
        </div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const inputs = [document.getElementById("own_support")];
        const go = document.getElementById("go");
        function valid(x) { if (PREVIEW_MODE && String(x.value || "").trim() === "") return true; const v = Number(x.value); return String(x.value || "").trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100; }
        function updateGate() { if (go) go.disabled = !inputs.every(valid); }
        inputs.forEach(x => x.addEventListener("input", updateGate));
        updateGate();
        go.addEventListener("click", () => jsPsych.finishTrial({
          page_type: `${phase}_policy_support`, phase, policy_id: p.policy_id, advocate_position: plan.advocate_position,
          own_policy_support: numberOrNull(inputs[0].value)
        }));
      }
    };
  }

  /* ==================== DOSSIER ==================== */

  function factCardHtml(f) {
    const fn = f._fn;
    const label = f._flabel || String(fn);
    const claimSide = factClaimSide(f);
    const sideLabel = claimSide === "supports_claim" ? "Supports claim" : claimSide === "opposes_claim" ? "Opposes claim" : "Fact";
    return `
      <div class="factCard" data-fact_id="${escapeHtml(f.fact_id)}" data-fn="${fn}">
        <div class="factHeader">
          <div class="factTitle">Fact ${escapeHtml(label)} <span class="sidePill">${escapeHtml(sideLabel)}</span></div>
          <div class="factHeaderRight">
            <button class="btn small openBtn" type="button" data-fn="${fn}">Open</button>
            <button class="btn small insertBtn" data-fn="${fn}" data-fid="${escapeHtml(f.fact_id)}" type="button">Insert reference</button>
            <label class="attachWrap"><input class="attachChk" type="checkbox" data-fn="${fn}" data-fid="${escapeHtml(f.fact_id)}"> Attach</label>
          </div>
        </div>
        <div id="factBody_${fn}" class="factBody">
          <div class="factText">${escapeClean(f.fact_text || "")}</div>
          <div style="margin-top:10px;"><button class="btn small sourceBtn" type="button" data-fn="${fn}">View source</button></div>
          <div id="sourceBody_${fn}" class="sourceBody"><b>Source:</b> ${escapeClean(f.source_name || "")}${f.source_url ? `<br>${escapeClean(f.source_url)}` : ""}</div>
        </div>
      </div>`;
  }

  function factsGroupedHtml(plan) {
    const displayIndex = claimDisplayIndex(plan);
    const groups = groupedClaimsForDisplay(plan);
    const proClaims = groups.Pro;
    const conClaims = groups.Con;
    function renderClaims(claims) {
      if (!claims.length) return `<div class="muted">No claims in this group.</div>`;
      return claims.map(cl => {
        const facts = plan.shown_facts_by_claim[cl.claim_id] || [];
        if (!facts.length) return "";
        const sup = facts.filter(f => factClaimSide(f) === "supports_claim");
        const opp = facts.filter(f => factClaimSide(f) === "opposes_claim");
        return `<div class="claimCard">
          <div class="claimTag">Claim ${displayIndex[cl.claim_id]}</div>
          <div class="claimText">${escapeClean(cl.claim_text)}</div>
          ${sup.length ? `<div class="factSubgroup">${sup.map(factCardHtml).join("\n")}</div>` : ""}
          ${opp.length ? `<div class="factSubgroup">${opp.map(factCardHtml).join("\n")}</div>` : ""}
        </div>`;
      }).join("\n");
    }
    return `
      <div class="evidenceGrid">
        <div class="evidencePanel supportPanel">
          <div class="evidencePanelTitle">Claims that support the proposed policy</div>
          ${renderClaims(proClaims)}
        </div>
        <div class="evidencePanel opposePanel">
          <div class="evidencePanelTitle">Claims that oppose the proposed policy</div>
          ${renderClaims(conClaims)}
        </div>
      </div>`;
  }

  function dossierScreen(jsPsych, plan, draftStore) {
    const p = plan.policy;
    const draftKey = p.policy_id;
    const openSummary = {};
    const sourceSummary = {};
    plan.facts_flat.forEach(f => {
      openSummary[f._fn] = { openedOnce: false, openCount: 0, totalOpenMs: 0 };
      sourceSummary[f._fn] = { openedOnce: false, openCount: 0, totalOpenMs: 0 };
    });
    const intervals = [];
    const sourceIntervals = [];
    const insertEvents = [];
    const attachedFactIds = new Set();
    const insertionCounts = {};
    plan.dossier_pass_counter = (plan.dossier_pass_counter || 0) + 1;
    const dossierPass = plan.dossier_pass_counter;

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">Writing Your Argument</div></div>
        ${orientationLineHtml(plan, true)}
        <div class="instructions">
          <p>Write your argument <b>${escapeHtml(roleDirectionLabel(plan.advocate_position))}</b> the proposed policy using any of the facts below.</p>
          <p>You can use the buttons below to choose which facts the reviewer will see with your argument.</p>
        </div>
        <div class="box" style="text-align:left !important;">
          <div style="font-weight:800; margin-bottom:10px; text-align:center !important;">Using the facts below</div>
          <div style="line-height:1.38;">
            <div><b>Open</b> — Click to read the fact and view its source.</div>
            <div style="margin-top:6px;"><b>Attach</b> — Click to include the fact with your argument.</div>
            <div style="margin-top:6px;"><b>Insert reference</b> — Click to reference the fact at a specific point in your argument. A reference number corresponding to the fact will be inserted automatically.</div>
            <div style="margin-top:8px;"><b>Only facts you attach or reference will be shown to the reviewer.</b></div>
          </div>
        </div>
        <div>
          <div class="subtitle" style="margin-top:18px; margin-bottom:8px;">Available facts</div>
          ${factsGroupedHtml(plan)}
          <div class="subtitle" style="margin-top:18px;">Write your argument here:</div>
          <textarea id="argBox" placeholder="This policy should be ${plan.advocate_position === "support" ? "supported" : "opposed"} because...\n\nLength: About 1–2 short paragraphs."></textarea>
          <div class="wc">Word count: <span id="wcN">0</span> (minimum: <span id="wcMin">${PREVIEW_MODE ? CFG.preview_min_argument_words : CFG.min_argument_words}</span>)</div>
          ${continueButtonHtml("Continue", { id: "continueBtn2", disabled: !PREVIEW_MODE })}
        </div>
      `),
      on_load: () => {
        const minWords = PREVIEW_MODE ? CFG.preview_min_argument_words : CFG.min_argument_words;
        const argBox = document.getElementById("argBox");
        const wcN = document.getElementById("wcN");
        const cont = document.getElementById("continueBtn2");
        let openFactFn = null, openFactStart = null;
        let openSourceFn = null, openSourceStart = null;

        const saved = draftStore[draftKey] || null;
        if (saved && typeof saved.text === "string") argBox.value = saved.text;
        if (saved && Array.isArray(saved.attached_fact_ids)) {
          saved.attached_fact_ids.forEach(fid => attachedFactIds.add(fid));
        }
        if (saved && saved.insertion_counts && typeof saved.insertion_counts === "object") {
          Object.keys(saved.insertion_counts).forEach(fid => { insertionCounts[fid] = Number(saved.insertion_counts[fid]) || 0; });
        }

        function closeFact() {
          if (openFactFn === null) return;
          const body = document.getElementById(`factBody_${openFactFn}`);
          if (body) body.style.display = "none";
          const elapsed = Math.max(0, nowMs() - openFactStart);
          if (openSummary[openFactFn]) openSummary[openFactFn].totalOpenMs += elapsed;
          intervals.push({ fn: openFactFn, durationMs: Math.round(elapsed) });
          openFactFn = null; openFactStart = null;
        }
        function closeSource() {
          if (openSourceFn === null) return;
          const body = document.getElementById(`sourceBody_${openSourceFn}`);
          if (body) body.style.display = "none";
          const elapsed = Math.max(0, nowMs() - openSourceStart);
          if (sourceSummary[openSourceFn]) sourceSummary[openSourceFn].totalOpenMs += elapsed;
          sourceIntervals.push({ fn: openSourceFn, durationMs: Math.round(elapsed) });
          openSourceFn = null; openSourceStart = null;
        }
        function updateRequirementStatus(el, ok) {
          if (!el) return;
          el.textContent = ok ? "✓" : "✗";
          el.classList.toggle("reqMet", ok);
          el.classList.toggle("reqMissing", !ok);
        }
        function updateGate() {
          const wc = wordCount(argBox.value);
          const hasEnoughWords = wc >= minWords;
          if (wcN) wcN.textContent = String(wc);
          if (cont) cont.disabled = (!PREVIEW_MODE && !hasEnoughWords);
        }
        function currentInsertedFactIdsFromText() {
          const text = argBox.value || "";
          const ids = new Set();
          plan.facts_flat.forEach(f => {
            const tagRegex = new RegExp(`\\[F${escapeRegex(f._flabel || String(f._fn))}\\]`, "g");
            if (tagRegex.test(text)) ids.add(f.fact_id);
          });
          return ids;
        }
        function usedFactIds() {
          const currentInserted = currentInsertedFactIdsFromText();
          return Array.from(new Set([...currentInserted, ...attachedFactIds]));
        }
        function updateAttachedSummary() {
          // No on-page fact-count requirement is displayed; Insert/Attach states remain visible on the fact cards.
        }
        function persistDraft() {
          draftStore[draftKey] = { text: argBox.value, attached_fact_ids: Array.from(attachedFactIds), used_fact_ids: usedFactIds(), insertion_counts: { ...insertionCounts } };
        }
        argBox.addEventListener("input", () => { updateAttachedSummary(); updateGate(); persistDraft(); });
        document.querySelectorAll(".openBtn").forEach(btn => btn.addEventListener("click", () => {
          const fn = Number(btn.dataset.fn);
          if (openFactFn !== null && openFactFn !== fn) closeFact();
          const body = document.getElementById(`factBody_${fn}`);
          if (!body) return;
          const hidden = body.style.display !== "block";
          body.style.display = hidden ? "block" : "none";
          if (hidden) {
            openFactFn = fn; openFactStart = nowMs();
            openSummary[fn].openedOnce = true; openSummary[fn].openCount += 1;
          } else closeFact();
        }));
        document.querySelectorAll(".sourceBtn").forEach(btn => btn.addEventListener("click", () => {
          const fn = Number(btn.dataset.fn);
          if (openSourceFn !== null && openSourceFn !== fn) closeSource();
          const body = document.getElementById(`sourceBody_${fn}`);
          if (!body) return;
          const hidden = body.style.display !== "block";
          body.style.display = hidden ? "block" : "none";
          if (hidden) {
            openSourceFn = fn; openSourceStart = nowMs();
            sourceSummary[fn].openedOnce = true; sourceSummary[fn].openCount += 1;
          } else closeSource();
        }));
        document.querySelectorAll(".insertBtn").forEach(btn => btn.addEventListener("click", () => {
          const fn = Number(btn.dataset.fn); const fid = btn.dataset.fid; const fact = plan.facts_flat.find(z => z.fact_id === fid) || {}; const tag = `[F${fact._flabel || fn}]`;
          const start = argBox.selectionStart ?? argBox.value.length;
          const end = argBox.selectionEnd ?? argBox.value.length;
          argBox.value = argBox.value.slice(0, start) + tag + argBox.value.slice(end);
          const newPos = start + tag.length;
          argBox.focus(); argBox.setSelectionRange(newPos, newPos);
          insertionCounts[fid] = (insertionCounts[fid] || 0) + 1;
          insertEvents.push({ fn, fact_id: fid, tMs: nowMs() });
          updateAttachedSummary(); updateGate(); persistDraft();
        }));
        document.querySelectorAll(".attachChk").forEach(chk => {
          const fid = chk.dataset.fid;
          chk.checked = attachedFactIds.has(fid);
          chk.addEventListener("change", () => {
            if (chk.checked) attachedFactIds.add(fid); else attachedFactIds.delete(fid);
            updateAttachedSummary(); updateGate(); persistDraft();
          });
        });
        updateGate(); updateAttachedSummary(); persistDraft();
        cont.addEventListener("click", () => {
          closeFact(); closeSource(); persistDraft();
          const currentInserted = currentInsertedFactIdsFromText();
          const usedIds = usedFactIds(); const usedSet = new Set(usedIds);
          const factProcess = plan.facts_flat.map(f => ({
            dossier_pass: dossierPass,
            fn: f._fn, fact_id: f.fact_id, claim_id: f.claim_id,
            picked_claim_side: f._picked_claim_side || factClaimSide(f), fact_relation_to_policy: f.fact_relation_to_policy,
            opened: openSummary[f._fn].openedOnce ? 1 : 0, open_count: openSummary[f._fn].openCount || 0, total_open_ms: Math.round(openSummary[f._fn].totalOpenMs || 0),
            source_opened: sourceSummary[f._fn].openedOnce ? 1 : 0, source_open_count: sourceSummary[f._fn].openCount || 0, source_total_open_ms: Math.round(sourceSummary[f._fn].totalOpenMs || 0),
            inserted: currentInserted.has(f.fact_id) ? 1 : 0, attached: attachedFactIds.has(f.fact_id) ? 1 : 0, used: usedSet.has(f.fact_id) ? 1 : 0,
            insertion_count: insertionCounts[f.fact_id] || 0
          }));
          factProcess.forEach(row => writeDataRow(jsPsych, { page_type: "dossier_fact_process", policy_id: p.policy_id, advocate_position: plan.advocate_position, dossier_pass: dossierPass, ...row }));
          jsPsych.finishTrial({
            page_type: "dossier", policy_id: p.policy_id, advocate_position: plan.advocate_position, dossier_pass: dossierPass,
            facts_shown_ids: plan.facts_shown_ids, argument_text: argBox.value, argument_word_count: wordCount(argBox.value),
            inserted_fact_ids: Array.from(currentInserted), attached_fact_ids: Array.from(attachedFactIds), used_fact_ids: usedIds,
            dossier_fact_process: factProcess, dossier_open_intervals: intervals, source_open_intervals: sourceIntervals, dossier_insert_events: insertEvents
          });
        });
      }
    };
  }

  function dossierPreviewScreen(jsPsych, plan, draftStore) {
    const p = plan.policy;
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: () => {
        const saved = draftStore[p.policy_id] || { text: "", used_fact_ids: [] };
        const usedSet = new Set(saved.used_fact_ids || []);
        const usedFacts = plan.facts_flat.filter(f => usedSet.has(f.fact_id));
        const factsHtml = usedFacts.length ? usedFacts.map(f => `<div class="claimCard"><b>[F${escapeHtml(f._flabel || f._fn)}]</b> ${escapeHtml(f.fact_text || "")}</div>`).join("\n") : `<div class="muted">No facts included.</div>`;
        return pageHtml(`
          <div class="s1Header"><div class="title">Reviewing Your Argument</div></div>
          ${orientationLineHtml(plan, true)}
          <div class="previewBox"><div class="previewTitle">Argument</div><div style="white-space:pre-wrap; line-height:1.4;">${escapeHtml(saved.text || "")}</div></div>
          <div class="previewBox"><div class="previewTitle">Facts included with your argument</div>${factsHtml}</div>
          <button id="revise" class="btn backBtn" type="button">Revise argument</button>
          ${continueButtonHtml("Continue")}
        `);
      },
      on_load: () => {
        document.getElementById("revise").addEventListener("click", () => jsPsych.finishTrial({ page_type: "dossier_preview", policy_id: p.policy_id, confirm: false }));
        document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type: "dossier_preview", policy_id: p.policy_id, confirm: true }));
      }
    };
  }

  function activationScreen(jsPsych, plan) {
    const displayIndex = claimDisplayIndex(plan);
    const groups = groupedClaimsForDisplay(plan);

    function renderFactRow(f) {
      const label = f._flabel || String(f._fn);
      return `
        <div class="activationRow">
          <div style="flex:1 1 auto;"><div class="claimTag"><b>Fact ${escapeHtml(label)}</b></div><div class="factText">${escapeHtml(f.fact_text || "")}</div></div>
          <label class="attachWrap" style="min-width:40px; justify-content:flex-end; padding-top:4px;"><input class="actChk" type="checkbox" data-fact_id="${escapeHtml(f.fact_id)}" data-fn="${f._fn}"></label>
        </div>`;
    }

    function renderClaims(claims) {
      if (!claims.length) return `<div class="muted">No claims in this group.</div>`;
      return claims.map(cl => {
        const facts = plan.shown_facts_by_claim[cl.claim_id] || [];
        if (!facts.length) return "";
        return `
          <div class="activationClaimBlock" data-claim_id="${escapeHtml(cl.claim_id)}">
            <div class="activationClaimHeader">
              <div class="claimTag">Claim ${displayIndex[cl.claim_id]}</div>
              <div class="claimText">${escapeClean(cl.claim_text || "")}</div>
            </div>
            ${facts.map(renderFactRow).join("\n")}
          </div>`;
      }).join("\n");
    }

    const rows = `
      <div class="sectionHeader proPolicy">Claims that support the proposed policy</div>
      ${renderClaims(groups.Pro)}
      <div class="sectionHeader conPolicy">Claims that oppose the proposed policy</div>
      ${renderClaims(groups.Con)}`;

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">Facts That Came to Mind</div></div>
        <div class="instructions">Please indicate which facts came to mind while answering the previous questions about the policy and related claims.</div>
        <div class="probList">${rows}</div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const boxes = Array.from(document.querySelectorAll(".actChk"));
        const go = document.getElementById("go");
        function checked() { return boxes.filter(x => x.checked).map(x => x.dataset.fact_id); }
        function updateGate() { if (go) go.disabled = (!PREVIEW_MODE && checked().length === 0); }
        boxes.forEach(b => b.addEventListener("change", updateGate));
        updateGate();
        go.addEventListener("click", () => jsPsych.finishTrial({ page_type: "activation_check", policy_id: plan.policy.policy_id, advocate_position: plan.advocate_position, facts_shown_ids: plan.facts_shown_ids, activated_fact_ids: checked() }));
      }
    };
  }

  function feedbackScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="title">Optional Feedback</div>
        <div class="instructions">If you have feedback—anything confusing, any technical issues, or anything we should improve—you can share it below.</div>
        <div class="box" style="background:#fff;"><textarea id="fb" style="min-height:150px;" placeholder="Feedback..."></textarea></div>
        ${continueButtonHtml("Continue")}
      `),
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type: "end_feedback", feedback: document.getElementById("fb").value || "" }))
    };
  }

  function prolificEndScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="title">All done</div>
        <div class="instructions">Your completion code is:<div style="margin:12px 0 16px 0;"><span style="font-size:18px; padding:10px 12px; border:1px solid #ddd; border-radius:12px; background:#fafafa; display:inline-block; letter-spacing:.06em;">${escapeHtml(CFG.prolific_completion_code)}</span></div>Clicking the button below will redirect you to Prolific.</div>
        ${continueButtonHtml("Continue")}
      `),
      on_load: () => document.getElementById("go").addEventListener("click", () => {
        jsPsych.finishTrial({ page_type: "prolific_end", prolific_completion_code: CFG.prolific_completion_code });
        try { window.location.href = PROLIFIC_REDIRECT_URL; } catch (_) {}
      })
    };
  }

  /* ==================== MAIN ==================== */

  async function main() {
    try {
      const stim = await loadStimuli();
      const policy = (CFG.forced_policy_id
        ? (stim.policies || []).find(p => p.policy_id === CFG.forced_policy_id)
        : shuffle(stim.policies)[0]);
      if (!policy) throw new Error(`Forced policy_id not found in stimuli JSON: ${CFG.forced_policy_id}`);
      const plan = makePlan(policy);
      const draftStore = {};

      const jsPsych = initJsPsych({
        show_progress_bar: CFG.show_progress_bar,
        auto_update_progress_bar: true,
        on_finish: () => { try { console.log(jsPsych.data.get().values()); } catch (_) {} }
      });

      addDataProperties(jsPsych, {
        study_id: CFG.study_id,
        js_version: CFG.js_version,
        stimuli_file: CFG.stimuli_path,
        stimuli_schema_version: stim.schema_version || "",
        preview_mode: PREVIEW_MODE,
        prolific_pid: URL_PARAMS.get("PROLIFIC_PID") || "",
        study_id_param: URL_PARAMS.get("STUDY_ID") || "",
        session_id_param: URL_PARAMS.get("SESSION_ID") || "",
        selected_policy_id: policy.policy_id,
        selected_policy_name: policy.policy_name,
        advocate_position: plan.advocate_position,
        claim_order: plan.claim_order,
        claim_display_order: claimDisplayOrder(plan),
        claim_display_index: claimDisplayIndex(plan),
        fact_display_labels: plan.fact_display_labels,
        facts_shown_ids: plan.facts_shown_ids,
        sampler_side_selections: plan.sampler_side_selections,
        sampler_schema_warnings: plan.sampler_schema_warnings
      });

      writeDataRow(jsPsych, {
        page_type: "assignment",
        policy_id: policy.policy_id,
        policy_name: policy.policy_name,
        advocate_position: plan.advocate_position,
        claim_order: plan.claim_order,
        claim_display_order: claimDisplayOrder(plan),
        claim_display_index: claimDisplayIndex(plan),
        fact_display_labels: plan.fact_display_labels,
        facts_shown_ids: plan.facts_shown_ids,
        sampler_side_selections: plan.sampler_side_selections,
        sampler_schema_warnings: plan.sampler_schema_warnings
      });

      const timeline = [
        consentScreen(jsPsych),
        overviewScreen(jsPsych),
        policyOverviewScreen(jsPsych, plan),
        claimsOverviewScreen(jsPsych, plan),
        initialQuestionsTransitionScreen(jsPsych, plan),
        claimWarrantedScreen(jsPsych, plan, "pre"),
        policySupportScreen(jsPsych, plan, "pre"),
        quantBeliefScreen(jsPsych, plan, "pre"),
        roleTransitionScreen(jsPsych, plan),
        {
          timeline: [dossierScreen(jsPsych, plan, draftStore), dossierPreviewScreen(jsPsych, plan, draftStore)],
          loop_function: (data) => {
            const last = data.values().slice(-1)[0] || {};
            return last.confirm === false;
          }
        },
        postQuestionsTransitionScreen(jsPsych, plan),
        claimWarrantedScreen(jsPsych, plan, "post"),
        policySupportScreen(jsPsych, plan, "post"),
        quantBeliefScreen(jsPsych, plan, "post"),
        finalQuestionsTransitionScreen(jsPsych, plan),
        activationScreen(jsPsych, plan),
        feedbackScreen(jsPsych),
        prolificEndScreen(jsPsych)
      ];

      jsPsych.run(timeline);
    } catch (err) { showFatalError(err); }
  }

  function startStudy() {
    if (document.body && !document.body.innerHTML.trim()) {
      document.body.innerHTML = '<div style="font-family: Arial, sans-serif; padding:16px;">Loading…</div>';
    }
    main();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startStudy);
  else startStudy();
})();