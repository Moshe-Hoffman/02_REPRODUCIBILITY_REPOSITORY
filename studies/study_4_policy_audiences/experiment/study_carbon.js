/*******************************************************
 * Policy Reviewer Study — Cognition.run (jsPsych 8.x)
 * Adapted from policy advocacy study
   * Version: policy_reviewer_carbon_final_disclosure_pid_safe_2026-08-25
 * Timestamp: 2026-07-14
 *
 * Active design:
 *  - Reviewer is assigned one advocate dossier from reviewer_dossiers JSON via the assignment service.
 *  - Each dossier receives exactly one independent reviewer; the advocate role is disclosed.
 *  - The assignment service controls dossier assignment; refreshes reuse an active assignment.
 *  - Mirrors advocate measurement pages: claim-warrant priors/posteriors,
 *    policy support priors/posteriors and quantitative-estimate priors/posteriors.
 *  - No direct persuasiveness or quality ratings.
 *******************************************************/

(function () {
  "use strict";

  const CFG = {
    study_id: "policy_reviewer_v1",
    js_version: "policy_reviewer_carbon_final_disclosure_pid_safe_2026-08-25",
    stimuli_path: "stimuli/policy_advocacy_stimuli.json",
    reviewer_dossiers_path: "stimuli/policy_reviewer_runtime_carbon_final_aug20.json",
    assignment_service_url: "PASTE_YOUR_ASSIGNMENT_SERVICE_URL_HERE", // Operational endpoint redacted from the public archive.
    assignment_study_key: "carbon_final_aug20_disclosure",
    prolific_completion_code: "C1379C4O",
    show_progress_bar: true,
    ask_claim_warranted: true,
    strict_completed_only: false,
    bonus_max: 0.00 // Pilot reviewer run: participant-facing bonus language disabled.
  };

  const PROLIFIC_REDIRECT_URL =
    `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(CFG.prolific_completion_code)}`;
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const PREVIEW_MODE = false;

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

  function escapeClean(x) { return escapeHtml(cleanParticipantText(x)); }
  function displayFactLabel(label) {
    const s = String(label || "Fact").trim();
    if (!s || s === "Fact") return "Fact";
    return /^F/i.test(s) ? s : `F${s}`;
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
  window.onerror = function (_m, _s, _l, _c, error) { showFatalError(error || _m); return true; };
  window.addEventListener("unhandledrejection", (event) => showFatalError(event.reason || event));

  function safeId(s) { return String(s || "x").replace(/[^A-Za-z0-9_\-]/g, "_"); }
  function numberOrNull(x) {
    const s = String(x === null || x === undefined ? "" : x).trim();
    if (s === "") return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }
  function writeDataRow(jsPsych, row) {
    try {
      if (jsPsych && jsPsych.data && typeof jsPsych.data.write === "function") { jsPsych.data.write(row); return true; }
      if (jsPsych && jsPsych.data && typeof jsPsych.data.addData === "function") { jsPsych.data.addData(row); return true; }
    } catch (_) {}
    return false;
  }
  function addDataProperties(jsPsych, obj) { try { jsPsych.data.addProperties(obj); } catch (_) {} }
  function hashString(s) {
    let h = 2166136261;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); }
    return Math.abs(h >>> 0);
  }
  function valenceLabel(v) {
    const s = String(v || "").toLowerCase();
    if (s === "pro") return "Supports the policy";
    if (s === "con") return "Opposes the policy";
    return "Claim";
  }
  function factClaimSide(f) {
    const s = String(f.side_relative_to_claim || "").toLowerCase();
    if (s.includes("support")) return "supports_claim";
    if (s.includes("oppose")) return "opposes_claim";
    return "unknown";
  }

  const BASE_CSS = `
  <style>
    .page, .page * { text-align: left; box-sizing: border-box; }
    .page { max-width:1120px; margin:0 auto; padding:0 14px 76px; font-family:Arial,sans-serif; color:#111; }
    .textPage { max-width:840px; margin:0 auto; padding-top:0; }
    .jspsych-display-element { width:100% !important; }
    .jspsych-content-wrapper { width:100% !important; max-width:1120px !important; margin:0 auto !important; padding:0 14px !important; align-items:flex-start !important; justify-content:flex-start !important; }
    .jspsych-content { width:100% !important; max-width:1120px !important; margin:0 auto !important; padding-top:52px !important; }
    .title { font-size:24px; font-weight:800; margin:6px 0 20px; text-align:center !important; width:100%; }
    .subtitle { font-size:16px; font-weight:800; margin:0 0 8px; }
    .instructions { font-size:16px; line-height:1.45; margin:18px auto 14px; color:#111; max-width:860px; }
    .muted { font-size:13px; color:#555; margin-top:6px; }
    .noteLine { font-size:13px; color:#555; margin-top:10px; }
    .btn { border:1px solid #aaa; background:#f7f7f7; border-radius:12px; padding:9px 11px; cursor:pointer; font-size:15px; }
    .btn.small { padding:7px 9px; font-size:13px; }
    .btn:disabled { opacity:.45; cursor:not-allowed; }
    .continueBtn { width:auto; min-width:120px; padding:10px 16px; font-size:16px; border-radius:14px; position:fixed; bottom:18px; right:18px; z-index:50; box-shadow:0 4px 14px rgba(0,0,0,.18); max-width:220px; white-space:nowrap; display:inline-block; }
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
    .probRow { display:flex; justify-content:space-between; gap:14px; border-bottom:1px solid rgba(0,0,0,.06); padding:13px 12px; align-items:flex-start; }
    .probRow:last-child { border-bottom:none; }
    .sliderPrompt { flex:1 1 auto; min-width:0; max-width:760px; padding-right:12px; }
    .probInputBox { min-width:190px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .probInput { width:160px; padding:8px 10px; border-radius:12px; border:1px solid rgba(0,0,0,.22); font-size:16px; text-align:left !important; }
    .probInputHint { font-size:12px; color:#555; text-align:right !important; }
    .quantClaimBlock, .activationClaimBlock { border:1px solid #e5e5e5; border-radius:14px; background:#fff; margin:12px 0; overflow:hidden; }
    .quantClaimHeader, .activationClaimHeader { padding:12px 14px; background:#fafafa; border-bottom:1px solid #eaeaea; }
    .dossierBox { border:1px solid #ddd; border-radius:16px; background:#fff; padding:14px; margin:14px 0; }
    .dossierDoc { border:1px solid #ddd; border-radius:16px; background:#fff; padding:18px; margin:14px 0 20px; }
    .dossierSectionTitle { font-size:17px; font-weight:900; margin:4px 0 8px; }
    .dossierDivider { border:0; border-top:1px solid #ddd; margin:18px 0; }
    .dossierDoc .claimCard { background:#fafafa; border-color:#e5e5e5; padding:10px; }
    .dossierDoc .factCard { background:#fff; }
    .argumentText { white-space:pre-wrap; line-height:1.45; font-size:15px; }
    .evidenceGrid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:16px; align-items:start; }
    .evidencePanel { border:1px solid #ddd; border-radius:16px; background:#fafafa; padding:12px; }
    .evidencePanel.supportPanel { background:#f6fbf8; }
    .evidencePanel.opposePanel { background:#fff9f1; }
    .evidencePanelTitle { font-weight:900; font-size:16px; margin:0 0 10px; text-align:center !important; }
    .factCard { border:1px solid #ddd; border-radius:14px; padding:10px 12px; margin:8px 0; background:#fff; }
    .factHeader { display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .factTitle { font-size:14px; font-weight:900; }
    .factText { font-size:14px; line-height:1.45; margin-top:8px; }
    .sourceBody { display:none; font-size:13px; color:#333; word-break:break-word; background:#fafafa; border-radius:10px; padding:10px; border:1px solid #eee; margin-top:10px; }
.dossierDoc { max-width:980px; margin:0 auto 16px; background:#fff; border:1px solid #ddd; border-radius:16px; padding:16px; }
    .dossierSectionTitle { font-size:17px; font-weight:900; margin:4px 0 10px; }
    .dossierDivider { border:none; border-top:1px solid #ddd; margin:18px 0; }
    .activationRow { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; padding:14px 12px; border-bottom:1px solid rgba(0,0,0,.06); }
    .demoGrid { display:grid; grid-template-columns:1fr 1fr; gap:14px; max-width:860px; margin:0 auto; }
    .demoItem { border:1px solid #ddd; border-radius:14px; padding:12px; background:#fff; }
    .demoItem label { display:block; font-weight:800; margin-bottom:6px; }
    .demoItem input, .demoItem select { width:100%; padding:8px 10px; border:1px solid #bbb; border-radius:10px; font-size:15px; }
    textarea { width:100%; min-height:150px; font-size:15px; line-height:1.4; padding:12px; border-radius:14px; border:1px solid #ccc; }

    .reviewProgressBox { max-width:980px; margin:10px auto 14px; padding:10px 12px; border:1px solid #ddd; border-radius:14px; background:#fafafa; font-size:14px; line-height:1.35; }
    .argumentCard { background:#fff; }
    .argumentBody, .factBody { margin-top:10px; padding-top:10px; border-top:1px solid #eee; }
    .factFooter { margin-top:10px; display:flex; justify-content:flex-end; }
    @media (max-width:980px){ .probRow{flex-direction:column;align-items:stretch;} .probInputBox{align-items:flex-start;} .demoGrid,.evidenceGrid{grid-template-columns:1fr;} }
  </style>`;

  function pageHtml(inner) { return `${BASE_CSS}<div class="page">${inner}</div>`; }
  function continueButtonHtml(label = "Continue", opts = {}) {
    const id = opts.id || "go";
    const disabled = opts.disabled ? " disabled" : "";
    return `<button id="${escapeHtml(id)}" class="btn continueBtn"${disabled}>${escapeHtml(label)}</button>`;
  }
  function textPageHtml(title, bodyHtml, buttonLabel = "Continue") {
    return pageHtml(`<div class="textPage">${title ? `<div class="title">${escapeHtml(title)}</div>` : ""}<div class="instructions">${bodyHtml}</div></div>${continueButtonHtml(buttonLabel)}`);
  }
  function orientationLineHtml(plan, includeAdvocateRole = false) {
    const policy = plan.policy || {};
    let rolePart = "";
    if (includeAdvocateRole && plan && plan.disclosure_condition === "role_disclosed" && plan.dossier) {
      const roleText = plan.dossier.advocate_position === "support" ? "argue in favor of the policy" : "argue against the policy";
      rolePart = ` &nbsp;|&nbsp; Other participant's assigned role: <b>${escapeHtml(roleText)}</b>`;
    }
    return `<div class="orientationLine">Policy: ${escapeHtml(policy.policy_name || policy.policy_id)}${rolePart}</div>`;
  }
  function addClickFinish(jsPsych, payload = {}) { const btn = document.getElementById("go"); if (btn) btn.addEventListener("click", () => jsPsych.finishTrial(payload)); }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
    return await res.json();
  }
  async function loadStimuli() {
    const data = await fetchJson(CFG.stimuli_path);
    if (!data || !Array.isArray(data.policies) || !data.policies.length) throw new Error("Stimuli JSON must contain policies.");
    data.policies.forEach((p) => {
      p.claims = Array.isArray(p.claims) ? p.claims : [];
      p.claims.forEach((cl) => {
        cl.facts = Array.isArray(cl.facts) ? cl.facts : [];
        cl.quantitative_questions = Array.isArray(cl.quantitative_questions) ? cl.quantitative_questions : [];
      });
    });
    return data;
  }
  async function loadDossiers() {
    const data = await fetchJson(CFG.reviewer_dossiers_path);
    let dossiers = Array.isArray(data.dossiers) ? data.dossiers.slice() : [];
    dossiers = dossiers.filter(d => d && d.usable_for_reviewer !== false);
    if (CFG.strict_completed_only) dossiers = dossiers.filter(d => d.strict_completed_usable !== false);
    if (!dossiers.length) throw new Error("Reviewer dossier JSON contains no usable dossiers.");
    return { ...data, dossiers };
  }


  function randomFiveDigitString() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return String(a[0] % 100001).padStart(5, "0");
    } catch (_) {
      return String(Math.floor(Math.random() * 100001)).padStart(5, "0");
    }
  }
  function getReviewerIdentity() {
    const prolificPid = URL_PARAMS.get("PROLIFIC_PID");
    if (prolificPid) return { reviewer_pid: prolificPid, synthetic: false, source: "PROLIFIC_PID" };
    const sessionId = URL_PARAMS.get("SESSION_ID");
    if (sessionId) return { reviewer_pid: sessionId, synthetic: false, source: "SESSION_ID" };
    const pid = `00000.${randomFiveDigitString()}`;
    return { reviewer_pid: pid, synthetic: true, source: "synthetic" };
  }
  const REVIEWER_IDENTITY = getReviewerIdentity();
  function effectiveAssignmentStudyKey(){return (PREVIEW_MODE || REVIEWER_IDENTITY.synthetic)?`${CFG.assignment_study_key}_preview`:CFG.assignment_study_key;}
  function jsonpRequest(url,params,timeoutMs=30000){return new Promise((resolve,reject)=>{const cb=`__reviewAssignCb_${Date.now()}_${Math.floor(Math.random()*1e9)}`,script=document.createElement("script"),timer=setTimeout(()=>cleanup(new Error("Assignment service timed out.")),timeoutMs);function cleanup(err,val){clearTimeout(timer);try{delete window[cb];}catch(_){window[cb]=undefined;}if(script.parentNode)script.parentNode.removeChild(script);err?reject(err):resolve(val);}window[cb]=v=>cleanup(null,v);const q=new URLSearchParams({...params,callback:cb});script.src=`${url}${url.includes("?")?"&":"?"}${q.toString()}`;script.onerror=()=>cleanup(new Error("Could not contact assignment service."));document.head.appendChild(script);});}
  async function requestServerAssignment(){if(!CFG.assignment_service_url||CFG.assignment_service_url.includes("PASTE_YOUR"))throw new Error("Set CFG.assignment_service_url to the deployed Google Apps Script web-app URL.");const r=await jsonpRequest(CFG.assignment_service_url,{action:"assign",study:effectiveAssignmentStudyKey(),reviewer_pid:REVIEWER_IDENTITY.reviewer_pid});if(!r||!r.ok)throw new Error((r&&r.error)||"Assignment service did not return an assignment.");return r;}
  async function markServerAssignmentComplete(plan){const a=plan&&plan.server_assignment;if(!a||!a.assignment_id||!a.assignment_token)return {ok:false,skipped:true};let last=null;for(let n=1;n<=3;n++){try{const r=await jsonpRequest(CFG.assignment_service_url,{action:"complete",study:a.study,assignment_id:a.assignment_id,token:a.assignment_token,reviewer_pid:REVIEWER_IDENTITY.reviewer_pid});if(r&&r.ok)return r;last=new Error((r&&r.error)||"Completion service call failed.");}catch(e){last=e;}await new Promise(r=>setTimeout(r,500*n));}throw last||new Error("Could not mark assignment complete.");}

  async function chooseDossier(dossierData) {
    const dossiers=dossierData.dossiers||[],byId=Object.fromEntries(dossiers.map(d=>[String(d.dossier_id),d]));
    const requested=URL_PARAMS.get("dossier_id")||URL_PARAMS.get("DOSSIER_ID");
    // Debug dossier overrides are allowed only outside real Prolific production sessions.
    // A production participant with a PROLIFIC_PID must always go through the assignment
    // service so PID-level duplicate protection cannot be bypassed.
    if(requested&&(PREVIEW_MODE||REVIEWER_IDENTITY.synthetic)&&byId[String(requested)])return {dossier:byId[String(requested)],assignment_method:"url_dossier_id_debug",reviewer_slot:null,slot_pair_index:null,server_assignment:null};
    const server=await requestServerAssignment(),dossier=byId[String(server.dossier_id)];
    if(!dossier)throw new Error(`Assignment service returned dossier_id=${server.dossier_id}, but it is not present in the uploaded dossier JSON.`);
    return {dossier,assignment_method:"google_apps_script_sequential_assignment",reviewer_slot:null,slot_pair_index:null,server_assignment:server};
  }

  async function makePlan(stimuli, dossierData) {
    const assignment = await chooseDossier(dossierData);
    const dossier = assignment.dossier;
    const policy = (stimuli.policies || []).find(p => p.policy_id === dossier.policy_id);
    if (!policy) throw new Error(`No matching policy found for dossier policy_id=${dossier.policy_id}`);
    const disclosure_condition = "role_disclosed";
    const defaultClaimOrder = (policy.claims || []).map(c => c.claim_id);
    const claim_order = Array.isArray(dossier.claim_order) && dossier.claim_order.length ? dossier.claim_order : defaultClaimOrder;
    const attachedFacts = Array.isArray(dossier.attached_facts) ? dossier.attached_facts : [];
    const fact_display_labels = Object.fromEntries(attachedFacts.map((f, i) => [f.fact_id, displayFactLabel(f.display_label || `${i + 1}`)]));
    return { policy, dossier, disclosure_condition, assignment_method: assignment.assignment_method, reviewer_slot: assignment.reviewer_slot, slot_pair_index: assignment.slot_pair_index, server_assignment: assignment.server_assignment, claim_order, attachedFacts, fact_display_labels };
  }

  function groupedClaimsForDisplay(plan) {
    const claimById = Object.fromEntries((plan.policy.claims || []).map(c => [c.claim_id, c]));
    const groups = { Pro: [], Con: [] };
    (plan.claim_order || []).forEach(cid => {
      const cl = claimById[cid]; if (!cl) return;
      if (String(cl.claim_valence_for_policy || "").toLowerCase() === "pro") groups.Pro.push(cl); else groups.Con.push(cl);
    });
    return groups;
  }
  function claimDisplayOrder(plan) { const g = groupedClaimsForDisplay(plan); return g.Pro.concat(g.Con).map(cl => cl.claim_id); }
  function claimDisplayIndex(plan) { const out = {}; claimDisplayOrder(plan).forEach((cid, i) => { out[cid] = i + 1; }); return out; }
  function claimsGroupedHtml(plan) {
    const displayIndex = claimDisplayIndex(plan);
    const groups = groupedClaimsForDisplay(plan);
    function renderGroup(label, arr, cls) {
      if (!arr.length) return "";
      return `<div class="sectionHeader ${cls}">${label}</div>` + arr.map(cl => `<div class="claimCard"><div class="claimTag">Disputed claim ${displayIndex[cl.claim_id]}</div><div class="claimText">${escapeClean(cl.claim_text)}</div></div>`).join("\n");
    }
    return renderGroup("Disputed claims that support the proposed policy", groups.Pro, "proPolicy") + renderGroup("Disputed claims that oppose the proposed policy", groups.Con, "conPolicy");
  }

  function consentScreen(jsPsych) {
    return {
      type: jsPsychHtmlButtonResponse,
      stimulus: `${BASE_CSS}<div class="page"><div class="title">Consent to Participate in Research</div><div class="box" style="max-height:360px; overflow-y:auto; background:#fff;"><div class="instructions" style="margin-top:0;"><p><b>Title of Research:</b> Computational Cognitive Science</p><p><b>Principal Investigator:</b> Thomas Griffiths, Department of Psychology, Princeton University</p><p>You are being invited to take part in a research study on human judgment and decision-making.</p><p>You will read about a policy proposal, review an argument written by another participant, and answer questions about the policy.</p><p>Risks are minimal. Participation is voluntary, and you may withdraw at any time.</p><p>By clicking <b>"I consent"</b>, you indicate that you voluntarily agree to participate.</p></div></div><div class="instructions" style="text-align:center;">Do you consent to participate in this study?</div></div>`,
      choices: ["I do NOT consent", "I consent"],
      on_finish: (data) => { data.page_type = "consent"; if (data.response === 0) jsPsych.endExperiment("No consent"); },
      data: { page_type: "consent" }
    };
  }
  function overviewScreen(jsPsych, plan) {
    const disclosed = plan && plan.disclosure_condition === "role_disclosed";
    const reviewSentence = disclosed
      ? "You will then review a short argument and several facts from another participant who was assigned to argue for or against the proposal."
      : "You will then review a short argument and several facts from another participant.";
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Overview", `<p>This is a study about political persuasion.</p><p>In this study, you will:</p><ul style="line-height:1.45; margin-top:0;"><li>Begin by reviewing some basic information about a policy proposal and answering several questions about the policy.</li><li>${reviewSentence.replace(/^You will then /, "Then ")}</li><li>Afterward, re-answer questions about the policy based on what you read, along with a few additional questions.</li></ul>`),
      on_load: () => addClickFinish(jsPsych, { page_type: "overview", disclosure_condition: plan ? plan.disclosure_condition : "" })
    };
  }
  function policyOverviewScreen(jsPsych, plan) {
    const p = plan.policy;
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: pageHtml(`<div class="s1Header"><div class="title">Policy Overview</div></div>${orientationLineHtml(plan)}<div class="policySummary"><div class="subtitle">Policy proposal</div><p>${escapeHtml(p.proposal_text)}</p><div class="subtitle" style="margin-top:12px;">Summary of the debate</div><p>${escapeHtml(p.debate_summary)}</p></div>${continueButtonHtml()}`), on_load: () => addClickFinish(jsPsych, { page_type: "policy_overview", policy_id: p.policy_id, dossier_id: plan.dossier.dossier_id }) };
  }
  function claimsOverviewScreen(jsPsych, plan) {
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: pageHtml(`<div class="s1Header"><div class="title">Disputed Claims About the Policy</div></div>${orientationLineHtml(plan)}<div class="instructions">The following are commonly disputed claims related to the proposed policy.</div>${claimsGroupedHtml(plan)}${continueButtonHtml()}`), on_load: () => addClickFinish(jsPsych, { page_type: "claims_overview", policy_id: plan.policy.policy_id, dossier_id: plan.dossier.dossier_id, claim_order: plan.claim_order }) };
  }
  function initialQuestionsTransitionScreen(jsPsych, plan) {
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: textPageHtml("Initial Questions", `<p>Before you review another participant's argument about this policy, we would like to know your initial views.</p>`), on_load: () => addClickFinish(jsPsych, { page_type: "initial_questions_transition", policy_id: plan.policy.policy_id, dossier_id: plan.dossier.dossier_id }) };
  }
  function reviewerDossierTransitionScreen(jsPsych, plan) {
    const d = plan.dossier;
    const roleText = d.advocate_position === "support" ? "supporting" : "opposing";
    const disclosed = plan.disclosure_condition === "role_disclosed";
    const assignmentBox = disclosed
      ? `<div class="box" style="max-width:860px; margin:12px auto; background:#fff; border-left:5px solid #aaa;"><div style="font-weight:900; margin-bottom:6px;">Other Participant's Assignment</div><div>The other participant was assigned to write an argument <b>${escapeHtml(roleText)}</b> the proposed policy and to select facts that would support that argument.</div></div>`
      : "";
    const intro = disclosed
      ? `<p>Next, you will review an argument written by another participant along with the facts they selected to share.</p>`
      : `<p>Next, you will review an argument written by another participant along with facts they included.</p>`;
    const body = `
      ${intro}
      <p>Each fact is based on a published authoritative source. You may click <b>View source</b> to learn more.</p>
      ${assignmentBox}
      <p>After reviewing these materials, you will be asked to update your assessments based on what you learned, so please review the argument and facts carefully.</p>
    `;
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: textPageHtml("Review an Argument", body), on_load: () => addClickFinish(jsPsych, { page_type: "reviewer_dossier_transition", policy_id: plan.policy.policy_id, dossier_id: d.dossier_id, disclosure_condition: plan.disclosure_condition, advocate_position: d.advocate_position }) };
  }
  function quantitativeQuestionsTransitionScreen(jsPsych, plan, phase) {
    const isPost = phase === "post";
    const title = isPost ? "Current Factual Estimates" : "Initial Factual Estimates";
    const body = isPost
      ? `<p>Finally, we would like your current best estimates of several real-world outcomes related to this policy.</p>`
      : `<p>Before reviewing the other participant's argument, we would like your best estimates of several measurable real-world outcomes related to this policy.</p><p>These questions ask about factual quantities rather than opinions. Some answers are objectively more accurate than others.</p>`;
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml(title, body),
      on_load: () => addClickFinish(jsPsych, { page_type: `${phase}_quantitative_questions_transition`, phase, policy_id: plan.policy.policy_id, dossier_id: plan.dossier.dossier_id })
    };
  }
  function finalQuestionsTransitionScreen(jsPsych, plan) {
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: textPageHtml("Final Questions", `<p>Thank you. We have just a few final questions before you finish the study.</p>`), on_load: () => addClickFinish(jsPsych, { page_type: "final_questions_transition", policy_id: plan.policy.policy_id, dossier_id: plan.dossier.dossier_id }) };
  }

  function postReviewInstruction(plan, kind) {
    const disclosed = plan && plan.disclosure_condition === "role_disclosed";
    const roleText = plan && plan.dossier && plan.dossier.advocate_position === "support" ? "support" : "oppose";
    if (kind === "claims") {
      return disclosed
        ? `Please give your current impression of how warranted each disputed claim is, taking into account the argument and facts you reviewed, as well as the fact that they were selected by a participant assigned to argue <b>${escapeHtml(roleText)}</b> the proposed policy.`
        : "Please give your current impression of how warranted each disputed claim is, taking into account the argument and facts you reviewed.";
    }
    if (kind === "policy") {
      return disclosed
        ? `Please indicate your current view of the proposed policy, taking into account the argument and facts you reviewed, as well as the fact that they were selected by a participant assigned to argue <b>${escapeHtml(roleText)}</b> the proposed policy.`
        : "Please indicate your current view of the proposed policy, taking into account the argument and facts you reviewed.";
    }
    if (kind === "quant") {
      return disclosed
        ? `Please provide your current best estimates of these real-world outcomes. Each estimate is grouped under the disputed claim to which it is most closely related. Please take into account the argument and facts you reviewed, as well as the fact that they were selected by a participant assigned to argue <b>${escapeHtml(roleText)}</b> the proposed policy.`
        : "Please provide your current best estimates of these real-world outcomes. Each estimate is grouped under the disputed claim to which it is most closely related. Please take into account the argument and facts you reviewed.";
    }
    return "";
  }
  function postQuestionsTransitionScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: textPageHtml("Reconsider Your Views", `<p>You have now finished reviewing the other participant's argument and the facts included with it.</p><p>Next, we will ask you to answer some of the same questions again so we can understand how, if at all, your views changed after reviewing these materials.</p>`),
      on_load: () => addClickFinish(jsPsych, { page_type: "post_questions_transition", policy_id: plan.policy.policy_id, dossier_id: plan.dossier.dossier_id })
    };
  }
  function claimWarrantedScreen(jsPsych, plan, phase) {
    const p = plan.policy;
    const claimById = Object.fromEntries((p.claims || []).map(c => [c.claim_id, c]));
    const displayIndex = claimDisplayIndex(plan);
    const title = phase === "pre" ? "Initial Views About the Disputed Claims" : "Current Views About the Disputed Claims";
    const draft = (plan.post_review_drafts && plan.post_review_drafts.claim_warranted) || {};
    const rows = claimDisplayOrder(plan).map(cid => {
      const cl = claimById[cid] || {};
      const cls = String(cl.claim_valence_for_policy).toLowerCase() === "pro" ? "pillPro" : "pillCon";
      const val = phase === "post" && draft[cid] !== undefined ? ` value="${escapeHtml(draft[cid])}"` : "";
      return `<div class="probRow"><div class="sliderPrompt"><div class="claimTag"><span class="sidePill ${cls}">${escapeHtml(valenceLabel(cl.claim_valence_for_policy))}</span> Disputed claim ${displayIndex[cid]}</div><div class="claimText">${escapeClean(cl.claim_text)}</div></div><div class="probInputBox"><input class="probInput warrantInput" type="number" min="0" max="100" step="1" placeholder="0–100" data-claim_id="${escapeHtml(cid)}"${val}></div></div>`;
    }).join("\n");
    const instructions = phase === "pre" ? "Please give your initial impression of how warranted each disputed claim is." : postReviewInstruction(plan, "claims");
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: pageHtml(`<div class="s1Header"><div class="title">${escapeHtml(title)}</div></div>${orientationLineHtml(plan)}<div class="instructions">${phase === "post" ? instructions : escapeHtml(instructions)}</div><div class="box" style="max-width:860px; margin:10px auto 12px; background:#fff;"><b>Scale:</b> 0 = not warranted at all; 100 = completely warranted.</div><div class="probList">${rows}</div>${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}`), on_load: () => {
      const inputs = Array.from(document.querySelectorAll(".warrantInput")); const go = document.getElementById("go");
      function valid(x){ if(PREVIEW_MODE && String(x.value||"").trim()==="") return true; const v=Number(x.value); return String(x.value||"").trim()!=="" && Number.isFinite(v)&&v>=0&&v<=100; }
      function updateGate(){ if(go) go.disabled=!inputs.every(valid); } inputs.forEach(x=>x.addEventListener("input",updateGate)); updateGate();
      go.addEventListener("click",()=>{ const responses=inputs.map(x=>{ const cl=claimById[x.dataset.claim_id]||{}; return { page_type:`${phase}_claim_warranted_row`, phase, policy_id:p.policy_id, dossier_id:plan.dossier.dossier_id, claim_id:x.dataset.claim_id, claim_text:cl.claim_text||"", response:numberOrNull(x.value) };}); responses.forEach(r=>writeDataRow(jsPsych,r)); jsPsych.finishTrial({ page_type:`${phase}_claim_warranted`, phase, policy_id:p.policy_id, dossier_id:plan.dossier.dossier_id, responses }); });
    }};
  }

  function policySupportScreen(jsPsych, plan, phase) {
    const p = plan.policy;
    const title = phase === "pre" ? "Initial Policy View" : "Current Policy View";
    const draft = (plan.post_review_drafts && plan.post_review_drafts.policy_support) || {};
    const ownVal = phase === "post" && draft.own_support !== undefined ? ` value="${escapeHtml(draft.own_support)}"` : "";
    const instructions = phase === "post" ? postReviewInstruction(plan, "policy") : "Please indicate your current view of the proposed policy.";
    return { type: jsPsychHtmlKeyboardResponse, choices: "NO_KEYS", stimulus: pageHtml(`<div class="s1Header"><div class="title">${escapeHtml(title)}</div></div>${orientationLineHtml(plan)}<div class="instructions">${phase === "post" ? instructions : escapeHtml(instructions)}</div><div class="policySummary"><b>${escapeHtml(p.proposal_text)}</b></div><div class="probList"><div class="probRow"><div class="sliderPrompt">Overall, do you support or oppose this policy?</div><div class="probInputBox"><input id="own_support" class="probInput" type="number" min="0" max="100" step="1" placeholder="0–100"${ownVal}><div class="probInputHint">0 = strongly oppose; 100 = strongly support</div></div></div></div>${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}`), on_load: () => {
      const input=document.getElementById("own_support"); const go=document.getElementById("go");
      function valid(x){ if(PREVIEW_MODE && String(x.value||"").trim()==="") return true; const v=Number(x.value); return String(x.value||"").trim()!=="" && Number.isFinite(v)&&v>=0&&v<=100; }
      function updateGate(){ if(go) go.disabled=!valid(input); } input.addEventListener("input",updateGate); updateGate();
      go.addEventListener("click",()=>jsPsych.finishTrial({ page_type:`${phase}_policy_support`, phase, policy_id:p.policy_id, dossier_id:plan.dossier.dossier_id, advocate_position:plan.dossier.advocate_position, disclosure_condition:plan.disclosure_condition, own_policy_support:numberOrNull(input.value) }));
    }};
  }

  function quantBeliefScreen(jsPsych, plan, phase) {
    const p = plan.policy; const claimById=Object.fromEntries((p.claims||[]).map(c=>[c.claim_id,c])); const displayIndex=claimDisplayIndex(plan);
    const draft = (plan.post_review_drafts && plan.post_review_drafts.quant_beliefs) || {};
    function renderQuestion(claim,q,idx){
      const min=q.allowed_min==null?"":q.allowed_min; const max=q.allowed_max==null?"":q.allowed_max;
      const qText=cleanParticipantText(q.question_text||"").replace(/Click here to see (the source and assumptions that will be used for benchmarking|how the correct answer is determined)\.?/gi,"").trim();
      const draftKey = `${claim.claim_id}||${q.question_id}`;
      const val = phase === "post" && draft[draftKey] !== undefined ? ` value="${escapeHtml(draft[draftKey])}"` : "";
      return `<div class="probRow"><div class="sliderPrompt"><div>${escapeClean(qText)}</div></div><div class="probInputBox"><input class="probInput quantInput" type="number" step="any" min="${escapeHtml(min)}" max="${escapeHtml(max)}" placeholder="${escapeHtml(min)}–${escapeHtml(max)}" data-claim_id="${escapeHtml(claim.claim_id)}" data-question_id="${escapeHtml(q.question_id)}"${val}><div class="probInputHint">${escapeClean(q.units_label||"numeric answer")}</div></div></div>`;
    }
    let qCounter=0; const sections=claimDisplayOrder(plan).map(cid=>{ const cl=claimById[cid]; if(!cl||!(cl.quantitative_questions||[]).length) return ""; const rows=(cl.quantitative_questions||[]).map(q=>renderQuestion(cl,q,qCounter++)).join("\n"); return `<div class="quantClaimBlock"><div class="quantClaimHeader"><div class="claimTag">Disputed claim ${displayIndex[cid]}</div><div class="claimText">${escapeClean(cl.claim_text||"")}</div></div>${rows}</div>`; }).join("\n");
    const title = phase === "pre" ? "Initial Factual Estimates" : "Current Factual Estimates";
    const instructions = phase === "post" ? postReviewInstruction(plan, "quant") : "Please provide your initial best estimates of these real-world outcomes. Each estimate is grouped under the disputed claim to which it is most closely related.";
    return { type: jsPsychHtmlKeyboardResponse, choices:"NO_KEYS", stimulus: pageHtml(`<div class="s1Header"><div class="title">${escapeHtml(title)}</div></div>${orientationLineHtml(plan)}<div class="instructions">${phase === "post" ? instructions : escapeHtml(instructions)}</div><div class="probList">${sections}</div>${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}`), on_load:()=>{
      const inputs=Array.from(document.querySelectorAll(".quantInput")); const go=document.getElementById("go");
      function valid(x){ if(PREVIEW_MODE && String(x.value||"").trim()==="") return true; const v=Number(x.value), min=Number(x.min), max=Number(x.max); return String(x.value||"").trim()!=="" && Number.isFinite(v) && (!Number.isFinite(min)||v>=min) && (!Number.isFinite(max)||v<=max); }
      function updateGate(){ if(go) go.disabled=!inputs.every(valid); } inputs.forEach(x=>x.addEventListener("input",updateGate)); updateGate();
      go.addEventListener("click",()=>{ const responses=inputs.map(x=>{ const claim_id=x.dataset.claim_id; const question_id=x.dataset.question_id; const cl=claimById[claim_id]||{}; const q=(cl.quantitative_questions||[]).find(z=>z.question_id===question_id)||{}; const response=numberOrNull(x.value), benchmark=numberOrNull(q.benchmark_value); return { page_type:`${phase}_quant_belief_row`, phase, policy_id:p.policy_id, dossier_id:plan.dossier.dossier_id, claim_id, question_id, claim_text:cl.claim_text||"", question_text:q.question_text||"", response, units_label:q.units_label||"", allowed_min:q.allowed_min, allowed_max:q.allowed_max, benchmark_value:benchmark, benchmark_units:q.benchmark_units||"", abs_error: response!==null&&benchmark!==null?Math.abs(response-benchmark):null, higher_value_supports_claim:q.higher_value_supports_claim, higher_value_supports_policy:q.higher_value_supports_policy }; }); responses.forEach(r=>writeDataRow(jsPsych,r)); jsPsych.finishTrial({ page_type:`${phase}_quant_beliefs`, phase, policy_id:p.policy_id, dossier_id:plan.dossier.dossier_id, responses }); });
    }};
  }


  function factsGroupedHtml(plan) {
    const byClaim = {};
    (plan.attachedFacts || []).forEach(f => {
      const cid = f.claim_id || "uncategorized";
      byClaim[cid] = byClaim[cid] || [];
      byClaim[cid].push(f);
    });
    const claimById = Object.fromEntries((plan.policy.claims || []).map(c => [c.claim_id, c]));
    const displayIndex = claimDisplayIndex(plan);
    const proClaims = [], conClaims = [];
    claimDisplayOrder(plan).forEach(cid => {
      const cl = claimById[cid];
      if (!cl || !byClaim[cid] || !byClaim[cid].length) return;
      if (String(cl.claim_valence_for_policy).toLowerCase() === "pro") proClaims.push(cl);
      else conClaims.push(cl);
    });
    function factCard(f) {
      const fidSafe = safeId(f.fact_id);
      const sideLabel = factClaimSide(f) === "supports_claim" ? "Supports claim" : factClaimSide(f) === "opposes_claim" ? "Opposes claim" : "Information";
      return `<div class="factCard requiredFactCard" data-fact_id="${escapeHtml(f.fact_id)}" data-label="${escapeHtml(displayFactLabel(f.display_label || "Fact"))}">
        <div class="factHeader">
          <div class="factTitle">${escapeHtml(displayFactLabel(f.display_label || "Fact"))} <span class="sidePill">${escapeHtml(sideLabel)}</span></div>
          <button type="button" class="btn small openFactBtn" data-target="fact_body_${fidSafe}" data-fact_id="${escapeHtml(f.fact_id)}">Open fact</button>
        </div>
        <div id="fact_body_${fidSafe}" class="factBody" style="display:none;">
          <div class="factText">${escapeClean(f.fact_text || "")}</div>
          <div class="factFooter"><button type="button" class="btn small sourceBtn" data-target="src_${fidSafe}">View source</button></div>
          <div id="src_${fidSafe}" class="sourceBody"><b>Source:</b> ${escapeClean(f.source_name || "")}${f.source_url ? `<br>${escapeClean(f.source_url)}` : ""}</div>
        </div>
      </div>`;
    }
    function renderClaims(claims) {
      return claims.map(cl => `<div class="claimCard"><div class="claimTag">Disputed claim ${displayIndex[cl.claim_id]}</div><div class="claimText">${escapeClean(cl.claim_text)}</div>${(byClaim[cl.claim_id] || []).map(factCard).join("\n")}</div>`).join("\n");
    }
    const panels = [];
    if (conClaims.length) panels.push(`<div class="evidencePanel opposePanel"><div class="evidencePanelTitle">Disputed claims that oppose the policy</div>${renderClaims(conClaims)}</div>`);
    if (proClaims.length) panels.push(`<div class="evidencePanel supportPanel"><div class="evidencePanelTitle">Disputed claims that support the policy</div>${renderClaims(proClaims)}</div>`);
    if (!panels.length) return `<div class="muted">The participant did not include any facts.</div>`;
    return `<div class="evidenceGrid">${panels.join("\n")}</div>`;
  }

  function dossierReviewScreen(jsPsych, plan) {
    const d = plan.dossier;
    const enforceReview = !plan.dossier_initial_review_complete;
    const requiredArgMs = 5000;
    const requiredFactMs = 2000;
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">Review the Argument</div></div>
        ${orientationLineHtml(plan, true)}
        <div class="instructions" style="max-width:980px; margin-left:auto; margin-right:auto;">
          Please open and review each fact and the participant's argument before continuing. Only one item will be open at a time.
        </div>
        <div class="dossierDoc">
          <div class="dossierSectionTitle">Facts included with the argument</div>
          ${(plan.attachedFacts || []).length ? factsGroupedHtml(plan) : `<div class="muted">The participant did not include any facts.</div>`}
          <hr class="dossierDivider">
          <div class="dossierSectionTitle">Participant's argument</div>
          <div class="factCard argumentCard" data-component="argument">
            <div class="factHeader">
              <div class="factTitle">Participant's argument</div>
              <button type="button" id="openArgumentBtn" class="btn small">Open argument</button>
            </div>
            <div id="argumentBody" class="argumentBody" style="display:none;">
              <div class="argumentText">${escapeClean(d.argument_text || "")}</div>
            </div>
          </div>
        </div>
        <div id="reviewProgress" class="reviewProgressBox">
          Please continue reviewing the remaining item(s). Continue will become available automatically once each item has been reviewed for long enough.
        </div>
        ${continueButtonHtml("Continue", { disabled: enforceReview })}
      `),
      on_load: () => {
        const go = document.getElementById("go");
        const progress = document.getElementById("reviewProgress");
        const argBtn = document.getElementById("openArgumentBtn");
        const argBody = document.getElementById("argumentBody");
        const factButtons = Array.from(document.querySelectorAll(".openFactBtn"));
        const factIds = (plan.attachedFacts || []).map(f => String(f.fact_id));
        const factLabels = Object.fromEntries((plan.attachedFacts || []).map(f => [String(f.fact_id), displayFactLabel(f.display_label || f.fact_id || "Fact")]));
        const reviewState = {
          argument: { open: false, openedOnce: false, openCount: 0, totalOpenMs: 0, lastOpenMs: null, requirementMet: !enforceReview },
          facts: Object.fromEntries(factIds.map(fid => [fid, { open: false, openedOnce: false, openCount: 0, totalOpenMs: 0, lastOpenMs: null, requirementMet: !enforceReview, display_label: factLabels[fid] || fid }]))
        };
        const interval = setInterval(updateProgress, 250);

        function elapsedMs(item) {
          return item.totalOpenMs + (item.open && item.lastOpenMs !== null ? Math.max(0, performance.now() - item.lastOpenMs) : 0);
        }
        function formatSeconds(ms) { return Math.max(0, Math.ceil(ms / 1000)); }
        function updateProgress() {
          const argElapsed = elapsedMs(reviewState.argument);
          if (argElapsed >= requiredArgMs) reviewState.argument.requirementMet = true;
          Object.keys(reviewState.facts).forEach(fid => {
            if (elapsedMs(reviewState.facts[fid]) >= requiredFactMs) reviewState.facts[fid].requirementMet = true;
          });
          const factsDone = Object.values(reviewState.facts).filter(x => x.requirementMet).length;
          const factsTotal = Object.keys(reviewState.facts).length;
          const argDone = reviewState.argument.requirementMet;
          const allDone = argDone && factsDone === factsTotal;
          if (progress) {
            if (enforceReview && allDone) {
              progress.style.display = "none";
            } else {
              progress.style.display = "block";
              progress.innerHTML = enforceReview
                ? `Reviewed: argument ${argDone ? "1/1" : "0/1"}; facts ${factsDone}/${factsTotal}. Please continue reviewing the remaining item(s). Continue will become available automatically once each item has been reviewed for long enough.`
                : `You may continue when ready.`;
            }
          }
          if (go && enforceReview) go.disabled = !allDone;
        }
        function openItem(item) {
          if (!item.open) {
            item.open = true;
            item.openedOnce = true;
            item.openCount += 1;
            item.lastOpenMs = performance.now();
          }
        }
        function closeItem(item) {
          if (item.open && item.lastOpenMs !== null) {
            item.totalOpenMs += Math.max(0, performance.now() - item.lastOpenMs);
            item.lastOpenMs = null;
            item.open = false;
          }
        }
        function closeArgument() {
          closeItem(reviewState.argument);
          if (argBody) argBody.style.display = "none";
          if (argBtn) argBtn.textContent = "Open argument";
        }
        if (argBtn && argBody) {
          argBtn.addEventListener("click", () => {
            const hidden = argBody.style.display !== "block";
            if (hidden) {
              Object.keys(reviewState.facts).forEach(closeFactById);
              argBody.style.display = "block";
              argBtn.textContent = "Close argument";
              openItem(reviewState.argument);
            }
            else {
              closeArgument();
            }
            updateProgress();
          });
        }
        function closeFactById(fid) {
          const st = reviewState.facts[fid];
          const otherBtn = factButtons.find(b => String(b.dataset.fact_id || "") === fid);
          const otherBody = otherBtn ? document.getElementById(otherBtn.dataset.target) : null;
          if (st) closeItem(st);
          if (otherBody) {
            otherBody.style.display = "none";
            otherBody.querySelectorAll(".sourceBody").forEach(src => { src.style.display = "none"; });
            otherBody.querySelectorAll(".sourceBtn").forEach(srcBtn => { srcBtn.textContent = "View source"; });
          }
          if (otherBtn) otherBtn.textContent = "Open fact";
        }
        factButtons.forEach(btn => btn.addEventListener("click", () => {
          const fid = String(btn.dataset.fact_id || "");
          const body = document.getElementById(btn.dataset.target);
          const item = reviewState.facts[fid];
          if (!body || !item) return;
          const hidden = body.style.display !== "block";
          if (hidden) {
            closeArgument();
            Object.keys(reviewState.facts).forEach(otherFid => { if (otherFid !== fid) closeFactById(otherFid); });
            body.style.display = "block";
            btn.textContent = "Close fact";
            openItem(item);
          } else {
            closeFactById(fid);
          }
          updateProgress();
        }));
        document.querySelectorAll(".sourceBtn").forEach(btn => btn.addEventListener("click", () => {
          const el = document.getElementById(btn.dataset.target);
          if (!el) return;
          const hidden = el.style.display !== "block";
          el.style.display = hidden ? "block" : "none";
          btn.textContent = hidden ? "Hide source" : "View source";
        }));
        if (go) go.addEventListener("click", () => {
          closeItem(reviewState.argument);
          Object.values(reviewState.facts).forEach(closeItem);
          clearInterval(interval);
          updateProgress();
          const factsReview = Object.fromEntries(Object.entries(reviewState.facts).map(([fid, st]) => [fid, {
            display_label: st.display_label,
            opened_once: st.openedOnce,
            open_count: st.openCount,
            total_open_ms: Math.round(elapsedMs(st)),
            requirement_met: st.requirementMet
          }]));
          plan.dossier_initial_review_complete = true;
          jsPsych.finishTrial({
            page_type: "dossier_review",
            policy_id: plan.policy.policy_id,
            dossier_id: d.dossier_id,
            advocate_position: d.advocate_position,
            disclosure_condition: plan.disclosure_condition,
            argument_word_count: d.argument_word_count,
            attached_fact_ids: (plan.attachedFacts || []).map(f => f.fact_id),
            dossier_review_requirement_enforced: enforceReview,
            argument_opened_once: reviewState.argument.openedOnce,
            argument_open_count: reviewState.argument.openCount,
            argument_total_open_ms: Math.round(elapsedMs(reviewState.argument)),
            argument_requirement_met: reviewState.argument.requirementMet,
            facts_review_summary: factsReview
          });
        });
        updateProgress();
      }
    };
  }

  function demographicsScreen(jsPsych, plan) {
    return { type: jsPsychHtmlKeyboardResponse, choices:"NO_KEYS", stimulus: pageHtml(`<div class="s1Header"><div class="title">Background Questions</div></div><div class="instructions">Finally, please answer a few background questions. You may choose “Prefer not to answer.”</div><div class="demoGrid"><div class="demoItem"><label>Age</label><input id="age" type="number" min="18" max="100" placeholder="Age"></div><div class="demoItem"><label>Gender</label><select id="gender"><option value="">Select...</option><option>Woman</option><option>Man</option><option>Non-binary</option><option>Other</option><option>Prefer not to answer</option></select></div><div class="demoItem"><label>Race/ethnicity</label><select id="race"><option value="">Select...</option><option>White</option><option>Black or African American</option><option>Hispanic or Latino</option><option>Asian or Asian American</option><option>Native American or Alaska Native</option><option>Middle Eastern or North African</option><option>Multiracial</option><option>Other</option><option>Prefer not to answer</option></select></div><div class="demoItem"><label>Education</label><select id="education"><option value="">Select...</option><option>Less than high school</option><option>High school diploma or GED</option><option>Some college</option><option>Associate degree</option><option>Bachelor's degree</option><option>Graduate or professional degree</option><option>Prefer not to answer</option></select></div><div class="demoItem"><label>Political party identification</label><select id="party"><option value="">Select...</option><option>Strong Democrat</option><option>Not very strong Democrat</option><option>Independent, lean Democrat</option><option>Independent</option><option>Independent, lean Republican</option><option>Not very strong Republican</option><option>Strong Republican</option><option>Other party</option><option>Prefer not to answer</option></select></div><div class="demoItem"><label>Political ideology</label><select id="ideology"><option value="">Select...</option><option>Very liberal</option><option>Liberal</option><option>Moderate</option><option>Conservative</option><option>Very conservative</option><option>Prefer not to answer</option></select></div></div>${continueButtonHtml("Continue")}`), on_load:()=>{ document.getElementById("go").addEventListener("click",()=>jsPsych.finishTrial({ page_type:"demographics", policy_id:plan.policy.policy_id, dossier_id:plan.dossier.dossier_id, age:numberOrNull(document.getElementById("age").value), gender:document.getElementById("gender").value, race_ethnicity:document.getElementById("race").value, education:document.getElementById("education").value, party_id:document.getElementById("party").value, ideology:document.getElementById("ideology").value })); }};
  }

  function disclosureManipulationCheckScreen(jsPsych, plan) {
    const options = [
      { value: "support", label: "They were assigned to write an argument supporting the proposed policy." },
      { value: "oppose", label: "They were assigned to write an argument opposing the proposed policy." },
      { value: "honest_opinion", label: "They were assigned to write an argument expressing their honest opinion about the policy." },
      { value: "dont_remember", label: "I don’t remember." }
    ];
    const rows = options.map((opt, i) => `
      <label class="checkItem" style="display:block; margin:10px 0; cursor:pointer;">
        <input type="radio" name="manip_assignment" value="${escapeHtml(opt.value)}" data-label="${escapeHtml(opt.label)}"> ${escapeHtml(opt.label)}
      </label>`).join("\n");
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="s1Header"><div class="title">Final Question</div></div>
        <div class="instructions" style="max-width:860px; margin-left:auto; margin-right:auto;">
          <p><b>At the beginning of the review, you were told that the other participant had been assigned a particular role. What role were they assigned?</b></p>
          <div class="box" style="background:#fff;">${rows}</div>
        </div>
        ${continueButtonHtml("Continue", { disabled: !PREVIEW_MODE })}
      `),
      on_load: () => {
        const go = document.getElementById("go");
        const inputs = Array.from(document.querySelectorAll('input[name="manip_assignment"]'));
        function updateGate() { if (go && !PREVIEW_MODE) go.disabled = !inputs.some(x => x.checked); }
        inputs.forEach(x => x.addEventListener("change", updateGate));
        updateGate();
        if (go) go.addEventListener("click", () => {
          const chosen = inputs.find(x => x.checked);
          const response = chosen ? chosen.value : "";
          jsPsych.finishTrial({
            page_type: "disclosure_manipulation_check",
            policy_id: plan.policy.policy_id,
            dossier_id: plan.dossier.dossier_id,
            advocate_position: plan.dossier.advocate_position,
            disclosure_condition: plan.disclosure_condition,
            question_variant: "role_recall",
            correct_response: plan.dossier.advocate_position === "support" ? "support" : "oppose",
            response,
            correct: response ? response === (plan.dossier.advocate_position === "support" ? "support" : "oppose") : null
          });
        });
      }
    };
  }
  function feedbackScreen(jsPsych) { return { type: jsPsychHtmlKeyboardResponse, choices:"NO_KEYS", stimulus: pageHtml(`<div class="title">Thank you</div><div class="instructions">If you have feedback—anything confusing, any technical issues, or anything we should improve—you can share it below.</div><div class="box" style="background:#fff;"><textarea id="fb" placeholder="Feedback..."></textarea></div>${continueButtonHtml("Continue")}`), on_load:()=>document.getElementById("go").addEventListener("click",()=>jsPsych.finishTrial({ page_type:"end_feedback", feedback:document.getElementById("fb").value||"" }))}; }
  function prolificEndScreen(jsPsych, plan) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      choices: "NO_KEYS",
      stimulus: pageHtml(`
        <div class="title">All done</div>
        <div class="instructions">
          <div id="completionStatus">Saving your completion…</div>
          <div id="completionCodeBlock" style="display:none;">
            <p>Your completion code is:</p>
            <div style="margin:12px 0 16px 0;">
              <span style="font-size:18px; padding:10px 12px; border:1px solid #ddd; border-radius:12px; background:#fafafa; display:inline-block; letter-spacing:.06em;">
                ${escapeHtml(CFG.prolific_completion_code)}
              </span>
            </div>
            <p>Click Continue to return to Prolific.</p>
          </div>
        </div>
        ${continueButtonHtml("Continue", { disabled: true })}
      `),
      on_load: async () => {
        const go = document.getElementById("go");
        const status = document.getElementById("completionStatus");
        const codeBlock = document.getElementById("completionCodeBlock");

        let serviceResult = null;
        let serviceError = null;

        try {
          serviceResult = await markServerAssignmentComplete(plan);
        } catch (err) {
          serviceError = err;
        }

        writeDataRow(jsPsych, {
          page_type: "assignment_service_completion",
          dossier_id: plan.dossier.dossier_id,
          assignment_study_key: effectiveAssignmentStudyKey(),
          assignment_id: plan.server_assignment ? plan.server_assignment.assignment_id : null,
          review_number: plan.server_assignment ? plan.server_assignment.review_number : null,
          assignment_service_ok: serviceResult && serviceResult.ok ? 1 : 0,
          assignment_service_status: serviceResult && serviceResult.status ? serviceResult.status : "",
          assignment_service_error: serviceError ? String(serviceError && serviceError.message || serviceError) : ""
        });

        if (serviceResult && serviceResult.ok) {
          if (status) status.textContent = "Your completion has been saved.";
        } else {
          if (status) {
            status.innerHTML =
              "We could not confirm the assignment automatically. Your study responses are still recorded. " +
              "Please copy the completion code below before returning to Prolific.";
          }
        }

        if (codeBlock) codeBlock.style.display = "block";
        if (go) {
          go.disabled = false;
          go.addEventListener("click", () => {
            jsPsych.finishTrial({
              page_type: "prolific_end",
              prolific_completion_code: CFG.prolific_completion_code,
              assignment_service_ok: serviceResult && serviceResult.ok ? 1 : 0,
              assignment_service_error: serviceError ? String(serviceError && serviceError.message || serviceError) : ""
            });
            try { window.location.href = PROLIFIC_REDIRECT_URL; } catch (_) {}
          });
        }
      }
    };
  }

  async function main() {
    try {
      const stim = await loadStimuli();
      const dossierData = await loadDossiers();
      const plan = await makePlan(stim, dossierData);
      const jsPsych = initJsPsych({ show_progress_bar: CFG.show_progress_bar, auto_update_progress_bar: true, on_finish: () => { try { console.log(jsPsych.data.get().values()); } catch (_) {} } });
      addDataProperties(jsPsych, {
        study_id: CFG.study_id, js_version: CFG.js_version, stimuli_file: CFG.stimuli_path, reviewer_dossiers_file: CFG.reviewer_dossiers_path,
        preview_mode: PREVIEW_MODE, prolific_pid: URL_PARAMS.get("PROLIFIC_PID") || "", study_id_param: URL_PARAMS.get("STUDY_ID") || "", session_id_param: URL_PARAMS.get("SESSION_ID") || "",
        selected_policy_id: plan.policy.policy_id, selected_policy_name: plan.policy.policy_name, dossier_id: plan.dossier.dossier_id, reviewer_slot: plan.reviewer_slot, slot_pair_index: plan.slot_pair_index,
        assignment_method: plan.assignment_method, assignment_study_key: effectiveAssignmentStudyKey(), assignment_id: plan.server_assignment ? plan.server_assignment.assignment_id : null, assignment_reused_existing: plan.server_assignment && plan.server_assignment.reused_existing_assignment ? 1 : 0, assignment_reuse_reason: plan.server_assignment ? (plan.server_assignment.assignment_reuse_reason || "") : "", disclosure_condition: plan.disclosure_condition, advocate_position: plan.dossier.advocate_position, advocate_prolific_pid: plan.dossier.advocate_prolific_pid,
        claim_order: plan.claim_order, attached_fact_ids: (plan.attachedFacts||[]).map(f=>f.fact_id)
      });
      writeDataRow(jsPsych, {
        page_type:"reviewer_assignment",
        policy_id:plan.policy.policy_id,
        dossier_id:plan.dossier.dossier_id,
        assignment_id:plan.server_assignment ? plan.server_assignment.assignment_id : null,
        review_number:plan.server_assignment ? plan.server_assignment.review_number : null,
        assignment_study_key:effectiveAssignmentStudyKey(),
        assignment_method:plan.assignment_method,
        assignment_reused_existing:plan.server_assignment && plan.server_assignment.reused_existing_assignment ? 1 : 0,
        assignment_reuse_reason:plan.server_assignment ? (plan.server_assignment.assignment_reuse_reason || "") : "",
        disclosure_condition:plan.disclosure_condition,
        advocate_position:plan.dossier.advocate_position,
        advocate_prolific_pid:plan.dossier.advocate_prolific_pid || null,
        argument_word_count:plan.dossier.argument_word_count,
        attached_fact_ids:(plan.attachedFacts||[]).map(f=>f.fact_id),
        claim_order:plan.claim_order,
        assigned_at_iso:plan.server_assignment ? plan.server_assignment.assigned_at_iso : null,
        reviewer_pid_effective:REVIEWER_IDENTITY.reviewer_pid,
        reviewer_pid_source:REVIEWER_IDENTITY.source,
        synthetic_reviewer_pid:REVIEWER_IDENTITY.synthetic ? 1 : 0
      });
      const timeline = [
        consentScreen(jsPsych), overviewScreen(jsPsych, plan), policyOverviewScreen(jsPsych, plan), claimsOverviewScreen(jsPsych, plan), initialQuestionsTransitionScreen(jsPsych, plan),
        ...(CFG.ask_claim_warranted ? [claimWarrantedScreen(jsPsych, plan, "pre")] : []),
        policySupportScreen(jsPsych, plan, "pre"),
        quantitativeQuestionsTransitionScreen(jsPsych, plan, "pre"),
        quantBeliefScreen(jsPsych, plan, "pre"),
        reviewerDossierTransitionScreen(jsPsych, plan), dossierReviewScreen(jsPsych, plan),
        postQuestionsTransitionScreen(jsPsych, plan),
        ...(CFG.ask_claim_warranted ? [claimWarrantedScreen(jsPsych, plan, "post")] : []),
        policySupportScreen(jsPsych, plan, "post"),
        quantitativeQuestionsTransitionScreen(jsPsych, plan, "post"),
        quantBeliefScreen(jsPsych, plan, "post"),
        demographicsScreen(jsPsych, plan), disclosureManipulationCheckScreen(jsPsych, plan), feedbackScreen(jsPsych), prolificEndScreen(jsPsych, plan)
      ];
      jsPsych.run(timeline);
    } catch (err) { showFatalError(err); }
  }
  function startStudy() { if (document.body && !document.body.innerHTML.trim()) document.body.innerHTML = '<div style="font-family: Arial, sans-serif; padding:16px;">Loading…</div>'; main(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startStudy); else startStudy();
})();
