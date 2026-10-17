/*******************************************************
 * Legal Evidence Study — Cognition.run (jsPsych 8.x)
 * Clean rebuild — one-case disputed-issue/dossier design
 * Version: v7.06; Time of last edit: 6:33 p.m. June 5 2026
 *
 * Active design:
 *  - One random case per participant.
 *  - Random assignment to prepare an argument for Plaintiff or Defendant.
 *  - Disputed-issue priors + verdict prior.
 *  - Dossier task with Open / Insert / Attach evidence mechanics.
 *  - Each evidence item stores open count, total open duration, and whether it was inserted, attached, and used analytically.
 *  - Disputed-issue posteriors + verdict posterior.
 *  - Activation follow-up only.

 *******************************************************/

(function () {
  "use strict";

  /* ==================== CONFIG ==================== */

  const CFG = {
    study_id: "legal_evidence_clean_v7",
    js_version: "v7_clean_04_pruned_json",
    stimuli_path: "stimuli/cleaned_pruned_based_on_best_validation_facts.json",
    prolific_completion_code: "C1379C4O",
    min_argument_words: 80,
    preview_min_argument_words: 0,
    show_progress_bar: true
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

  function showFatalError(err) {
    const msg = (err && (err.stack || err.message)) || String(err);
    const html = `
      <div style="font-family: Arial, sans-serif; padding:16px; max-width:1100px; margin:0 auto;">
        <h2>Script error</h2>
        <pre style="white-space:pre-wrap; background:#f7f7f7; padding:12px; border-radius:10px; border:1px solid #eee;">${escapeHtml(msg)}</pre>
        <div style="margin-top:10px; font-size:13px; color:#555;">
          If this persists, copy the error above and send it to the researcher.
        </div>
      </div>`;
    try {
      document.body.innerHTML = html;
    } catch (_) {
      try { alert(msg); } catch (__) {}
    }
  }

  window.onerror = function (_message, _source, _lineno, _colno, error) {
    showFatalError(error || _message);
    return true;
  };
  window.addEventListener("unhandledrejection", (event) => {
    showFatalError(event.reason || event);
  });

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

  function titleCaseLabel(s) {
    return String(s || "Case")
      .replaceAll("_", " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function getFactSide(f) {
    const explicit = String(f.direction || f.fact_helps_side || f.fact_side || "").trim().toLowerCase();
    if (explicit === "plaintiff" || explicit === "defendant") return explicit;
    if (f.supports_plaintiff) return "plaintiff";
    if (f.supports_defendant) return "defendant";
    return "";
  }

  function nowMs() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  function addDataProperties(jsPsych, obj) {
    try { jsPsych.data.addProperties(obj); } catch (_) {}
  }

  function writeDataRow(jsPsych, row) {
    try {
      if (jsPsych && jsPsych.data && typeof jsPsych.data.write === "function") {
        jsPsych.data.write(row);
        return true;
      }
      if (jsPsych && jsPsych.data && typeof jsPsych.data.addData === "function") {
        jsPsych.data.addData(row);
        return true;
      }
    } catch (_) {}
    return false;
  }

  /* ==================== CSS + UI HELPERS ==================== */

  const BASE_CSS = `
  <style>
    .page, .page * { text-align: left; box-sizing: border-box; }
    .page { max-width: 1100px; margin: 0 auto; padding: 0 14px 76px; font-family: Arial, sans-serif; color: #111; }
    .textPage { max-width: 820px; margin: 0 auto; padding-top: 0; }

    .jspsych-display-element {
      width: 100% !important;
    }

    .jspsych-content-wrapper {
      width: 100% !important;
      max-width: 1100px !important;
      margin: 0 auto !important;
      padding: 0 14px !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
    }

    .jspsych-content {
      width: 100% !important;
      max-width: 1100px !important;
      margin: 0 auto !important;
      padding-top: 56px !important;
    }

    .transitionPage {
      max-width: 820px;
      margin: 0 auto;
      padding-top: 160px;
    }

    .transitionPage .instructions {
      margin-top: 0;
      font-size: 17px;
      line-height: 1.45;
    }

    .overviewPage {
      max-width: 720px;
      margin: 0 auto;
      padding-top: 32px;
    }

    .overviewPage .instructions {
      margin-top: 18px;
      font-size: 16px;
      line-height: 1.45;
    }

    .title { font-size: 24px; font-weight: 800; margin: 6px 0 22px; letter-spacing: -0.2px; text-align: center !important; width: 100%; }
    .subtitle { font-size: 16px; font-weight: 800; margin: 0 0 8px; }
    .instructions { font-size: 16px; line-height: 1.4; margin: 18px auto 14px; color:#111; max-width: 820px; }
    .muted { font-size: 13px; color: #555; margin-top: 6px; }
    .noteLine { font-size: 13px; color:#555; margin-top: 10px; }
    .orientationLine { max-width: 980px; margin: -8px auto 16px; font-size: 13px; color: #444; text-align: center !important; line-height: 1.35; }
    .hr { height: 1px; background:#eee; margin: 14px 0; }
    .space-sm { height: 8px; }

    .btn { border: 1px solid #aaa; background: #f7f7f7; border-radius: 12px; padding: 9px 11px; cursor:pointer; font-size: 15px; }
    .btn.small { padding: 7px 9px; font-size: 13px; }
    .btn:hover { filter: brightness(0.98); }
    .btn:active { transform: translateY(1px); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .continueBtn { width: auto; min-width: 120px; padding: 10px 16px; font-size: 16px; border-radius: 14px; position: fixed; bottom: 18px; right: 18px; z-index: 50; box-shadow: 0 4px 14px rgba(0,0,0,0.18); max-width: 220px; white-space: nowrap; display: inline-block; }
    .backBtn { position: fixed; bottom: 18px; left: 18px; width: auto; display: inline-block; min-width: 140px; max-width: 260px; white-space: nowrap; z-index: 50; }

    .box { border: 1px solid #ddd; border-radius: 14px; padding: 12px; background: #fafafa; margin: 12px 0; }
    .caseBar { border: 1px solid #ddd; border-radius: 14px; padding: 12px; background: #fff; margin: 10px 0; position: relative; }
    .caseTopLine { font-size: 15px; font-weight: 800; text-align: left !important; }
    .casePartyLine { font-size: 13px; color: #444; margin-top: 4px; }
    details.caseSummary { border: 1px solid #e5e5e5; border-radius: 14px; padding: 10px 12px; background: #fff; margin-top: 10px; }
    details.caseSummary summary { list-style: none; cursor: pointer; font-weight: 900; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    details.caseSummary summary::-webkit-details-marker { display: none; }
    details.caseSummary summary::after { content: "▾"; font-weight: 900; opacity: 0.6; }
    details.caseSummary[open] summary::after { content: "▴"; }
    .accordionContent { margin-top: 10px; }

    .s1Header { background: rgba(0,0,0,0.07); border: 1px solid rgba(0,0,0,0.14); padding: 12px 14px; border-radius: 14px; margin: 10px 6px 28px 6px; }
    .s1Header .title { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
    .s1Header .muted { font-size: 13px; color: rgba(0,0,0,0.6); text-align: center !important; }

    .claimList { margin-top:10px; margin-left:6px; margin-right:6px; padding:8px 10px; border:1px solid rgba(0,0,0,0.06); border-radius:16px; overflow:hidden; background:rgba(0,0,0,0.012); }
    .claimItem { background: transparent; border:none; border-bottom:1px solid rgba(0,0,0,0.06); border-radius:0; padding:12px 12px; margin:0; }
    .claimItem:last-child { border-bottom:none; }
    .claimTag { color:rgba(0,0,0,0.60); font-size:13px; margin-bottom:4px; }
    .claimText { font-size:16px; line-height:1.35; }

    .probList .sliderGroup { display:flex; flex-direction:column; gap:0; }
    .probRow { display:flex; justify-content:space-between; gap:12px; background:transparent; border:none; border-bottom:1px solid rgba(0,0,0,0.06); border-radius:0; padding:12px 12px; margin:0; align-items:flex-start; }
    .probRow:last-child { border-bottom:none; }
    .sliderPrompt { flex: 1 1 auto; min-width: 0; width:100%; max-width:720px; padding-right: 12px; }
    .probInputBox { min-width:160px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .probInput { width:140px; padding:8px 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.22); font-size:16px; text-align:left !important; }
    .probInputHint { font-size:12px; color:#555; text-align:right !important; margin-top:0; }

    .layoutRow { display:flex; gap:16px; align-items:flex-start; flex-wrap:nowrap; }
    .colLeft { flex: 1 1 0; min-width:0; }
    .colRight { flex:0 0 390px; max-width:390px; }
    @media (max-width: 980px) {
      .layoutRow { flex-direction: column !important; }
      .colRight { order: -1 !important; flex: 1 1 auto; max-width: none; width: 100%; }
      .probInputBox { min-width:160px; width:auto; }
      .probRow { flex-direction: column; align-items: stretch; }
    }

    textarea { width:100%; min-height:220px; font-size:15px; line-height:1.4; padding:12px; border-radius:14px; border:1px solid #ccc; }
    .wc { margin-top: 8px; font-size:13px; color:#444; }
    .tip { font-size:14px; background:#f3f6ff; border:1px solid #dbe4ff; padding:10px 12px; border-radius:14px; margin:10px 0; }

    .claimGroup { border:1px solid #e5e5e5; border-radius:14px; padding:10px 12px; background:#fff; margin:12px 0; }
    .claimHeaderRow { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .claimTitle { font-size:15px; font-weight:900; }
    .claimToggle { cursor:pointer; user-select:none; font-weight:900; }

    .factCard { border:1px solid #ddd; border-radius:14px; padding:10px 12px; margin:10px 0; background:#fff; }
    .factHeader { display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .factTitle { font-size:15px; font-weight:800; }
    .factHeaderRight { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .factBody { margin-top:10px; padding-top:10px; border-top:1px solid #eee; }
    .factText { font-size:14px; line-height:1.45; }
    .factFooter { margin-top:10px; display:flex; justify-content:flex-end; }
    .attachWrap { font-size:13px; display:flex; gap:6px; align-items:center; }
    .sidePill { display:inline-block; margin-left:10px; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; line-height:1.2; border:1px solid rgba(0,0,0,0.15); background:rgba(0,0,0,0.04); }
    .tag { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

    .previewBox { border:1px solid #ddd; border-radius:14px; padding:12px; background:#fff; margin:10px 0; }
    .previewTitle { font-weight:800; margin-bottom:6px; }
    .previewFact { margin:10px 0; font-size:14px; }

    .activationRow { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:14px 12px; border-bottom:1px solid rgba(0,0,0,0.06); }
    .activationRow:last-child { border-bottom:none; }
  
.header-plain, .title-plain { background: transparent !important; border:none !important; box-shadow:none !important; padding:0 !important; margin-bottom:14px !important; }
.page-title, .title { background: transparent !important; border:none !important; }
.instructions-box { border:1px solid #d9d9d9; border-radius:8px; padding:16px 18px; background:#fafafa; margin-top:12px; }
.orientation-line { font-size:15px; color:#555; margin:4px 0 14px 0; }
</style>`;

  function pageHtml(inner) {
    return `${BASE_CSS}<div class="page" data-component-id="page:root">${inner}</div>`;
  }

  function continueButtonHtml(label = "Continue", opts = {}) {
    const id = opts.id || "go";
    const cls = opts.className || "btn continueBtn";
    const disabled = opts.disabled ? " disabled" : "";
    return `<button id="${escapeHtml(id)}" class="${escapeHtml(cls)}" data-component-id="button:continue"${disabled}>${escapeHtml(label)}</button>`;
  }

  function textPageHtml(title, bodyHtml, buttonLabel = "Continue", extraClass = "") {
    return pageHtml(`
      <div class="textPage ${escapeHtml(extraClass)}">
        ${title ? `<div class="title" data-component-id="header:page_title">${escapeHtml(title)}</div>` : ""}
        <div class="instructions" data-component-id="text:instructions">${bodyHtml}</div>
      </div>
      ${continueButtonHtml(buttonLabel)}
    `);
  }

  function orientationLineHtml(plan, includeRole = false) {
    const c = plan.caseObj || {};
    const caseLabel = c.case_label || titleCaseLabel(c.case_id || "Case");
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    const side = plan.advocate_side === "plaintiff" ? "Plaintiff" : "Defendant";
    const rolePart = includeRole
      ? ` &nbsp;|&nbsp; Your role: argue for the ${escapeHtml(side)}`
      : "";
    return `<div class="orientationLine" data-component-id="text:orientation">Case: ${escapeHtml(caseLabel)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)}${rolePart}</div>`;
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
    if (!data || !Array.isArray(data.cases) || !data.cases.length) {
      throw new Error("Stimuli JSON must contain a non-empty top-level cases array.");
    }
    data.cases.forEach((c) => {
      c.case_id = c.case_id || c.case_id_canonical || c.case_label || "case";
      c.case_label = c.case_label || titleCaseLabel(c.case_id);
      c.plaintiff_descriptor = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
      c.defendant_descriptor = c.defendant_descriptor || c.defendant_name || "Defendant";
      c.claims = Array.isArray(c.claims) ? c.claims : [];
      c.facts = Array.isArray(c.facts) ? c.facts : [];
      c.claims.forEach((cl) => {
        cl.claim_id = cl.claim_id || cl.id || safeId(cl.claim_text || cl.text || cl.claim);
        cl.claim_text = cl.claim_text || cl.text || cl.claim || "";
      });
      c.facts.forEach((f) => {
        f.fact_id = f.fact_id || f.id || safeId(f.fact_text || f.text);
        f.claim_id = f.claim_id || "";
        f.fact_text = f.fact_text || f.text || "";
        f.direction = getFactSide(f);
        f.fact_helps_side = f.direction; // backward-compatible internal alias
      });
    });
    return data;
  }

  function sampleFactsForCase(caseObj) {
    const claims = Array.isArray(caseObj.claims) ? caseObj.claims.slice() : [];
    const claim_order = shuffle(claims.map(c => c.claim_id));
    const byClaim = {};

    (caseObj.facts || []).forEach((f) => {
      const cid = f.claim_id;
      const side = getFactSide(f);
      if (!cid || (side !== "plaintiff" && side !== "defendant")) return;
      byClaim[cid] = byClaim[cid] || { plaintiff: [], defendant: [] };
      byClaim[cid][side].push({ ...f, direction: side, fact_helps_side: side });
    });

    const shown_facts_by_claim = {};
    const sampler_side_selections = [];
    const sampler_schema_warnings = [];

    claim_order.forEach((claim_id) => {
      const bucket = byClaim[claim_id] || { plaintiff: [], defendant: [] };
      const pFact = bucket.plaintiff[0] || null;
      const dFact = bucket.defendant[0] || null;

      if (bucket.plaintiff.length !== 1 || bucket.defendant.length !== 1) {
        sampler_schema_warnings.push({
          claim_id,
          n_plaintiff_facts: bucket.plaintiff.length,
          n_defendant_facts: bucket.defendant.length
        });
      }

      // With the pruned stimuli, each claim should have exactly one Plaintiff fact
      // and one Defendant fact. Randomization is therefore over side exposure only:
      // Plaintiff-only, Defendant-only, or Both. No within-side fact sampling remains.
      const r = Math.random();
      const showP = r < 1 / 3 || r >= 2 / 3;
      const showD = r >= 1 / 3;
      const picked = [];

      if (showP && pFact) picked.push({ ...pFact, _picked_side: "plaintiff" });
      if (showD && dFact) picked.push({ ...dFact, _picked_side: "defendant" });

      shown_facts_by_claim[claim_id] = shuffle(picked);
      sampler_side_selections.push({
        claim_id,
        exposure_condition: showP && showD ? "both" : (showP ? "plaintiff_only" : "defendant_only"),
        plaintiff_seen: picked.some(f => f._picked_side === "plaintiff") ? 1 : 0,
        defendant_seen: picked.some(f => f._picked_side === "defendant") ? 1 : 0,
        plaintiff_fact_id: pFact ? pFact.fact_id : null,
        defendant_fact_id: dFact ? dFact.fact_id : null
      });
    });

    const facts_flat = [];
    claim_order.forEach((cid) => {
      (shown_facts_by_claim[cid] || []).forEach(f => facts_flat.push(f));
    });
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
      n_plaintiff_shown: facts_flat.filter(f => f._picked_side === "plaintiff").length,
      n_defendant_shown: facts_flat.filter(f => f._picked_side === "defendant").length,
      sampler_side_selections,
      sampler_schema_warnings,
      sampler_fallbacks: []
    };
  }

  function makePlan(caseObj) {
    const advocate_side = Math.random() < 0.5 ? "plaintiff" : "defendant";
    return {
      caseObj,
      advocate_side,
      ...sampleFactsForCase(caseObj)
    };
  }

  /* ==================== SIMPLE PAGES ==================== */

  function consentScreen(jsPsych) {
    return {
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" style="text-align:center;">Consent to Participate in Research</div>
          <div class="box" style="max-height:360px; overflow-y:auto; background:#fff;">
            <div class="instructions" data-component-id="text:instructions" style="margin-top:0;">
              <p><b>Title of Research:</b> Computational Cognitive Science</p>
              <p><b>Principal Investigator:</b> Thomas Griffiths, Department of Psychology, Princeton University</p>
              <p>You are being invited to take part in a research study on human judgment and decision-making. Before you decide whether to participate, please read the information below.</p>
              <p><b>What you will do:</b> You will read brief descriptions and facts about a legal case and answer questions about it.</p>
              <p><b>Risks and discomforts:</b> Risks are minimal. You may skip any question that makes you uncomfortable and may withdraw at any time without penalty.</p>
              <p><b>Benefits:</b> There are no direct benefits to you.</p>
              <p><b>Confidentiality:</b> We will not ask for personally identifying information, and we will handle your responses as confidentially as possible.</p>
              <p><b>Compensation:</b> You will be compensated as described on the platform for your time.</p>
              <p><b>Voluntary participation:</b> Your participation is voluntary. You may refuse to participate or withdraw at any time without penalty.</p>
              <p><b>Who to contact:</b> tomg@princeton.edu; cocosci-lab@princeton.edu; IRB: irb@princeton.edu or (609) 258-8543.</p>
              <p>By clicking <b>"I consent"</b>, you indicate that you have read and understood the information above and voluntarily agree to participate.</p>
            </div>
          </div>
          <div class="instructions" data-component-id="text:instructions" style="margin:12px 0 0; text-align:center;">
            Do you consent to participate in this study?
          </div>
        </div>
      `,
      choices: ["I do NOT consent", "I consent"],
      on_finish: (data) => {
        data.page_type = "consent";
        const noConsent = (data.response === 0);
        if (noConsent) {
          jsPsych.endExperiment("No consent");
        }
      },
      data: { page_type: "consent" }
    };
  }

  function overviewScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Overview", `
        <p>In this study, you will review materials from a real legal case.</p>
        <p>You will:</p>
        <ul style="margin-top:12px; margin-bottom:12px; padding-left:22px;">
          <li>read a summary of the case,</li>
          <li>answer a few questions about disputed issues,</li>
          <li>review evidence related to the case,</li>
          <li>prepare a short argument for one side,</li>
          <li>and answer a few follow-up questions afterward.</li>
        </ul>
        <div class="noteLine"><i><b>Estimated Duration:</b> Most people finish the task in under <b>15 minutes</b>.</i></div>
      `, "Continue", "overviewPage"),
      on_load: () => addClickFinish(jsPsych, { page_type: "overview" })
    };
  }

  function initialTransitionScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("", `<p>First, read about the case and answer a few questions about the disputed issues.</p>`, "Continue", "transitionPage"),
      on_load: () => addClickFinish(jsPsych, { page_type: "initial_transition" })
    };
  }

  function dossierTransitionScreen(jsPsych, plan) {
    const sideLabel = plan.advocate_side === "plaintiff" ? "Plaintiff" : "Defendant";
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("", `
        <p>Next, you will review evidence and prepare a brief dossier on behalf of the <b>${escapeHtml(sideLabel)}</b>. The dossier will consist of a short argument, including whatever evidence you think is helpful, to best make the case for the <b>${escapeHtml(sideLabel)}</b>.</p>
      `, "Continue", "transitionPage"),
      on_load: () => addClickFinish(jsPsych, {
        page_type: "dossier_transition",
        case_id: plan.caseObj.case_id,
        advocate_side: plan.advocate_side
      })
    };
  }

  function finalQuestionsTransitionScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("", `<p>Next, answer a few questions about the case and evidence.</p>`, "Continue", "transitionPage"),
      on_load: () => addClickFinish(jsPsych, { page_type: "final_questions_transition" })
    };
  }

  function caseOverviewScreen(jsPsych, plan) {
    const c = plan.caseObj;
    const summary = String(c.case_summary_text || "").trim()
      .split(/\n\s*\n/g)
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p)}</p>`)
      .join("\n");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header" data-component-id="header:case_overview">
          <div class="title" data-component-id="header:page_title">Case Overview</div>
        </div>
        ${orientationLineHtml(plan)}
        <div class="instructions" data-component-id="text:case_summary">${summary}</div>
        ${continueButtonHtml()}
      `),
      on_load: () => addClickFinish(jsPsych, {
        page_type: "case_overview",
        case_id: c.case_id,
        advocate_side: plan.advocate_side
      })
    };
  }

  /* ==================== JUDGMENT PAGES ==================== */

  function issueJudgmentScreen(jsPsych, plan, phase) {
    const c = plan.caseObj;
    const claimById = Object.fromEntries((c.claims || []).map(cl => [cl.claim_id, cl]));
    const claims = (plan.claim_order || []).map(cid => claimById[cid]).filter(Boolean);
    const isPre = phase === "pre";
    const title = isPre ? "Initial Judgments About the Disputed Issues" : "Final Judgments About the Disputed Issues";
    const instructions = isPre
      ? "The statements below are key disputed issues in the case. Later, you will review evidence related to these issues. Based on the information you have seen so far, enter how likely you believe each disputed issue is to be true."
      : "After reviewing the evidence, enter how likely you believe each disputed issue is to be true.";

    const rows = claims.map((cl, idx) => {
      const iid = `claim_prob_${idx}`;
      return `
        <div class="probRow" data-component-id="row:${phase}_claim_${escapeHtml(cl.claim_id)}">
          <div class="sliderPrompt">
            <div class="claimTag">Disputed issue ${idx + 1}</div>
            <div class="claimText">${escapeHtml(cl.claim_text)}</div>
          </div>
          <div class="probInputBox">
            <input id="${iid}" class="probInput judgmentProb" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0–100" data-claim_id="${escapeHtml(cl.claim_id)}" data-component-id="input:${phase}_claim_${idx + 1}">
            <div class="probInputHint" data-component-id="text:hint_${phase}_claim_${idx + 1}">Probability (%)</div>
          </div>
        </div>`;
    }).join("\n");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header" data-component-id="header:${phase}_claims">
          <div class="title" data-component-id="header:page_title">${escapeHtml(title)}</div>
        </div>
        ${orientationLineHtml(plan)}
        <div class="instructions" data-component-id="text:instructions">${escapeHtml(instructions)}</div>
        <div class="space-sm" aria-hidden="true"></div>
        <div class="muted" style="text-align:left; margin-bottom:10px; position:sticky; top:0; background:rgba(255,255,255,0.92); backdrop-filter:saturate(180%) blur(6px); padding:10px 0; z-index:5;" data-component-id="text:scale_note">
          
        </div>
        <div class="claimList probList"><div class="sliderGroup">${rows}</div></div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const go = document.getElementById("go");
        const inputs = Array.from(document.querySelectorAll(".judgmentProb"));
        function validInput(x) {
          if (PREVIEW_MODE && String(x.value || "").trim() === "") return true;
          const v = Number(x.value);
          return String(x.value || "").trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100;
        }
        function updateGate() {
          if (go) go.disabled = !inputs.every(validInput);
        }
        inputs.forEach((x) => x.addEventListener("input", updateGate));
        updateGate();
        go.addEventListener("click", () => {
          const responses = inputs.map((x) => {
            const claim_id = x.dataset.claim_id;
            const cl = claimById[claim_id] || {};
            const raw = String(x.value || "").trim();
            return {
              page_type: `${phase}_disputed_issue_judgment_row`,
              phase,
              case_id: c.case_id,
              claim_id,
              claim_text: cl.claim_text || "",
              response: raw === "" ? null : Number(raw),
              claim_order: plan.claim_order,
              advocate_side: plan.advocate_side
            };
          });
          responses.forEach(r => writeDataRow(jsPsych, r));
          jsPsych.finishTrial({
            page_type: `${phase}_disputed_issue_judgments`,
            phase,
            case_id: c.case_id,
            advocate_side: plan.advocate_side,
            responses
          });
        });
      }
    };
  }

  function verdictJudgmentScreen(jsPsych, plan, phase) {
    const c = plan.caseObj;
    const isPre = phase === "pre";
    const title = isPre ? "Initial Case Judgment" : "Final Case Judgment";
    const instructions = isPre
      ? "Based on the information you have seen so far, how likely is it that the Plaintiff should prevail?"
      : "After reviewing the evidence, how likely is it that the Plaintiff should prevail?";

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header" data-component-id="header:${phase}_verdict">
          <div class="title" data-component-id="header:page_title">${escapeHtml(title)}</div>
        </div>
        ${orientationLineHtml(plan)}
        <div class="instructions" data-component-id="text:instructions">${escapeHtml(instructions)}</div>
        <div class="space-sm" aria-hidden="true"></div>
        <div class="muted" style="text-align:left; margin-bottom:10px; position:sticky; top:0; background:rgba(255,255,255,0.92); backdrop-filter:saturate(180%) blur(6px); padding:10px 0; z-index:5;" data-component-id="text:scale_note">
          
        </div>
        <div class="claimList probList"><div class="sliderGroup">
          <div class="probRow" style="align-items:flex-start; margin-bottom:6px;" data-component-id="row:outcome">
            <div class="sliderPrompt" style="width:100%; max-width:720px;" data-component-id="text:outcome_prompt">
              Probability that the Plaintiff should prevail
            </div>
            <div class="probInputBox">
              <input id="verdict_prob" class="probInput" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0–100" data-component-id="input:outcome">
              <div class="probInputHint">Probability (%)</div>
            </div>
          </div>
        </div></div>
        
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const input = document.getElementById("verdict_prob");
        const go = document.getElementById("go");
        function valid() {
          if (PREVIEW_MODE && String(input.value || "").trim() === "") return true;
          const v = Number(input.value);
          return String(input.value || "").trim() !== "" && Number.isFinite(v) && v >= 0 && v <= 100;
        }
        function updateGate() { if (go) go.disabled = !valid(); }
        input.addEventListener("input", updateGate);
        updateGate();
        go.addEventListener("click", () => {
          const raw = String(input.value || "").trim();
          jsPsych.finishTrial({
            page_type: `${phase}_verdict_judgment`,
            phase,
            case_id: c.case_id,
            advocate_side: plan.advocate_side,
            response: raw === "" ? null : Number(raw),
            claim_order: plan.claim_order,
            facts_shown_ids: plan.facts_shown_ids
          });
        });
      }
    };
  }

  /* ==================== DOSSIER ==================== */

  function factCardHtml(f, mode) {
    const fn = f._fn;
    const fid = f.fact_id;
    const side = getFactSide(f);
    const sideLabel = side === "plaintiff" ? "Introduced by Plaintiff" : side === "defendant" ? "Introduced by Defendant" : "Evidence";
    const actions = mode === "dossier"
      ? `<button class="btn small insertBtn" data-fn="${fn}" data-fid="${escapeHtml(fid)}" type="button">Insert</button>
         <label class="attachWrap"><input class="attachChk" type="checkbox" data-fn="${fn}" data-fid="${escapeHtml(fid)}"> Attach</label>`
      : "";
    return `
      <div class="factCard" data-fact_id="${escapeHtml(fid)}" data-fn="${fn}">
        <div class="factHeader">
          <div class="factTitle">Evidence ${fn}<span class="sidePill ${escapeHtml(side)}">${escapeHtml(sideLabel)}</span></div>
          <div class="factHeaderRight">
            <button class="btn small openBtn" type="button" data-fn="${fn}">Open</button>
            ${actions}
          </div>
        </div>
        <div id="factBody_${fn}" class="factBody" style="display:none;">
          <div class="factText">${escapeHtml(f.fact_text || f.text || "")}</div>
          <div class="factFooter"><button class="btn small closeBtn" type="button" data-fn="${fn}">Close</button></div>
        </div>
      </div>`;
  }

  function factsGroupedHtml(plan, mode = "dossier") {
    const claimById = Object.fromEntries((plan.caseObj.claims || []).map(cl => [cl.claim_id, cl]));
    const groups = (plan.claim_order || []).map((cid, idx) => {
      const cl = claimById[cid] || {};
      const facts = plan.shown_facts_by_claim[cid] || [];
      if (!facts.length) return "";
      const textId = `claimText_${safeId(cid)}_${idx}`;
      return `
        <div class="claimGroup" data-claim_id="${escapeHtml(cid)}">
          <div class="claimTag" style="margin-bottom:8px;">
            Disputed issue ${idx + 1}
            <button class="btn small issueBtn" data-target="${textId}" type="button" style="margin-left:8px;">Show issue</button>
          </div>
          <div id="${textId}" class="claimText" style="display:none; margin-bottom:10px;">${escapeHtml(cl.claim_text || "")}</div>
          ${facts.map(f => factCardHtml(f, mode)).join("\n")}
        </div>`;
    }).join("\n");
    return `<div class="claimGroups">${groups}</div>`;
  }

  function dossierScreen(jsPsych, plan, draftStore) {
    const c = plan.caseObj;
    const sideLabel = plan.advocate_side === "plaintiff" ? "Plaintiff" : "Defendant";
    const draftKey = c.case_id;
    const openSummary = {};
    plan.facts_flat.forEach(f => { openSummary[f._fn] = { openedOnce: false, openCount: 0, totalOpenMs: 0 }; });
    const intervals = [];
    const insertEvents = [];
    const attachedFactIds = new Set();
    const insertedFactIds = new Set();
    const insertionCounts = {};

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header" data-component-id="header:dossier">
          <div class="title" data-component-id="header:page_title">Draft your dossier </div>
        </div>
        ${orientationLineHtml(plan, true)}
        <div class="instructions" data-component-id="text:instructions">Write a brief argument and select the evidence that makes the best case possible for the <b>${escapeHtml(sideLabel)}</b>.</div>

        <div class="box" data-component-id="box:how_to_read_and_use_facts" style="margin-top:22px; margin-bottom:24px; text-align:left !important;">
          <div style="font-weight:800; margin-bottom:8px; text-align:center !important;">How to read and use the evidence:</div>
          <ul style="margin:8px 0 0 18px; line-height:1.35;">
             <li>Please treat each evidence item as if it were verified as stated.</li>
            <li>Click <b>Show issue</b> to see the disputed issue that the evidence relates to.</li>
            <li>Click <b>Open</b> on any evidence item to review it.</li>
            <li>Click <b>Insert</b> to add a short evidence reference, such as <b>[E2]</b>, to your draft. This also attaches the evidence.</li>
            <li>Check <b>Attach</b> to include the evidence with your dossier without adding a reference to your draft.</li>
            <li>You may use as much or as little evidence as you think is appropriate.</li>

          </ul>
        </div>

        <div class="layoutRow">
          <div class="colLeft">
            <div class="subtitle" style="margin-bottom:8px;">Write your argument here:</div>
            <textarea id="argBox" data-component-id="input:argument" placeholder="The ${escapeHtml(sideLabel)} should prevail in this case because...\n\nLength: About 1–2 short paragraphs (roughly 100–200 words)."></textarea>

            <div id="attachedSummary"
                 style="margin-top:10px; font-size:13px; color:#444;">
              Attached evidence: None
            </div>

            <div class="wc">Word count: <span id="wcN">0</span> (minimum: <span id="wcMin">${PREVIEW_MODE ? CFG.preview_min_argument_words : CFG.min_argument_words}</span>)</div>
            ${continueButtonHtml("Continue", { id: "continueBtn2", disabled: !PREVIEW_MODE })}
          </div>
          <div class="colRight">
            <div class="caseTopLine" style="margin-top:10px; margin-bottom:6px;" data-component-id="header:facts_heading">Review, insert, and attach evidence here:</div>
            ${factsGroupedHtml(plan, "dossier")}
          </div>
        </div>
      `),
      on_load: () => {
        const minWords = PREVIEW_MODE ? CFG.preview_min_argument_words : CFG.min_argument_words;
        const argBox = document.getElementById("argBox");
        const wcN = document.getElementById("wcN");
        const cont = document.getElementById("continueBtn2");
        let openFn = null;
        let openStart = null;

        const saved = draftStore[draftKey] || null;
        if (saved && typeof saved.text === "string") argBox.value = saved.text;
        if (saved) {
          if (Array.isArray(saved.inserted_fact_ids)) saved.inserted_fact_ids.forEach(fid => insertedFactIds.add(fid));
          if (Array.isArray(saved.attached_fact_ids)) saved.attached_fact_ids.forEach(fid => attachedFactIds.add(fid));
          if (saved.insertion_counts && typeof saved.insertion_counts === "object") Object.assign(insertionCounts, saved.insertion_counts);
          document.querySelectorAll(".attachChk").forEach(chk => { chk.checked = attachedFactIds.has(chk.dataset.fid); });
        }

        function updateGate() {
          const wc = wordCount(argBox.value);
          if (wcN) wcN.textContent = String(wc);
          if (cont) cont.disabled = (!PREVIEW_MODE && wc < minWords);
        }

        function usedFactIds() {
          return Array.from(new Set([...insertedFactIds, ...attachedFactIds]));
        }

        function updateAttachedSummary() {
          const el = document.getElementById("attachedSummary");
          if (!el) return;

          const attachedFns = plan.facts_flat
            .filter(f => usedFactIds().includes(f.fact_id))
            .map(f => `E${f._fn}`);

          el.textContent = attachedFns.length
            ? `Attached evidence: ${attachedFns.join(", ")}`
            : "Attached evidence: None";
        }

        function persistDraft() {
          draftStore[draftKey] = draftStore[draftKey] || {};
          draftStore[draftKey].text = argBox.value;
          draftStore[draftKey].inserted_fact_ids = Array.from(insertedFactIds);
          draftStore[draftKey].attached_fact_ids = Array.from(attachedFactIds);
          draftStore[draftKey].used_fact_ids = usedFactIds();
          draftStore[draftKey].insertion_counts = { ...insertionCounts };
        }

        function closeOpenFact() {
          if (openFn === null) return;
          const body = document.getElementById(`factBody_${openFn}`);
          const btn = document.querySelector(`.openBtn[data-fn="${openFn}"]`);
          if (body) body.style.display = "none";
          if (btn) btn.style.display = "inline-block";
          const elapsed = Math.max(0, nowMs() - openStart);
          if (openSummary[openFn]) openSummary[openFn].totalOpenMs += elapsed;
          intervals.push({ fn: openFn, fact_id: (plan.facts_flat.find(f => f._fn === openFn) || {}).fact_id || "", startMs: openStart, endMs: nowMs(), durationMs: elapsed });
          openFn = null;
          openStart = null;
        }

        function isClickInsideOpenFact(target) {
          if (openFn === null || !target) return false;
          const card = document.querySelector(`.factCard[data-fn="${openFn}"]`);
          return card && card.contains(target);
        }

        argBox.addEventListener("input", () => { updateGate(); persistDraft(); });
        document.addEventListener("mousedown", (e) => {
          if (openFn !== null && !isClickInsideOpenFact(e.target)) closeOpenFact();
        }, true);
        argBox.addEventListener("focus", () => { if (openFn !== null) closeOpenFact(); });

        document.querySelectorAll(".issueBtn").forEach(btn => {
          btn.addEventListener("click", () => {
            const body = document.getElementById(btn.dataset.target);
            if (!body) return;
            const hidden = body.style.display === "none";
            body.style.display = hidden ? "block" : "none";
            btn.textContent = hidden ? "Hide issue" : "Show issue";
          });
        });

        document.querySelectorAll(".openBtn").forEach(btn => {
          btn.addEventListener("click", () => {
            const fn = Number(btn.dataset.fn);
            if (openFn !== null && openFn !== fn) closeOpenFact();
            const body = document.getElementById(`factBody_${fn}`);
            if (body && body.style.display === "none") {
              body.style.display = "block";
              btn.style.display = "none";
              openFn = fn;
              openStart = nowMs();
              if (openSummary[fn]) {
                openSummary[fn].openedOnce = true;
                openSummary[fn].openCount += 1;
              }
            }
          });
        });
        document.querySelectorAll(".closeBtn").forEach(btn => btn.addEventListener("click", closeOpenFact));

        document.querySelectorAll(".insertBtn").forEach(btn => {
          btn.addEventListener("click", () => {
            const fn = Number(btn.dataset.fn);
            const fid = btn.dataset.fid;
            const tag = `[E${fn}]`;
            const start = argBox.selectionStart === null || argBox.selectionStart === undefined ? argBox.value.length : argBox.selectionStart;
            const end = argBox.selectionEnd === null || argBox.selectionEnd === undefined ? argBox.value.length : argBox.selectionEnd;
            argBox.value = argBox.value.slice(0, start) + tag + argBox.value.slice(end);
            const newPos = start + tag.length;
            argBox.focus();
            argBox.setSelectionRange(newPos, newPos);
            insertedFactIds.add(fid);
            attachedFactIds.add(fid);
            insertionCounts[fid] = (insertionCounts[fid] || 0) + 1;
            insertEvents.push({ fn, fact_id: fid, tMs: nowMs() });
            updateAttachedSummary();
            updateGate();
            persistDraft();
          });
        });

        document.querySelectorAll(".attachChk").forEach(chk => {
          chk.addEventListener("change", () => {
            const fid = chk.dataset.fid;
            if (chk.checked) attachedFactIds.add(fid);
            else attachedFactIds.delete(fid);
            updateAttachedSummary();
            persistDraft();
          });
        });

        updateAttachedSummary();
        updateGate();
        persistDraft();

        cont.addEventListener("click", () => {
          closeOpenFact();
          persistDraft();
          const inserted = plan.facts_flat
            .filter(f => insertedFactIds.has(f.fact_id))
            .map(f => ({ fn: f._fn, fact_id: f.fact_id, insertion_count: insertionCounts[f.fact_id] || 0 }));
          const attached = plan.facts_flat
            .filter(f => attachedFactIds.has(f.fact_id))
            .map(f => ({ fn: f._fn, fact_id: f.fact_id }));
          const usedIds = usedFactIds();
          const usedSet = new Set(usedIds);
          const used = plan.facts_flat
            .filter(f => usedSet.has(f.fact_id))
            .map(f => ({ fn: f._fn, fact_id: f.fact_id, inserted: insertedFactIds.has(f.fact_id) ? 1 : 0, attached: attachedFactIds.has(f.fact_id) ? 1 : 0 }));
          const factProcess = plan.facts_flat.map(f => {
            const os = openSummary[f._fn] || { openedOnce: false, openCount: 0, totalOpenMs: 0 };
            return {
              fn: f._fn,
              fact_id: f.fact_id,
              claim_id: f.claim_id,
              picked_side: f._picked_side || getFactSide(f),
              shown: 1,
              opened: os.openedOnce ? 1 : 0,
              open_count: os.openCount || 0,
              total_open_ms: Math.round(os.totalOpenMs || 0),
              inserted: insertedFactIds.has(f.fact_id) ? 1 : 0,
              attached: attachedFactIds.has(f.fact_id) ? 1 : 0,
              used: usedSet.has(f.fact_id) ? 1 : 0,
              insertion_count: insertionCounts[f.fact_id] || 0
            };
          });
          factProcess.forEach(row => writeDataRow(jsPsych, {
            page_type: "dossier_fact_process",
            case_id: c.case_id,
            advocate_side: plan.advocate_side,
            ...row
          }));
          jsPsych.finishTrial({
            page_type: "dossier",
            case_id: c.case_id,
            advocate_side: plan.advocate_side,
            claim_order: plan.claim_order,
            shown_facts_by_claim: Object.fromEntries(Object.entries(plan.shown_facts_by_claim).map(([k, v]) => [k, v.map(f => f.fact_id)])),
            facts_shown_ids: plan.facts_shown_ids,
            inserted_facts: inserted,
            inserted_fact_ids: inserted.map(a => a.fact_id),
            attached_facts: attached,
            attached_fact_ids: attached.map(a => a.fact_id),
            used_facts: used,
            used_fact_ids: usedIds,
            argument_text: argBox.value,
            argument_word_count: wordCount(argBox.value),
            dossier_open_summary: openSummary,
            dossier_open_intervals: intervals.map(x => ({ ...x, durationMs: Math.round(x.durationMs || 0) })),
            dossier_insert_events: insertEvents,
            dossier_fact_process: factProcess
          });
        });
      }
    };
  }

  function dossierPreviewScreen(jsPsych, plan, draftStore) {
    const c = plan.caseObj;
    const sideLabel = plan.advocate_side === "plaintiff" ? "Plaintiff" : "Defendant";
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: () => {
        const saved = draftStore[c.case_id] || { text: "", used_fact_ids: [] };
        const usedSet = new Set(saved.used_fact_ids || []);
        const usedFacts = plan.facts_flat.filter(f => usedSet.has(f.fact_id));
        const factsHtml = usedFacts.length
          ? usedFacts.map(f => `<div class="previewFact"><b>[E${f._fn}]</b> ${escapeHtml(f.fact_text || f.text || "")}</div>`).join("\n")
          : `<div class="muted">No evidence attached.</div>`;
        return pageHtml(`
          <div class="s1Header" data-component-id="header:dossier_preview">
            <div class="title" data-component-id="header:page_title">Review your argument</div>
            
          </div>
          ${orientationLineHtml(plan, true)}
          <div class="instructions" data-component-id="text:instructions">Review your argument and attached evidence before continuing.</div>
          <div class="previewBox"><div class="previewTitle">Argument</div><div style="white-space:pre-wrap; line-height:1.4;">${escapeHtml(saved.text || "")}</div></div>
          <div class="previewBox"><div class="previewTitle">Attached evidence</div>${factsHtml}</div>
          <button id="revise" class="btn backBtn" type="button">Revise dossier</button>
          ${continueButtonHtml("Continue")}
        `);
      },
      on_load: () => {
        const revise = document.getElementById("revise");
        const go = document.getElementById("go");
        revise.addEventListener("click", () => jsPsych.finishTrial({ page_type: "dossier_preview", case_id: c.case_id, confirm: false }));
        go.addEventListener("click", () => jsPsych.finishTrial({ page_type: "dossier_preview", case_id: c.case_id, confirm: true }));
      }
    };
  }

  /* ==================== ACTIVATION ==================== */

  function activationScreen(jsPsych, plan) {
    const c = plan.caseObj;
    const facts = plan.facts_flat || [];
    const rows = facts.map((f) => `
      <div class="activationRow" data-fact_id="${escapeHtml(f.fact_id)}">
        <div style="flex:1 1 auto;">
          <div class="claimTag"><b>Evidence ${f._fn}</b></div>
          <div class="factText">${escapeHtml(f.fact_text || f.text || "")}</div>
        </div>
        <label class="attachWrap" style="min-width:40px; justify-content:flex-end; padding-top:4px;">
          <input class="actChk" type="checkbox" data-fact_id="${escapeHtml(f.fact_id)}" data-fn="${f._fn}">
        </label>
      </div>`).join("\n");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header" data-component-id="header:activation">
          <div class="title" data-component-id="header:page_title">Follow-Up Questions</div>
        </div>
        ${orientationLineHtml(plan)}
        <div class="instructions" data-component-id="text:instructions">Indicate which evidence items came to mind while you worked on the case.</div>
        <div class="claimList probList"><div class="sliderGroup">${rows}</div></div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const go = document.getElementById("go");
        const boxes = Array.from(document.querySelectorAll(".actChk"));
        function checked() { return boxes.filter(x => x.checked).map(x => x.dataset.fact_id); }
        function updateGate() { if (go) go.disabled = (!PREVIEW_MODE && checked().length === 0); }
        boxes.forEach(b => b.addEventListener("change", updateGate));
        updateGate();
        go.addEventListener("click", () => jsPsych.finishTrial({
          page_type: "activation_check",
          case_id: c.case_id,
          advocate_side: plan.advocate_side,
          facts_shown_ids: plan.facts_shown_ids,
          activated_fact_ids: checked(),
          activated_fact_details: boxes.map(b => ({ fn: Number(b.dataset.fn), fact_id: b.dataset.fact_id, activated: b.checked }))
        }));
      }
    };
  }

  /* ==================== END ==================== */

  function feedbackScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="title" data-component-id="header:page_title">Thank you</div>
        <div class="instructions" data-component-id="text:instructions">
          Thanks for participating in this study.
        </div>
        <div class="instructions" data-component-id="text:instructions">
          If you have any feedback—anything confusing, any technical issues, or anything you think we should improve—you can share it below.
        </div>
        <div class="box" style="background:#fff;">
          <textarea id="fb" style="min-height:160px;" placeholder="Feedback..."></textarea>
        </div>
        ${continueButtonHtml("Continue",{style:"margin-top:10px;"})}
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (!btn) { jsPsych.finishTrial({ page_type: "end_feedback", feedback: "" }); return; }
        btn.addEventListener("click", () => {
          const fb = document.getElementById("fb");
          jsPsych.finishTrial({
            page_type: "end_feedback",
            feedback: fb ? fb.value : ""
          });
        });
      },
      data: { page_type: "end_feedback" }
    };
  }

  function prolificEndScreen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="title" data-component-id="header:page_title">All done</div>
        <div class="instructions" data-component-id="text:instructions">
          Your completion code is:
          <div style="margin:12px 0 16px 0;">
            <span class="tag" style="font-size:18px; padding:10px 12px; border:1px solid #ddd; border-radius:12px; background:#fafafa; display:inline-block; letter-spacing:0.06em;">
              ${escapeHtml(CFG.prolific_completion_code)}
            </span>
          </div>
          Clicking the button below will redirect you to Prolific to submit the study.
        </div>
        <div class="muted"><i>If the redirect does not work, you can manually submit using the code above.</i></div>
        ${continueButtonHtml("Continue")}
      `),
      on_start: () => {
        try {
          jsPsych.data.addProperties({
            prolific_completion_code: CFG.prolific_completion_code,
            prolific_redirect_url: PROLIFIC_REDIRECT_URL
          });
        } catch (_) {}
      },
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => {
          try { if (typeof saveDataset === "function") saveDataset("final"); } catch (_) {}
          jsPsych.finishTrial({ page_type: "prolific_end", prolific_completion_code: CFG.prolific_completion_code });
          try { window.location.href = PROLIFIC_REDIRECT_URL; } catch (_) {}
        });
      },
      data: { page_type: "prolific_end", preview_mode: PREVIEW_MODE, prolific_completion_code: CFG.prolific_completion_code }
    };
  }

  /* ==================== MAIN ==================== */

  async function main() {
    try {
      const stim = await loadStimuli();
      const cases = stim.cases;
      const selectedCase = shuffle(cases)[0];
      const plan = makePlan(selectedCase);
      const draftStore = {};

      const jsPsych = initJsPsych({
        show_progress_bar: CFG.show_progress_bar,
        auto_update_progress_bar: true,
        on_finish: () => {
          try { console.log(jsPsych.data.get().values()); } catch (_) {}
        }
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
        selected_case_id: selectedCase.case_id,
        advocate_side: plan.advocate_side,
        claim_order: plan.claim_order,
        facts_shown_ids: plan.facts_shown_ids,
        n_plaintiff_shown: plan.n_plaintiff_shown,
        n_defendant_shown: plan.n_defendant_shown,
        sampler_side_selections: plan.sampler_side_selections,
        sampler_fallbacks: plan.sampler_fallbacks,
        sampler_schema_warnings: plan.sampler_schema_warnings
      });

      const shownByClaimIds = Object.fromEntries(
        Object.entries(plan.shown_facts_by_claim).map(([cid, facts]) => [cid, facts.map(f => f.fact_id)])
      );
      writeDataRow(jsPsych, {
        page_type: "assignment",
        case_id: selectedCase.case_id,
        case_label: selectedCase.case_label,
        advocate_side: plan.advocate_side,
        claim_order: plan.claim_order,
        shown_facts_by_claim: shownByClaimIds,
        facts_shown_ids: plan.facts_shown_ids,
        n_plaintiff_shown: plan.n_plaintiff_shown,
        n_defendant_shown: plan.n_defendant_shown,
        sampler_side_selections: plan.sampler_side_selections,
        sampler_fallbacks: plan.sampler_fallbacks,
        sampler_schema_warnings: plan.sampler_schema_warnings
      });

      const timeline = [
        consentScreen(jsPsych),
        overviewScreen(jsPsych),
        initialTransitionScreen(jsPsych),
        caseOverviewScreen(jsPsych, plan),
        issueJudgmentScreen(jsPsych, plan, "pre"),
        verdictJudgmentScreen(jsPsych, plan, "pre"),
        dossierTransitionScreen(jsPsych, plan),
        {
          timeline: [
            dossierScreen(jsPsych, plan, draftStore),
            dossierPreviewScreen(jsPsych, plan, draftStore)
          ],
          loop_function: (data) => {
            const last = data.values().slice(-1)[0] || {};
            return last.confirm === false;
          }
        },
        finalQuestionsTransitionScreen(jsPsych),
        issueJudgmentScreen(jsPsych, plan, "post"),
        verdictJudgmentScreen(jsPsych, plan, "post"),
        activationScreen(jsPsych, plan),
        feedbackScreen(jsPsych),
        prolificEndScreen(jsPsych)
      ];

      jsPsych.run(timeline);
    } catch (err) {
      showFatalError(err);
    }
  }

  function startStudy() {
    if (document.body && !document.body.innerHTML.trim()) {
      document.body.innerHTML = '<div style="font-family: Arial, sans-serif; padding:16px;">Loading…</div>';
    }
    main();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startStudy);
  } else {
    startStudy();
  }
})();
