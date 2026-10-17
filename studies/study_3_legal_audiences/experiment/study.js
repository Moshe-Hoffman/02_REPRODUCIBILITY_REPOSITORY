/*******************************************************
 * Judge Study — Cognition.run (jsPsych 8.x)
 * JS v10.0 (edited from JS v8.3.2)
 * Created: 2026-06-12 10:39 ET
*  - EDITING-READY PASS: added a preview-mode render-check first trial before the main timeline.
 */


(function () {
  /* ==================== ERROR HANDLER (ON-SCREEN) ==================== */
  function escapeHtml(str) {
    return String((str === null || str === undefined) ? "" : str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

function ensureDoubleQuotes(s) {
  const t = String((s === null || s === undefined) ? "" : s).trim();
  if (!t) return t;
  // If wrapped in single quotes, convert to double quotes; otherwise wrap in double quotes if not already quoted.
  const singleWrapped = t.length >= 2 && t.startsWith("'") && t.endsWith("'");
  const doubleWrapped = t.length >= 2 && t.startsWith('"') && t.endsWith('"');
  if (singleWrapped) return '"' + t.slice(1, -1) + '"';
  if (doubleWrapped) return t;
  // Avoid double-wrapping if the string already begins/ends with quotes-like characters.
  return '"' + t.replace(/^"+|"+$/g, "") + '"';
}


  // Render strings that mark differences using **...** by converting them to <b>...</b>.
  function renderBoldDiff(str) {
    const escaped = escapeHtml(str);
    // Replace pairs of **...** with bold. Non-greedy to handle multiple segments.
    return escaped.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }

  // Render strings that use **double-asterisks** to mark differing words/phrases.
  // Produces SAFE HTML: everything is escaped, except the <b> wrappers we add.
  function renderBoldMarkers(raw) {
    const s = String((raw === null || raw === undefined) ? "" : raw);
    const parts = s.split("**");
    return parts.map((p, idx) => {
      const safe = escapeHtml(p);
      return (idx % 2 === 1) ? `<b>${safe}</b>` : safe;
    }).join("");
  }

/** Highlight word-level differences between two strings for the gist (memory) 2AFC.
 * Returns safe HTML with differing tokens wrapped in <span class="gistDiff">...</span>.
 */
function highlightGistDifferences(a, b) {
  const A = String(a || "");
  const B = String(b || "");

  // Tokenize into words/punctuation while preserving order
  const tok = (s) => (s.match(/[\w’']+|[^\s\w]/g) || []);
  const ta = tok(A);
  const tb = tok(B);

  // LCS table (small strings; fine)
  const n = ta.length, m = tb.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = (ta[i] === tb[j]) ? (1 + dp[i + 1][j + 1]) : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  // Recover alignment
  let i = 0, j = 0;
  const outA = [];
  const outB = [];
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      outA.push(escapeHtml(ta[i]));
      outB.push(escapeHtml(tb[j]));
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      outA.push(`<span class="gistDiff">${escapeHtml(ta[i])}</span>`);
      i++;
    } else {
      outB.push(`<span class="gistDiff">${escapeHtml(tb[j])}</span>`);
      j++;
    }
  }
  while (i < n) { outA.push(`<span class="gistDiff">${escapeHtml(ta[i])}</span>`); i++; }
  while (j < m) { outB.push(`<span class="gistDiff">${escapeHtml(tb[j])}</span>`); j++; }

  // Join with spaces except before punctuation
  const joinSmart = (arr) => arr.join(" ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .replace(/([(\\[])\s+/g, "$1");

  return { a: joinSmart(outA), b: joinSmart(outB) };
}



/** v6.11: get foil text with backward/forward compatibility.
 * If newer keys exist (gist_foil_direction_flip / gist_foil_scope_or_scale_shift), use those.
 * Otherwise fall back to gist_foil_1/2.
 * foil_condition: 1 => direction_flip, 2 => scope_or_scale_shift
 */
function getGistFoilText(fact, foil_condition) {
  // foil_condition: 1 or 2
  const k = (Number(foil_condition) === 2) ? 2 : 1;
  if (!fact) return { foilText: "", foilType: "", foilIndex: k };

  // Preferred: structured array `gist_foils: [{foil_text, foil_type}, ...]`
  if (Array.isArray(fact.gist_foils) && fact.gist_foils[k - 1]) {
    const x = fact.gist_foils[k - 1] || {};
    return {
      foilText: String(((x.foil_text !== null && x.foil_text !== undefined) ? x.foil_text : ((x.text !== null && x.text !== undefined) ? x.text : "")) || "").trim(),
      foilType: String(((x.foil_type !== null && x.foil_type !== undefined) ? x.foil_type : ((x.type !== null && x.type !== undefined) ? x.type : "")) || "").trim(),
      foilIndex: k
    };
  }

  // Newer derived flat keys (direction/scope)
  const dir = String(fact.gist_foil_direction_flip || "").trim();
  const scope = String(fact.gist_foil_scope_or_scale_shift || "").trim();
  if (dir || scope) {
    return { foilText: (k === 2 ? scope : dir), foilType: "", foilIndex: k };
  }

  // Legacy flat keys
  const legacy1 = (fact.gist_foil_1 || fact.gistFoil1 || fact.gist_foil1 || "");
  const legacy2 = (fact.gist_foil_2 || fact.gistFoil2 || fact.gist_foil2 || "");
  const t1 = (fact.foil_type_1 || fact.foilType1 || fact.foil_type1 || "");
  const t2 = (fact.foil_type_2 || fact.foilType2 || fact.foil_type2 || "");

  return {
    foilText: String((k === 1 ? legacy1 : legacy2) || "").trim(),
    foilType: String((k === 1 ? t1 : t2) || "").trim(),
    foilIndex: k
  };
}



  // Normalize gist strings for robust equality checks (avoid "identical" options).
  function normGist(s) {
    return String((s === null || s === undefined) ? "" : s)
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
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
      </div>
    `;
    try {
      if (document.body) {
        document.body.innerHTML = html;
      } else if (document.documentElement) {
        document.documentElement.innerHTML = `<body>${html}</body>`;
      }
    } catch (e) {
      // Last resort: alert
      try { alert(msg); } catch (_) {}
    }
  }

  window.onerror = function (_message, _source, _lineno, _colno, error) {
    showFatalError(error || _message);
    return true;
  };
  window.addEventListener("unhandledrejection", (event) => {
    showFatalError(event.reason || event);
  });

  /* ==================== UTIL ==================== */
  
  function writeDataRow(jsPsych, row) {
    // Robust per-row writer for jsPsych 8+ (Cognition wrappers may not expose jsPsych.data.write)
    try {
      if (jsPsych && jsPsych.data) {
        if (typeof jsPsych.data.write === "function") {
          jsPsych.data.write(row);
          return true;
        }
        if (typeof jsPsych.data.addData === "function") {
          jsPsych.data.addData(row);
          return true;
        }
        // last-resort: push into internal storage if present
        if (Array.isArray(jsPsych.data._trials)) {
          jsPsych.data._trials.push(row);
          return true;
        }
        if (Array.isArray(jsPsych.data.trials)) {
          jsPsych.data.trials.push(row);
          return true;
        }
      }
    } catch (e) {
      // swallow and report via false
    }
    return false;
  }

function shuffle(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function wordCount(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).filter(Boolean).length;
  }

  function truncateText(s, n) {
    const str = String(s || "");
    if (str.length <= n) return str;
    return str.slice(0, n - 1) + "…";
  }

  function titleCaseLabel(s) {
    const x = String(s || "").replaceAll("_", " ").trim();
    return x.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function normStrength(x) {
    const s = String(x || "").trim().toLowerCase();
    if (s === "strong" || s === "high") return "strong";
    if (s === "weak" || s === "low") return "weak";
    return s;
  }

  function factSide(f) {
    // Compatible with both older JSON keys (fact_helps_side/fact_side/support flags)
    // and the cleaned/pruned JSON, which uses `direction`.
    const hs = String(f.direction || f.fact_helps_side || f.fact_side || "").trim().toLowerCase();
    if (hs === "plaintiff" || hs === "defendant") return hs;
    if (f.supports_plaintiff) return "plaintiff";
    if (f.supports_defendant) return "defendant";
    return null;
  }

  function safePrefix(s) {
    return String(s || "x").replace(/[^a-zA-Z0-9_]/g, "_");
  }


  /* ==================== EVIDENCE EXPOSURE ARM ==================== */
  function weightedSample(items) {
    const arr = Array.isArray(items) ? items : [];
    const total = arr.reduce((s, x) => s + Number((x && x.weight) || 0), 0);
    let r = Math.random() * total;
    for (const x of arr) {
      r -= Number((x && x.weight) || 0);
      if (r <= 0) return x.value;
    }
    return arr.length ? arr[arr.length - 1].value : null;
  }

  const EVIDENCE_EXPOSURE_ARM = weightedSample([
    { value: "one_side_disclosed", weight: 2 },
    { value: "one_side_undisclosed", weight: 2 },
    { value: "both_sides_disclosed", weight: 1 }
  ]);

  const DISCLOSE_EVIDENCE_SIDE = EVIDENCE_EXPOSURE_ARM === "one_side_disclosed";
  const SHOW_BOTH_SIDES = EVIDENCE_EXPOSURE_ARM === "both_sides_disclosed";

  /* ==================== COPY ==================== */
  const COPY = {
    consent_title: "Consent to Participate in Research",
    consent_prompt: "Do you consent to participate in this study?",
    consent_buttons: ["I do NOT consent", "I consent"],
    consent_html: `
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
    `,
    overview_title: "Overview",
    overview_html: evidenceSideCopy(
      `
      In this study, you will complete a <b>legal judgment task</b> based on <b>a real legal case</b>.<br><br>
      This study will have <b>3</b> different sections:<br>
      <ul style="margin-top:12px; margin-bottom:12px; padding-left:22px;">
        <li><b>Section 1:</b> You will read the case summary and provide an initial assessment of the disputed points and overall outcome.</li>
        <li><b>Section 2:</b> You will review some of the evidence presented by one side in the case.</li>
        <li><b>Section 3:</b> You will provide another assessment, but this time you will take into account the evidence you were shown (as well as the fact that you still don't know any of the evidence that was presented by the opposing side).</li>
      </ul>
    `,
      `
      In this study, you will complete a <b>legal judgment task</b> based on <b>a real legal case</b>.<br><br>
      This study will have <b>3</b> different sections:<br>
      <ul style="margin-top:12px; margin-bottom:12px; padding-left:22px;">
        <li><b>Section 1:</b> You will read the case summary and provide an initial assessment of the disputed points and overall outcome.</li>
        <li><b>Section 2:</b> You will review some of the evidence in the case.</li>
        <li><b>Section 3:</b> You will provide another assessment, but this time you will take into account the evidence you were shown.</li>
      </ul>
    `,
      `
      In this study, you will complete a <b>legal judgment task</b> based on <b>a real legal case</b>.<br><br>
      This study will have <b>3</b> different sections:<br>
      <ul style="margin-top:12px; margin-bottom:12px; padding-left:22px;">
        <li><b>Section 1:</b> You will read the case summary and provide an initial assessment of the disputed points and overall outcome.</li>
        <li><b>Section 2:</b> You will review evidence presented by both sides in the case.</li>
        <li><b>Section 3:</b> You will provide another assessment, but this time you will take into account the evidence you were shown.</li>
      </ul>
    `
    ),
    overview_duration_note: `<i><b>Estimated Duration:</b> Most people finish the task in about <b>12 minutes</b>.</i>`,
    section1_transition_html: `<p><b>We are now ready for Section 1.</b></p><p>In this section, you will read the case summary and indicate your initial judgment about the disputed points and overall outcome.</p>`,
    section1_case_summary_title: "Case Summary",
    section1_required_title: "Required Elements",
    section1_required_intro_html: `For the plaintiff to prevail, the judge or jury needs to believe each of the following are <b>more likely true than not</b>:`,
    section1_assess_required_title: "Assessing Required Elements",
    section1_assess_required_intro_html: `Based on the information you've been given so far, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:`,
    section1_disputed_title: "Disputed Points",
    section1_disputed_intro_html: `Below are the claims the litigants disputed at trial:`,
    section1_assess_disputed_title: "Assessing Disputed Points",
    section1_assess_disputed_intro_html: `Based on the information you've been given so far, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:`,
    section1_case_outcome_title: "Assessing Case Outcome",
    section1_case_outcome_intro_html: `Considering all these issues, what do you think is the probability the plaintiff prevailed (won)?`,
    section1_case_outcome_scale_note: `Enter a number from <b>0</b> (definitely did not prevail) to <b>100</b> (definitely prevailed).`,
    section2_transition_intro_html: evidenceSideCopy(
      `<p><b>We are now ready for Section 2.</b></p><p>In this section, you will review <b>one piece of evidence for each disputed point</b>, selected from the evidence presented by <b>{SIDE}</b> in the case.</p>`,
      `<p><b>We are now ready for Section 2.</b></p><p>In this section, you will review <b>one piece of evidence for each disputed point</b> from the case.</p>`,
      `<p><b>We are now ready for Section 2.</b></p><p>In this section, you will review <b>one piece of evidence from each side for each disputed point</b>.</p>`
    ),
    review_title: "Review the evidence",
    review_instructions_html: evidenceSideCopy(
      "Please review the evidence below, prepared by <b>{SIDE}</b>. You will see <b>one piece of evidence for each disputed point</b>.",
      "Please review the evidence below. You will see <b>one piece of evidence for each disputed point</b>.",
      "Please review the evidence below. You will see <b>one piece of evidence from each side for each disputed point</b>."
    ),
    review_open_button: "Open evidence",
    review_open_requirement_html: "",
    review_progress_label: "Evidence opened:",
    review_ready_label: "You may continue once all evidence cards have been opened for at least 2 seconds.",
    review_reminder_title: "Reminder",
    review_reminder_p1: evidenceSideCopy("The evidence shown below was presented by {SIDE}.", "", "The evidence shown below was presented by both sides."),
    review_reminder_p2: evidenceSideCopy("You are not seeing the opposing side’s evidence, so relevant counter-evidence may be missing.", "", ""),
    no_evidence_for_claim: "No evidence was provided by {SIDE} for this claim.",
    section3_transition_title: "Section 3",
    section3_transition_html: evidenceSideCopy(
      `<p><b>We are now ready for Section 3.</b></p><p>In this section, you will answer the same assessment questions again, taking into account the evidence you reviewed earlier (as well as the fact that you were not shown any of the evidence presented by the opposing side).</p>`,
      `<p><b>We are now ready for Section 3.</b></p><p>In this section, you will answer the same assessment questions again, taking into account the evidence you reviewed earlier.</p>`,
      `<p><b>We are now ready for Section 3.</b></p><p>In this section, you will answer the same assessment questions again, taking into account the evidence you reviewed earlier from both sides.</p>`
    ),
    section3_assess_required_title: "Assessing Required Elements",
    section3_assess_required_intro_html: evidenceSideCopy(
      `Now that you have reviewed the evidence from one side, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:` ,
      `Now that you have reviewed the evidence, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:`,
      `Now that you have reviewed evidence from both sides, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:`
    ),
    section3_assess_disputed_title: "Assessing Disputed Points",
    section3_assess_disputed_intro_html: evidenceSideCopy(
      `Now that you have reviewed the evidence from one side, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:` ,
      `Now that you have reviewed the evidence, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:`,
      `Now that you have reviewed evidence from both sides, please indicate how likely it is that the judge or jury accepted each of these claims as <b>more likely true than not</b>:`
    ),
    s3_page_reminder_html: evidenceSideCopy(
      `Reminder: You reviewed only the evidence presented by <b>{SIDE}</b>. Your assessment should take into account the kind of evidence you think the <b>{OTHER_SIDE}</b> might have presented.`,
      ``,
      ``
    ),
    s3_outcome_title: "Assessing Case Outcome",
    s3_outcome_instructions: evidenceSideCopy(
      "Taking into account the evidence you reviewed from {SIDE}, and the fact that you did <b>not</b> see the opposing side’s evidence, what do you think is the probability the plaintiff prevailed (won the case)?",
      "Taking into account the evidence you reviewed, what do you think is the probability the plaintiff prevailed (won the case)?",
      "Taking into account the evidence you reviewed from both sides, what do you think is the probability the plaintiff prevailed (won the case)?"
    ),
    s3_outcome_prompt: "What is the probability the plaintiff prevailed in this case?",
    s3_outcome_scale_note: "Enter a number from <b>0</b> (definitely did not prevail) to <b>100</b> (definitely prevailed).",
    prob_error: "Please enter a number from 0 to 100.",
    continue_label: "Continue",
    finish_label: "Finish",
    completion_html: `<p>Thank you for participating. Your responses have been recorded.</p>`
  };

  function copyFormat(template, values) {
    let out = String(template || "");
    const obj = values || {};
    Object.keys(obj).forEach((k) => {
      out = out.replaceAll("{" + k + "}", String(obj[k]));
    });
    return out;
  }

  function recordSideLabel(side) {
    return (String(side || "").toLowerCase() === "plaintiff") ? "the plaintiff" : "the defendant";
  }

  function evidenceSideCopy(disclosedHtml, undisclosedHtml, bothSidesHtml) {
    if (SHOW_BOTH_SIDES) return bothSidesHtml;
    return DISCLOSE_EVIDENCE_SIDE ? disclosedHtml : undisclosedHtml;
  }

  /* ==================== PREVIEW MODE ==================== */
  // Preview mode toggled by ?preview=1
  // Render-check screen is shown ONLY when preview mode is ON.
  const PREVIEW_MODE = false;

  let __PREVIEW_TRIAL_COUNTER = 0;


/* ==================== PROLIFIC COMPLETION ==================== */
// Set your Prolific completion code here (and keep the redirect URL as-is).
const PROLIFIC_COMPLETION_CODE = "C1379C4O";
const PROLIFIC_REDIRECT_URL = `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(PROLIFIC_COMPLETION_CODE)}`;



/* ==================== SLIDER HELPERS ==================== */
function sliderHelpHtml(kind) {
  const tip = (!window.__seen_slider_tip)
    ? `<div class="muted" style="margin-top:6px;"></div>`
    : ``;
  const meaning = (kind === "verdict")
    ? noteLineHtml(`<i>Reminder: Higher numbers mean more warranted to rule for the Plaintiff.</i>`, {style:"margin-top:6px;", componentId:"note:slider_verdict_meaning"}) : noteLineHtml(`<i></i>`, {style:"margin-top:6px;", componentId:"note:slider_blank"});
  return tip + meaning;
}

function attachSliderBubble(sliderOrId, formatFn) {
    const slider =
      (typeof sliderOrId === "string")
        ? document.getElementById(sliderOrId)
        : sliderOrId;

    if (!slider) return;

    const fmt = (typeof formatFn === "function") ? formatFn : ((v) => String(v));

    // Ensure container is positioned
    const container = slider.closest(".jspsych-html-slider-response-container") || slider.parentElement;
    if (!container) return;
    if (!container.style.position) container.style.position = "relative";
    container.style.overflow = "visible";

    // Create bubble
    let bubble = container.querySelector(".sliderBubble");
    if (!bubble) {
      bubble = document.createElement("div");
      bubble.className = "sliderBubble";
      container.appendChild(bubble);
    }

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);

    function update() {
      const v = Number(slider.value);
      bubble.textContent = fmt(v);

      // Position above thumb (use bounding boxes for robustness)
      const pct = (max === min) ? 0.5 : (v - min) / (max - min);
      const sliderRect = slider.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const x = (sliderRect.left - containerRect.left) + pct * sliderRect.width;
      bubble.style.left = `${x}px`;
    }

    slider.addEventListener("input", update);
    window.addEventListener("resize", update);
    update();
  }

/* ==================== CSS (UI) ==================== */
  const BASE_CSS = `
  <style>
    .page, .page * { text-align: left; }
    .page { max-width: 1100px; margin: 0 auto; padding: 0 14px; }

    /* Constrain jsPsych content width so slider labels don't clip */
    .jspsych-display-element { width: 100% !important; }
    .jspsych-content-wrapper { width: 100% !important; max-width: 1100px !important; margin: 0 auto !important; padding: 0 14px !important; }
    .jspsych-content { width: 100% !important; max-width: 1100px !important; }
.title { font-size: 24px; font-weight: 800; margin: 6px 0 10px; letter-spacing: -0.2px;
  

  display: block;
  width: 100% !important;
  margin-left: auto;
  margin-right: auto;

  display: block;
  text-align: center !important;
  width: 100% !important;
  margin-left: auto;
  margin-right: auto;

  margin-bottom: 16px;
}
    .subtitle { font-size: 16px; font-weight: 800; margin: 0 0 8px; }
    .instructions { font-size: 16px; line-height: 1.4; margin: 10px 0 14px; color:#111; }
    .muted { font-size: 13px; color: #555; margin-top: 6px; }
    .noteLine { font-size: 13px; color:#555; margin-top: 10px; }
    .noteLine i { color:#555; }
    .tipTitle { font-weight: 800; margin-bottom: 6px; }
    .hr { height:1px; background:#eee; margin: 14px 0; }

    .layoutRow { display: flex; gap: 16px; align-items: flex-start; flex-wrap: nowrap; }
    .colLeft { flex: 1 1 0; min-width: 0; }
    .colRight { flex: 0 0 380px; max-width: 380px; }

    @media (max-width: 980px) {
      /* On smaller screens, place the Facts panel above the argument box so it isn't easy to miss. */
      .layoutRow { flex-direction: column !important; }
      .colRight { order: -1 !important; flex: 1 1 auto; max-width: none; margin-left: 0 !important; }
      .colLeft { min-width: 0; }
    }

    .box { border: 1px solid #ddd; border-radius: 14px; padding: 12px; background: #fafafa; }
    .caseBar { border: 1px solid #ddd; border-radius: 14px; padding: 12px; background: #fff; margin: 10px 0; position: relative; }

    .caseBar.reminder { position: relative; }
    .reminderTag { position: absolute; top: 10px; right: 12px; font-size: 11px; font-weight: 900; opacity: 0.6; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; background: rgba(0,0,0,0.06); z-index: 3; pointer-events: none; }
    .caseTopLine { font-size: 15px; font-weight: 800; text-align: left !important; }
    .casePartyLine { font-size: 13px; color: #444; margin-top: 4px; }
    details.caseSummary { margin-top: 10px; }
    details.caseSummary summary { cursor: pointer; font-weight: 800; }

    /* === B5: Accordion standardization === */
    details.caseSummary {
      border: 1px solid #e5e5e5;
      border-radius: 14px;
      padding: 10px 12px;
      background: #fff;
      margin-top: 10px;
    }
    details.caseSummary summary {
      list-style: none;
      cursor: pointer;
      font-weight: 900;
      letter-spacing: 0.02em;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    details.caseSummary summary::-webkit-details-marker { display: none; }
    details.caseSummary summary::after {
      content: "▾";
      font-weight: 900;
      opacity: 0.6;
      transform: translateY(-1px);
    }
    details.caseSummary[open] summary::after { content: "▴"; }
    .accordionContent { margin-top: 10px; }

    /* === B5: Reminder box standardization === */
    .caseBar.reminder {
      background: #fafafa;
      border-color: #e3e3e3;
      padding: 14px 14px 12px 14px;
    }
    .caseBar.reminder::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: rgba(0,0,0,0.06);
      border-top-left-radius: 14px;
      border-bottom-left-radius: 14px;
    }
    .caseBar.reminder .reminderTag {
      top: 12px;
      right: 12px;
    }


    .claimGroup { border: 1px solid #e5e5e5; border-radius: 14px; padding: 10px 12px; background:#fff; margin: 12px 0; }
    .claimHeaderRow { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .claimTitle { font-size: 15px; font-weight: 900; }
    .claimText { font-size: 14px; line-height: 1.45; margin-top: 6px; color:#111; }
    .claimToggle { cursor: pointer; user-select:none; font-weight: 900; }

    .factCard { border: 1px solid #ddd; border-radius: 14px; padding: 10px 12px; margin: 10px 0; background: #fff; }
    .factHeader { display:flex; justify-content: space-between; gap: 10px; align-items:center; }
    .factTitle { font-size: 15px; font-weight: 800; }
    .tag { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .factHeaderRight { display:flex; gap: 8px; align-items:center; flex-wrap: wrap; justify-content:flex-end; }
    .factBody { margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; }
    .factText { font-size: 14px; line-height: 1.45; }
    .factFooter { margin-top: 10px; display:flex; justify-content:flex-end; }

    .btn { border: 1px solid #aaa; background: #f7f7f7; border-radius: 12px; padding: 9px 11px; cursor:pointer; }
    .btn.small { padding: 7px 9px; font-size: 13px; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .bigBtn { width: 100%; padding: 12px; font-size: 16px; border-radius: 14px; }
    /* Unified Continue button: compact, fixed bottom-right */
    .continueBtn {
 width: auto; min-width: 120px; padding: 10px 16px; font-size: 16px; border-radius: 14px; position: fixed; bottom: 18px;
  right: 18px; z-index: 50; box-shadow: 0 4px 14px rgba(0,0,0,0.18); 
  max-width: 220px;
  white-space: nowrap;
  width: auto;
  display: inline-block;
}
    
.backBtn {
  position: fixed;
  bottom: 18px;
  left: 18px;
  width: auto;
  display: inline-block;
  min-width: 140px;
  max-width: 260px;
  white-space: nowrap;
  z-index: 50;
}
.continueBtn:focus { outline: 3px solid rgba(0,0,0,0.18); outline-offset: 2px; }

    
    /* A+ (UI): Normalize jsPsych plugin buttons (e.g., HtmlButtonResponse) to match .btn.bigBtn */
    .jspsych-content-wrapper .jspsych-btn-container { width: 100% !important; text-align: center; margin-top: 14px; }
    .jspsych-content-wrapper .jspsych-btn { border: 1px solid #aaa; background: #f7f7f7; border-radius: 14px; padding: 12px; cursor: pointer; width: 100% !important; font-size: 16px; box-sizing: border-box; }
    .jspsych-content-wrapper .jspsych-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .jspsych-content-wrapper .jspsych-btn:hover { filter: brightness(0.98); }
    .jspsych-content-wrapper .jspsych-btn:active { transform: translateY(1px); }

.btn:hover { filter: brightness(0.98); }
    .btn:active { transform: translateY(1px); }

    textarea { width: 100%; min-height: 220px; font-size: 15px; line-height: 1.4; padding: 12px; border-radius: 14px; border: 1px solid #ccc; }
    .wc { margin-top: 8px; font-size: 13px; color: #444; }
    .attachWrap { font-size: 13px; display:flex; gap: 6px; align-items:center; }
    .tip { font-size: 14px; background:#f3f6ff; border:1px solid #dbe4ff; padding:10px 12px; border-radius: 14px; margin: 10px 0; }

    .previewBox { border:1px solid #ddd; border-radius: 14px; padding: 12px; background:#fff; margin: 10px 0; }
    .previewTitle { font-weight: 800; margin-bottom: 6px; }
    .previewFact { margin: 10px 0; font-size: 14px; }

    .checkItem { display:block; margin: 10px 0; cursor:pointer; }

    /* Pre-evidence form sliders */
    .preBlock { border:1px solid #ddd; border-radius: 14px; background:#fff; padding: 12px; margin: 12px 0; }
    .prePrompt { font-size: 15px; font-weight: 800; margin-bottom: 8px; }
    .rangeWrap { margin: 6px 0 0; }
    .rangeWrap input[type="range"] { width: 100%; }
    .rangeLabels { display:flex; justify-content:space-between; font-size: 12px; color:#555; margin-top: 6px; }
    .rangeLabels div { width: 20%; text-align:center; }
    .rangeLabels .endL { text-align:left; }
    .rangeLabels .endR { text-align:right; }

    /* Standardize slider widths across questions */
    .jspsych-html-slider-response-container {
      width: min(900px, 75vw);
      position: relative;
      margin: 6px auto 0;
      padding: 0 8px; /* breathing room so end labels don't clip */
      box-sizing: border-box;
    }
    .jspsych-html-slider-response-container .jspsych-slider { width: 100%; }
    .jspsych-html-slider-response-container .jspsych-slider-labels {
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;
      box-sizing: border-box;
    }
    .jspsych-html-slider-response-container .jspsych-slider-labels span {
      flex: 1 1 0;
      text-align: center;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.2;
    }
    .jspsych-html-slider-response-container .jspsych-slider-labels span:first-child { text-align: left; }
    .jspsych-html-slider-response-container .jspsych-slider-labels span:last-child { text-align: right; }

    .diff { font-weight: 800; font-style: italic; background: rgba(255,230,150,0.55); padding: 0 2px; border-radius: 4px; }
.jspsych-progressbar-container { margin-bottom: 14px; }
  
.floatingValue{position:absolute; top:-34px; transform:translateX(-50%); font-size:13px; color:#555; white-space:nowrap;}
.gistDiff{font-weight:700;font-style:italic;background:rgba(255,230,150,0.6);padding:0 2px;border-radius:3px;}

.sidePill{display:inline-block;margin-left:10px;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.2;border:1px solid rgba(0,0,0,0.15);background:rgba(0,0,0,0.04);}
.sidePill.plaintiff{ }
.sidePill.defendant{ }



/* MULTISLIDER_RANGE_OVERRIDES: force fully-grey tracks (no blue progress) */
input[type="range"].ms-range,
input[type="range"].dp-slider{
  -webkit-appearance:none;
  appearance:none;
  width:100%;
  background:transparent;
}
input[type="range"].ms-range:focus,
input[type="range"].dp-slider:focus{ outline:none; }

/* WebKit */
input[type="range"].ms-range::-webkit-slider-runnable-track,
input[type="range"].dp-slider::-webkit-slider-runnable-track{
  height:10px;
  background:#d0d0d0;
  border-radius:999px;
}
input[type="range"].ms-range::-webkit-slider-thumb,
input[type="range"].dp-slider::-webkit-slider-thumb{
  -webkit-appearance:none;
  appearance:none;
  margin-top:-6px;
  width:22px;
  height:22px;
  border-radius:999px;
  background:#ffffff;
  border:1px solid rgba(0,0,0,0.25);
  box-shadow:0 1px 4px rgba(0,0,0,0.2);
}

/* Firefox */
input[type="range"].ms-range::-moz-range-track,
input[type="range"].dp-slider::-moz-range-track{
  height:10px;
  background:#d0d0d0;
  border-radius:999px;
}
input[type="range"].ms-range::-moz-range-progress,
input[type="range"].dp-slider::-moz-range-progress{
  height:10px;
  background:#d0d0d0;
  border-radius:999px;
}
input[type="range"].ms-range::-moz-range-thumb,
input[type="range"].dp-slider::-moz-range-thumb{
  width:22px;
  height:22px;
  border-radius:999px;
  background:#ffffff;
  border:1px solid rgba(0,0,0,0.25);
  box-shadow:0 1px 4px rgba(0,0,0,0.2);
}

  /* Force-center all header-like elements */
  [data-component-id^="header:"] { text-align: center !important; width: 100% !important; }


  [data-component-id="header:page_title"] { display: block; margin-bottom: 16px; }

  .factsContent { text-align: left; }

  /* Global header spacing */
  .title { margin-bottom: 22px !important; }
  [data-component-id="header:page_title"] { margin-bottom: 22px !important; }
  .title + .instructions, [data-component-id="header:page_title"] + .instructions { margin-top: 18px !important; }


  /* Evidence facts expansion: left-align revealed content */
  [data-component-id="accordion:facts"] .box,
  [data-component-id="accordion:facts"] .box *,
  .factsContent, .factsContent *,
  .caseSummary .box, .caseSummary .box * {
    text-align: left !important;
  }


  /* Evidence facts: force left alignment inside Facts tip + claim/fact groups */
  details.tip, details.tip * { text-align: left !important; }
  
  .judgeReviewWrap { width: 100%; }
  .judgeReviewGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
    gap: 18px;
    align-items: start;
    width: 100%;
    margin-top: 10px;
  }
  .judgeReviewGrid .claimGroup {
    margin: 0;
    height: 100%;
    background: #fff;
  }
  @media (max-width: 980px) {
    .judgeReviewGrid { grid-template-columns: 1fr; }
  }

.claimGroups, .claimGroups *,
  .claimGroup, .claimGroup *,
  .claimHeaderRow, .claimHeaderRow *,
  .claimTitle, .claimText,
  .factCard, .factCard * {
    text-align: left !important;
  }


  

  /* Reminder box: left-indent case name */
  .caseBar.reminder .caseTopLine {
    text-align: left !important;
    padding-left: 18px;
  }


  /* Case header boxes: right-align case title on non-reminder boxes */
  

    .sliderBubble{
      position:absolute;
      top:-28px;
      transform:translateX(-50%);
      font-size:13px;
      font-weight:600;
      background:#ffffff;
      padding:2px 6px;
      border-radius:12px;
      box-shadow:0 1px 4px rgba(0,0,0,0.15);
      pointer-events:none;
      z-index: 10;
    }

    /* Multi-slider scale row (match Section 1 spacing) */
    .scaleRow{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:10px;
      width:100%;
      margin-top:10px;
    }
    .scaleTick{
      flex:1 1 0;
      text-align:center;
      font-size:12px;
      line-height:1.15;
      color:#333;
    }
    .scaleTick:first-child{ text-align:left; }
    .scaleTick:last-child{ text-align:right; }

    /* Multi-slider: ensure track width matches label row */
    .multiSliderBox .jspsych-html-slider-response-container{ width:100%; }
    .multiSliderBox input[type=range]{ width:100%; margin:0; }
    .multiSliderBox .scaleRow{ width:100%; }

    /* ===== Section 1 readability tweaks ===== */

    /* ===== Section 1 hierarchy v2 ===== */

    .page .instructions{margin:28px 6px 10px 6px;}

    .probList .sliderGroup{gap:0;}
    .probList .probRow{background:transparent; border:none; border-bottom:1px solid rgba(0,0,0,0.06); border-radius:0; padding:12px 12px; margin:0;}
    .probList .probRow:last-child{border-bottom:none;}

    .s1Header{background:rgba(0,0,0,0.07); border:1px solid rgba(0,0,0,0.14); padding:12px 14px; border-radius:14px; margin:10px 6px 40px 6px;}
    .s1Header .title{font-size:20px; font-weight:700; margin-bottom:2px;}
    .s1Header .muted{font-size:13px; color:rgba(0,0,0,0.6);}
        .instructionCard{background:rgba(0,0,0,0.02); border:1px solid rgba(0,0,0,0.06); border-radius:14px; padding:10px 12px; margin:12px 6px 10px 6px;}
    .claimList{margin-top:10px; margin-left:6px; margin-right:6px; padding:8px 10px; border:1px solid rgba(0,0,0,0.06); border-radius:16px; overflow:hidden; background:rgba(0,0,0,0.012);}
    .claimItem{background:transparent; border:none; border-bottom:1px solid rgba(0,0,0,0.06); border-radius:0; padding:12px 12px; margin:0;}
    .claimItem:last-child{border-bottom:none;}
    .claimTag{color:rgba(0,0,0,0.60); font-size:13px; margin-bottom:4px;}
    .claimText{font-size:16px; line-height:1.25; padding-left:8px;}
    .probRow{display:flex; justify-content:space-between; gap:12px; background:rgba(0,0,0,0.02); border:1px solid rgba(0,0,0,0.06); border-radius:14px; padding:10px 12px;}
    .probRow .sliderPrompt{flex:1; padding-right:8px;}
    .sliderGroup{display:flex; flex-direction:column; gap:8px;}

  
    .bonusNote{display:none;}
  
    .reminderBox{display:none;}
  
    /* ===== Reminder suppression ===== */
    .reminderBox,.reminder-box,#reminderBox{display:none !important;}
  
    /* ===== Hide Section 2 reminder panels ===== */
    .reminderBox,.reminder-box,.requiredIssuesBox,.requiredIssuesPanel{display:none !important;}
  
    /* ===== Evidence help box styling ===== */
    .box[data-component-id="box:how_to_read_and_use_facts"]{background:rgba(0,0,0,0.015); border:1px dashed rgba(0,0,0,0.18); border-radius:10px; padding:14px 16px;}
    .box[data-component-id="box:how_to_read_and_use_facts"] > div:first-child{
        font-weight:700;
        letter-spacing:0.02em;
    }

  
    /* Hide bonus info */
    .muted.bonus, .bonusInfo {display:none !important;}
  
    /* Details styling for disputed point */
    .disputedPoint{margin-top:6px;}
    .disputedPoint summary{font-weight:700; padding:6px 8px; border-radius:8px; background:rgba(0,0,0,0.01);}
    .disputedPoint div{padding:8px 6px; margin-top:6px; border-left:3px solid rgba(0,0,0,0.04); background:rgba(0,0,0,0.01);}
    
  </style>
`;
  /**
   * pageFrameHtml — standard page wrapper
   * Ensures consistent BASE_CSS injection and root .page container.
   * @param {string} innerHtml - inner HTML placed inside the .page container.
   * @returns {string}
   */
  function pageFrameHtml(innerHtml) {
    return `${BASE_CSS}
<div class="page" data-component-id="page:root">
<div class="stack">${innerHtml}</div>
</div>`;
  }


/* ==================== HEADER + INSTRUCTIONS COMPONENTS ==================== */

/**
 * pageTitleHtml — standardized page title/header element.
 * @param {string} title
 * @param {object} opts
 * @param {boolean} [opts.is_html=false] - If true, title is inserted as raw HTML; otherwise escaped.
 * @param {string} [opts.component_id="header:page_title"]
 * @param {string} [opts.class_name="title"]
 * @param {string} [opts.style=""]
 */
function pageTitleHtml(title, opts = {}) {
  const is_html = !!opts.is_html;
  const component_id = opts.component_id || "header:page_title";
  const class_name = opts.class_name || "title";
  const style = opts.style ? String(opts.style) : "";
  const content = is_html ? String(title || "") : escapeHtml(String(title || ""));
  return `<div class="${class_name}" data-component-id="${component_id}"${style ? ` style="${style}"` : ""}>${content}</div>`;
}

/**
 * instructionsHtml — standardized instructions block.
 * @param {string} inner
 * @param {object} opts
 * @param {boolean} [opts.is_html=true] - If true, inner is inserted as raw HTML; otherwise escaped.
 * @param {string} [opts.component_id="text:instructions"]
 * @param {string} [opts.style="max-width:820px; margin:18px auto 0; text-align:left;"]
 * @param {string} [opts.class_name="instructions"]
 */
function instructionsHtml(inner, opts = {}) {
  const is_html = (typeof opts.is_html === "boolean") ? opts.is_html : true;
  const component_id = opts.component_id || "text:instructions";
  const class_name = opts.class_name || "instructions";
  const style_default = "max-width:820px; margin:18px auto 0; text-align:left;";
  const style = (typeof opts.style === "string") ? opts.style : style_default;
  const content = is_html ? String(inner || "") : escapeHtml(String(inner || ""));
  return `<div class="${class_name}" data-component-id="${component_id}"${style ? ` style="${style}"` : ""}>${content}</div>`;
}

/**
 * headerBlockHtml — common pattern: page title + single instructions block.
 * Returns INNER HTML only (no .page wrapper); intended to be passed into pageHtml()/pageFrameHtml().
 * @param {object} cfg
 * @param {string} cfg.title
 * @param {string} [cfg.instructions_html=""]
 * @param {boolean} [cfg.title_is_html=false]
 * @param {string} [cfg.title_style=""]
 * @param {string} [cfg.instructions_style] - If omitted, uses instructionsHtml default style.
 */
function headerBlockHtml(cfg = {}) {
  const title = cfg.title || "";
  const instructions_html = cfg.instructions_html || "";
  const title_is_html = !!cfg.title_is_html;
  const title_style = cfg.title_style || "";
  const instructions_style = (typeof cfg.instructions_style === "string") ? cfg.instructions_style : undefined;

  const parts = [];
  parts.push(pageTitleHtml(title, { is_html: title_is_html, style: title_style }));
  if (String(instructions_html || "").trim()) {
    parts.push(instructionsHtml(instructions_html, { is_html: true, style: instructions_style }));
  }
  return parts.join("\n");
}


/* ==================== CONTINUE BUTTON COMPONENT ==================== */
/**
 * continueButtonHtml — standardized manual continue/start button.
 * Intended for use inside jsPsychHtmlKeyboardResponse trials where a custom button triggers finishTrial().
 * @param {string} label
 * @param {object} opts
 * @param {string} [opts.id="go"]
 * @param {string} [opts.component_id="button:continue"]
 * @param {string} [opts.class_name="btn bigBtn"]
 * @param {string} [opts.style=""]
 */

/* ==================== B3: NOTE / MUTED HELPERS ==================== */
function mutedHtml(html, opts) {
  const o = opts || {};
  const cid = o.componentId ? ` data-component-id="${o.componentId}"` : ` data-component-id="text:muted"`;
  const style = o.style ? ` style="${o.style}"` : "";
  return `<div class="muted"${cid}${style}>${html}</div>`;
}

function noteLineHtml(html, opts) {
  const o = opts || {};
  const cid = o.componentId ? ` data-component-id="${o.componentId}"` : ` data-component-id="note:line"`;
  const style = o.style ? ` style="${o.style}"` : "";
  return `<div class="noteLine"${cid}${style}>${html}</div>`;
}

function continueButtonHtml(label = "Continue", opts = {}) {
  const id = opts.id || "go";
  const component_id = opts.component_id || "button:continue";
  const class_name = opts.class_name || "btn continueBtn";
  const style = opts.style ? String(opts.style) : "";
  const safeLabel = escapeHtml(String(label || ""));
  return `<button id="${escapeHtml(id)}" class="${escapeHtml(class_name)}" data-component-id="${escapeHtml(component_id)}"${style ? ` style="${style}"` : ""}>${safeLabel}</button>`;
}



  /**
   * pageHtml — normalize a stimulus HTML string into the standard page wrapper.
   * Accepts either:
   *  (a) inner HTML (no .page wrapper), or
   *  (b) a full <div class="page"...>...</div> block (with or without BASE_CSS).
   *
   * This allows incremental migration while keeping output consistent.
   * @param {string} html
   * @returns {string}
   */
  function pageHtml(html) {
    const s = String(html || "");
    // Remove any embedded BASE_CSS interpolation if present in template literals.
    const stripped = s.replace(/\$\{BASE_CSS\}/g, "").trim();

    // If the caller already provided a .page wrapper, just ensure BASE_CSS is injected once.
    const hasPageWrapper = /<div\s+class="page"\b/.test(stripped);
    if (hasPageWrapper) {
      // Prefer the canonical root tag when present; do not rewrite markup here.
      return `${BASE_CSS}
${stripped}`;
    }

    // Otherwise treat it as inner HTML and wrap.
    return pageFrameHtml(stripped);
  }

  /* ==================== JSON LOADING ==================== */
  // IMPORTANT: upload the JSON to cognition.run stimuli tab with this exact name.
  const STIM_PATH = "stimuli/cleaned_pruned_based_on_best_validation_facts.json";

  async function loadStimuli() {
    const res = await fetch(STIM_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${STIM_PATH}: HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.cases)) throw new Error("JSON missing top-level 'cases' array");

    // Normalize for compatibility
    data.cases.forEach(cs => {
      cs.plaintiff_name = cs.plaintiff_name || cs.plaintiff_descriptor || cs.plaintiff || "Plaintiff";
      cs.defendant_name = cs.defendant_name || cs.defendant_descriptor || cs.defendant || "Defendant";

      if (!Array.isArray(cs.claims)) cs.claims = [];
      cs.claims.forEach(cl => {
        const txt = (cl && (cl.claim_text || cl.text || cl.claim || cl.claimText || cl.statement)) || "";
        cl.claim_text = String(txt || "");
        cl.text = cl.claim_text;
        cl.claim = cl.claim_text;
      });
      cs.claims = cs.claims.filter(cl => (cl && (cl.claim_id || (cl.claim_text && String(cl.claim_text).trim().length > 0))));

      if (!Array.isArray(cs.facts)) cs.facts = [];
      cs.facts.forEach(f => {
        const ft = (f && (f.fact_text || f.text)) || "";
        f.fact_text = String(ft || "");
        f.text = f.fact_text;
        // v6.12: optional bold-diff memory fields (fallbacks)
        if (typeof f.fact_text_bolded_diff !== "string" || !f.fact_text_bolded_diff) f.fact_text_bolded_diff = f.fact_text;
        if (typeof f.exposure_foil_bolded_diff !== "string") f.exposure_foil_bolded_diff = "";
        if (typeof f.exposure_foil_type !== "string") f.exposure_foil_type = "";
        const dir = String(f.direction || f.fact_helps_side || f.fact_side || "").trim().toLowerCase();
        if (dir === "plaintiff" || dir === "defendant") {
          f.direction = dir;
          f.fact_helps_side = f.fact_helps_side || dir;
          f.fact_side = f.fact_side || dir;
        }
        if (typeof f.supports_plaintiff !== "boolean") f.supports_plaintiff = (dir === "plaintiff");
        if (typeof f.supports_defendant !== "boolean") f.supports_defendant = (dir === "defendant");
        if (!f.claim_id) throw new Error(`Fact missing claim_id (case=${cs.case_id}, fact_id=${f.fact_id})`);
      });
    });

    return data.cases;
  }


  function singleCaseSuffix() {
    return "";
  }


  function caseMetaLine(plan, i, n) {
    const c = (plan && plan.caseObj) ? plan.caseObj : {};
    const label = titleCaseLabel(c.case_label || c.case_id || ("Case " + (i || 1)));
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    return `${escapeHtml(label)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)}${singleCaseSuffix()}`;
  }

  function numericProbabilityScaleNoteHtml(html) {
    return `<div class="muted" style="text-align:left; margin-bottom:10px; position:sticky; top:0; background:rgba(255,255,255,0.92); backdrop-filter:saturate(180%) blur(6px); padding:10px 0; z-index:5;" data-component-id="text:scale_note">${html}</div>`;
  }

  function numericProbabilityInputRowHtml(cfg) {
    const promptHtml = cfg.promptHtml || "";
    const inputId = cfg.inputId || "prob_input";
    const inputComponentId = cfg.inputComponentId || "input:prob";
    const rowComponentId = cfg.rowComponentId || "row:prob";
    return `
      <div class="sliderRow probRow" style="align-items:flex-start; margin-bottom:6px;" data-component-id="${rowComponentId}">
        <div class="sliderPrompt" style="width:100%; max-width:720px;" data-component-id="text:prob_prompt">${promptHtml}</div>
        <div style="min-width:160px; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
          <input id="${inputId}" type="number" inputmode="numeric" min="0" max="100" step="1"
            placeholder="0–100" style="width:140px; padding:8px 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.22); font-size:16px;"
            data-component-id="${inputComponentId}" />
          <div class="muted" style="font-size:12px; text-align:right;">Probability (%)</div>
        </div>
      </div>
    `;
  }

  /* ==================== CASE HEADER ==================== */
    function requiredIssuesDetailsHtml(plan) {
    const c = plan.caseObj || {};
    const caseType = getCaseTypeLabel(c.case_id || c.case_label || "");
    const layer1 = c.claims_layer_1 || c.claims_layer1 || c.layer1_claims || [];
    const layer2 = c.claims || [];
    const disputedParents = new Set((layer2 || []).map(x => x && x.layer_1_parent).filter(Boolean));
    const l1Order = getStableClaimOrder(plan, "layer1", layer1);
    const l1ById = Object.fromEntries(layer1.map(x => [x.claim_id, x]));
    const ids = (l1Order && l1Order.length) ? l1Order : layer1.map(x => x.claim_id);
    const items = ids.map((cid, i) => {
      const it = l1ById[cid] || {};
      const t = (it.claim_text_abstract || it.claim_text || "").trim();
      if (!t) return "";
      return `<li style="margin:8px 0; line-height:1.35;"><b>Required Issue ${i+1}${disputedParents.has(cid) ? " <span style=\"font-weight:800; font-size:12px; padding:2px 8px; border-radius:999px; background:rgba(0,0,0,0.06);\">Disputed</span>" : ""}:</b> ${disputedParents.has(cid) ? `<span style=\"font-weight:800;\">${escapeHtml(domainPriorsNormalizeAssertion(t))}</span>` : escapeHtml(domainPriorsNormalizeAssertion(t))}</li>`;
    }).filter(Boolean).join("");

    if (!items) return "";
    return `<details class="caseSummary" data-component-id="accordion:req_issues_and_routes">
      <summary>View required issues</summary>
      <div class="instructions" data-component-id="text:instructions" class="accordionContent">
        <div class="muted" style="margin-bottom:10px;">
          <span style="font-weight:700;">Reminder:</span> In some cases, an issue may not be disputed. But to win, the plaintiff must still be able to establish each required issue as <b>more likely true than not</b>.
        </div>
        <ul style="margin:0 0 0 18px; padding:0;">${items}</ul>
      </div>
    </details>`;
  }

  function evidentiaryRoutesDetailsHtml(plan) {
    const c = plan.caseObj || {};
    const caseType = getCaseTypeLabel(c.case_id || c.case_label || "");
    const layer2 = c.claims || [];
    const l2Order = getStableClaimOrder(plan, "layer2", layer2);
    const l2ById = Object.fromEntries(layer2.map(x => [x.claim_id, x]));
    const ids = (l2Order && l2Order.length) ? l2Order : layer2.map(x => x.claim_id);
    const items = ids.map((cid, i) => {
      const it = l2ById[cid] || {};
      const t = (it.claim_text_abstract || it.claim_text || "").trim();
      if (!t) return "";
      return `<li style="margin:8px 0; line-height:1.35;"><b>Line of Evidence ${i+1}:</b> ${escapeHtml(domainPriorsNormalizeAssertion(t))}</li>`;
    }).filter(Boolean).join("");

    if (!items) return "";
    return `<details class="caseSummary" data-component-id="accordion:req_issues_and_routes">
      <summary>View lines of evidence</summary>
      <div class="instructions" data-component-id="text:instructions" class="accordionContent">
        <div class="muted" style="margin-bottom:10px;">
          Each line of evidence is a disputed point that the parties may try to prove or challenge.
        </div>
        <ul style="margin:0 0 0 18px; padding:0;">${items}</ul>
      </div>
    </details>`;
  }

function caseHeaderHtml(plan, showSummaryToggle) {
    const c = plan.caseObj;
    const label = titleCaseLabel(c.case_label || c.case_id || "Case");
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    const summary = c.case_summary_text || "";

    return `
      <div class="caseBar${showSummaryToggle ? " reminder" : ""}">
        ${showSummaryToggle ? `<div class="reminderTag" data-component-id="watermark:reminder">Reminder</div>` : ""}
        <div class="caseTopLine" data-component-id="header:case_title">${escapeHtml(label)}</div>
        <div class="casePartyLine" data-component-id="text:case_parties">Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)}</div>
        ${showSummaryToggle
          ? `<details class="caseSummary" data-component-id="accordion:case_summary"><summary data-component-id="accordion:case_summary:summary">CASE SUMMARY</summary><div class="instructions" data-component-id="text:instructions" class="accordionContent">${escapeHtml(summary)}</div></details>` : ""
        }
      
        
        </div>
    `;
  }

  /* ==================== LEGACY FACT CARD BUILDERS REMOVED ==================== */

// Highlight word/phrase differences between two near-identical gist options.
// Word-level LCS diff; wraps non-common tokens in <span class="diff">...</span>.
function diffHighlightHtml(aRaw, bRaw) {
  const a = String(aRaw || "");
  const b = String(bRaw || "");
  const aWords = a.split(/(\s+)/); // keep whitespace tokens
  const bWords = b.split(/(\s+)/);

  // Build arrays of "word tokens" indices (non-whitespace), but preserve whitespace in output.
  const aTok = aWords.map(t => ({ t, isSpace: /^\s+$/.test(t) }));
  const bTok = bWords.map(t => ({ t, isSpace: /^\s+$/.test(t) }));

  const aCore = aTok.filter(x => !x.isSpace).map(x => x.t);
  const bCore = bTok.filter(x => !x.isSpace).map(x => x.t);

  const n = aCore.length, m2 = bCore.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m2 + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m2 - 1; j >= 0; j--) {
      dp[i][j] = (aCore[i] === bCore[j]) ? (1 + dp[i + 1][j + 1]) : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Recover common-word sets (indices)
  const aCommon = new Set();
  const bCommon = new Set();
  let i = 0, j = 0;
  while (i < n && j < m2) {
    if (aCore[i] === bCore[j]) { aCommon.add(i); bCommon.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  function render(tokens, coreWords, commonSet) {
    let coreIdx = 0;
    return tokens.map(x => {
      if (x.isSpace) return escapeHtml(x.t);
      const w = coreWords[coreIdx];
      const isCommon = commonSet.has(coreIdx);
      coreIdx++;
      const safe = escapeHtml(w);
      return isCommon ? safe : `<span class="diff">${safe}</span>`;
    }).join("");
  }

  return {
    a_html: render(aTok, aCore, aCommon),
    b_html: render(bTok, bCore, bCommon)
  };
}

  /* ==================== CLAIM-STRUCTURED SAMPLER ==================== */
  function sampleFactsForCase(caseObj) {
    const safeCase = caseObj || {};
    const claims = Array.isArray(safeCase.claims) ? safeCase.claims.filter(Boolean) : [];
    const facts = Array.isArray(safeCase.facts) ? safeCase.facts.filter(Boolean) : [];
    const claim_order = shuffle(claims.map(c => c && c.claim_id).filter(Boolean));

    const shown_facts_by_claim = {};
    const sideSelections = [];

    claim_order.forEach(claim_id => {
      const claimFacts = facts.filter(f => f && String(f.claim_id || "") === String(claim_id || ""));
      const plaintiffFacts = claimFacts.filter(f => factSide(f) === "plaintiff");
      const defendantFacts = claimFacts.filter(f => factSide(f) === "defendant");
      const picked = [];

      if (plaintiffFacts.length) picked.push(Object.assign({}, plaintiffFacts[0], { _picked_side: "plaintiff" }));
      if (defendantFacts.length) picked.push(Object.assign({}, defendantFacts[0], { _picked_side: "defendant" }));

      shown_facts_by_claim[claim_id] = shuffle(picked);
      sideSelections.push({
        claim_id,
        plaintiff_seen: plaintiffFacts.length ? 1 : 0,
        defendant_seen: defendantFacts.length ? 1 : 0
      });
    });

    const flat = [];
    claim_order.forEach(claim_id => {
      (shown_facts_by_claim[claim_id] || []).forEach(f => flat.push(f));
    });
    flat.forEach((f, idx) => { f._fn = idx + 1; });

    const fnById = {};
    flat.forEach(f => { if (f && f.fact_id) fnById[f.fact_id] = f._fn; });
    Object.keys(shown_facts_by_claim).forEach(claim_id => {
      shown_facts_by_claim[claim_id] = (shown_facts_by_claim[claim_id] || []).map(f => Object.assign({}, f, { _fn: fnById[f.fact_id] || null }));
    });

    const facts_shown_ids = flat.map(f => f.fact_id).filter(Boolean);
    const n_plaintiff_shown = flat.filter(f => f._picked_side === "plaintiff").length;
    const n_defendant_shown = flat.filter(f => f._picked_side === "defendant").length;

    return {
      claim_order,
      shown_facts_by_claim,
      facts_flat: flat,
      facts_shown_ids,
      n_plaintiff_shown,
      n_defendant_shown,
      sampler_side_selections: sideSelections
    };
  }

  /* ==================== SCREENS ==================== */
  function render_check_screen(jsPsych, stimMeta) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: () => {
        const meta = stimMeta || {};
        const firstClaim = String(meta.first_claim_preview || "");
        const claimSnippet = firstClaim ? (firstClaim.length > 120 ? firstClaim.slice(0, 120) + "…" : firstClaim) : "(none)";
        return pageFrameHtml(`
            <div class="title" data-component-id="header:page_title">Render check</div>
            <div class="instructions" data-component-id="text:instructions">
              If you can see this page, the task rendered successfully.
            </div>

            <div class="box" style="margin: 12px 0;">
              <div><b>Stimuli file:</b> <span class="tag">${escapeHtml(meta.stim_path || STIM_PATH)}</span></div>
              <div class="muted">Cases: <b>${((meta.n_cases === null || meta.n_cases === undefined) ? "?" : meta.n_cases)}</b> &nbsp;|&nbsp;
                Claims per case: <b>${Array.isArray(meta.n_claims_by_case) ? meta.n_claims_by_case.join(", ") : "?"}</b> &nbsp;|&nbsp;
                Facts per case: <b>${Array.isArray(meta.n_facts_by_case) ? meta.n_facts_by_case.join(", ") : "?"}</b>
              </div>
              <div class="muted"><b>First claim preview:</b> ${escapeHtml(ensureDoubleQuotes(claimSnippet))}</div>
              <div class="muted"><b>Preview mode:</b> <span class="tag">ON</span></div>
            </div>

            ${continueButtonHtml("Start",{component_id:"button:start"})}
        `);
      },
      on_load: () => {
        document.getElementById("go").addEventListener("click", () => {
          jsPsych.finishTrial({ page_type: "render_check", preview_mode: PREVIEW_MODE });
        });
      }
    };
  }

  function consent_screen(jsPsych) {
    return {
      type: jsPsychHtmlButtonResponse,
      stimulus: `
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" style="text-align:center;">${COPY.consent_title}</div>
          <div class="box" style="max-height:360px; overflow-y:auto; background:#fff;">
            <div class="instructions" data-component-id="text:instructions" style="margin-top:0;">
              ${COPY.consent_html}
            </div>
          </div>
          <div class="instructions" data-component-id="text:instructions" style="margin:12px 0 0; text-align:center;">
            ${COPY.consent_prompt}
          </div>
        </div>
      `,
      choices: COPY.consent_buttons,
      on_finish: (data) => {
        const noConsent = (data.response === 0);
        if (noConsent) {
          jsPsych.endExperiment("No consent");
        }
      },
      data: { page_type: "consent" }
    };
  }

  function overview_screen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: `
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" data-component-id="header:page_title">${COPY.overview_title}</div>
          <div class="instructions" data-component-id="text:instructions">
            ${COPY.overview_html}
          </div>
          ${noteLineHtml(COPY.overview_duration_note, {style:"margin-top:8px; margin-bottom:8px;", componentId:"note:duration"})}
          ${continueButtonHtml(COPY.continue_label)}
        </div>
      `,
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type: "overview" }))
    };
  }

  /* ==================== DOMAIN PRIORS (CASE-TYPE INTRO) ==================== */

  function getCaseTypeLabel(case_id) {
    const id = String(case_id || "").toLowerCase();
    if (id.includes("consumer") || id.includes("fraud")) return "Consumer Fraud";
    if (id.includes("employment")) return "Employment Discrimination";
    // default: product liability / toxic implant
    return "Product Liability";
  }


  function standardTransitionScreen(jsPsych, pageType, bodyHtml, extraData) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${bodyHtml}
          </div>
          ${continueButtonHtml(COPY.continue_label)}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial(Object.assign({ page_type: pageType }, extraData || {})));
      }
    };
  }

  function section1_transition_screen(jsPsych) {
    return standardTransitionScreen(jsPsych, "section1_transition", COPY.section1_transition_html);
  }

  /* ==================== SECTION 1: CASE ORIENTATION + INITIAL PROBABILITIES ==================== */

    function section1_case_transition_screen(jsPsych, plan, i, n) {
    const c = plan.caseObj || {};
    const label = titleCaseLabel(c.case_label || c.case_id || ("Case " + i));
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="instructions" data-component-id="text:transition" style="text-align:left;">
            <p style="margin:0;">Moving on to <b>${escapeHtml(label)}</b>.</p>
          </div>
          ${continueButtonHtml("Continue")}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial({
          page_type: "s1_case_transition",
          case_id: c.case_id,
          case_index: i
        }));
      }
    };
  }

  function section1_case_summary_screen(jsPsych, plan, i, n) {
    const c = plan.caseObj || {};
    const label = titleCaseLabel(c.case_label || c.case_id || ("Case " + i));
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    const summary = c.case_summary_text || "";

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s1">
          <div class="title" data-component-id="header:page_title">Case Summary</div>
          <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(label)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
        </div>
          <div class="space-md" aria-hidden="true"></div>

          <div class="instructions" data-component-id="text:case_summary" style="text-align:left; white-space:pre-wrap;">${escapeHtml(summary)}</div>

          ${continueButtonHtml("Continue")}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial({
          page_type: "s1_case_summary",
          case_id: c.case_id,
          case_index: i
        }));
      }
    };
  }

    function section1_layer1_list_screen(jsPsych, plan, i) {
    const c = plan.caseObj || {};
    const label = titleCaseLabel(c.case_label || c.case_id || ("Case " + i));
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    const layer1 = c.claims_layer_1 || c.claims_layer1 || c.layer1_claims || [];

    const items = layer1.map((it, idx) => {
      const txt = (it.claim_text || it.text || "").toString().trim();
      if (!txt) return "";
      return `
        <div class="claimItem" data-component-id="item:l1_${idx+1}">
          <div class="claimTag" data-component-id="tag:l1_${idx+1}"><b>Required element ${idx+1}:</b></div>
          <div class="claimText" data-component-id="text:l1_text_${idx+1}">${escapeHtml(txt)}</div>
        </div>
      `;
    }).filter(Boolean).join("");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s1">
            <div class="title" data-component-id="header:page_title">${COPY.section1_required_title}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(label)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
          </div>

          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${COPY.section1_required_intro_html}
          </div>

          
          <div class="space-sm" aria-hidden="true"></div>
          <div class="claimList" data-component-id="list:l1_required">
            ${items}
          </div>

          ${continueButtonHtml("Continue")}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial({
          page_type: "s1_layer1_list",
          case_id: c.case_id,
          case_index: i
        }));
      }
    };
  }

  function section1_probability_inputs_screen(jsPsych, plan, i, opts) {
    const c = plan.caseObj || {};
    const claimLayer = opts.claimLayer; // "layer1" | "layer2"
    const pageType = opts.pageType;
    const titleSuffix = opts.titleSuffix;
    const introHtml = opts.introHtml;
    const claims = opts.claims || [];

    const showS3Reminder = (pageType === "s3_layer1_post" || pageType === "s3_layer2_post");

    const rowsHtml = claims.map((cl, idx) => {
      const txt = (cl.claim_text || cl.text || "").toString().trim();
      const inputId = `prob_${claimLayer}_${idx}`;
      return `
        <div class="sliderRow probRow" data-component-id="row:${claimLayer}_${idx+1}" style="align-items:flex-start; margin-bottom:6px;">
          <div class="sliderPrompt" data-component-id="text:${claimLayer}_text_${idx+1}" style="width:100%; max-width:720px;">
            <div class="claimTag" data-component-id="tag:${claimLayer}_${idx+1}"><b>${claimLayer === "layer1" ? `Required element ${idx+1}:` : `Disputed point ${idx+1}:`}</b></div>
            <div class="claimText" data-component-id="text:${claimLayer}_text_${idx+1}">${escapeHtml(txt)}</div>
          </div>
          <div style="min-width:160px; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <input id="${inputId}" data-claim-idx="${idx}" type="number" inputmode="numeric" min="0" max="100" step="1"
              placeholder="0–100" style="width:140px; padding:8px 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.22); font-size:16px;"
              data-component-id="input:${claimLayer}_${idx+1}" />
            <div class="muted" style="font-size:12px; text-align:right;" data-component-id="text:hint_${claimLayer}_${idx+1}">Probability (%)</div>
          </div>
        </div>
      `;
    }).join("");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s1">
            <div class="title" data-component-id="header:page_title">${escapeHtml(titleSuffix)}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${caseMetaLine(plan, i)}</div>
          </div>

          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${introHtml}${(showS3Reminder && DISCLOSE_EVIDENCE_SIDE && !SHOW_BOTH_SIDES) ? noteLineHtml(`<i>${copyFormat(COPY.s3_page_reminder_html, {SIDE: recordSideLabel(plan.record_side), OTHER_SIDE: recordSideLabel(plan.record_side === "plaintiff" ? "defendant" : "plaintiff")})}</i>`, {style:"margin-top:10px; margin-bottom:0;", componentId:"note:s3_page_reminder"}) : ""}
          </div>

          <div class="space-sm" aria-hidden="true"></div>

          ${numericProbabilityScaleNoteHtml('Enter a number from <b>0</b> (definitely not accepted) to <b>100</b> (definitely accepted).')}

          <div class="claimList probList" data-component-id="list:prob_container"><div class="sliderGroup" data-component-id="group:${claimLayer}_probs">
            ${rowsHtml}
          </div></div>

          <div id="prob_error" class="errorBox" style="display:none; margin-top:10px;" data-component-id="error:prob">
            Please enter a number from 0 to 100 for every item.
          </div>

          ${continueButtonHtml(COPY.continue_label)}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        const inputs = Array.from(document.querySelectorAll('input[type="number"][id^="prob_"]'));
        const err = document.getElementById("prob_error");

        function allValid() {
          if (typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE) return true;
          for (const el of inputs) {
            const v = el.value;
            if (v === "" || v === null) return false;
            const num = Number(v);
            if (!Number.isFinite(num) || num < 0 || num > 100) return false;
          }
          return true;
        }

        function update() {
          const ok = allValid();
          if (btn) btn.disabled = !ok;
          if (err) err.style.display = "none";
        }

        inputs.forEach(el => {
          el.addEventListener("input", update);
          el.addEventListener("blur", update);
        });

        if (btn) btn.disabled = !(typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE);
        update();

        if (btn) {
          btn.addEventListener("click", () => {
            if (!allValid()) {
              if (err) err.style.display = "block";
              return;
            }
            const rows = inputs.map(el => {
              const idx = Number(el.getAttribute("data-claim-idx"));
              const cl = claims[idx] || {};
              const prob = (el.value === "" || el.value === null) ? null : Number(el.value);
              return {
                page_type: pageType,
                case_id: c.case_id,
                case_index: i,
                claim_layer: claimLayer,
                claim_id: cl.claim_id,
                claim_text: (cl.claim_text || cl.text || "").toString(),
                probability: prob
              };
            });
            jsPsych.finishTrial({
              page_type: pageType,
              case_id: c.case_id,
              case_index: i,
              claim_layer: claimLayer,
              rows
            });
          });
        }
      },
      on_finish: (data) => {
        const rows = data.rows || [];
        if (rows && rows.length) rows.forEach(r => writeDataRow(jsPsych, r));
      }
    };
  }

    function section1_layer2_list_screen(jsPsych, plan, i) {
    const c = plan.caseObj || {};
    const label = titleCaseLabel(c.case_label || c.case_id || ("Case " + i));
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    const layer2 = c.claims || [];

    const items = layer2.map((it, idx) => {
      const txt = (it.claim_text || it.text || "").toString().trim();
      if (!txt) return "";
      return `
        <div class="claimItem" data-component-id="item:l2_${idx+1}">
          <div class="claimTag" data-component-id="tag:l2_${idx+1}"><b>Disputed point ${idx+1}:</b></div>
          <div class="claimText" data-component-id="text:l2_text_${idx+1}">${escapeHtml(txt)}</div>
        </div>
      `;
    }).filter(Boolean).join("");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s1">
            <div class="title" data-component-id="header:page_title">${COPY.section1_disputed_title}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(label)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
          </div>

          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${COPY.section1_disputed_intro_html}
          </div>

          
          <div class="space-sm" aria-hidden="true"></div>
          <div class="claimList" data-component-id="list:l2_disputed">
            ${items}
          </div>

          ${continueButtonHtml("Continue")}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial({
          page_type: "s1_layer2_list",
          case_id: c.case_id,
          case_index: i
        }));
      }
    };
  }

    function section1_case_outcome_probability_screen(jsPsych, plan, i) {
    const c = plan.caseObj || {};
    const label = titleCaseLabel(c.case_label || c.case_id || ("Case " + i));
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s1">
            <div class="title" data-component-id="header:page_title">${COPY.section1_case_outcome_title}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(label)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
          </div>

          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${COPY.section1_case_outcome_intro_html}
          </div>

          <div class="space-sm" aria-hidden="true"></div>

          <div class="muted" style="text-align:left; margin-bottom:10px; position:sticky; top:0; background:rgba(255,255,255,0.92); backdrop-filter:saturate(180%) blur(6px); padding:10px 0; z-index:5;" data-component-id="text:scale_note">
            ${COPY.section1_case_outcome_scale_note}
          </div>

          <div class="sliderRow probRow" style="align-items:flex-start; margin-bottom:6px;" data-component-id="row:outcome">
            <div class="sliderPrompt" style="width:100%; max-width:720px;" data-component-id="text:outcome_prompt"></div>
            <div style="min-width:160px; display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
              <input id="prob_outcome" type="number" inputmode="numeric" min="0" max="100" step="1"
                placeholder="0–100" style="width:140px; padding:8px 10px; border-radius:12px; border:1px solid rgba(0,0,0,0.22); font-size:16px;"
                data-component-id="input:outcome" />
              <div class="muted" style="font-size:12px; text-align:right;">Probability (%)</div>
            </div>
          </div>

          <div id="prob_error_outcome" class="errorBox" style="display:none; margin-top:12px;" data-component-id="error:prob_outcome">
            Please enter a number from 0 to 100.
          </div>

          ${continueButtonHtml("Continue")}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        const input = document.getElementById("prob_outcome");
        const err = document.getElementById("prob_error_outcome");

        function valid() {
          if (typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE && (!input.value || String(input.value).trim() === "")) return true;
          const v = input.value;
          if (v === "" || v === null) return false;
          const num = Number(v);
          return Number.isFinite(num) && num >= 0 && num <= 100;
        }
        function update() {
          const ok = valid();
          if (btn) btn.disabled = !ok;
          if (err) err.style.display = "none";
        }
        if (btn) btn.disabled = !(typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE);
        if (input) {
          input.addEventListener("input", update);
          input.addEventListener("blur", update);
        }
        update();

        if (btn) btn.addEventListener("click", () => {
          if (!valid()) { if (err) err.style.display = "block"; return; }
          const raw = (input && input.value !== null && input.value !== undefined) ? String(input.value).trim() : "";
          const prob = (raw === "") ? null : Number(raw);
          jsPsych.finishTrial({
            page_type: "s1_case_outcome_prior",
            case_id: c.case_id,
            case_index: i,
            probability: prob
          });
        });
      },
      on_finish: (data) => {
        writeDataRow(jsPsych, {
          page_type: "s1_case_outcome_prior",
          case_id: c.case_id,
          case_index: i,
          probability: data.probability
        });
      }
    };
  }

  function section3_case_outcome_probability_screen(jsPsych, plan, i) {
    const c = plan.caseObj || {};
    const who = recordSideLabel(plan.record_side);
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s1">
            <div class="title" data-component-id="header:page_title">${COPY.section1_case_outcome_title}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${caseMetaLine(plan, i)}</div>
          </div>

          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${copyFormat(COPY.s3_outcome_instructions, {SIDE: "<b>" + escapeHtml(who) + "</b>"})}${(DISCLOSE_EVIDENCE_SIDE && !SHOW_BOTH_SIDES) ? noteLineHtml(`<i>${copyFormat(COPY.s3_page_reminder_html, {SIDE: recordSideLabel(plan.record_side), OTHER_SIDE: recordSideLabel(plan.record_side === "plaintiff" ? "defendant" : "plaintiff")})}</i>`, {style:"margin-top:10px; margin-bottom:0;", componentId:"note:s3_page_reminder"}) : ""}
          </div>

          <div class="space-sm" aria-hidden="true"></div>

          ${numericProbabilityScaleNoteHtml(COPY.s3_outcome_scale_note)}

          ${numericProbabilityInputRowHtml({
            promptHtml: COPY.s3_outcome_prompt,
            inputId: "prob_outcome",
            inputComponentId: "input:outcome",
            rowComponentId: "row:outcome"
          })}

          <div id="prob_error_outcome" class="errorBox" style="display:none; margin-top:12px;" data-component-id="error:prob_outcome">
            ${COPY.prob_error}
          </div>

          ${continueButtonHtml(COPY.continue_label)}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        const input = document.getElementById("prob_outcome");
        const err = document.getElementById("prob_error_outcome");

        function valid() {
          if (typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE) return true;
          const v = input.value;
          if (v === "" || v === null) return false;
          const num = Number(v);
          return Number.isFinite(num) && num >= 0 && num <= 100;
        }
        function update() {
          const ok = valid();
          if (btn) btn.disabled = !ok;
          if (err) err.style.display = "none";
        }
        if (btn) btn.disabled = !(typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE);
        if (input) {
          input.addEventListener("input", update);
          input.addEventListener("blur", update);
        }
        update();

        if (btn) btn.addEventListener("click", () => {
          if (!valid()) { if (err) err.style.display = "block"; return; }
          const prob = (input.value === "" || input.value === null) ? null : Number(input.value);
          jsPsych.finishTrial({
            page_type: "s3_case_outcome_post",
            case_id: c.case_id,
            case_index: i,
            probability: prob
          });
        });
      },
      on_finish: (data) => {
        writeDataRow(jsPsych, {
          page_type: "s3_case_outcome_post",
          case_id: c.case_id,
          case_index: i,
          probability: data.probability
        });
      }
    };
  }


function build_section1_for_case(jsPsych, plan, i, n) {
    const c = plan.caseObj || {};
    const layer2 = c.claims || [];

    // Required-elements pages intentionally removed for the cleaned/pruned judge variant.
    // Section 1 now shows: case summary -> disputed points list -> disputed-point priors -> case outcome.
    return [
      section1_case_summary_screen(jsPsych, plan, i, n),
      section1_layer2_list_screen(jsPsych, plan, i),
      section1_probability_inputs_screen(jsPsych, plan, i, {
        claimLayer: "layer2",
        pageType: "s1_layer2_priors",
        titleSuffix: COPY.section1_assess_disputed_title,
        introHtml: COPY.section1_assess_disputed_intro_html,
        claims: layer2
      }),
      section1_case_outcome_probability_screen(jsPsych, plan, i)

    ];
  }


  
function section2_transition_screen(jsPsych, plan) {
    const who = recordSideLabel(plan ? plan.record_side : null);
    return standardTransitionScreen(
      jsPsych,
      "section2_transition",
      copyFormat(COPY.section2_transition_intro_html, {SIDE: escapeHtml(who)}),
      { record_side: plan ? plan.record_side : null }
    );
  }

  function section3_transition_screen(jsPsych, firstCaseLabel) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s3">
            <div class="title" data-component-id="header:page_title">${escapeHtml(COPY.section3_transition_title)}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(firstCaseLabel || "Case")}</div>
          </div>
          <div class="instructions" data-component-id="text:instructions" style="text-align:left;">
            ${COPY.section3_transition_html}
          </div>
          ${continueButtonHtml(COPY.continue_label)}
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial({ page_type: "section3_transition" }));
      }
    };
  }


  // Stable (within-participant) randomized ordering for abstract claim lists
  function getStableClaimOrder(caseObj, layerKey, items) {
    window.__DOMAIN_PRIORS_ORDER = window.__DOMAIN_PRIORS_ORDER || {};
    const cid = caseObj.case_id;
    window.__DOMAIN_PRIORS_ORDER[cid] = window.__DOMAIN_PRIORS_ORDER[cid] || {};
    if (Array.isArray(window.__DOMAIN_PRIORS_ORDER[cid][layerKey]) && window.__DOMAIN_PRIORS_ORDER[cid][layerKey].length) {
      return window.__DOMAIN_PRIORS_ORDER[cid][layerKey];
    }
    const ids = (items || []).map(x => x.claim_id).filter(Boolean);
    const ordered = shuffle(ids.slice());
    window.__DOMAIN_PRIORS_ORDER[cid][layerKey] = ordered;
    return ordered;
  }

  function domain_priors_intro_screen(jsPsych, caseOrder) {
    // Only change vs prior wording: case types appear in the same (randomized) order as the cases.
    const labels = (caseOrder || []).map(c => getCaseTypeLabel(c.case_id || c.case_label || ""));
    const listBold = (labels.length >= 3)
      ? `<b>${labels[0]}</b>, <b>${labels[1]}</b>, and <b>${labels[2]}</b>`
      : labels.map(l => `<b>${l}</b>`).join(", ");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`${BASE_CSS}
<div class="page" data-component-id="page:root">
  <div class="instructions" data-component-id="text:instructions">
    <p>Before looking at specific cases, we will first introduce the three types of legal cases—${listBold}—and the legal issues that come up in these kinds of disputes.</p>
    <p>We will also ask you a few brief questions to gauge your general impressions about these kinds of cases.</p>
  </div>
</div>
${continueButtonHtml()}
`),
            on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial());
      },
      on_finish: (data) => {
        data.page_type = "domain_priors_intro";
      }
    };
  }

    function domainPriorsScaleLabelsHtml() {
    // Option A: endpoints only + meaning hint (avoids mid-tick alignment issues)
    return `
      <div style="width:100%; box-sizing:border-box; margin-top:10px;">
        <div class="jspsych-slider-labels" style="width:100%; box-sizing:border-box; display:flex; justify-content:space-between;">
          <span style="flex:0 0 auto; text-align:left;">0/100</span>
          <span style="flex:0 0 auto; text-align:right;">100/100</span>
        </div>
        <div style="margin-top:6px; font-size:0.85em; color:#666; text-align:center;">
          0 = almost never &nbsp;&nbsp;•&nbsp;&nbsp; 50 = about half &nbsp;&nbsp;•&nbsp;&nbsp; 100 = almost always
        </div>
      </div>
    `;
  }

  function domainPriorsNormalizeAssertion(text) {
    if (!text) return "";
    let t = String(text).trim();
    // Remove leading "Whether" / "whether"
    if (/^whether\b/i.test(t)) {
      t = t.replace(/^whether\b\s*/i, "");
      t = t.trim();
      // Capitalize first character
      if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    return t;
  }

  function domainPriorsShortLabel(claim) {
    if (!claim) return "";
    const candidates = [
      claim.claim_label,
      claim.short_label,
      claim.label,
      claim.claim_title,
      claim.claim_name,
      claim.layer_1_label,
      claim.layer_1_parent_label
    ].filter(Boolean);

    const s = (candidates[0] || "").toString().trim();
    if (!s) return "";
    return s.length > 40 ? (s.slice(0, 37) + "…") : s;
  }

  function renderDomainPriorsMultiSliderPage(jsPsych, opts) {
      const {
        page_tag,                 // e.g., "priors_layer1_q" or "priors_layer2_q"
        header_html,              // locked header/title HTML (already styled)
        prompt_html,              // locked prompt HTML (already styled)
        footer_html,              // closing/wrap HTML (already styled)
        items,                    // [{ id, label_html }]
        case_type_label,          // e.g., "Product Liability" (stored in data)
        save_prefix               // e.g., "priors_layer1" or "priors_layer2"
      } = opts;
  
      const previewBypass = domainPriorsPreviewBypass();
  
      // Labels are locked to the existing frequency framing used elsewhere.
      const tickLabels = ["0/100", "25/100", "50/100", "75/100", "100/100"];
  
      const itemsHtml = items.map((it, idx) => {
        const sid = `dp_${save_prefix}_${idx}`;
        return `
          <div class="dpCard" data-component="slider_card" data-item-id="${escapeHtml(it.id)}" style="margin: 14px 0 18px 0; padding: 14px 14px 10px 14px; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px;">
            <div class="dpCardTitle" style="margin-bottom: 10px; font-size: 16px; line-height: 1.25;">
              ${it.label_html}
            </div>
  
            <div class="rangeWrap" style="position: relative; padding-top: 22px; padding-bottom: 6px;">
              <div class="sliderBubble" id="${sid}_bubble" aria-hidden="true"
                   style="position:absolute; top: 0; left: 0; transform: translateX(-50%); padding: 2px 7px; border-radius: 999px; font-size: 12px; border: 1px solid rgba(0,0,0,0.18); background: rgba(255,255,255,0.98); white-space: nowrap;">
                50/100
              </div>
  
              <input type="range"
                     class="dp-slider ms-range"
                     id="${sid}"
                     min="0" max="100" step="1"
                     value="50"
                     data-item-id="${escapeHtml(it.id)}"
                     style="width: 100%;">
  
              <div class="rangeLabels" style="display:flex; justify-content: space-between; font-size: 12px; margin-top: 8px;">
                ${tickLabels.map(l => `<span>${escapeHtml(l)}</span>`).join("")}
              </div>
            </div>
          </div>
        `;
      }).join("");
  
      const html = `
        <div data-page-tag="${escapeHtml(page_tag)}">
          ${header_html}
          ${prompt_html}
          <div class="dpCards" data-component="slider_list" style="margin-top: 14px;">
            ${itemsHtml}
          </div>
          ${continueButtonHtml()}
          ${footer_html || ""}
        </div>
      `;
  
      function positionBubbleForSlider(slider) {
        const bubble = document.getElementById(`${slider.id}_bubble`);
        if (!bubble) return;
  
        const wrap = slider.closest(".rangeWrap");
        if (!wrap) return;
  
        const min = Number(slider.min || 0);
        const max = Number(slider.max || 100);
        const v = Number(slider.value || 0);
  
        // Update bubble text as frequency
        bubble.textContent = `${v}/100`;
  
        // Position bubble above thumb using % of track width.
        const pct = (v - min) / (max - min);
        const sliderRect = slider.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
  
        // Thumb alignment: approximate usable track by slider's content box.
        // We offset by ~12px to account for thumb radius; robust enough across browsers.
        const thumbOffset = 12;
        const x = thumbOffset + pct * (sliderRect.width - 2 * thumbOffset);
  
        bubble.style.left = `${x}px`;
      }
  
      function attachBubblesAndValidation() {
        const sliders = Array.from(document.querySelectorAll("input.dp-slider"));
        sliders.forEach(s => {
          // initial placement
          positionBubbleForSlider(s);
          s.addEventListener("input", () => positionBubbleForSlider(s));
          s.addEventListener("change", () => positionBubbleForSlider(s));
        });
  
        // Reposition on resize (e.g., responsive layout)
        window.addEventListener("resize", () => sliders.forEach(s => positionBubbleForSlider(s)));
  
        // Require movement unless preview bypass (mirrors prior behavior)
        if (!previewBypass) {
          domainPriorsBindSlidersRequireMovement(jsPsych, {
            selector: "input.dp-slider",
            buttonSelector: "#go"
          });
        }


        // Manual continue button (Option B): collect responses and finish the trial
        const btn = document.getElementById("go");
        if (btn) {
          btn.addEventListener("click", () => {
            const resp = {};
            const slidersNow = Array.from(document.querySelectorAll("input.dp-slider"));
            slidersNow.forEach(s => {
              const id = s.getAttribute("data-item-id") || s.id;
              resp[id] = Number(s.value);
            });
            jsPsych.finishTrial({ dp_responses: resp });
          });
        }
      }
  
      return {
        type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
        stimulus: html,
on_load: attachBubblesAndValidation,
        on_finish: (data) => {
          const resp = (data.dp_responses && typeof data.dp_responses === "object") ? data.dp_responses : {};
  
          data.page_type = "domain_priors_multi_slider";
          data.page_tag = page_tag;
          data.case_type = case_type_label;
          data.save_prefix = save_prefix;
          data.response = resp;
  
          // Flatten for easy analysis (also mirrors other blocks' wide logging style)
          Object.entries(resp).forEach(([k, v]) => {
            data[`${save_prefix}__${k}`] = v;
          });
        }
      };
    }
  
  
  function domainPriorsItemCardHtml(prefixLabel, assertionText, sliderId) {
    return `
      <div class="dp-item card" style="padding:18px 18px 20px; border-radius:18px; margin:18px 0;">
        <div style="font-weight:800; margin-bottom:10px; font-size:16px; line-height:1.35;">
          ${prefixLabel} ${escapeHtml(assertionText)}
        </div>

        <div class="jspsych-html-slider-response-container" data-slider-wrap="1" style="margin-top:10px; width:100%; box-sizing:border-box;">
          <div style="padding:0 12px; box-sizing:border-box; width:100%;">
            <input class="jspsych-slider dp-slider" style="width:100%; margin:0; box-sizing:border-box;" type="range" min="0" max="100" step="1" value="50" id="${sliderId}">
            ${domainPriorsScaleLabelsHtml()}
          </div>
          
        </div>
      </div>
    `;
  }

  function domainPriorsBindSlidersRequireMovement(previewBypass) {
    const btn = document.querySelector("#go") || document.querySelector(".jspsych-btn");
    const sliders = Array.from(document.querySelectorAll("input.dp-slider"));
    const moved = new Set();

    // Always bind for live value updates.
    sliders.forEach((s) => {
      const out = document.getElementById(`${s.id}_val`);
      if (out) out.textContent = String((s.value === null || s.value === undefined) ? 50 : s.value);

      s.addEventListener("input", () => {
        moved.add(s.id);
        if (out) out.textContent = String(s.value);
        if (btn && !previewBypass && moved.size === sliders.length) btn.disabled = false;
      });
    });

    // Only enforce "must move all sliders" when NOT in preview bypass.
    if (btn && !previewBypass) {
      btn.disabled = true;
    }
  }

    function getPreviewStartParam() {
    try {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get("preview_start") || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function setPreviewStartParam(val) {
    try {
      const url = new URL(window.location.href);
      if (val) url.searchParams.set("preview_start", val);
      else url.searchParams.delete("preview_start");
      window.location.href = url.toString();
    } catch (e) {}
  }

  function addPreviewJumpOverlay() {
    if (!PREVIEW_MODE) return;
    if (document.getElementById("preview-jump-overlay")) return;

    const wrap = document.createElement("div");
    wrap.id = "preview-jump-overlay";
    wrap.style.position = "fixed";
    wrap.style.top = "12px";
    wrap.style.right = "12px";
    wrap.style.zIndex = "999999";
    wrap.style.background = "rgba(255,255,255,0.96)";
    wrap.style.border = "1px solid rgba(0,0,0,0.12)";
    wrap.style.borderRadius = "14px";
    wrap.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
    wrap.style.padding = "10px 10px";
    wrap.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    wrap.style.fontSize = "12px";
    wrap.style.maxWidth = "240px";

    const title = document.createElement("div");
    title.textContent = "Preview jump";
    title.style.fontWeight = "700";
    title.style.marginBottom = "6px";

    const select = document.createElement("select");
    select.style.width = "100%";
    select.style.padding = "6px 8px";
    select.style.borderRadius = "10px";
    select.style.border = "1px solid rgba(0,0,0,0.18)";
    select.style.marginBottom = "8px";

    const opts = [
      ["", "Start (normal)"],
      ["section1", "Start at Section 1 (Legal Background)"],
      ["section2", "Start at Section 2 (Reviewing Record)"],
      ["section3", "Start at Section 3 (Post-review assessments)"],
      ["feedback", "Start at feedback screen"],
    ];
    const cur = getPreviewStartParam();
    opts.forEach(([v, label]) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      if (v === cur) o.selected = true;
      select.appendChild(o);
    });

    const btn = document.createElement("button");
    btn.textContent = "Jump (reload)";
    btn.style.width = "100%";
    btn.style.padding = "7px 10px";
    btn.style.borderRadius = "10px";
    btn.style.border = "1px solid rgba(0,0,0,0.18)";
    btn.style.background = "#f7f7f7";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => setPreviewStartParam(select.value));

    wrap.appendChild(title);
    wrap.appendChild(select);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

function domainPriorsPreviewBypass() {
    // Robust preview detection for cognition.run
    try {
      return !!PREVIEW_MODE || window.location.pathname.includes("preview");
    } catch (e) {
      return !!PREVIEW_MODE;
    }
  }

  function domainPriorsCaseTypeIntroText(caseType) {
    if (caseType === "Product Liability") {
      return {
        one: "Product Liability cases often involve allegations that a product was unsafe or defective and caused harm.",
        two: "A classic example might be the Ford Pinto litigation (Grimshaw v. Ford Motor Co.), involving allegations that a fuel-system design made rear-end collisions unusually likely to cause fires, and that the manufacturer proceeded despite knowledge of the risk."
      };
    }
    if (caseType === "Consumer Fraud") {
      return {
        one: "Consumer Fraud cases often involve allegations that a business misled consumers about a product or service.",
        two: "A classic example is the Volkswagen “Clean Diesel” litigation (often called “Dieselgate”), involving allegations that certain diesel vehicles used software to pass emissions tests while emitting higher pollution in real driving, and that consumers were misled about the cars’ environmental compliance and related attributes, leading to consumer fraud and false‑advertising claims."
      };
    }
    return {
      one: "Employment Discrimination cases often involve allegations that an employer treated an employee unfairly because of a protected characteristic.",
      two: "A classic example is Price Waterhouse v. Hopkins, involving allegations that a highly performing employee was denied partnership due to sex stereotyping (including comments about being insufficiently “feminine”), and disputes about whether the employer’s stated reasons reflected legitimate concerns or discriminatory bias."
    };
  }

  function domain_priors_case_overview_screen(jsPsych, caseObj) {
    const caseType = getCaseTypeLabel(caseObj.case_id);
    const t = domainPriorsCaseTypeIntroText(caseType);

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
${pageTitleHtml(caseType)}
<div class="card" style="padding:18px 18px; border-radius:18px; line-height:1.45;">
  <p style="margin-top:0;">${escapeHtml(t.one)}</p>
  <p style="margin-bottom:0;">${escapeHtml(t.two)}</p>
</div>
${continueButtonHtml()}
`),
            on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial());
      },
      on_finish: (data) => {
        data.page_type = "domain_priors_case_overview";
        data.case_id = caseObj.case_id;
        data.case_type = caseType;
      }
    };
  }

  function domain_priors_required_issues_list_screen(jsPsych, caseObj) {
    const caseType = getCaseTypeLabel(caseObj.case_id);
    const layer1 = caseObj.claims_layer_1 || caseObj.claims_layer1 || caseObj.layer1_claims || [];
    const order = getStableClaimOrder(caseObj, "layer1", layer1);
    const byId = Object.fromEntries(layer1.map(c => [c.claim_id, c]));

    const listItems = order.map((cid, idx) => {
      const c = byId[cid];
      const t = (c && (c.claim_text_abstract || c.claim_text)) ? (c.claim_text_abstract || c.claim_text) : "";
      const a = domainPriorsNormalizeAssertion(t);
      const lbl = domainPriorsShortLabel(c);
      const prefix = `Required Issue ${idx + 1}${lbl ? " (" + lbl + "): " : ": "}`;
      return `<li style="padding:10px 0; border-bottom:1px dashed #e6e6e6;"><div style="font-weight:800;">Required Issue ${idx + 1}:</div><div style="margin-top:8px; margin-left:14px; padding:10px 12px; background: rgba(0,0,0,0.04); border-radius:12px; font-weight:400; line-height:1.35;">${escapeHtml(a)}</div></li>`;
    }).join("");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
${pageTitleHtml("Required Elements")}
${instructionsHtml(`<p>In <b>${caseType}</b> cases, the plaintiff must establish each of the following as <b>more likely true than not</b> in order to prevail.</p>`, { style: "max-width:820px; margin:18px auto 0; text-align:left;" })}
<div class="card" style="padding:14px 16px; border-radius:18px;">
  <ul style="list-style:none; margin:0; padding-left:0;">${listItems}</ul>
</div>
${instructionsHtml(`<p>In some cases, an issue may not be disputed. But to win, the plaintiff must still be able to establish each required issue as more likely true than not.</p>`, { style: "max-width:820px; margin:14px auto 0; text-align:left;" })}
${continueButtonHtml()}
`),
            on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial());
      },
      on_finish: (data) => {
        data.page_type = "domain_priors_required_list";
        data.case_id = caseObj.case_id;
        data.case_type = caseType;
      }
    };
  }

    function domain_priors_required_issues_expectations_multislider(jsPsych, caseObj) {
  const caseType = getCaseTypeLabel(caseObj.case_id);
  const layer1 = caseObj.claims_layer_1 || caseObj.claims_layer1 || caseObj.layer1_claims || [];
  const order = getStableClaimOrder(caseObj, "layer1", layer1);
  const byId = Object.fromEntries(layer1.map(c => [c.claim_id, c]));

  const items = order.map((cid, idx) => {
    const c = byId[cid];
    const t = (c && (c.claim_text_abstract || c.claim_text)) ? (c.claim_text_abstract || c.claim_text) : "";
    const a = domainPriorsNormalizeAssertion(t);
    return {
      id: cid,
      label_html: `<div style="font-size:13.5px; font-weight:800; letter-spacing:0.2px; opacity:0.92;">Required Issue ${idx + 1}:</div><div style="margin-top:7px; padding-top:7px; border-top:1px solid rgba(0,0,0,0.12); font-weight:800; font-size:16px; line-height:1.35;">${escapeHtml(a)}</div>`
    };
  });

  const header_html = `    ${BASE_CSS}
    <div class="page" data-component-id="page:root">
      ${pageTitleHtml("Your general impressions")}
  `;

  const prompt_html = `      ${instructionsHtml(`<p>In <b>${escapeHtml(caseType)}</b> cases, in about <b>what fraction</b> do you think the court accepts the following as <b>more likely to be true than not</b>?</p>`)} 
  `;

  const footer_html = `</div>`;

  return renderDomainPriorsMultiSliderPage(jsPsych, {
    page_tag: `priors_layer1_q__${caseObj.case_id}`,
    header_html,
    prompt_html,
    footer_html,
    items,
    case_type_label: caseType,
    save_prefix: "priors_layer1"
  });
}

function domain_priors_evidentiary_routes_expectations_multislider(jsPsych, caseObj) {
  const caseType = getCaseTypeLabel(caseObj.case_id);
  const layer2 = caseObj.claims || caseObj.claims_layer_2 || caseObj.claims_layer2 || caseObj.layer2_claims || [];
  const order = getStableClaimOrder(caseObj, "layer2", layer2);
  const byId = Object.fromEntries(layer2.map(c => [c.claim_id, c]));

  const items = order.map((cid, idx) => {
    const c = byId[cid];
    const t = (c && (c.claim_text_abstract || c.claim_text)) ? (c.claim_text_abstract || c.claim_text) : "";
    const a = domainPriorsNormalizeAssertion(t);
    return {
      id: cid,
      label_html: `<div style="font-size:13.5px; font-weight:800; letter-spacing:0.2px; opacity:0.92;">Line of Evidence ${idx + 1}:</div><div style="margin-top:7px; padding-top:7px; border-top:1px solid rgba(0,0,0,0.12); font-weight:800; font-size:16px; line-height:1.35;">${escapeHtml(a)}</div>`
    };
  });

  const header_html = `    ${BASE_CSS}
    <div class="page" data-component-id="page:root">
      ${pageTitleHtml("Your general impressions")}
  `;

  const prompt_html = `      ${instructionsHtml(`<p>In <b>${escapeHtml(caseType)}</b> cases, in about <b>what fraction</b> do you think the court accepts the below claim as <b>more likely to be true than not</b>?</p>`)}
  `;

  const footer_html = `</div>`;

  return renderDomainPriorsMultiSliderPage(jsPsych, {
    page_tag: `priors_layer2_q__${caseObj.case_id}`,
    header_html,
    prompt_html,
    footer_html,
    items,
    case_type_label: caseType,
    save_prefix: "priors_layer2"
  });
}

  function domain_priors_required_issues_expectations_trials(jsPsych, caseObj) {
    const caseType = getCaseTypeLabel(caseObj.case_id);
    const layer1 = caseObj.claims_layer_1 || caseObj.claims_layer1 || caseObj.layer1_claims || [];
    const order = getStableClaimOrder(caseObj, "layer1", layer1);
    const byId = Object.fromEntries(layer1.map(c => [c.claim_id, c]));

    return order.map((cid, idx) => {
      const c = byId[cid];
      const t = (c && (c.claim_text_abstract || c.claim_text)) ? (c.claim_text_abstract || c.claim_text) : "";
      const a = domainPriorsNormalizeAssertion(t);

      return {
        type: jsPsychHtmlSliderResponse,
        button_label: "Continue",
        slider_start: 50,
        require_movement: domainPriorsPreviewBypass() ? false : true,
        labels: ["0/100", "25/100", "50/100", "75/100", "100/100"],
        on_load: function() {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return;

          const container = slider.parentElement;
          container.style.position = "relative";

          const bubble = document.createElement("div");
          bubble.style.position = "absolute";
          bubble.style.top = "-28px";
          bubble.style.transform = "translateX(-50%)";
          bubble.style.fontSize = "13px";
          bubble.style.fontWeight = "600";
          bubble.style.background = "#ffffff";
          bubble.style.padding = "2px 6px";
          bubble.style.borderRadius = "12px";
          bubble.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          bubble.style.pointerEvents = "none";
          container.appendChild(bubble);

          function updateBubble() {
            const val = parseInt(slider.value, 10);
            const min = parseInt(slider.min, 10);
            const max = parseInt(slider.max, 10);
            const percent = (val - min) / (max - min);
            const sliderWidth = slider.offsetWidth;
            const thumbOffset = percent * sliderWidth;
            bubble.textContent = val + "%";
            bubble.style.left = thumbOffset + "px";
          }

          slider.addEventListener("input", updateBubble);
          updateBubble();
        },
        on_load: function() {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return;

          const container = slider.parentElement;
          container.style.position = "relative";

          const bubble = document.createElement("div");
          bubble.style.position = "absolute";
          bubble.style.top = "-28px";
          bubble.style.transform = "translateX(-50%)";
          bubble.style.fontSize = "13px";
          bubble.style.fontWeight = "600";
          bubble.style.background = "#ffffff";
          bubble.style.padding = "2px 6px";
          bubble.style.borderRadius = "12px";
          bubble.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          bubble.style.pointerEvents = "none";
          container.appendChild(bubble);

          function updateBubble() {
            const val = parseInt(slider.value, 10);
            const min = parseInt(slider.min, 10);
            const max = parseInt(slider.max, 10);
            const percent = (val - min) / (max - min);
            const sliderWidth = slider.offsetWidth;
            const thumbOffset = percent * sliderWidth;
            bubble.textContent = val + "%";
            bubble.style.left = thumbOffset + "px";
          }

          slider.addEventListener("input", updateBubble);
          updateBubble();
        },
        stimulus: pageHtml(`
          ${BASE_CSS}
          <div class="page" data-component-id="page:root">
            <div class="title" data-component-id="header:page_title">${caseType}, Your general impressions</div>

            <div class="instructions" data-component-id="text:instructions">
              <p>In <b>${caseType}</b> cases, in about <b>what fraction</b> do you think the court accepts the following as <b>more likely to be true than not</b>?</p>
            </div>

            <div class="card" style="padding:18px 18px 20px; border-radius:18px; margin:18px 0;">
              <div style="font-weight:800; margin-bottom:10px; font-size:16px; line-height:1.35;">
                Required Issue ${idx + 1}: ${escapeHtml(a)}
              </div>
            </div>
          </div>
        `),
        on_finish: (data) => {
          data.page_type = "domain_priors_required_expectations";
          data.case_id = caseObj.case_id;
          data.case_type = caseType;
          data.domain_priors_kind = "required_issue";
          data.domain_priors_claim_id = cid;
          data.domain_priors_index = idx + 1;
        }
      };
    });
  }

  function domain_priors_required_issues_expectations_screen(jsPsych, caseObj) {
    // Deprecated: kept for compatibility. Use domain_priors_required_issues_expectations_trials.
    return domain_priors_required_issues_expectations_trials(jsPsych, caseObj)[0];
  }


  function domain_priors_evidentiary_routes_list_screen(jsPsych, caseObj) {
    const caseType = getCaseTypeLabel(caseObj.case_id);

    const layer1 = caseObj.claims_layer_1 || [];
    const layer2 = caseObj.claims || [];

    const l1Order = getStableClaimOrder(caseObj, "layer1", layer1);
    const l2Order = getStableClaimOrder(caseObj, "layer2", layer2);

    const l1ById = Object.fromEntries(layer1.map(c => [c.claim_id, c]));
    const l2ById = Object.fromEntries(layer2.map(c => [c.claim_id, c]));

    // Group L2 claims by their L1 parent, preserving the stable L2 order.
    const childrenByParent = {};
    l2Order.forEach((cid) => {
      const c = l2ById[cid];
      const pid = c && c.layer_1_parent;
      if (!pid) return;
      if (!childrenByParent[pid]) childrenByParent[pid] = [];
      childrenByParent[pid].push(cid);
    });

    // Only show L1 required issues that have at least one L2 child (reduces clutter).
    const parentIdsWithChildren = l1Order.filter((pid) => Array.isArray(childrenByParent[pid]) && childrenByParent[pid].length > 0);

    // Friendly short tags: RI1/RI2... within this case type page.
    const riTag = (i) => `RI${i + 1}`;

    const rowsHtml = parentIdsWithChildren.map((pid, i) => {
      const parent = l1ById[pid] || {};
      const parentTextRaw = parent.claim_text_abstract || parent.claim_text || parent.text || "";
      const parentText = domainPriorsNormalizeAssertion(parentTextRaw);

      const kids = (childrenByParent[pid] || []).map((cid, j) => {
        const c = l2ById[cid] || {};
        const tRaw = c.claim_text_abstract || c.claim_text || c.text || "";
        const t = domainPriorsNormalizeAssertion(tRaw);

        // Prefer explicit claim labels where available; fall back to helper.
        const lbl = (String(c.claim_label || c.claimLabel || "").trim()) || domainPriorsShortLabel(c) || `E${j + 1}`;
        return `
          <div style="margin: 10px 0;">
            <div style="font-weight:900; font-size:13px; margin-bottom:6px;">${escapeHtml(lbl)}</div>
            <div style="margin-left:10px; padding:10px 12px; background: rgba(0,0,0,0.04); border-radius:12px; line-height:1.35;">
              ${escapeHtml(t)}
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="riMapRow" style="display:grid; grid-template-columns: 0.9fr 1.1fr; gap: 18px; align-items:flex-start; margin-bottom: 26px;">
          <div style="border:1px solid #e5e5e5; border-radius:16px; background:#fff; padding:12px 14px;">
            <div style="font-weight:900; font-size:13px; letter-spacing:0.02em; margin-bottom:8px;">
              ${escapeHtml(riTag(i))}
            </div>
            <div style="padding:10px 12px; background: rgba(0,0,0,0.04); border-radius:12px; line-height:1.35;">
              ${escapeHtml(parentText)}
            </div>
          </div>

          <div style="border:1px solid #e5e5e5; border-radius:16px; background:#fff; padding:12px 14px;">
            ${kids}
          </div>
        </div>
      `;
    }).join("");

return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" data-component-id="header:page_title">Lines of Evidence</div>

          <div class="instructions" data-component-id="text:instructions" style="margin-top:18px; text-align:left !important;">
            <p><b>Plaintiffs in ${escapeHtml(caseType)} cases typically try to establish the required issues on the left by demonstrating one or more of the claims on the right.</b></p>
            <p class="muted" style="margin-top:8px;">
              Reminder: Plaintiffs are not obliged to use any particular claim. These are simply common ways parties try to support or challenge each required issue.
            </p>
          </div>

          <div style="margin-top: 16px;">
            <div style="display:flex; gap:18px; font-weight:900; margin: 0 0 10px;">
              <div style="flex:0.9;">Required issues</div>
              <div style="flex:1.1;">Common lines of evidence</div>
            </div>

            ${rowsHtml || `)<div class="muted">No lines of evidence listed.</div>`}
          </div>
        </div>
${continueButtonHtml()}
`),
            on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial());
      },
      on_finish: (data) => {
        data.page_type = "domain_priors_routes_map";
        data.case_id = caseObj.case_id;
        data.case_type = caseType;
      }
    };
  }

function case_template_mapping_screen(jsPsych, plan) {
  const caseObj = plan.caseObj || {};
  const caseType = getCaseTypeLabel(caseObj.case_id);

  const layer1 = caseObj.claims_layer_1 || [];
  const layer2 = caseObj.claims || [];

  const l1Order = getStableClaimOrder(caseObj, "layer1", layer1);
  const l2Order = getStableClaimOrder(caseObj, "layer2", layer2);

  const l1ById = Object.fromEntries(layer1.map(c => [c.claim_id, c]));
  const l2ById = Object.fromEntries(layer2.map(c => [c.claim_id, c]));

  // Group L2 claims by their L1 parent, preserving the stable L2 order.
  const childrenByParent = {};
  l2Order.forEach((cid) => {
    const c = l2ById[cid];
    const pid = c && c.layer_1_parent;
    if (!pid) return;
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(cid);
  });

  // Show all required issues; visually highlight contested ones (those with ≥1 line of evidence).
  const allParentIds = l1Order.length ? l1Order : layer1.map(x => x.claim_id);


  const riTag = (i) => `RI${i + 1}`;

  
  const contestedIds = allParentIds.filter(pid => Array.isArray(childrenByParent[pid]) && childrenByParent[pid].length > 0);
  const nonContestedIds = allParentIds.filter(pid => !(Array.isArray(childrenByParent[pid]) && childrenByParent[pid].length > 0));

  const buildRow = (pid, i, showRight) => {
    const parent = l1ById[pid] || {};
    const parentAbsRaw = parent.claim_text_abstract || parent.claim_text || parent.text || "";
    const parentAbs = domainPriorsNormalizeAssertion(parentAbsRaw);

    const kidsHtml = (childrenByParent[pid] || []).map((cid, j) => {
      const c = l2ById[cid] || {};
      const specificRaw = c.claim_text || c.text || c.claim_text_abstract || "";

      const specific = domainPriorsNormalizeAssertion(specificRaw);
      const lbl = (String(c.claim_label || c.claimLabel || "").trim()) || domainPriorsShortLabel(c) || `E${j + 1}`;

      return `
        <div style="margin: 10px 0;">
          <div style="font-weight:900; font-size:13px; margin-bottom:6px;">${escapeHtml(lbl)}</div>
          <div style="margin-left:10px; padding:10px 12px; background: rgba(0,0,0,0.04); border-radius:12px; line-height:1.35;">
            <div>${escapeHtml(specific)}</div>
</div>
        </div>
      `;
    }).join("");

    return `
      <div class="riMapRow" style="display:grid; grid-template-columns: 0.9fr 1.1fr; gap: 18px; align-items:flex-start; margin-bottom: 28px;">
        <div style="border:1px solid #e5e5e5; border-radius:16px; background:#fff; padding:12px 14px;">
          <div style="font-weight:900; font-size:13px; letter-spacing:0.02em; margin-bottom:8px;">
            ${escapeHtml(riTag(i))}
          </div>
          <div style="padding:10px 12px; background: rgba(0,0,0,0.04); border-radius:12px; line-height:1.35;">
            ${escapeHtml(parentAbs)}
          </div>
        </div>

        <div style="border:1px solid #e5e5e5; border-radius:16px; background:#fff; padding:12px 14px;">
          ${showRight ? (kidsHtml || `<div class="muted" style="padding:6px 10px;">(no lines listed)</div>`) : ``}
        </div>
      </div>
    `;
  };

  const contestedHtml = contestedIds.map((pid, i) => buildRow(pid, i, true)).join("");

  const dividerHtml = nonContestedIds.length ? `
    <div style="margin: 4px 0 18px;">
      <div style="height:1px; background:#e5e5e5;"></div>
      <div class="muted" style="margin-top:10px; font-size:12.5px;">Non-disputed required issues</div>
    </div>` : "";

  // Non-disputed issues appear at the bottom; leave the right column blank for these rows.
  const nonContestedHtml = nonContestedIds.map((pid, i) => buildRow(pid, contestedIds.length + i, false)).join("");

  const rowsHtml = `${contestedHtml}${dividerHtml}${nonContestedHtml}`;

  return {
    type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
      ${BASE_CSS}
      <div class="page" data-component-id="page:root">
        <div class="title" data-component-id="header:page_title" style="text-align:center;">Required issues and key claims in this case</div>

        <div class="instructions" data-component-id="text:instructions" style="margin-top:16px; text-align:left !important;">
          <p><b>The legal background you learned in Section 1 provides a template.</b> Below is how that template maps onto this ${escapeHtml(caseType)} case.</p>
        </div>

        <div style="margin-top: 14px;">
          <div style="display:flex; gap:18px; font-weight:900; margin: 0 0 10px;">
            <div style="flex:0.9;">Required issues</div>
            <div style="flex:1.1;">Lines of evidence in this case</div>
          </div>
          <div class="muted" style="margin:-2px 0 12px; font-size:12.5px;">Lines of evidence are shown only for disputed issues in this case.</div>

          ${rowsHtml || `<div class="muted">No mapping available.</div>`}
          ${continueButtonHtml()}
          
        </div>
      </div>
    `),
      on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial());
      }

  };
}


  function domain_priors_evidentiary_routes_expectations_trials(jsPsych, caseObj) {
    const caseType = getCaseTypeLabel(caseObj.case_id);
    const layer2 = caseObj.claims || [];
    const order = getStableClaimOrder(caseObj, "layer2", layer2);
    const byId = Object.fromEntries(layer2.map(c => [c.claim_id, c]));

    return order.map((cid, idx) => {
      const c = byId[cid];
      const t = (c && (c.claim_text_abstract || c.claim_text)) ? (c.claim_text_abstract || c.claim_text) : "";
      const a = domainPriorsNormalizeAssertion(t);

      return {
        type: jsPsychHtmlSliderResponse,
        button_label: "Continue",
        slider_start: 50,
        require_movement: domainPriorsPreviewBypass() ? false : true,
        labels: ["0/100", "25/100", "50/100", "75/100", "100/100"],
        on_load: function() {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return;

          const container = slider.parentElement;
          container.style.position = "relative";

          const bubble = document.createElement("div");
          bubble.style.position = "absolute";
          bubble.style.top = "-28px";
          bubble.style.transform = "translateX(-50%)";
          bubble.style.fontSize = "13px";
          bubble.style.fontWeight = "600";
          bubble.style.background = "#ffffff";
          bubble.style.padding = "2px 6px";
          bubble.style.borderRadius = "12px";
          bubble.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          bubble.style.pointerEvents = "none";
          container.appendChild(bubble);

          function updateBubble() {
            const val = parseInt(slider.value, 10);
            const min = parseInt(slider.min, 10);
            const max = parseInt(slider.max, 10);
            const percent = (val - min) / (max - min);
            const sliderWidth = slider.offsetWidth;
            const thumbOffset = percent * sliderWidth;
            bubble.textContent = val + "%";
            bubble.style.left = thumbOffset + "px";
          }

          slider.addEventListener("input", updateBubble);
          updateBubble();
        },
        on_load: function() {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return;

          const container = slider.parentElement;
          container.style.position = "relative";

          const bubble = document.createElement("div");
          bubble.style.position = "absolute";
          bubble.style.top = "-28px";
          bubble.style.transform = "translateX(-50%)";
          bubble.style.fontSize = "13px";
          bubble.style.fontWeight = "600";
          bubble.style.background = "#ffffff";
          bubble.style.padding = "2px 6px";
          bubble.style.borderRadius = "12px";
          bubble.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          bubble.style.pointerEvents = "none";
          container.appendChild(bubble);

          function updateBubble() {
            const val = parseInt(slider.value, 10);
            const min = parseInt(slider.min, 10);
            const max = parseInt(slider.max, 10);
            const percent = (val - min) / (max - min);
            const sliderWidth = slider.offsetWidth;
            const thumbOffset = percent * sliderWidth;
            bubble.textContent = val + "%";
            bubble.style.left = thumbOffset + "px";
          }

          slider.addEventListener("input", updateBubble);
          updateBubble();
        },
        stimulus: pageHtml(`
          ${BASE_CSS}
          <div class="page" data-component-id="page:root">
            <div class="title" data-component-id="header:page_title">${caseType} Your general impressions</div>

            <div class="instructions" data-component-id="text:instructions">
              <p>In <b>${caseType}</b> cases, in about <b>what fraction</b> do you think the court accepts the below claim as <b>more likely to be true than not</b>?</p>
            </div>

            <div class="card" style="padding:18px 18px 20px; border-radius:18px; margin:18px 0;">
              <div style="font-weight:800; margin-bottom:10px; font-size:16px; line-height:1.35;">
                Line of Evidence ${idx + 1}: ${escapeHtml(a)}
              </div>
            </div>
          </div>
        `),
        on_finish: (data) => {
          data.page_type = "domain_priors_routes_expectations";
          data.case_id = caseObj.case_id;
          data.case_type = caseType;
          data.domain_priors_kind = "evidentiary_route";
          data.domain_priors_claim_id = cid;
          data.domain_priors_index = idx + 1;
        }
      };
    });
  }

  function domain_priors_evidentiary_routes_expectations_screen(jsPsych, caseObj) {
    // Deprecated: kept for compatibility. Use domain_priors_evidentiary_routes_expectations_trials.
    return domain_priors_evidentiary_routes_expectations_trials(jsPsych, caseObj)[0];
  }


    function between_cases_transition_screen(jsPsych, prevPlan, nextPlan) {
    const nextLabel = titleCaseLabel((nextPlan && nextPlan.caseObj && (nextPlan.caseObj.case_label || nextPlan.caseObj.case_id)) || "Next case");
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
${transitionTagHtml(TRANSITIONS.between_cases.tag)}
${instructionsHtml(`Now moving on to <b>${escapeHtml(nextLabel)}</b>.`, { style: "max-width:820px; margin:8px auto 0; text-align:left;" })}
`)
    };
  }

  function to_final_questions_transition_screen(jsPsych, firstCaseLabel) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
${transitionTagHtml(TRANSITIONS.to_final_questions.tag)}
<div class="space-md" aria-hidden="true"></div>
${instructionsHtml(`We now have some questions for you about each case.`, { style: "max-width:820px; margin:0 auto; text-align:left;" })}
<div class="space-md" aria-hidden="true"></div>
${noteLineHtml(`<i>Bonus Info: In this section, you can earn a bonus of up to $1 depending on how close your answers are to those provided by other participants, who were shown the same set of facts you were.</i>`, {style:"margin-top:0; margin-bottom:0;", componentId:"note:bonus_predictions"})}
`)
    };
  }

  function to_exposure_transition_screen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`

${transitionTagHtml(TRANSITIONS.to_exposure.tag)}
${instructionsHtml(`Now we will ask you a final set of questions, briefly testing your memory regarding the cases you reviewed.`, { style: "max-width:820px; margin:8px auto 0; text-align:left;" })}
${continueButtonHtml('Continue')}

      `),
      on_load: () => {
        const btn = document.getElementById('go');
        if (btn) btn.addEventListener('click', () => jsPsych.finishTrial({ page_type: 'to_exposure_transition' }));
      }
    };
  }


function case_intro_screen(jsPsych, plan, i, n) {
    const c = plan.caseObj;
    const label = titleCaseLabel(c.case_label || c.case_id || "Case");
    const sideLabel = (plan.advocate_side === "plaintiff") ? "Plaintiff" : "Defendant";

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
${pageTitleHtml("Case Summary")}
${caseHeaderHtml(plan, false)}
${instructionsHtml(String(c.case_summary_text || ""), { is_html: false })}
${contestedRequiredIssuesHtml(plan, {context:"case_summary_page"})}
${continueButtonHtml("Continue")}
`),
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({
        page_type: "case_intro",
        case_id: plan.caseObj.case_id,
        advocate_side: plan.advocate_side
      }))
    };
  }

  /* ==================== PRE-EVIDENCE JUDGMENTS (ONE PAGE PER CASE) ==================== */
  
  // Pre-evidence judgments (formatted to match post-fact judgments)
  
  function pre_verdict_screen(plan, i, n) {
  const sliderId = "pre_verdict_slider";
  const labelId = "pre_verdict_value";

  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    stimulus: pageHtml(`
      ${BASE_CSS}
      <div class="page" data-component-id="page:root">
        ${caseHeaderHtml(plan, true)}
        <div class="space-md" aria-hidden="true"></div>

        <div class="instructions" data-component-id="text:instructions">
          <b>Based only on the case summary, how warranted would it be to rule in favor of the Plaintiff?</b>
        </div>
        <div class="noteLine" style="margin-top:0; margin-bottom:0;"><i>Reminder: Higher numbers mean more warranted to rule for the Plaintiff.</i></div>

        <div class="block" style="text-align:left; margin-top:10px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <input id="${sliderId}" type="range" min="0" max="100" step="1" value="50" style="flex:1;"/>
            <div id="${labelId}" class="muted" style="min-width:44px; text-align:right;">50</div>
          </div>
        </div>

        ${continueButtonHtml("Continue", { id: "go" })}
      </div>
    `),
    on_load: () => {
      const s = document.getElementById(sliderId);
      const v = document.getElementById(labelId);
      const btn = document.getElementById("go");
      if (!s || !v || !btn) return;

      let moved = false;

      function setBtn() {
        const ok = PREVIEW_MODE ? true : moved;
        btn.disabled = !ok;
        btn.style.opacity = ok ? "1" : "0.55";
      }

      try { attachSliderBubble(s, (val) => String(val)); } catch (e) {}

      s.addEventListener("input", () => {
        moved = true;
        v.textContent = String(s.value);
        setBtn();
      });

      setBtn();

      btn.addEventListener("click", () => {
        jsPsych.finishTrial({
          page_type: "pre_verdict",
          case_id: plan.caseObj.case_id,
          advocate_side: plan.advocate_side,
          response: Number(s.value),
          slider_moved: moved,
          preview_mode: PREVIEW_MODE
        });
      });
    }
  };
}

function pre_claim_beliefs_block(jsPsych, plan) {
    const rawClaims = Array.isArray(plan.caseObj.claims) ? plan.caseObj.claims : [];
    const claimById = {};
    rawClaims.forEach(c => { claimById[c.claim_id] = c; });
    const claimOrder = plan.claim_order || rawClaims.map(c => c.claim_id);

    const trials = claimOrder.map((claim_id, idx) => {
      const c = claimById[claim_id] || {};
      const txt = String(c.claim_text || c.text || "");
      const liveId = `pre_claim_live_${safePrefix(plan.caseObj.case_id)}_${idx}`;
      return {
        type: jsPsychHtmlSliderResponse,
        stimulus: pageHtml(`
          ${BASE_CSS}
          <div class="page" data-component-id="page:root">
            <div class="title" data-component-id="header:page_title">Claim judgment</div>
            <div class="muted">Claim ${idx + 1}: of ${claimOrder.length}</div>
            ${caseHeaderHtml(plan, true)}
            <div class="space-md" aria-hidden="true"></div>
          <div style=\"height:18px;\"></div>
            <div class=\"instructions\" data-component-id="text:instructions"><b>Claim:</b> “${escapeHtml(txt)}”</div>
            <div class="instructions" data-component-id="text:instructions"><b>Based only on the case summary, how likely do you think it is that this claim is true?</b></div>
            <div class="muted"> Higher numbers mean the claim is more likely true.</div>
            
          </div>
        `),
        min: 0, max: 100, step: 1, slider_start: 50,
        require_movement: PREVIEW_MODE ? false : true,
        labels: [
          "0<br>Definitely<br>false",
          "25<br>Probably<br>false",
          "50<br>About<br>50–50",
          "75<br>Probably<br>true",
          "100<br>Definitely<br>true"
        ],
        on_load: function() {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return;

          const container = slider.parentElement;
          container.style.position = "relative";

          const bubble = document.createElement("div");
          bubble.style.position = "absolute";
          bubble.style.top = "-28px";
          bubble.style.transform = "translateX(-50%)";
          bubble.style.fontSize = "13px";
          bubble.style.fontWeight = "600";
          bubble.style.background = "#ffffff";
          bubble.style.padding = "2px 6px";
          bubble.style.borderRadius = "12px";
          bubble.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          bubble.style.pointerEvents = "none";
          container.appendChild(bubble);

          function updateBubble() {
            const val = parseInt(slider.value, 10);
            const min = parseInt(slider.min, 10);
            const max = parseInt(slider.max, 10);
            const percent = (val - min) / (max - min);
            const sliderWidth = slider.offsetWidth;
            const thumbOffset = percent * sliderWidth;
            bubble.textContent = val + "%";
            bubble.style.left = thumbOffset + "px";
          }

          slider.addEventListener("input", updateBubble);
          updateBubble();
        },
        on_load: function() {
          const slider = document.querySelector('input[type="range"]');
          if (!slider) return;

          const container = slider.parentElement;
          container.style.position = "relative";

          const bubble = document.createElement("div");
          bubble.style.position = "absolute";
          bubble.style.top = "-28px";
          bubble.style.transform = "translateX(-50%)";
          bubble.style.fontSize = "13px";
          bubble.style.fontWeight = "600";
          bubble.style.background = "#ffffff";
          bubble.style.padding = "2px 6px";
          bubble.style.borderRadius = "12px";
          bubble.style.boxShadow = "0 1px 4px rgba(0,0,0,0.15)";
          bubble.style.pointerEvents = "none";
          container.appendChild(bubble);

          function updateBubble() {
            const val = parseInt(slider.value, 10);
            const min = parseInt(slider.min, 10);
            const max = parseInt(slider.max, 10);
            const percent = (val - min) / (max - min);
            const sliderWidth = slider.offsetWidth;
            const thumbOffset = percent * sliderWidth;
            bubble.textContent = val + "%";
            bubble.style.left = thumbOffset + "px";
          }

          slider.addEventListener("input", updateBubble);
          updateBubble();
        },
        on_load: () => {
          const slider = document.getElementById("jspsych-html-slider-response-response");
          const out = document.getElementById(liveId);
          if (!slider || !out) return;
          out.textContent = String(slider.value || 50);
          slider.addEventListener("input", () => { out.textContent = String(slider.value); });
        },
        data: {
          page_type: "pre_claim_belief",
          preview_mode: PREVIEW_MODE,
          case_id: plan.caseObj.case_id,
          claim_id: claim_id,
          claim_text: txt,
          claim_order: plan.claim_order
        }
      };
    });

    // Layer 1 claims (multi-slider page) immediately after claim questions
    trials.push(layer1_claims_multi_slider_screen(jsPsych, plan));

    return { timeline: trials };
  }


  /* ==================== LEGACY REVIEW SCREEN REMOVED ==================== */

  
function case_priors_screen(jsPsych, plan) {
  const caseObj = plan.caseObj || {};
  const caseType = getCaseTypeLabel(caseObj.case_id);

  const layer1 = caseObj.claims_layer_1 || [];
  const layer2 = caseObj.claims || [];

  const l1Order = getStableClaimOrder(caseObj, "layer1", layer1);
  const l2Order = getStableClaimOrder(caseObj, "layer2", layer2);

  const l1ById = Object.fromEntries(layer1.map(c => [c.claim_id, c]));
  const l2ById = Object.fromEntries(layer2.map(c => [c.claim_id, c]));

  const childrenByParent = {};
  l2Order.forEach((cid) => {
    const c = l2ById[cid];
    const pid = c && c.layer_1_parent;
    if (!pid) return;
    if (!childrenByParent[pid]) childrenByParent[pid] = [];
    childrenByParent[pid].push(cid);
  });

  const allParentIds = (l1Order && l1Order.length) ? l1Order : layer1.map(x => x.claim_id);
  const contestedIds = allParentIds.filter(pid => Array.isArray(childrenByParent[pid]) && childrenByParent[pid].length > 0);
  const nonContestedIds = allParentIds.filter(pid => !(Array.isArray(childrenByParent[pid]) && childrenByParent[pid].length > 0));

  const riTag = (i) => `RI${i + 1}`;

  const buildRiInputRow = (pid, i, isContested) => {
    const parent = l1ById[pid] || {};
    const txtRaw = parent.claim_text || parent.claim_text_abstract || parent.text || "";
    const txt = domainPriorsNormalizeAssertion(txtRaw);
    const tag = riTag(i);
    return `
      <div class="riBlock" style="border:1px solid #e5e5e5; border-radius:16px; background:#fff; padding:12px 14px; margin:18px 0 22px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="font-weight:900; font-size:13px; letter-spacing:0.02em; margin-bottom:8px;">
            ${escapeHtml(tag)}${isContested ? ' <span style="font-weight:700; font-size:12px; color:#555;">(Disputed)</span>' : ''}
          </div>
        </div>
        <div style="padding:10px 12px; background: rgba(0,0,0,0.04); border-radius:12px; line-height:1.35;">
          ${escapeHtml(txt)}
        </div>
        <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
          <label for="prior_${escapeHtml(pid)}" class="muted" style="min-width:180px;">Likelihood plaintiff can establish this issue:</label>
          <input id="prior_${escapeHtml(pid)}" name="prior_${escapeHtml(pid)}" type="number" min="0" max="100" step="1" required
                 style="width:110px; padding:8px 10px; border-radius:10px; border:1px solid #ccc; font-size:14px;" />
          <span class="muted">%</span>
        </div>
      </div>
    `;
  };

  const inputsHtml = contestedIds.map((pid, idx) => buildRiInputRow(pid, allParentIds.indexOf(pid), true)).join("")
    + (nonContestedIds.length ? `<div style="border-top:2px solid #e2e2e2; margin:26px 0 12px;"></div>` : "")
    + nonContestedIds.map((pid) => buildRiInputRow(pid, allParentIds.indexOf(pid), false)).join("");

  return {
    type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
      ${BASE_CSS}
      <div class="page" data-component-id="page:root">
        ${pageTitleHtml("Your initial estimates for this case",{style:"text-align:center;"})}
        ${instructionsHtml(`<p>Before reviewing any evidence in this case, please give your best estimate for each required issue below.</p>`, {is_html:true, style:"text-align:left; margin-top:10px;"})}
        ${inputsHtml}
      </div>
${continueButtonHtml()}
`),
    on_load: () => {
      // Disable continue until all required inputs are valid (0–100).
      const btn = document.querySelector("#go") || document.querySelector(".jspsych-btn");
      const inputs = Array.from(document.querySelectorAll('input[type="number"][name^="prior_"]'));
      const validate = () => {
        const ok = inputs.length > 0 && inputs.every(el => el.value !== "" && !isNaN(Number(el.value)) && Number(el.value) >= 0 && Number(el.value) <= 100);
        if (btn) btn.disabled = !ok;
      };
      inputs.forEach(el => el.addEventListener("input", validate));
      validate();
    },
    on_finish: (data) => {
      data.page_type = "case_priors_layer1";
      data.case_id = caseObj.case_id;
      data.case_type = caseType;

      const inputs = Array.from(document.querySelectorAll('input[type="number"][name^="prior_"]'));
      const priors = {};
      inputs.forEach(el => {
        const name = el.getAttribute("name") || "";
        const pid = name.replace(/^prior_/, "");
        priors[pid] = (el.value === "" ? null : Number(el.value));
      });
      data.layer1_priors = priors;
      data.layer1_contested_ids = contestedIds;
      data.layer1_noncontested_ids = nonContestedIds;
    }
  };
}

  /* ==================== OBSOLETE DOSSIER SCREENS REMOVED ==================== */

  /* ==================== POST-EVIDENCE JUDGMENTS ==================== */
  function judgment_transition_screen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" data-component-id="header:page_title">Next section</div>
          <div class="instructions" data-component-id="text:instructions">
            You have now completed the evidence-review portion of the study.<br><br>
            Next, you will answer questions about the case you reviewed.
            <div class="muted">Answer based on what you remember from the facts you were shown.</div>
          <br><br>
          </div>
          ${noteLineHtml(`<i><b>Bonus (Judgments):</b> You can earn up to <b>$1.00</b> in this section based on how close your case judgments are to the average judgments of other participants who saw the same information.</i>`, {componentId:"note:bonus_judgments"})}
          ${continueButtonHtml("Continue")}
        </div>
      `),
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type:"judgment_transition" }))
    };
  }

  function judgment_case_transition_screen(jsPsych, plan, i, n) {
    const label = titleCaseLabel(plan.caseObj.case_label || plan.caseObj.case_id || "Case");
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        
        ${transitionTagHtml(TRANSITIONS.judgment_between_cases.tag)}
<div class="page" data-component-id="page:root">
          <div class="instructions" data-component-id="text:instructions" style="margin-top:14px;">
            Now moving on to <b>${escapeHtml(label)}</b>.
          </div>
          ${continueButtonHtml("Continue",{style:"margin-top:16px;"})}
        </div>
      `),
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({
        page_type: "judgment_case_transition",
        case_id: plan.caseObj.case_id
      }))
    };
  }

  
  function post_verdict_screen(jsPsych, plan) {
  // Called as post_verdict_screen(jsPsych, plan) in main().
  const sliderId = "post_verdict_slider";
  const labelId = "post_verdict_value";

  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    stimulus: pageHtml(`
      ${BASE_CSS}
      <div class="page" data-component-id="page:root">
        ${caseHeaderHtml(plan, true)}
        <div class="space-md" aria-hidden="true"></div>

        <div class="instructions" data-component-id="text:instructions">
          Please consider <b>all the facts you had access to</b>, as well as the case summary, and disputed points while answering the following question:
        </div>

        <div class="block" style="text-align:left; margin-top:10px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <input id="${sliderId}" type="range" min="0" max="100" step="1" value="50" style="flex:1;"/>
            <div id="${labelId}" class="muted" style="min-width:44px; text-align:right;">50</div>
          </div>
        </div>

        ${continueButtonHtml("Continue", { id: "go" })}
      </div>
    `),
    on_load: () => {
      const s = document.getElementById(sliderId);
      const v = document.getElementById(labelId);
      const btn = document.getElementById("go");
      if (!s || !v || !btn) return;

      let moved = false;

      function setBtn() {
        const ok = PREVIEW_MODE ? true : moved;
        btn.disabled = !ok;
        btn.style.opacity = ok ? "1" : "0.55";
      }

      try { attachSliderBubble(s, (val) => String(val)); } catch (e) {}

      s.addEventListener("input", () => {
        moved = true;
        v.textContent = String(s.value);
        setBtn();
      });

      setBtn();

      btn.addEventListener("click", () => {
        jsPsych.finishTrial({
          page_type: "post_verdict",
          case_id: plan.caseObj.case_id,
          advocate_side: plan.advocate_side,
          response: Number(s.value),
          slider_moved: moved,
          preview_mode: PREVIEW_MODE
        });
      });
    }
  };
}

function layer1_claims_multi_slider_screen(jsPsych, plan) {
    const c = plan.caseObj || {};
    const layer1 = c.claims_layer_1 || c.claims_layer1 || c.layer1_claims || [];
    const l1Order = (typeof getStableClaimOrder === "function") ? getStableClaimOrder(plan, "layer1", layer1) : null;
    const byId = Object.fromEntries(layer1.map(x => [x.claim_id, x]));
    const ids = (l1Order && l1Order.length) ? l1Order : layer1.map(x => x.claim_id);

    const items = ids.map((cid, idx) => {
      const it = byId[cid] || {};
      const raw = (it.claim_text || it.claim_text_abstract || "").trim();
      const norm = (typeof domainPriorsNormalizeAssertion === "function") ? domainPriorsNormalizeAssertion(raw) : raw;
      const claimText = escapeHtml(ensureDoubleQuotes(norm));
      if (!raw) return "";
      return `
        <div class="box multiSliderBox" style="padding:16px 16px 18px; border-radius:18px; margin:14px 0; background: rgba(0,0,0,0.06);" data-component-id="root:layer1_claim_${idx+1}">
          <div style="font-weight:800; margin-bottom:6px; text-align:left;" data-component-id="header:layer1_claim_label_${idx+1}">Claim ${idx+1}:</div>
          <div style="line-height:1.35; margin-bottom:12px; padding-left:14px; text-align:left;" data-component-id="text:layer1_claim_text_${idx+1}">${claimText}</div>
          <div class="jspsych-html-slider-response-container" style="margin-top:6px; width:100%;" data-component-id="slider:container_${idx+1}">
            <input type="range" class="jspsych-slider" min="0" max="100" step="1" value="50" id="l1_slider_${idx+1}" data-claim-id="${escapeHtml(cid)}" />
          </div>
          <div class="scaleRow" data-component-id="scale:row_${idx+1}"><div class="scaleTick" data-component-id="scale:tick1_${idx+1}">0<br>Very<br>unlikely</div><div class="scaleTick" data-component-id="scale:tick2_${idx+1}">25<br>Somewhat<br>unlikely</div><div class="scaleTick" data-component-id="scale:tick3_${idx+1}">50<br>Unsure /<br>Neutral</div><div class="scaleTick" data-component-id="scale:tick4_${idx+1}">75<br>Somewhat<br>likely</div><div class="scaleTick" data-component-id="scale:tick5_${idx+1}">100<br>Very<br>likely</div></div>
        </div>
      `;
    }).filter(Boolean).join("");

    // If there are no layer 1 claims, skip gracefully.
    if (!items) {
      return {
        type: jsPsychHtmlKeyboardResponse,
        choices: "NO_KEYS",
        stimulus: pageHtml(`${BASE_CSS}<div class="page">${caseHeaderHtml(plan, true)}${instructionsHtml("No additional questions for this case.",{is_html:false, style:""})}${continueButtonHtml("Continue")}</div>`),
        on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type: "layer1_claims_multi", case_id: (c.case_id || plan.caseObj.case_id), skipped: true }))
      };
    }

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          ${caseHeaderHtml(plan, true)}
          <div class="space-md" aria-hidden="true"></div>

          <div class="instructions" data-component-id="text:instructions">
            Please consider <b>all the facts you had access to</b>, while answering the following <b>questions</b>:
          </div>

          <div style="font-weight:800; line-height:1.35; margin:14px 0 10px; text-align:left !important; text-align:left;" data-component-id="text:layer1_questions_prompt">How likely do you think it is that these claims are true?</div>

          <div class="noteLine" style="margin-top:8px; text-align:left;"><i>Reminder: Higher numbers mean the claim is more likely true.</i></div>
${items}

          <button id="continue" class="btn continueBtn" disabled style="opacity:0.55; margin-top:18px;" data-component-id="btn:continue">Continue</button>
        </div>
      `),
      on_load: () => {
        const btn = document.getElementById("continue");
        const sliders = Array.from(document.querySelectorAll('input[type="range"][id^="l1_slider_"]'));

        const moved = new Set();

        function setBtnState() {
          const ok = moved.size === sliders.length;
          btn.disabled = !ok;
          btn.style.opacity = ok ? "1" : "0.55";
        }

        sliders.forEach((s, i) => {
          // Attach bubble (same helper used elsewhere)
          attachSliderBubble(s, (v) => String(v));

          s.addEventListener("input", () => {
            moved.add(s.id);
            setBtnState();
          });

          // On first load, do not count as moved until user interacts (consistent with require_movement behavior)
        });

        setBtnState();

        btn.addEventListener("click", () => {
  const rows = [];
  // Build one data row per slider, then finish the trial.
  sliders.forEach((s, idx) => {
    const cid = s.getAttribute("data-claim-id") || `layer1_${idx+1}`;
    rows.push({
      page_type: "layer1_claim_judgment",
      case_id: (c.case_id || plan.caseObj.case_id),
      claim_id: cid,
      claim_index: idx + 1,
      response: Number(s.value),
      preview_mode: PREVIEW_MODE
    });
  });

  // Try to write rows directly (preferred), but always include them in finishTrial as fallback.
  rows.forEach((r) => { writeDataRow(jsPsych, r); });

  jsPsych.finishTrial({
    page_type: "layer1_claims_multi",
    case_id: (c.case_id || plan.caseObj.case_id),
    n_layer1: sliders.length,
    preview_mode: PREVIEW_MODE,
    layer1_rows: rows
  });
});

      }
    };
  }

function post_claim_beliefs_block(jsPsych, plan) {
    const rawClaims = Array.isArray(plan.caseObj.claims) ? plan.caseObj.claims : [];
    const claimById = {};
    rawClaims.forEach(c => { claimById[c.claim_id] = c; });
    const claimOrder = plan.claim_order || rawClaims.map(c => c.claim_id);

    const trials = claimOrder.map((claim_id, idx) => {
      const c = claimById[claim_id] || {};
      const txt = String(c.claim_text || c.text || "");
      const liveId = `post_claim_live_${safePrefix(plan.caseObj.case_id)}_${idx}`;
      return {
        type: jsPsychHtmlSliderResponse,
        stimulus: pageHtml(`
          ${BASE_CSS}
          <div class="page" data-component-id="page:root">
            ${caseHeaderHtml(plan, true)}
            <div class="space-md" aria-hidden="true"></div>
          <div style=\"height:18px;\"></div>
            <div class=\"instructions\" data-component-id="text:instructions">
              Please consider all the evidence you reviewed while answering the following question:
            </div>
            
            <div style="font-weight:800; line-height:1.35; margin:36px 0 28px; padding-left:16px; text-align:left;">How likely do you think it is that this claim is true?</div>
<div class="card" style="padding:16px 16px 18px; border-radius:18px; margin:14px 0 16px; background: rgba(0,0,0,0.06);"><div style="font-weight:800; margin-bottom:6px;">Claim ${idx + 1}:</div>
              <div style="line-height:1.35;">“${escapeHtml(txt)}”</div>
            </div>
                      <div class="noteLine" style="margin-top:10px; margin-bottom:0; text-align:left !important;"><i>Reminder: Higher numbers mean the claim is more likely true.</i></div>

          </div>
        `),

        min: 0, max: 100, step: 1, slider_start: 50,
        require_movement: PREVIEW_MODE ? false : true,
        labels: [
          "0<br>Definitely<br>false",
          "25<br>Probably<br>false",
          "50<br>About<br>50–50",
          "75<br>Probably<br>true",
          "100<br>Definitely<br>true"
        ],
        on_load: () => {
          const slider = document.querySelector('input[type="range"]');
          attachSliderBubble(slider, (v) => String(v));
        },
        data: {
          page_type: "post_claim_belief",
          preview_mode: PREVIEW_MODE,
          case_id: plan.caseObj.case_id,
          claim_id: claim_id,
          claim_text: txt,
          facts_shown_ids: plan.facts_shown_ids,
          claim_order: plan.claim_order
        }
      };
    });

    

    // Layer 1 claims (multi-slider page) immediately after claim questions
    trials.push(layer1_claims_multi_slider_screen(jsPsych, plan));

    return { timeline: trials };
  }


  /* ==================== FINAL QUESTIONS (ACTIVATION vs EXPOSURE) ==================== */

function final_questions_intro_screen(jsPsych, firstPlan, n, checkCondition) {
    const firstLabel = titleCaseLabel(firstPlan.caseObj.case_label || firstPlan.caseObj.case_id || "Case");
    const isExposure = (checkCondition === "exposure");

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" data-component-id="header:page_title">Final questions</div>
          <div class="instructions" data-component-id="text:instructions" style="margin-top:14px;">
            Now we will ask you a final set of questions, briefly testing your memory regarding the cases you reviewed.
          </div>
          ${continueButtonHtml("Continue",{style:"margin-top:16px;"})}
        </div>
      `),
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type:"final_questions_intro" }))
    };
  }

  function final_questions_between_cases_screen(jsPsych, nextPlan, nextI, n) {
    const nextLabel = titleCaseLabel(nextPlan.caseObj.case_label || nextPlan.caseObj.case_id || "Case");
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}

        ${transitionTagHtml(TRANSITIONS.finalq_between_cases.tag)}
<div class="page" data-component-id="page:root">
          <div class="instructions" data-component-id="text:instructions" style="margin-top:14px;">
            Next, we will ask questions about <b>${escapeHtml(nextLabel)}</b>.
          </div>
          ${continueButtonHtml("Continue",{style:"margin-top:16px;"})}
        </div>
      `),
      on_load: () => document.getElementById("go").addEventListener("click", () => jsPsych.finishTrial({ page_type:"final_questions_between_cases", case_id: nextPlan.caseObj.case_id }))
    };
  }

  
function activation_check_screen(jsPsych, plan, i, n) {
  // Activation check: Which shown facts came to mind while judging this case?
  // Show ONLY facts that were shown earlier, grouped by claim, using stored order.

  const factsByClaim = plan.shown_facts_by_claim || {};
  const claimOrder = plan.claim_order || [];
  const claimById = {};
  (plan.caseObj.claims || []).forEach(cl => { claimById[cl.claim_id] = cl; });

  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    stimulus: () => {
      const caseLabel = plan.case_label || plan.caseObj.case_name || plan.caseObj.case_label || "Case";
      const pl = plan.caseObj.plaintiff_descriptor || plan.caseObj.plaintiff_name || "Plaintiff";
      const df = plan.caseObj.defendant_descriptor || plan.caseObj.defendant_name || "Defendant";
      const groups = claimOrder
        .filter(claim_id => Array.isArray(factsByClaim[claim_id]) && factsByClaim[claim_id].length > 0)
        .map((claim_id, idx) => {
          const cl = claimById[claim_id] || {};
          const claimText = cl.claim_text || cl.text || "";
          const items = (factsByClaim[claim_id] || []).map((f, j) => {
            const factText = f.fact_text || f.text || "";
            const fid = escapeHtml(f.fact_id || `f_${idx}_${j}`);
            const eNum = (f && (f._fn || f.fn)) ? (f._fn || f.fn) : (j + 1);
            return `
              <div class="sliderRow probRow" data-component-id="row:activation_${escapeHtml(ensureDoubleQuotes(claim_id))}_${eNum}" style="align-items:flex-start; margin-bottom:6px;">
                <div class="sliderPrompt" style="width:100%; max-width:720px;">
                  <div class="claimTag" data-component-id="tag:activation_${escapeHtml(ensureDoubleQuotes(claim_id))}_${eNum}"><b>Evidence ${eNum}:</b></div>
                  <div class="claimText" style="margin-top:2px; font-size:14px; line-height:1.45;" data-component-id="text:evidence_${eNum}">${escapeHtml(factText)}</div>
                </div>
                <div style="min-width:160px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; padding-top:2px;">
                  <input class="actChk" type="checkbox"
                    data-fact_id="${fid}"
                    data-claim_id="${escapeHtml(ensureDoubleQuotes(claim_id))}"
                    style="transform: scale(1.15); margin-top:6px;">
                  <div class="muted" style="font-size:12px; text-align:right;">Select</div>
                </div>
              </div>
            `;
          }).join("");

          return `
            <div class="claimList probList" data-component-id="list:activation_group"><div class="sliderGroup">
              <div class="claimHeaderRow">
                </div>
              ${items}
            </div></div>
          `;
        }).join("");

      return `
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s3">
            <div class="title" data-component-id="header:page_title">Evidence activation</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(caseLabel)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
          </div>
<div class="space-md" aria-hidden="true"></div>
          <div style=\"height:18px;\"></div>
            <div class=\"instructions\" data-component-id="text:instructions">
            Which evidence do you remember <b>actively thinking about</b>, while providing your assessments for the ${escapeHtml(caseLabel)} case?
            
          <br><br>
          </div>

          ${groups || `<div class="box" style="margin-top:10px;">No items could be generated for this page. This usually means the stimuli JSON is missing exposure foil fields (e.g., <code>exposure_foil_bolded_diff</code>). Please contact the researcher.</div>`}

          ${continueButtonHtml("Continue")}
        </div>
      `;
    },
    on_load: () => {
      const goBtn = document.getElementById("go");

      function getChecked() {
        return Array.from(document.querySelectorAll(".actChk"))
          .filter(x => x.checked)
          .map(x => x.dataset.fact_id);
      }

      function updateGate() {
        if (PREVIEW_MODE) { goBtn.disabled = false; return; }
        goBtn.disabled = (getChecked().length === 0);
      }

      document.querySelectorAll(".actChk").forEach(el => el.addEventListener("change", updateGate));
      updateGate();

      goBtn.addEventListener("click", () => {
          window.__seen_slider_hint = true;
        jsPsych.finishTrial({
          page_type: "activation_check",
          preview_mode: PREVIEW_MODE,
          case_id: plan.caseObj.case_id,
          facts_shown_ids: plan.facts_shown_ids,
          claim_order: plan.claim_order,
          activated_fact_ids: getChecked()
        });
      });
    }
  };
}


// Participant-specific "contested required issues" (Layer 1) based on which Layer-2 claims have any shown facts.
// Rule: a required issue is "contested" if the participant is shown at least one fact tied to any evidentiary route whose layer_1_parent is that issue.
function contestedRequiredIssuesHtml(plan, opts={}) {
  const c0 = (plan && plan.caseObj) ? plan.caseObj : {};
  const case_id = c0.case_id;

  // Robustness: in some reminder-box contexts, plan.caseObj may be stripped.
  const c = (() => {
    if ((c0 && (c0.claims_layer_1 || c0.claims || c0.claims_layer1 || c0.layer1_claims)) ) return c0;
    if (typeof CASES !== "undefined" && Array.isArray(CASES) && case_id) {
      const full = CASES.find(x => x && x.case_id === case_id);
      if (full) return full;
    }
    return c0 || {};
  })();

  let layer1 = c.claims_layer_1 || c.claims_layer1 || c.layer1_claims || [];
    let layer2 = c.claims || [];

    // Robustness: some reminder-box contexts may pass a stripped case object; fall back to the full CASES entry.
    if ((!layer1.length || !layer2.length) && typeof CASES !== "undefined" && Array.isArray(CASES)) {
      const cid = (c.case_id || plan.case_id || plan.caseId || "").trim();
      const clabel = (c.case_label || plan.case_label || "").trim();
      const full = CASES.find(x => x && ((cid && x.case_id === cid) || (clabel && (x.case_label === clabel || x.case_id === clabel))));
      if (full) {
        layer1 = full.claims_layer_1 || full.claims_layer1 || full.layer1_claims || layer1;
        layer2 = full.claims || layer2;
      }
    }
  if (!layer1.length || !layer2.length) return "";

  const l2ById = Object.fromEntries(layer2.map(x => [x.claim_id, x]));
  const l1ById = Object.fromEntries(layer1.map(x => [x.claim_id, x]));

  const factsFlat = (plan && plan.facts_flat) ? plan.facts_flat : (c.facts || []);
  const seenL1 = new Set();

  (factsFlat || []).forEach(f => {
    const l2 = l2ById[f.claim_id];
    if (!l2) return;
    const parent = l2.layer_1_parent;
    if (parent) seenL1.add(parent);
  });

  if (!seenL1.size) return "";

  // Order by stable Layer-1 order if available
  const l1Order = getStableClaimOrder({caseObj:c, facts_flat: factsFlat || []}, "layer1", layer1);
  const ordered = (l1Order.length ? l1Order : layer1.map(x => x.claim_id)).filter(cid => seenL1.has(cid));

  const items = ordered.map(cid => {
    const it = l1ById[cid] || {};
    const t = (it.claim_text_abstract || it.claim_text || it.text || "").trim();
    if (!t) return "";
    return `<li style="margin:6px 0; line-height:1.25;">${escapeHtml(domainPriorsNormalizeAssertion(t))}</li>`;
  }).filter(Boolean).join("");

  if (!items) return "";

  return `<div class="box" data-component-id="box:contested_required_issues" style="margin-top:12px; background:#f6f6f6;">
    <div style="font-weight:800; margin-bottom:6px;">In this case, the contested required issues are:</div>
    <ul style="margin:0 0 0 18px; padding:0;">${items}</ul>
  </div>`;
}



function exposure_gist_screen(jsPsych, plan, i, n, foil_condition) {
  // 2AFC recognition per shown fact, grouped by claim (stored order).
  // Uses bold-diff fields:
  //   - fact_text_bolded_diff
  //   - exposure_foil_bolded_diff
  //   // Bold markers use **...** and are rendered as <b>...</b>.

  const factsByClaim = plan.shown_facts_by_claim || {};
  const claimOrder = plan.claim_order || [];
  const claimById = {};
  (plan.caseObj.claims || []).forEach(cl => { claimById[cl.claim_id] = cl; });

  function normForCompare(s) {
    return normGist(String(s || "").replaceAll("**", ""));
  }

  function getPairForFact(f) {
    const true_raw = String(f.fact_text_bolded_diff || f.fact_text || "");
    const foil_raw = String(f.exposure_foil_bolded_diff || "");
    const foil_type = String(f.exposure_foil_type || "");

    // foil_condition is intentionally ignored now (kept only so callers don't need to change).
    if (!true_raw || !foil_raw) {
      throw new Error(`Missing exposure 2AFC text for fact_id=${f.fact_id} (need fact_text_bolded_diff/fact_text and exposure_foil_bolded_diff)`);
    }

    // Guard: avoid identical options after removing ** markers
    if (normForCompare(true_raw) === normForCompare(foil_raw)) {
      throw new Error(`Foil identical to true text for fact_id=${f.fact_id}`);
    }
    return { true_raw, foil_raw, foil_type };
  }

  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    stimulus: () => {
      const caseLabel = plan.case_label || plan.caseObj.case_name || plan.caseObj.case_label || "Case";
      const pl = plan.caseObj.plaintiff_descriptor || plan.caseObj.plaintiff_name || "Plaintiff";
      const df = plan.caseObj.defendant_descriptor || plan.caseObj.defendant_name || "Defendant";
      const groups = claimOrder
        .filter(claim_id => Array.isArray(factsByClaim[claim_id]) && factsByClaim[claim_id].length > 0)
        .map((claim_id, idx) => {
          const cl = claimById[claim_id] || {};
          const claimText = cl.claim_text || cl.text || "";
          const itemsArr = [];

          (factsByClaim[claim_id] || []).forEach(f => {
            try {
              const { true_raw, foil_raw } = getPairForFact(f);

              // Randomize whether true vs foil is shown first
              const swap = (Math.random() < 0.5);
              const optAraw = swap ? foil_raw : true_raw;
              const optBraw = swap ? true_raw : foil_raw;

              // Render **...** markers as bold (safe HTML)
              const optAhtml = renderBoldMarkers(optAraw);
              const optBhtml = renderBoldMarkers(optBraw);

              const correct = swap ? "B" : "A"; // which displayed option is the true statement

              itemsArr.push(`
                <div class="claimList probList" data-component-id="list:exposure_item" style="margin:10px 0;"><div class="sliderGroup">
                  <div class="instructions" data-component-id="text:instructions" style="margin:6px 0 10px;">
                    ${(()=>{const eNum=(f && (f._fn||f.fn))?(f._fn||f.fn):""; return eNum?`<div class="claimTag" style="margin-bottom:6px;"><b>Evidence ${eNum}:</b></div>`:"";})()}
                  </div>
                  <label class="checkItem" style="margin:6px 0; display:block; padding:10px 12px; border:1px solid rgba(0,0,0,0.10); border-radius:12px; background:rgba(0,0,0,0.01);">
                    <input type="radio" name="gist_${escapeHtml(f.fact_id)}" value="A" data-fact_id="${escapeHtml(f.fact_id)}" data-claim_id="${escapeHtml(ensureDoubleQuotes(claim_id))}" data-correct="${correct}">
                    <span style="margin-left:8px; display:block;">${optAhtml}</span>
                  </label>
                  <label class="checkItem" style="margin:6px 0; display:block; padding:10px 12px; border:1px solid rgba(0,0,0,0.10); border-radius:12px; background:rgba(0,0,0,0.01);">
                    <input type="radio" name="gist_${escapeHtml(f.fact_id)}" value="B" data-fact_id="${escapeHtml(f.fact_id)}" data-claim_id="${escapeHtml(ensureDoubleQuotes(claim_id))}" data-correct="${correct}">
                    <span style="margin-left:8px; display:block;">${optBhtml}</span>
                  </label>
                </div></div>
              `);
            } catch (e) {
              console.warn(`Skipping memory item for fact_id=${(f && f.fact_id) || "unknown"}: ${e && e.message}`);
              return;
            }
          });

          const items = itemsArr.join("");
          if (!items || items.trim().length === 0) return "";
          return `
            <div class="claimGroup">
${items}
            </div>
          `;
        }).join("");

      return `
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s3">
            <div class="title" data-component-id="header:page_title">Evidence recognition</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(caseLabel)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
          </div>

          <div class="space-md" aria-hidden="true"></div>
          <div style=\"height:18px;\"></div>
            <div class=\"instructions\" data-component-id="text:instructions">
            <b>For each item below, please select the option that appeared earlier as evidence. :</b> <br><br>
          </div>
          ${groups || `<div class="box" style="margin-top:10px;">No items could be generated for this page. This usually means the stimuli JSON is missing exposure foil fields (e.g., <code>exposure_foil_bolded_diff</code>). Please contact the researcher.</div>`}

          ${continueButtonHtml("Continue")}
        </div>
      `;
    },
    on_load: () => {
      const goBtn = document.getElementById("go");

      function getEligibleFactIds() {
        const els = Array.from(document.querySelectorAll('input[type="radio"][data-fact_id]'));
        const ids = els.map(e => e.dataset.fact_id);
        return Array.from(new Set(ids));
      }

      function allAnswered() {
        const factIds = getEligibleFactIds();
        for (const fid of factIds) {
          const sel = document.querySelector(`input[name="gist_${CSS.escape(fid)}"]:checked`);
          if (!sel) return false;
        }
        return true;
      }

      function updateGate() {
        const factIds = getEligibleFactIds();
        if (factIds.length === 0) { goBtn.disabled = false; return; }
        if (PREVIEW_MODE) { goBtn.disabled = false; return; }
        goBtn.disabled = !allAnswered();
      }

      document.querySelectorAll('input[type="radio"]').forEach(el => el.addEventListener("change", updateGate));
      updateGate();

      goBtn.addEventListener("click", () => {
        const results = [];
        const byId = {};
        (plan.facts_flat || []).forEach(f => { byId[f.fact_id] = f; });

        const eligible = getEligibleFactIds();
        const skipped = (plan.facts_flat || []).map(f => f.fact_id).filter(fid => !eligible.includes(fid));

        eligible.forEach(fid => {
          const f = byId[fid] || {};
          const sel = document.querySelector(`input[name="gist_${CSS.escape(fid)}"]:checked`);
          const picked = sel ? sel.value : null;
          const correct = sel ? sel.dataset.correct : null;
          const is_correct = (picked && correct) ? (picked === correct ? 1 : 0) : null;

          // Log foil type if available (new or legacy)
          let foil_type_used = String(f.exposure_foil_type || "");
          if (!foil_type_used) {
            foil_type_used = (Number(foil_condition) === 2) ? String(f.foil_type_2 || "") : String(f.foil_type_1 || "");
          }

          results.push({
            fact_id: fid,
            claim_id: f.claim_id || (sel ? sel.dataset.claim_id : null),
            picked,
            correct_option: correct,
            is_correct,
            foil_condition,
            foil_type_used
          });
        });

        jsPsych.finishTrial({
          page_type: "exposure_gist",
          gist_skipped_fact_ids: (typeof skipped !== "undefined") ? skipped : [],
          preview_mode: PREVIEW_MODE,
          case_id: plan.caseObj.case_id,
          facts_shown_ids: plan.facts_shown_ids,
          claim_order: plan.claim_order,
          foil_condition,
          exposure_gist_results: results
        });
      });
    }
  };
}

function end_feedback_screen(jsPsych) {
  // Avoid dependency on jsPsychSurveyText (not always loaded on cognition.run).
  return {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    stimulus: pageHtml(`
      ${BASE_CSS}
      <div class="page" data-component-id="page:root">
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
      </div>
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
  function prolific_end_screen(jsPsych) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="title" data-component-id="header:page_title">All done</div>
          <div class="instructions" data-component-id="text:instructions">
            Your completion code is:
            <div style="margin:12px 0 16px 0;">
              <span class="tag" style="font-size:18px; padding:10px 12px; border:1px solid #ddd; border-radius:12px; background:#fafafa; display:inline-block; letter-spacing:0.06em;">
                ${escapeHtml(PROLIFIC_COMPLETION_CODE)}
              </span>
            </div>
            Clicking the button below will redirect you to Prolific to submit the study.
          </div>
          <div class="muted"><i>If the redirect does not work, you can manually submit using the code above.</i></div>
        </div>
${continueButtonHtml()}
`),
      on_start: () => {
        try {
          jsPsych.data.addProperties({
            prolific_completion_code: PROLIFIC_COMPLETION_CODE,
            prolific_redirect_url: PROLIFIC_REDIRECT_URL
          });
        } catch (_) {}
      },
            on_load: () => {
        const btn = document.getElementById("go");
        if (btn) btn.addEventListener("click", () => jsPsych.finishTrial());
      },
      on_finish: () => {
        try { window.location.href = PROLIFIC_REDIRECT_URL; } catch (_) {}
      },
      data: { page_type: "prolific_end", preview_mode: PREVIEW_MODE, prolific_completion_code: PROLIFIC_COMPLETION_CODE }
    };
  }



  /* ==================== JUDGE HELPERS ==================== */
  function sampleJudgeFactsForCase(caseObj, record_side) {
    const safeCase = caseObj || {};
    const claims = Array.isArray(safeCase.claims) ? safeCase.claims.filter(Boolean) : [];
    const facts = Array.isArray(safeCase.facts) ? safeCase.facts.filter(Boolean) : [];
    const claim_order = getStableClaimOrder(safeCase, "layer2", claims);

    const shown_facts_by_claim = {};
    const facts_flat = [];
    const facts_shown_ids = [];
    const claim_record_empty = {};

    claim_order.forEach((claim_id) => {
      const matchingFacts = facts.filter(f => {
        if (!f) return false;
        return (
          String(f.claim_id || "") === String(claim_id || "") &&
          factSide(f) === record_side
        );
      });

      const arr = [];

      if (matchingFacts.length > 0) {
        const picked = Object.assign({}, matchingFacts[0], {
          _picked_side: record_side
        });

        arr.push(picked);
        facts_flat.push(picked);
        if (picked.fact_id) facts_shown_ids.push(picked.fact_id);
        claim_record_empty[claim_id] = 0;
      } else {
        claim_record_empty[claim_id] = 1;
      }

      shown_facts_by_claim[claim_id] = arr;
    });

    facts_flat.forEach((f, idx) => { f._fn = idx + 1; });
    const fnById = {};
    facts_flat.forEach(f => { if (f && f.fact_id) fnById[f.fact_id] = f._fn; });
    Object.keys(shown_facts_by_claim).forEach(claim_id => {
      const arr = Array.isArray(shown_facts_by_claim[claim_id]) ? shown_facts_by_claim[claim_id] : [];
      shown_facts_by_claim[claim_id] = arr.map(f => Object.assign({}, f, { _fn: fnById[f.fact_id] || null }));
    });

    return {
      claim_order,
      shown_facts_by_claim,
      facts_flat,
      facts_shown_ids,
      record_side,
      claim_record_empty
    };
  }

  function buildJudgeFactCardHtml(f, n) {
    const fid = escapeHtml(f.fact_id || `fact_${n}`);
    const ftext = escapeHtml(f.fact_text || "");
    return `
      <div class="factCard" data-component-id="factcard:E${n}" data-fn="${n}" data-fid="${fid}" data-fact-id="${fid}">
        <div class="factHeader" data-component-id="factcard:E${n}:header" role="button" tabindex="0" aria-expanded="false">
          <div class="factTitle" data-component-id="label:fact_title"></div>
          <div class="factHeaderRight">
            <button type="button" class="btn small openBtn" data-component-id="btn:fact_open" data-fn="${n}">${COPY.review_open_button}</button>
          </div>
        </div>
        <div class="factBody" id="factBody_${n}" style="display:none;">
          <div class="factText">${ftext}</div>
          <div class="factFooter">
            <button type="button" class="btn small closeBtn" data-fn="${n}">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function buildJudgeFactsGroupedByClaimHtml(plan) {
    const c = plan.caseObj || {};
    const claimOrder = Array.isArray(plan.claim_order) ? plan.claim_order : [];
    const shownByClaim = plan.shown_facts_by_claim || {};
    const claimById = {};
    (c.claims || []).forEach(cl => { if (cl && cl.claim_id) claimById[cl.claim_id] = cl; });

    const groupsHtml = claimOrder.map((claim_id, idx) => {
      const cl = claimById[claim_id] || {};
      const claimText = cl.claim_text || cl.text || "";
      const facts = Array.isArray(shownByClaim[claim_id]) ? shownByClaim[claim_id] : [];
      let inner = "";
      if (!facts.length) {
        const who = recordSideLabel(plan.record_side);
        inner = `<div class="muted" style="margin-top:8px;"><i>${copyFormat(COPY.no_evidence_for_claim, {SIDE: escapeHtml(who)})}</i></div>`;
      } else {
        inner = facts.map(f => buildJudgeFactCardHtml(f, f._fn)).join("\n");
      }
      return `
        <div class="claimGroup">
          <div class="claimHeaderRow">
            <div style="flex:1 1 auto;">
              <div class="claimTag"><b>Disputed point ${idx+1}:</b></div>
              <div class="claimText">${escapeHtml(ensureDoubleQuotes(claimText))}</div>
            </div>
          </div>
          <div class="hr"></div>
          ${inner}
        </div>
      `;
    }).join("\n");
    return `<div class="claimGroups">${groupsHtml}</div>`;
  }

  function judge_record_review_screen(jsPsych, plan, i, n) {
    const c = plan.caseObj || {};
    const caseLabel = plan.case_label || c.case_name || c.case_label || "Case";
    const pl = c.plaintiff_descriptor || c.plaintiff_name || "Plaintiff";
    const df = c.defendant_descriptor || c.defendant_name || "Defendant";
    const who = recordSideLabel(plan.record_side);
    const factsFlat = Array.isArray(plan.facts_flat) ? plan.facts_flat : [];

    const openSummary = {};
    for (let k = 1; k <= factsFlat.length; k++) openSummary[k] = { openedOnce:false, openCount:0, totalOpenMs:0 };
    const intervals = [];

    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        ${BASE_CSS}
        <div class="page" data-component-id="page:root">
          <div class="s1Header" data-component-id="header:s2">
            <div class="title" data-component-id="header:page_title">${COPY.review_title}</div>
            <div class="muted" data-component-id="header:page_subtitle" style="margin-top:4px;">${escapeHtml(caseLabel)} &nbsp;|&nbsp; Plaintiff: ${escapeHtml(pl)} &nbsp;|&nbsp; Defendant: ${escapeHtml(df)} </div>
          </div>

          <div class="instructions" data-component-id="text:review_instructions" style="text-align:left; margin-top:18px; margin-bottom:14px;">
            <p style="margin:0 0 8px 0;">${COPY.review_open_requirement_html}</p>
            <p style="margin:0;">${copyFormat(COPY.review_instructions_html, { SIDE: who })}</p>
            ${noteLineHtml(`<i>Note: Evidence is organized by the disputed point they relate to. Each evidence must be opened for at least 2 seconds before continuing.</i>`, {style:"margin-top:8px; margin-bottom:0;", componentId:"note:review_open_requirement"})}
          </div>

          <div class="judgeReviewWrap">
            ${buildJudgeFactsGroupedByClaimHtml(plan)}
          </div>

          <div style="display:flex; justify-content:flex-end; align-items:center; gap:14px; margin-top:16px;">
            <div class="muted" id="judgeReviewProgress" style="margin:0;">${COPY.review_progress_label} <span id="judgeReviewOpenedN">0</span> / ${factsFlat.length}</div>
            ${continueButtonHtml("Continue",{style:"position:static; box-shadow:none; margin-top:0;"})}
          </div>
        </div>
      `),
      on_load: () => {
        let openFn = null, openStart = null;
        let reviewTimer = null;
        const continueBtn = document.getElementById("go");
        const openedNEl = document.getElementById("judgeReviewOpenedN");

        function openedLongEnoughCount() {
          return Object.values(openSummary).filter(x => x && x.openedOnce).length;
        }

        function updateContinueGate() {
          if (PREVIEW_MODE) {
            if (openedNEl) openedNEl.textContent = String(openedLongEnoughCount());
            if (continueBtn) continueBtn.disabled = false;
            return;
          }
          if (openFn !== null && openStart !== null && openSummary[openFn]) {
            const liveDur = performance.now() - openStart;
            if ((openSummary[openFn].totalOpenMs + liveDur) >= 2000) {
              openSummary[openFn].openedOnce = true;
            }
          }
          const openedN = openedLongEnoughCount();
          if (openedNEl) openedNEl.textContent = String(openedN);
          const ok = (factsFlat.length === 0) || (openedN >= factsFlat.length);
          if (continueBtn) continueBtn.disabled = !ok;
        }

        function startReviewTimer() {
          if (reviewTimer !== null) return;
          reviewTimer = window.setInterval(updateContinueGate, 150);
        }

        function stopReviewTimer() {
          if (reviewTimer !== null) {
            window.clearInterval(reviewTimer);
            reviewTimer = null;
          }
        }

        function closeOpenFact() {
          if (openFn === null) return;
          const now = performance.now();
          const dur = now - openStart;
          if (openSummary[openFn]) {
            openSummary[openFn].totalOpenMs += dur;
            if (openSummary[openFn].totalOpenMs >= 2000) openSummary[openFn].openedOnce = true;
          }
          intervals.push({
            fn: openFn,
            fact_id: (factsFlat && factsFlat[openFn-1] ? factsFlat[openFn-1].fact_id : null),
            claim_id: (factsFlat && factsFlat[openFn-1] ? factsFlat[openFn-1].claim_id : null),
            startMs: openStart, endMs: now, durationMs: dur
          });
          const body = document.getElementById(`factBody_${openFn}`);
          const ob = document.querySelector(`.openBtn[data-fn="${openFn}"]`);
          const header = document.querySelector(`.factCard[data-fn="${openFn}"] .factHeader`);
          if (body) body.style.display = "none";
          if (ob) ob.style.display = "";
          if (header) header.setAttribute("aria-expanded","false");
          openFn = null; openStart = null;
          updateContinueGate();
        }

        document.querySelectorAll(".openBtn").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const fn = Number(btn.dataset.fn);
            if (openFn !== null && openFn !== fn) closeOpenFact();
            const body = document.getElementById(`factBody_${fn}`);
            const header = document.querySelector(`.factCard[data-fn="${fn}"] .factHeader`);
            if (body && body.style.display === "none") {
              body.style.display = "block";
              btn.style.display = "none";
              if (header) header.setAttribute("aria-expanded","true");
              openFn = fn;
              openStart = performance.now();
              if (openSummary[fn]) openSummary[fn].openCount += 1;
              startReviewTimer();
            }
          });
        });

        document.querySelectorAll(".closeBtn").forEach(btn => btn.addEventListener("click", (e) => {
          e.stopPropagation();
          closeOpenFact();
        }));

        document.querySelectorAll(".factHeader").forEach(head => {
          head.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              const btn = head.querySelector(".openBtn");
              if (btn && btn.style.display !== "none") btn.click();
              else closeOpenFact();
            }
          });
        });

        if (continueBtn) {
          continueBtn.disabled = PREVIEW_MODE ? false : (factsFlat.length > 0);
          continueBtn.addEventListener("click", () => {
            closeOpenFact();
            updateContinueGate();
            if (continueBtn.disabled) return;
            stopReviewTimer();
            jsPsych.finishTrial({
              page_type: "judge_record_review",
              case_id: c.case_id,
              case_index: i,
              record_side: plan.record_side,
              side_disclosed: DISCLOSE_EVIDENCE_SIDE ? 1 : 0,
              both_sides_shown: SHOW_BOTH_SIDES ? 1 : 0,
              evidence_exposure_arm: EVIDENCE_EXPOSURE_ARM,
              claim_order: plan.claim_order,
              shown_facts_by_claim: Object.fromEntries(
                Object.entries(plan.shown_facts_by_claim || {}).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map(f => f && f.fact_id ? f.fact_id : null).filter(Boolean)])
              ),
              facts_shown_ids: plan.facts_shown_ids,
              judge_open_summary: openSummary,
              judge_open_intervals: intervals
            });
          });
        }

        updateContinueGate();
      },
      on_finish: (data) => {
        (Array.isArray(plan.claim_order) ? plan.claim_order : []).forEach((claim_id) => {
          const arr = Array.isArray(plan.shown_facts_by_claim && plan.shown_facts_by_claim[claim_id]) ? plan.shown_facts_by_claim[claim_id] : [];
          const fid = (arr[0] && arr[0].fact_id) ? arr[0].fact_id : null;
          const f = fid ? (Array.isArray(plan.facts_flat) ? plan.facts_flat.find(x => x && x.fact_id === fid) : null) : null;
          writeDataRow(jsPsych, {
            page_type: "record_review_exposure",
            case_id: c.case_id,
            case_index: i,
            record_side: plan.record_side,
            side_disclosed: DISCLOSE_EVIDENCE_SIDE ? 1 : 0,
            both_sides_shown: SHOW_BOTH_SIDES ? 1 : 0,
            evidence_exposure_arm: EVIDENCE_EXPOSURE_ARM,
            claim_id,
            fact_id: fid,
            open_count: f ? ((data.judge_open_summary && data.judge_open_summary[f._fn] ? data.judge_open_summary[f._fn].openCount : 0)) : 0,
            total_open_time_ms: f ? ((data.judge_open_summary && data.judge_open_summary[f._fn] ? data.judge_open_summary[f._fn].totalOpenMs : 0)) : 0,
            claim_record_empty: plan.claim_record_empty ? plan.claim_record_empty[claim_id] : (fid ? 0 : 1),
            phase: "record_review"
          });
        });
      }
    };
  }

  /* ==================== MAIN ==================== */

  async function main() {
    try {
      const CASES = await loadStimuli();

      const jsPsych = initJsPsych({
        on_trial_start: (trial) => {
          try {
            if (typeof PREVIEW_MODE !== "undefined" && PREVIEW_MODE) {
              const raw = (typeof window.__PREVIEW_RAW_COUNTER !== "undefined") ? (++window.__PREVIEW_RAW_COUNTER) : 0;
              window.__PREVIEW_SECTION_ID = window.__PREVIEW_SECTION_ID || 0;
              window.__PREVIEW_SECTION_PAGE = window.__PREVIEW_SECTION_PAGE || 0;
              const stim = (trial && trial.stimulus) ? String(trial.stimulus) : "";
              const isS1 = stim.includes("Section 1:");
              const isS2 = stim.includes("Section 2:");
              if (isS1) { window.__PREVIEW_SECTION_ID = 1; window.__PREVIEW_SECTION_PAGE = 0; }
              if (isS2) { window.__PREVIEW_SECTION_ID = 2; window.__PREVIEW_SECTION_PAGE = 0; }
              if (raw > 0) window.__PREVIEW_SECTION_PAGE += 1;
            }
          } catch (e) {}
          try { addPreviewJumpOverlay(); } catch (e) {}
        },
        show_progress_bar: true,
        auto_update_progress_bar: true,
        on_finish: () => console.log(jsPsych.data.get().values())
      });

      const CHECK_CONDITION = (Math.random() < 0.5) ? "activation" : "exposure";
      const FOIL_CONDITION = (Math.random() < 0.5) ? 1 : 2;
      jsPsych.data.addProperties({
        preview_mode: PREVIEW_MODE,
        check_condition: CHECK_CONDITION,
        foil_condition: FOIL_CONDITION,
        stimuli_file: STIM_PATH,
        js_version: "v8.3.4"
      });

      const safeCases = Array.isArray(CASES) ? CASES.filter(Boolean) : [];
      if (!safeCases.length) throw new Error("No cases found in stimuli JSON.");
      const caseOrder = shuffle(safeCases).slice(0, 1);

      const casePlans = [];
      for (let idx = 0; idx < caseOrder.length; idx++) {
        const safeCase = caseOrder[idx] || {};
        const record_side = (Math.random() < 0.5) ? "plaintiff" : "defendant";
        const sampled = SHOW_BOTH_SIDES ? sampleFactsForCase(safeCase) : sampleJudgeFactsForCase(safeCase, record_side);
        casePlans.push(Object.assign({
          caseObj: safeCase,
          case_label: safeCase.case_label || safeCase.case_id || "Case",
          advocate_side: record_side,
          record_side: record_side,
          side_disclosed: DISCLOSE_EVIDENCE_SIDE ? 1 : 0,
          both_sides_shown: SHOW_BOTH_SIDES ? 1 : 0,
          evidence_exposure_arm: EVIDENCE_EXPOSURE_ARM
        }, sampled));
      }

      const timeline = [];
      const PREVIEW_START = getPreviewStartParam();
      const PREVIEW_START_NORM = (PREVIEW_START === "priors") ? "section1" : PREVIEW_START;

      if (!PREVIEW_MODE || PREVIEW_START_NORM === "") {
        timeline.push(consent_screen(jsPsych));
        timeline.push(overview_screen(jsPsych));
        timeline.push(section1_transition_screen(jsPsych));
      } else if (PREVIEW_START_NORM === "section1") {
        timeline.push(section1_transition_screen(jsPsych));
      }

      if (!PREVIEW_MODE || PREVIEW_START_NORM === "" || PREVIEW_START_NORM === "section1") {
        for (let idx = 0; idx < casePlans.length; idx++) {
          const plan = casePlans[idx];
          const s1Trials = build_section1_for_case(jsPsych, plan, idx + 1, casePlans.length);
          if (Array.isArray(s1Trials)) {
            for (let j = 0; j < s1Trials.length; j++) timeline.push(s1Trials[j]);
          }
        }
      }

      if (!PREVIEW_MODE || !['section3','finalq','exposure','feedback'].includes(String(PREVIEW_START||''))) {
        for (let idx = 0; idx < casePlans.length; idx++) {
          const plan = casePlans[idx];
          timeline.push(section2_transition_screen(jsPsych, plan));
          timeline.push(judge_record_review_screen(jsPsych, plan, idx + 1, casePlans.length));
        }
      }

      if (!(PREVIEW_MODE && ['feedback'].includes(String(PREVIEW_START||'')))) {
        timeline.push(section3_transition_screen(jsPsych, titleCaseLabel(casePlans[0].caseObj.case_label || casePlans[0].caseObj.case_id || "Case")));
        for (let idx = 0; idx < casePlans.length; idx++) {
          const plan = casePlans[idx];
          const c = plan.caseObj || {};
          const layer2 = Array.isArray(c.claims) ? c.claims : [];
          timeline.push(section1_probability_inputs_screen(jsPsych, plan, idx + 1, {
            claimLayer: "layer2",
            pageType: "s3_layer2_post",
            titleSuffix: COPY.section3_assess_disputed_title,
            introHtml: COPY.section3_assess_disputed_intro_html,
            claims: layer2
          }));
          timeline.push(section3_case_outcome_probability_screen(jsPsych, plan, idx + 1));
        }
      }

      timeline.push(end_feedback_screen(jsPsych));
      timeline.push(prolific_end_screen(jsPsych));
      jsPsych.run(timeline);
    } catch (err) {
      showFatalError(err);
    }
  }
  function startStudy() {
    // Ensure the page is not blank while loading
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
})()
  function requiredElementsAndRoutesAccordionHtml(caseObj) {
    const caseType = getCaseTypeLabel(caseObj.case_id);
    const layer1 = caseObj.claims_layer_1 || caseObj.claims_layer1 || caseObj.layer1_claims || [];
    const layer2 = caseObj.claims || [];
    const l1Order = getStableClaimOrder(caseObj, "layer1", layer1);
    const l2Order = getStableClaimOrder(caseObj, "layer2", layer2);
    const l1ById = Object.fromEntries(layer1.map(c => [c.claim_id, c]));
    const l2ById = Object.fromEntries(layer2.map(c => [c.claim_id, c]));

    const l1Items = l1Order.map((cid, i) => {
      const c = l1ById[cid] || {};
      const t = (c.claim_text_abstract || c.claim_text || "").trim();
      return `<li style="margin:8px 0; line-height:1.35;"><b>Required Issue ${i+1}${disputedParents.has(cid) ? " <span style=\"font-weight:800; font-size:12px; padding:2px 8px; border-radius:999px; background:rgba(0,0,0,0.06);\">Disputed</span>" : ""}:</b> ${disputedParents.has(cid) ? `<span style=\"font-weight:800;\">${escapeHtml(domainPriorsNormalizeAssertion(t))}</span>` : escapeHtml(domainPriorsNormalizeAssertion(t))}</li>`;
    }).join("");

    const l2Items = l2Order.map((cid, i) => {
      const c = l2ById[cid] || {};
      const t = (c.claim_text_abstract || c.claim_text || "").trim();
      return `<li style="margin:8px 0; line-height:1.35;"><b>Line of Evidence ${i+1}:</b> ${escapeHtml(domainPriorsNormalizeAssertion(t))}</li>`;
    }).join("");

    return `
      <div class="accordion" style="margin-top:10px;">
        <button class="acc-btn" type="button" aria-expanded="false">
          <span>Required Elements and Lines of Evidence</span>
          <span class="acc-icon">+</span>
        </button>
        <div class="acc-panel" style="display:none;">
          <div class="acc-inner">
            <div style="margin-bottom:10px;">
              <div style="font-weight:800; margin-bottom:6px;">Required Elements in ${escapeHtml(caseType)} cases</div>
              <div class="muted" style="margin-bottom:10px;">
                <span style="font-weight:700;">Reminder:</span> In some cases, an issue may not be disputed. But to win, the plaintiff must still be able to establish each required issue as <b>more likely true than not</b>.
              </div>
              <ul style="margin:0 0 12px 18px; padding:0;">
                ${l1Items || "<li class='muted'>No required issues listed.</li>"}
              </ul>
            </div>

            <div>
              <div style="font-weight:800; margin-bottom:6px;">Lines of evidence in ${escapeHtml(caseType)} cases</div>
              <div class="muted" style="margin-bottom:10px;">
                Each line of evidence is a disputed point that the parties may try to prove or challenge.
              </div>
              <ul style="margin:0 0 6px 18px; padding:0;">
                ${l2Items || "<li class='muted'>No lines of evidence listed.</li>"}
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const TRANSITIONS = {
    priors_to_cases: {
      tag: "priors_to_cases",
    },
    between_cases: {
      tag: "between_cases",
    },
    to_final_questions: {
      tag: "to_final_questions",
    },
    to_exposure: {
      tag: "to_exposure",
    },
    judgment_between_cases: {
      tag: "judgment_between_cases",
    },
    finalq_between_cases: {
      tag: "finalq_between_cases",
    },

  };

  function transitionTagHtml(tag) {
    try {
      const t = (tag == null) ? "" : String(tag);
      // Keep a hidden marker; no watermarking to avoid any runtime issues.
      return `<div data-transition="${t.replaceAll('"','&quot;')}" style="display:none;"></div>`;
    } catch (e) {
      return "";
    }
  }