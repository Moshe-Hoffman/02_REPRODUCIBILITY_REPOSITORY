/*
TRUNCATION STUDY – cognition.run (jsPsych 8.x) – Version 9.7
Created: 2026-03-04 09:15:56 UTC-05:00
Edits since prior version:
- Boxes: removed Sample size from Block 1 info/generator boxes.
- Boxes: removed Cutoff value from Block 1 and Block 2 boxes (still shown in Block 3 boxes where applicable).

NOTE: Toggle PREVIEW_MODE below. Preview-only UI is suppressed when PREVIEW_MODE=false.
*/


/********************
 * SECTION A: STIMULI / CONFIG LAYER (NO HTML, NO COPY)
 ********************/
const CFG = Object.freeze({
 AXIS_MIN: 0,
 AXIS_MAX: 500,
 MACHINE: Object.freeze({
  HIGH_MEAN: 270,
  LOW_MEAN: 230,
  SD: 50,
 }),
 BLOCKS: Object.freeze({
  1: Object.freeze({
   rounds: 10,
   n_fixed: 5,
   cutoff_fixed: 250,
   cutoff_known: true,
   show_sample_size_in_round: true,
  }),
  2: Object.freeze({
   rounds: 10,
   geom_p: 0.2,
   cutoff_fixed: 250,
   cutoff_known: true,
   show_sample_size_in_round: false,
  }),
  3: Object.freeze({
   rounds: 10,
   geom_p: 0.2,
   cutoff_uniform_min: 230,
   cutoff_uniform_max: 270,
   cutoff_known: false,
   show_sample_size_in_round: false,
  }),
 }),
 RULES: Object.freeze({
  ONLY_LOW: 'Only Low',
  ONLY_HIGH: 'Only High',
  RANDOM_DROP: 'Random Drop',
  RANDOM_DROP_P: 1/3,
 }),

 END: Object.freeze({
  // Set these for your deployment (e.g., Prolific completion URL).
  // If redirect_url is empty, the end page will display the completion code (if provided) and instruct the participant to close the window.
  redirect_url: "https://app.prolific.com/submissions/complete?cc=C1379C4O",
  completion_code: "C1379C4O",
 }),
});

/********************
 * SECTION B: COPY LAYER (ALL PARTICIPANT-FACING TEXT)
 ********************/
const COPY = Object.freeze({
 GENERAL: Object.freeze({
  overview_h: 'Overview',
  overview_time: 'Most people take about 10–15 minutes to complete the study.',
  overview_p1: 'This study is about how people make judgments when the information they see may be censored.',
  overview_p2: 'On each of 30 rounds, numbers will be sampled from one of two machines.',
  overview_p3: 'You will see a record of these numbers. However, the record may omit some of the numbers, according to one of three Censoring Rules.',
  overview_p4: 'Your job will be to estimate the probability that the record came from the High Machine, based on the numbers you see and the Censoring Rule.',

  blocks_h: 'Overview: The Blocks',
  blocks_p1: 'The task will be split up into three blocks. Each block involves 10 rounds of the same basic judgment task, but the sampling and Censoring Rules may differ.',
  blocks_p2: 'At the beginning of each block, you will be told the details about how that block will work, and given the opportunity to view as many examples as you would like before proceeding to the actual rounds.',

  t_to_b1: 'We are now ready for the instructions to Block 1.',
  t_to_b2: 'We are now ready for Block 2.',
  t_to_b3: 'We are now ready for Block 3.',
  t_b1_to_r: 'We are now ready for rounds 1–10.',
  t_b2_to_r: 'We are now ready for rounds 11–20.',
  t_b3_to_r: 'We are now ready for rounds 21–30.',
 }),

 BLOCK: Object.freeze({
  1: Object.freeze({
   sub: 'Block 1',
   p1_h: 'Instructions: The Two Machines',
   p1_p1: 'In each round of Block 1, exactly 5 numbers are drawn from one of two machines—the High Machine or the Low Machine.',
   p1_p2: 'Both machines produce numbers randomly, but the High Machine produces numbers with an average of 270, while the Low Machine produces numbers with an average of 230.',
   p1_p3: 'Please click “Generate Sample” as many times as you would like to see how this sampling process works.',

   p2_h: 'Instructions: Censoring Rule',
   p2_p1: 'The three possible Censoring Rules:',
   p2_rules: 'Only Low: only sampled numbers below 250 are recorded\nOnly High: only sampled numbers above 250 are recorded\nRandom Drop: each sampled number is independently dropped with a fixed probability, regardless of its value.',
   p2_p2: 'Please click “Generate Record” as many times as you would like to see how a sample might get recorded.',

   p3_h: 'What you will see in each round',

   p3_p1: 'You will not be shown which machine was selected or the full original sample. You will only see the recorded values and the Censoring Rule that was used.',
   p3_p2: 'For your convenience, when applicable, we will shade regions of the number line to indicate values that were certainly not recorded.',
   p3_p3: 'Please click “Generate Sample Round” as many times as you would like to see an example of what information will actually be shown in a given round.',
   
  }),

  2: Object.freeze({
   sub: 'Block 2',
   p1_h: 'Instructions: The Two Machines',
   p1_p1: 'Unlike in Block 1, the total number of values drawn may vary from round to round.',
   p1_p2: 'Everything else remains as in Block 1: values are drawn from either the High Machine or the Low Machine. The High Machine has an average of 270; the Low Machine has an average of 230',
   p1_p4: 'Please click “Generate Sample” as many times as you would like to see how this sampling process works.',

   p2_h: 'Instructions: Censoring Rule',
   p2_p1: 'The Censoring Rules work in the same way as in Block 1. In particular, the three possible Censoring Rules remain:',
   p2_rules: 'Only Low: only sampled numbers below 250 are recorded\nOnly High: only sampled numbers above 250 are recorded\nRandom Drop: each sampled number is independently dropped with a fixed probability, regardless of its value.',
   p2_p2: 'Please click “Generate Record” as many times as you would like to see how a sample might get recorded, in this block.',

   p3_h: 'What you will see in each round',
   p3_p1: 'What you will see remains as in Block 1. Importantly, however, you will not be shown the total number of values drawn in the original sample.',
   p3_p5: 'Please click “Generate Sample Round” as many times as you would like to see an example of what an actual round will look like in this block.',
  }),

  3: Object.freeze({
   sub: 'Block 3',
   p1_h: 'Instructions: The Two Machines',
   p1_p1: 'The two machines work the same as in Block 2. The only difference will be in the Censoring Rules, which will be explained on the next page.',
   p1_p4: 'Please click “Generate Sample” as many times as you would like to review how this sampling process works.',

   p2_h: 'Instructions: Censoring Rule',
   p2_p1: 'The three possible Censoring Rules, for Block 3:',
   p2_rules: 'Only Low: only sampled numbers below the cutoff value are recorded\nOnly High: only sampled numbers above the cutoff value are recorded\nRandom Drop: each sampled number is independently dropped with a fixed probability, regardless of its value.',
   p2_p2: 'Importantly, unlike in Blocks 1 and 2, the cutoff value used to determine which numbers are recorded may vary from round to round. It will always be between 230 and 270.',
   p2_p4: 'Please click “Generate Record” as many times as you would like to see examples of these Censoring Rules in action.',

   p3_h: 'What you will see in each round',
   p3_p3: 'As before, you will be told which Censoring Rule was used, and you will see only the numbers that were recorded. However, you will not be told the cutoff value.',
  p3_p4: 'For your convenience, we will shade regions of the number line to indicate values that were certainly not recorded. We will also display a hatched region indicating values that might be missing because the cutoff could have been on either side of them.',
    p3_p5: 'Please click “Generate Sample Round” as many times as you would like to see an example of what an actual round will look like for this block.',

  }),
 }),

 ROUND: Object.freeze({
  info_h: (roundNum) => `Information for Round ${roundNum}`,
  q: 'What is the probability that this record came from the High Machine?',
 }),

 BUTTONS: Object.freeze({
  continue: 'Continue',
  gen_sample: 'Generate Sample',
  gen_record: 'Generate Record',
  gen_round: 'Generate Sample Round',
 }),

 LABELS: Object.freeze({
  censoring_rule: (rule) => `${rule}`,
  sample_size: (n) => `Sample size: ${n}`,
 }),

 LEGEND: Object.freeze({
  sampled: 'Sampled value',
  recorded: 'Recorded value',
  unrecorded_solid: 'Unrecorded region',
  uncertain_hatch: 'Additional uncertainty region',
  high_avg: `High Machine avg (${CFG.MACHINE.HIGH_MEAN})`,
  low_avg: `Low Machine avg (${CFG.MACHINE.LOW_MEAN})`,
 }),

 END: Object.freeze({
  feedback_h: 'Feedback',
  feedback_p: 'Please leave any comments about the task below.',
  feedback_placeholder: 'Type your feedback here…',
  redirect_h: 'Finished',
  redirect_p_with_link: 'Thank you for participating. Click the button below to finish and return to the study platform.',
  redirect_p_no_link: 'Thank you for participating. You may now close this window. If you need a completion code, it is shown below.',
  redirect_btn: 'Finish',
  preview_redirect_note: 'Preview mode: redirect is disabled.',
 }),
});

/********************
 * SECTION C: UI LAYER (PRIMITIVES ONLY)
 ********************/

const UI = (() => {
 const esc = (s) => String(s)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

 const Header = (text, opts={}) => {
  const sub = opts.subheader ? `<div class="ts-subheader" data-wm="Subheader">${esc(opts.subheader)}</div>` : '';
  return `<div class="ts-header" data-wm="Header">${esc(text)}${sub}</div>`;
 };

 const Paragraph = (text) => `<div class="ts-paragraph" data-wm="Paragraph">${esc(text)}</div>`;
 // Unsafe HTML paragraph (used sparingly for lists)
 const HtmlParagraph = (html) => `<div class="ts-paragraph" data-wm="Paragraph">${html}</div>`;

 const Box = (innerHtml) => `<div class="ts-box" data-wm="Grey Box">${innerHtml}</div>`;

 const Legend = (items) => {
  if (!items || items.length === 0) return '';
  const rows = items.map((it) => {
   const sw = (() => {
    if (it.kind === 'dot') {
     return `<span class="ts-legend-dot" style="background:${it.color}"></span>`;
    }
    if (it.kind === 'solid') {
     return `<span class="ts-legend-swatch ts-legend-solid"></span>`;
    }
    if (it.kind === 'hatch') {
     return `<span class="ts-legend-swatch ts-legend-hatch"></span>`;
    }
    if (it.kind === 'tick_high' || it.kind === 'tick_low') {
     return `<span class="ts-legend-tick">▲</span>`;
    }
    return `<span class="ts-legend-swatch"></span>`;
   })();
   return `<div class="ts-legend-row" data-wm="Legend item"><div>${sw}</div><div>${esc(it.label)}</div></div>`;
  }).join('');

  return `<div class="ts-legend" data-wm="Legend">${rows}</div>`;
 };

 const Numberline = (values, opts) => {
  const sampled = (values?.sampled ?? []).slice();
  const recorded = (values?.recorded ?? []).slice();
  const axisMin = opts.axisMin ?? CFG.AXIS_MIN;
  const axisMax = opts.axisMax ?? CFG.AXIS_MAX;

  let minV = axisMin;
  let maxV = axisMax;
  if (axisMin === axisMax) {
   minV = axisMin - 1;
   maxV = axisMax + 1;
  }

  const w = 700;
  // Extra left padding prevents SVG text from being clipped.
  const padL = 70;
  const padR = 22;

  const hasSampled = (opts.forceSampledLine === true) ? true : (sampled.length > 0);
  const hasRecorded = (opts.forceRecordedLine === true) ? true : (recorded.length > 0);
  const twoLines = hasSampled && hasRecorded;

  // Layout bands (tuned to prevent label overlap)
  const bandTopPad = 10;
  const bandAxisGap = 26;
  const bandLabelGap = 22;
  const axisY_sampled = bandTopPad + 18;
  const axisY_recorded = twoLines ? (axisY_sampled + bandAxisGap + bandLabelGap + 18) : axisY_sampled;
  const h = twoLines ? (axisY_recorded + 62) : (axisY_sampled + 62);

  const x = (v) => {
   const vv = Math.max(minV, Math.min(maxV, v));
   return padL + (vv - minV) * ( (w - padL - padR) / (maxV - minV) );
  };

  const shading = (opts.shading ?? []).filter(r => r && typeof r.x0 === 'number' && typeof r.x1 === 'number' && r.x1 > r.x0);

  const makeAxisTicks = (yAxis) => {
   const tickEvery = 50;
   const labelEvery = 100;
   const ticks = [];

   for (let v = axisMin; v <= axisMax; v += tickEvery) {
    const xx = x(v);
    const isMajor = (v % labelEvery === 0) || v === axisMin || v === axisMax;
    const tickLen = isMajor ? 10 : 6;
    const sw = isMajor ? 2 : 1.5;
    ticks.push(`<line x1="${xx}" y1="${yAxis}" x2="${xx}" y2="${yAxis+tickLen}" stroke="#222" stroke-width="${sw}" />`);
    if (isMajor) {
     ticks.push(`<text x="${xx}" y="${yAxis+26}" text-anchor="middle" font-size="12" fill="#222">${v}</text>`);
    }
   }

   // Machine-mean markers: colored tick marks at true x-positions (no text under axis to avoid overlap).
   const lowX = x(CFG.MACHINE.LOW_MEAN);
   const highX = x(CFG.MACHINE.HIGH_MEAN);
   ticks.push(`<line x1="${lowX}" y1="${yAxis-2}" x2="${lowX}" y2="${yAxis+18}" stroke="#2ca02c" stroke-width="4" />`);
   ticks.push(`<line x1="${highX}" y1="${yAxis-2}" x2="${highX}" y2="${yAxis+18}" stroke="#d62728" stroke-width="4" />`);

   return ticks.join('');
  };

  const makeShade = (yAxis) => {
   if (!hasRecorded) return '';
   if (!shading.length) return '';
   return shading.map((r) => {
    const x0 = x(r.x0);
    const x1 = x(r.x1);
    const width = Math.max(0, x1 - x0);
    const fill = r.kind === 'hatch' ? 'url(#tsHatch)' : 'rgba(160,160,160,0.35)';
    return `<rect x="${x0}" y="${yAxis-16}" width="${width}" height="32" fill="${fill}" rx="4" ry="4"></rect>`;
   }).join('');
  };

  const makeDots = (arr, yAxis, color) => {
   const cy = yAxis - 10;
   return arr.map(v => `<circle cx="${x(v)}" cy="${cy}" r="6" fill="${color}" opacity="0.95"></circle>`).join('');
  };

  const makeAxisLine = (yAxis) => `<line x1="${padL}" y1="${yAxis}" x2="${w-padR}" y2="${yAxis}" stroke="#222" stroke-width="2" />`;

  // Place labels inside the SVG canvas to avoid clipping.
  const labelSampled = hasSampled ? `<text x="${padL}" y="${axisY_sampled-14}" text-anchor="start" class="ts-nl-label">Sampled</text>` : '';
  const labelRecorded = hasRecorded ? `<text x="${padL}" y="${axisY_recorded-14}" text-anchor="start" class="ts-nl-label">Recorded</text>` : '';

  const sampledSvg = hasSampled ? (makeAxisLine(axisY_sampled) + makeAxisTicks(axisY_sampled) + makeDots(sampled, axisY_sampled, '#1f77b4')) : '';
  const recordedSvg = hasRecorded ? (makeShade(axisY_recorded) + makeAxisLine(axisY_recorded) + makeAxisTicks(axisY_recorded) + makeDots(recorded, axisY_recorded, '#000')) : '';

  return `
   <div class="ts-numberline" data-wm="Numberline">
    <svg width="${w}" height="${h}" role="img" aria-label="Numberline">
     <defs>
      <pattern id="tsHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
       <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(120,120,120,0.7)" stroke-width="3" />
      </pattern>
     </defs>
     ${labelSampled}
     ${labelRecorded}
     ${sampledSvg}
     ${recordedSvg}
    </svg>
   </div>
  `;
 };

 const InputPercent = (opts) => {
  const id = opts.id ?? 'ts_percent';
  const buttonId = opts.buttonId ?? 'ts_continue';
  const helpId = opts.helpId ?? 'ts_help';

  return `
   <div class="ts-input" data-wm="InputPercent">
    <div class="ts-input-row">
     <input id="${id}" class="ts-percent" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="" aria-label="Percent" />
     <span class="ts-percent-symbol">%</span>
    </div>
    <div id="${helpId}" class="ts-help" aria-live="polite"></div>
    <button id="${buttonId}" class="ts-btn ts-continue">${esc(COPY.BUTTONS.continue)}</button>
   </div>
  `;
 };

 const Button = (opts) => {
  const id = opts.id ?? 'ts_btn';
  const label = opts.label ?? 'Button';
  const isContinue = (opts.isContinue === true) || (label === COPY.BUTTONS.continue);
  const cls = `ts-btn${isContinue ? ' ts-continue' : ''}`;
  return `<button id="${id}" class="${cls}" data-wm="Button">${esc(label)}</button>`;
 };

 return { Header, Paragraph, HtmlParagraph, Box, Legend, Numberline, InputPercent, Button, esc };
})();

/********************
 * SECTION D: HELPERS (RANDOMIZATION, GENERATION, SHADING)
 ********************/

const RAND = (() => {
 // IMPORTANT: cognition.run environments can (in some deployments) reset Math.random
 // between trials. jsPsych maintains its own RNG; prefer it when available.
 const randU = () => {
  try {
   if (typeof jsPsych !== 'undefined' && jsPsych?.randomization?.randomInt) {
    // 0..1 inclusive-ish
    return jsPsych.randomization.randomInt(0, 1_000_000_000) / 1_000_000_000;
   }
  } catch (e) {
   // fall through
  }
  return Math.random();
 };
 const choice = (arr) => arr[Math.floor(randU() * arr.length)];
 const bernoulli = (p) => randU() < p;

 // Box-Muller normal
 const normal = (mean, sd) => {
  let u = 0, v = 0;
  while (u === 0) u = randU();
  while (v === 0) v = randU();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + sd * z;
 };

 // Geometric: failures before first success (0-indexed), then +1
 const sampleN_geomPlus1 = (p) => {
  let failures = 0;
  while (!bernoulli(p)) failures += 1;
  return 1 + failures;
 };

 const machine50_50 = () => (bernoulli(0.5) ? 'HIGH' : 'LOW');
 const ruleUniform = () => choice([CFG.RULES.ONLY_LOW, CFG.RULES.ONLY_HIGH, CFG.RULES.RANDOM_DROP]);

 const cutoffBlock = (blockNum) => {
  if (blockNum === 1 || blockNum === 2) return CFG.BLOCKS[blockNum].cutoff_fixed;
  const mn = CFG.BLOCKS[3].cutoff_uniform_min;
  const mx = CFG.BLOCKS[3].cutoff_uniform_max;
  return mn + randU() * (mx - mn);
 };

 return { randU, choice, bernoulli, normal, sampleN_geomPlus1, machine50_50, ruleUniform, cutoffBlock };
})();

const GEN = (() => {
 const roundToInt = (x) => {
  const v = Math.round(x);
  return Math.max(CFG.AXIS_MIN, Math.min(CFG.AXIS_MAX, v));
 };

 const sampleValues = (machine, n) => {
  const mean = machine === 'HIGH' ? CFG.MACHINE.HIGH_MEAN : CFG.MACHINE.LOW_MEAN;
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(roundToInt(RAND.normal(mean, CFG.MACHINE.SD)));
  return arr;
 };

 const recordValues = (sampled, rule, cutoff) => {
  if (rule === CFG.RULES.RANDOM_DROP) {
   return sampled.filter(() => !RAND.bernoulli(CFG.RULES.RANDOM_DROP_P));
  }
  if (rule === CFG.RULES.ONLY_LOW) return sampled.filter(v => v < cutoff);
  if (rule === CFG.RULES.ONLY_HIGH) return sampled.filter(v => v > cutoff);
  return [];
 };

 const getN = (blockNum) => {
  if (blockNum === 1) return CFG.BLOCKS[1].n_fixed;
  return RAND.sampleN_geomPlus1(CFG.BLOCKS[blockNum].geom_p);
 };

 const buildRound = (blockNum, globalRoundNum) => {
  const machine = RAND.machine50_50();
  const rule = RAND.ruleUniform();
  const n = getN(blockNum);
  const cutoff = RAND.cutoffBlock(blockNum);
  const sampled = sampleValues(machine, n);
  const recorded = recordValues(sampled, rule, cutoff);
  return { block: blockNum, round_global: globalRoundNum, machine, rule, n, cutoff, sampled, recorded };
 };

 const shadingFor = (state) => {
  const axisMin = CFG.AXIS_MIN;
  const axisMax = CFG.AXIS_MAX;
  const rule = state.rule;
  const blockNum = state.block;

  if (rule === CFG.RULES.RANDOM_DROP) return [];

  if (blockNum === 1 || blockNum === 2) {
   const c = CFG.BLOCKS[blockNum].cutoff_fixed;
   if (rule === CFG.RULES.ONLY_HIGH) return [{ kind: 'solid', x0: axisMin, x1: c }];
   if (rule === CFG.RULES.ONLY_LOW) return [{ kind: 'solid', x0: c, x1: axisMax }];
   return [];
  }

  // Block 3 (unknown cutoff)
  const lo = CFG.BLOCKS[3].cutoff_uniform_min;
  const hi = CFG.BLOCKS[3].cutoff_uniform_max;
  const recordedInBand = (state.recorded ?? []).filter(v => v >= lo && v <= hi);

  if (rule === CFG.RULES.ONLY_HIGH) {
   const regions = [{ kind: 'solid', x0: axisMin, x1: lo }];
   let hatch0 = lo;
   let hatch1 = hi;
   if (recordedInBand.length > 0) hatch1 = Math.min(hi, Math.min(...recordedInBand));
   if (hatch1 > hatch0) regions.push({ kind: 'hatch', x0: hatch0, x1: hatch1 });
   return regions;
  }

  if (rule === CFG.RULES.ONLY_LOW) {
   const regions = [{ kind: 'solid', x0: hi, x1: axisMax }];
   let hatch0 = lo;
   let hatch1 = hi;
   if (recordedInBand.length > 0) hatch0 = Math.max(lo, Math.max(...recordedInBand));
   if (hatch1 > hatch0) regions.push({ kind: 'hatch', x0: hatch0, x1: hatch1 });
   return regions;
  }

  return [];
 };

 return { buildRound, shadingFor };
})();

// Cache round states by (block, globalRound) so each round is drawn once and is independent
// of any jsPsych internal trial object reuse behavior.
const ROUND_STATE_CACHE = new Map();

/********************
 * SECTION E: PREVIEW MODE, ERROR HANDLER, STYLES
 ********************/

// Default: preview mode ON (toggle here)
const PREVIEW_MODE = true;

(function installErrorOverlay(){
 const overlayId = 'ts_error_overlay';
 const ensure = () => {
  if (document.getElementById(overlayId)) return;
  const el = document.createElement('div');
  el.id = overlayId;
  el.style.cssText = [
   'position:fixed','left:0','top:0','right:0','bottom:0',
   'background:rgba(0,0,0,0.75)','color:#fff','z-index:999999',
   'padding:20px','font-family:system-ui, sans-serif','display:none','overflow:auto'
  ].join(';');
  el.innerHTML = '<h2 style="margin:0 0 10px 0;">Script error</h2>'+
   '<p style="margin:0 0 10px 0;">If this persists, copy the error below and send it to the researcher.</p>'+
   '<pre id="ts_error_text" style="white-space:pre-wrap;"></pre>';
  document.body.appendChild(el);
 };
 const show = (msg) => {
  try {
   ensure();
   document.getElementById('ts_error_text').textContent = msg;
   document.getElementById(overlayId).style.display = 'block';
  } catch (e) {}
 };

 window.addEventListener('error', (ev) => {
  const msg = `${ev.message}\n${ev.filename || ''}:${ev.lineno || ''}:${ev.colno || ''}`;
  show(msg);
 });
 window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason && (ev.reason.stack || ev.reason.message || String(ev.reason));
  show(`Unhandled promise rejection\n${reason || ''}`);
 });
})();

(function injectStyles(){
 const css = `
  .ts-wrap{max-width:900px;margin:0 auto;padding:18px 14px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:left;}
  /* Global vertical rhythm: space between top-level sections on each page */
  .ts-wrap > * + *{margin-top:16px;}
  .ts-header{font-size:28px;font-weight:700;margin:0 0 16px 0;line-height:1.15;text-align:center;}
  .ts-subheader{font-size:16px;font-weight:600;color:#444;margin-top:6px;margin-bottom:10px;text-align:center;}
  .ts-paragraph{font-size:16px;line-height:1.55;margin:12px 0;color:#111;white-space:pre-line;text-align:left;}
  .ts-box{background:#efefef;border:1px solid #d2d2d2;border-radius:12px;padding:16px;margin:18px 0;}
  .ts-box-line{font-size:15px;margin:6px 0;color:#111;}
  .ts-numberline{margin-top:14px;padding:0 8px;overflow:visible;}
  .ts-numberline svg{overflow:visible;}
  .ts-mean-legend-row{display:flex;justify-content:flex-end;margin:4px 0 6px 0;}
  .ts-mean-legend{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,0.85);border:1px solid rgba(0,0,0,0.15);border-radius:10px;padding:6px 10px;}
  .ts-mean-legend-item{display:flex;align-items:center;gap:8px;font-size:13px;color:#111;}
  .ts-mean-swatch{display:inline-block;width:6px;height:18px;border-radius:2px;}
  .ts-mean-low{background:#2ca02c;}
  .ts-mean-high{background:#d62728;}
  .ts-nl-label{font-size:14px;font-weight:600;fill:#222;}
  .ts-gen-head{display:flex;align-items:center;justify-content:center;margin:2px 0 10px 0;}
  .ts-gen-head-title{font-size:18px;font-weight:700;}
  .ts-gen-btnrow{display:flex;justify-content:center;margin:10px 0 14px 0;}
  .ts-legend{display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:14px;padding-top:12px;border-top:1px solid #d2d2d2;}
  .ts-legend-row{display:flex;align-items:center;gap:8px;font-size:14px;color:#111;}
  .ts-legend-dot{width:12px;height:12px;border-radius:50%;display:inline-block;}
  .ts-legend-swatch{width:16px;height:12px;border-radius:3px;border:1px solid #888;display:inline-block;}
  .ts-legend-solid{background:rgba(160,160,160,0.35);}
  .ts-legend-hatch{background:repeating-linear-gradient(45deg, rgba(120,120,120,0.7) 0 3px, rgba(0,0,0,0) 3px 8px);}
  .ts-legend-tick{font-size:14px;line-height:1;transform:translateY(-1px);}

  .ts-btn{background:#111;color:#fff;border:none;border-radius:10px;padding:10px 14px;font-size:16px;cursor:pointer;}
  .ts-btn:disabled{opacity:0.45;cursor:not-allowed;}

  .ts-continue{position:fixed;right:14px;bottom:14px;z-index:9999;}

  .ts-input{margin-top:18px;}
  .ts-input-row{display:flex;align-items:center;gap:8px;}
  .ts-percent{width:120px;font-size:20px;padding:8px 10px;border-radius:10px;border:1px solid #aaa;}
  .ts-percent-symbol{font-size:20px;}
  .ts-help{min-height:20px;margin:8px 0;color:#a40000;font-size:14px;}
  .ts-textarea{width:100%;max-width:900px;padding:10px;border:1px solid #cfcfcf;border-radius:10px;font-size:16px;line-height:1.4;}

  .ts-tag{display:inline-block;font-size:18px;padding:10px 12px;border:1px solid #ddd;border-radius:12px;background:#fafafa;letter-spacing:0.06em;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;}

  .ts-inline-title{font-size:18px;font-weight:700;margin:16px 0 8px 0;}

  /* PREVIEW overlays */
  .ts-preview-watermark{position:fixed;right:10px;bottom:64px;z-index:99999;font-size:12px;color:rgba(0,0,0,0.35);pointer-events:none;}
  .ts-hover-tag{position:fixed;left:10px;bottom:10px;z-index:99999;font-size:12px;color:#000;background:rgba(255,255,255,0.85);border:1px solid rgba(0,0,0,0.2);border-radius:8px;padding:6px 8px;display:none;max-width:60vw;pointer-events:none;}
  .ts-jump-btn{position:fixed;right:10px;top:10px;z-index:99999;background:#fff;border:1px solid rgba(0,0,0,0.25);border-radius:10px;padding:8px 10px;cursor:pointer;font-size:14px;}
  .ts-jump-menu{position:fixed;right:10px;top:52px;z-index:99999;background:#fff;border:1px solid rgba(0,0,0,0.25);border-radius:12px;padding:10px;display:none;min-width:220px;box-shadow:0 10px 24px rgba(0,0,0,0.15);}
  .ts-jump-item{display:block;width:100%;text-align:left;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:10px;padding:8px 10px;margin:6px 0;cursor:pointer;font-size:14px;}
  .ts-jump-item:hover{background:#f3f3f3;}
 `;
 const style = document.createElement('style');
 style.id = 'ts_styles';
 style.textContent = css;
 document.head.appendChild(style);
})();

/********************
 * SECTION F: TRIAL FACTORIES (NO INLINE COPY STRINGS)
 ********************/

function wrapPage(innerHtml){
 return `<div class="ts-wrap">${innerHtml}</div>`;
}

function buildLegendForContext(ctx){
 const items = [];
 if (ctx.showSampled) items.push({ kind: 'dot', color: '#1f77b4', label: COPY.LEGEND.sampled });
 if (ctx.showRecorded) items.push({ kind: 'dot', color: '#000', label: COPY.LEGEND.recorded });
 // Machine mean markers (same labels/order used elsewhere)
 if (ctx.showMeans !== false) {
  items.push({ kind: 'tick_low', label: COPY.LEGEND.low_avg });
  items.push({ kind: 'tick_high', label: COPY.LEGEND.high_avg });
 }
 if (ctx.showSolid) items.push({ kind: 'solid', label: COPY.LEGEND.unrecorded_solid });
 if (ctx.showHatch) items.push({ kind: 'hatch', label: COPY.LEGEND.uncertain_hatch });
 return UI.Legend(items);
}

// Legend for machine mean markers + region shading cues.
// Rendered as HTML (not SVG) so it never occludes the numberline.
function buildMachineRegionLegend(ctx){
 const items = [];
 items.push({ kind: 'mean_low', label: `Low Machine avg (${CFG.MACHINE.LOW_MEAN})` });
 items.push({ kind: 'mean_high', label: `High Machine avg (${CFG.MACHINE.HIGH_MEAN})` });
 if (ctx?.showSolid) items.push({ kind: 'solid', label: COPY.LEGEND.unrecorded_solid });
 if (ctx?.showHatch) items.push({ kind: 'hatch', label: COPY.LEGEND.uncertain_hatch });

 const swatch = (it) => {
  if (it.kind === 'mean_low') return `<span class="ts-mean-swatch ts-mean-low" aria-hidden="true"></span>`;
  if (it.kind === 'mean_high') return `<span class="ts-mean-swatch ts-mean-high" aria-hidden="true"></span>`;
  if (it.kind === 'solid') return `<span class="ts-legend-swatch ts-legend-solid" aria-hidden="true"></span>`;
  if (it.kind === 'hatch') return `<span class="ts-legend-swatch ts-legend-hatch" aria-hidden="true"></span>`;
  return `<span class="ts-legend-swatch" aria-hidden="true"></span>`;
 };

 const rows = items.map(it => `<div class="ts-mean-legend-item">${swatch(it)}<span>${UI.esc(it.label)}</span></div>`).join('');
 return `<div class="ts-mean-legend-row" data-wm="Machine legend"><div class="ts-mean-legend">${rows}</div></div>`;
}


function trial_Transition(text, tag){
 return {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: wrapPage(UI.Paragraph(text) + UI.Button({id:'ts_tr_btn', label:COPY.BUTTONS.continue})),
  on_load: () => {
   document.getElementById('ts_tr_btn')?.addEventListener('click', () => jsPsych.finishTrial({transition:true}));
  },
  data: { trial_tag: tag },
 };
}


function trial_Consent(){
 // Exact consent copy + visual structure from legal_experiment_Post2ndPilot.js (consent_screen)
 const html = `

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


 /* Dossier facts expansion: left-align revealed content */
 [data-component-id="accordion:facts"] .box,
 [data-component-id="accordion:facts"] .box *,
 .factsContent, .factsContent *,
 .caseSummary .box, .caseSummary .box * {
  text-align: left !important;
 }


 /* Dossier facts: force left alignment inside Facts tip + claim/fact groups */
 details.tip, details.tip * { text-align: left !important; }
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
 
  /* ===== Dossier help box styling ===== */
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

<div class="page" data-component-id="page:root">
 <div class="title" style="text-align:center;">Consent to Participate in Research</div>
 <div class="box" style="max-height:360px; overflow-y:auto; background:#fff;">
  <div class="instructions" data-component-id="text:instructions" style="margin-top:0;">
   <p><b>Title of Research:</b> Computational Cognitive Science</p>
   <p><b>Principal Investigator:</b> Thomas Griffiths, Department of Psychology, Princeton University</p>
   <p>You are being invited to take part in a research study on human judgment and decision-making. Before you decide whether to participate, please read the information below.</p>
   <p><b>What you will do:</b> You will read brief descriptions and facts about legal cases and answer questions about them.</p>
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
 <div class="jspsych-btn-container">
  <button id="ts_btn_no_consent" class="jspsych-btn" style="margin:0 auto 10px;">I do NOT consent</button>
  <button id="ts_btn_yes_consent" class="jspsych-btn" style="margin:0 auto;">I consent</button>
 </div>
</div>
`;

 return {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: html,
  on_load: () => {
   const btnNo = document.getElementById('ts_btn_no_consent');
   const btnYes = document.getElementById('ts_btn_yes_consent');
   if (btnNo) btnNo.addEventListener('click', () => {
    jsPsych.finishTrial({ page_type: 'consent', response: 0 });
    jsPsych.endExperiment('No consent');
   });
   if (btnYes) btnYes.addEventListener('click', () => {
    jsPsych.finishTrial({ page_type: 'consent', response: 1 });
   });
  },
  data: { page_type: "consent" }
 };
}

function trial_OverviewPages(){
 const p1 = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: wrapPage(
   UI.Header(COPY.GENERAL.overview_h) +
   UI.Paragraph(COPY.GENERAL.overview_p1) +
   `<div style="height:16px;"></div>` +
   UI.Paragraph(COPY.GENERAL.overview_p2) +
   UI.Paragraph(COPY.GENERAL.overview_p3) +
   UI.Paragraph(COPY.GENERAL.overview_p4) +
   `<div style="height:16px;"></div>` +
   UI.Paragraph(COPY.GENERAL.overview_time) +
   UI.Button({id:'ts_ov1_btn', label:COPY.BUTTONS.continue})
  ),
  on_load: () => { document.getElementById('ts_ov1_btn')?.addEventListener('click', () => jsPsych.finishTrial({})); },
  data: { trial_tag: 'overview_1' },
 };

 const p2 = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: wrapPage(
   UI.Header(COPY.GENERAL.blocks_h) +
   UI.Paragraph(COPY.GENERAL.blocks_p1) +
   UI.Paragraph(COPY.GENERAL.blocks_p2) +
   UI.Button({id:'ts_ov2_btn', label:COPY.BUTTONS.continue})
  ),
  on_load: () => { document.getElementById('ts_ov2_btn')?.addEventListener('click', () => jsPsych.finishTrial({})); },
  data: { trial_tag: 'overview_2' },
 };

 return [p1, p2, trial_Transition(COPY.GENERAL.t_to_b1, 'transition_to_b1')];
}

function buildGeneratorBoxHtml(state, ctx){
 const lines = [];
 // Standard ordering: Selected machine → Sample size → Censoring rule → Threshold
 if (ctx.showMachineLine && state.machine) {
  const mLabel = (state.machine === 'HIGH') ? 'High Machine' : 'Low Machine';
  lines.push(`<div class="ts-box-line" data-wm="Selected Machine"><b>Selected machine:</b> ${UI.esc(mLabel)}</div>`);
 }
 if (ctx.showSampleSizeLine && typeof state.n === 'number') {
  lines.push(`<div class="ts-box-line" data-wm="Sample Size"><b>Sample size:</b> ${UI.esc(String(state.n))}</div>`);
 }
 if (ctx.showRuleLine && state.rule) {
  lines.push(`<div class="ts-box-line" data-wm="Censoring Rule"><b>Censoring Rule:</b> ${UI.esc(COPY.LABELS.censoring_rule(state.rule))}</div>`);
 }
 if (ctx.showThresholdLine && typeof state.cutoff === 'number' && (state.rule === CFG.RULES.ONLY_LOW || state.rule === CFG.RULES.ONLY_HIGH)) {
  lines.push(`<div class="ts-box-line" data-wm="Threshold"><b>Cutoff value:</b> ${UI.esc(String(Math.round(state.cutoff)))}</div>`);
 }

 // Generator boxes are self-explanatory via the button label and surrounding instructions.
 // Avoid redundant headers (they also tended to crowd/overlap the visual area).
 const head = '';

 const genBtn = ctx.genButtonId
  ? `<div class="ts-gen-btnrow" data-wm="Generator button row">${UI.Button({ id: ctx.genButtonId, label: ctx.genButtonLabel || 'Generate' })}</div>`
  : '';

 const nl = UI.Numberline({
  sampled: ctx.showSampled ? (state.sampled ?? []) : [],
  recorded: ctx.showRecorded ? (state.recorded ?? []) : [],
 }, {
  axisMin: CFG.AXIS_MIN,
  axisMax: CFG.AXIS_MAX,
  shading: ctx.shading ?? [],
  forceSampledLine: !!ctx.showSampled,
  forceRecordedLine: !!ctx.showRecorded,
 });

 // Place the machine/region legend as a dedicated bottom row in the generator box
 // so it cannot occlude the numberline.
 const machineLegend = (ctx.includeMachineLegend === true)
  ? buildMachineRegionLegend(ctx.legendCtx || {})
  : '';

 const legend = (ctx.includeLegend === false) ? '' : buildLegendForContext(ctx.legendCtx);
 const between = (lines.length ? '<div style="height:14px;"></div>' : '');
 return UI.Box(head + genBtn + lines.join('') + between + nl + machineLegend + legend);
}


function trial_BlockInstructions(blockNum){
 const B = COPY.BLOCK[blockNum];

 const renderParas = (arr) => {
  const out = [];
  for (const item of arr) {
   if (!item) continue;
   const isObj = (typeof item === 'object' && item !== null);
   const txt = isObj ? '' : String(item);
   if (!isObj && /^Please click\b/.test(txt)) out.push('<div style="height:18px;"></div>');
   if (isObj && item.__kind === 'html') out.push(UI.HtmlParagraph(item.html));
   else out.push(UI.Paragraph(txt));
  }
  return out.join('');
 };

 const p1 = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: () => {
   const header = UI.Header(B.p1_h, { subheader: B.sub });
   const paras = (blockNum === 1)
    ? [B.p1_p1, B.p1_p2, B.p1_p3]
    : [B.p1_p1, B.p1_p2, B.p1_p3, B.p1_p4].filter(Boolean);
   const box = `<div id="ts_gen_box"></div>`;
   const btns = UI.Button({id:'ts_cont_btn', label:COPY.BUTTONS.continue});
   return wrapPage(header + renderParas(paras) + box + `<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;" data-wm="Buttons">${btns}</div>`);
  },
  on_load: () => {
   const render = () => {
    const machine = RAND.machine50_50();
    const n = (blockNum === 1) ? CFG.BLOCKS[1].n_fixed : RAND.sampleN_geomPlus1(CFG.BLOCKS[blockNum].geom_p);
    // sample with correct distribution
    const sampled = (() => {
     const mean = machine === 'HIGH' ? CFG.MACHINE.HIGH_MEAN : CFG.MACHINE.LOW_MEAN;
     const arr = [];
     for (let i = 0; i < n; i++) arr.push(Math.max(CFG.AXIS_MIN, Math.min(CFG.AXIS_MAX, Math.round(RAND.normal(mean, CFG.MACHINE.SD)))));
     return arr;
    })();
    const rule = (blockNum === 3) ? RAND.choice([CFG.RULES.ONLY_LOW, CFG.RULES.ONLY_HIGH, CFG.RULES.RANDOM_DROP]) : null;
    const cutoff = (blockNum === 3) ? Math.min(Math.max(Math.round(RAND.normal(CFG.CUTOFF_FIXED, 10)), CFG.AXIS_MIN), CFG.AXIS_MAX) : CFG.CUTOFF_FIXED;
    const state = { block: blockNum, n, machine, sampled, recorded: [], rule, cutoff };
    const ctx = {
     showRuleLine: true,
     showMachineLine: true,
     showThresholdLine: false,
     showSampleSizeLine: (blockNum !== 1),
     showSampled: true,
     showRecorded: false,
     shading: [],
	     includeLegend: false,
	     includeMachineLegend: true,
     legendCtx: { showSampled: true, showRecorded: false, showSolid: false, showHatch: false },
     genTitle: COPY.BUTTONS.gen_sample + ' (optional)',
     genButtonId: 'ts_gen_btn',
     genButtonLabel: COPY.BUTTONS.gen_sample,
    };
    document.getElementById('ts_gen_box').innerHTML = buildGeneratorBoxHtml(state, ctx);
    bindGen();
   };
   render();
   function bindGen(){
    const b = document.getElementById('ts_gen_btn');
    if (b) b.onclick = (e) => { e.preventDefault(); render(); };
   }
   bindGen();

   document.getElementById('ts_cont_btn')?.addEventListener('click', () => jsPsych.finishTrial({}));
  },
  data: { trial_tag: `b${blockNum}_instr_1` },
 };

 const p2 = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: () => {
   const header = UI.Header(B.p2_h, { subheader: B.sub });
   const rulesHtml = `<ul style="margin:10px 0 0 22px;"><li><b>Only Low</b>: only sampled numbers below 250 are recorded</li><li><b>Only High</b>: only sampled numbers above 250 are recorded</li><li><b>Random Drop</b>: each sampled number is independently dropped with a fixed probability, regardless of its value.</li></ul>`;
   const paras = [B.p2_p1, {__kind:'html', html: rulesHtml}]
    .concat(blockNum === 2 ? [B.p2_p2, B.p2_p3] : [])
    .concat(blockNum === 1 ? [B.p2_p2] : [])
    .concat(blockNum === 3 ? [B.p2_p2, B.p2_p3, B.p2_p4] : [])
    .filter(Boolean);
   const box = `<div id="ts_gen_box"></div>`;
   const btns = UI.Button({id:'ts_cont_btn', label:COPY.BUTTONS.continue});
   return wrapPage(header + renderParas(paras) + box + `<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;" data-wm="Buttons">${btns}</div>`);
  },
  on_load: () => {
   const render = () => {
    const state = GEN.buildRound(blockNum, 0);
    state.cutoff = Math.round(state.cutoff);
    const shading = GEN.shadingFor(state);
    const showHatch = (blockNum === 3) && (state.rule !== CFG.RULES.RANDOM_DROP);
    const showSolid = (state.rule !== CFG.RULES.RANDOM_DROP);
    const ctx = {
     showRuleLine: true,
     showMachineLine: true,
     showThresholdLine: (blockNum === 3),
     showSampleSizeLine: (blockNum !== 1),
     showSampled: true,
     showRecorded: true,
     shading,
	     includeLegend: false,
	     includeMachineLegend: true,
     legendCtx: { showSampled: true, showRecorded: true, showSolid, showHatch },
     genTitle: COPY.BUTTONS.gen_record + ' (optional)',
     genButtonId: 'ts_gen_btn',
     genButtonLabel: COPY.BUTTONS.gen_record,
    };
    document.getElementById('ts_gen_box').innerHTML = buildGeneratorBoxHtml(state, ctx);
    bindGen();
   };
   render();
   function bindGen(){
    const b = document.getElementById('ts_gen_btn');
    if (b) b.onclick = (e) => { e.preventDefault(); render(); };
   }
   bindGen();

   document.getElementById('ts_cont_btn')?.addEventListener('click', () => jsPsych.finishTrial({}));
  },
  data: { trial_tag: `b${blockNum}_instr_2` },
 };

 const p3 = {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  stimulus: () => {
   const header = UI.Header(B.p3_h, { subheader: B.sub });
   const paras = (blockNum === 1)
    ? [B.p3_p1, B.p3_p2, B.p3_p3, B.p3_p4]
    : (blockNum === 2)
     ? [B.p3_p1, B.p3_p2, B.p3_p3, B.p3_p4, B.p3_p5, B.p3_p6]
     : [B.p3_p1, B.p3_p2, B.p3_p3, B.p3_p4, B.p3_p5, B.p3_p6];
   const box = `<div id="ts_gen_box"></div>`;
   const btns = UI.Button({id:'ts_cont_btn', label:COPY.BUTTONS.continue});
   return wrapPage(header + renderParas(paras) + box + `<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;" data-wm="Buttons">${btns}</div>`);
  },
  on_load: () => {
   const render = () => {
    const state = GEN.buildRound(blockNum, 0);
    state.cutoff = Math.round(state.cutoff);
    const shading = GEN.shadingFor(state);
    const showHatch = (blockNum === 3) && (state.rule !== CFG.RULES.RANDOM_DROP);
    const showSolid = (state.rule !== CFG.RULES.RANDOM_DROP);
    const ctx = {
     showRuleLine: true,
     showMachineLine: false,
     showThresholdLine: false,
     showSampleSizeLine: false,
     showSampled: false,
     showRecorded: true,
     shading,
	     includeLegend: false,
	     includeMachineLegend: true,
     legendCtx: { showSampled: false, showRecorded: true, showSolid, showHatch },
     genTitle: COPY.BUTTONS.gen_round + ' (optional)',
     genButtonId: 'ts_gen_btn',
     genButtonLabel: COPY.BUTTONS.gen_round,
    };
    document.getElementById('ts_gen_box').innerHTML = buildGeneratorBoxHtml(state, ctx);
    bindGen();
   };
   render();
   function bindGen(){
    const b = document.getElementById('ts_gen_btn');
    if (b) b.onclick = (e) => { e.preventDefault(); render(); };
   }
   bindGen();

   document.getElementById('ts_cont_btn')?.addEventListener('click', () => jsPsych.finishTrial({}));
  },
  data: { trial_tag: `b${blockNum}_instr_3` },
 };

 return [p1, p2, p3];
}

function trial_BlockTransitionToRounds(blockNum){
 if (blockNum === 1) return trial_Transition(COPY.GENERAL.t_b1_to_r, 'transition_b1_to_rounds');
 if (blockNum === 2) return trial_Transition(COPY.GENERAL.t_b2_to_r, 'transition_b2_to_rounds');
 return trial_Transition(COPY.GENERAL.t_b3_to_r, 'transition_b3_to_rounds');
}


function trial_Feedback(){
 return {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: () => {
   const html =
    UI.Header(COPY.END.feedback_h) +
    UI.Paragraph(COPY.END.feedback_p) +
    `<div style="margin-top:14px;" data-wm="Feedback textbox">
     <textarea id="ts_feedback_box" class="ts-textarea" rows="6" placeholder="${UI.esc(COPY.END.feedback_placeholder)}"></textarea>
    </div>` +
    `<div style="margin-top:14px;" data-wm="Continue button">${UI.Button({ id:'ts_feedback_continue', label: COPY.BUTTONS.continue })}</div>`;
   return wrapPage(html);
  },
  choices: "NO_KEYS",
  on_load: () => {
   const btn = document.getElementById('ts_feedback_continue');
   const box = document.getElementById('ts_feedback_box');
   if (!btn || !box) return;
   btn.addEventListener('click', () => {
    jsPsych.finishTrial({ feedback_text: String(box.value || '') });
   });
  },
  data: { page_tag: 'end_feedback' },
 };
}


function trial_RedirectOrComplete(){
 return {
  type: jsPsychHtmlKeyboardResponse,
  stimulus: () => {
   // Match the reference study end-screen: ALWAYS show both the completion code
   // and a visible redirect link, even if values are missing (in which case show
   // an explicit placeholder so misconfiguration is obvious).
   const urlRaw = (CFG.END.redirect_url || '').toString().trim();
   const codeRaw = (CFG.END.completion_code || '').toString().trim();

   const url = urlRaw.length ? urlRaw : '';
   const code = codeRaw.length ? codeRaw : '';
   const codeDisplay = code.length ? code : '[MISSING COMPLETION CODE — set CFG.END.completion_code]';
   const urlDisplay = url.length ? url : '';

   // Match the reference study end screen pattern:
   // - prominently show completion code (if any)
   // - provide a visible redirect link (if any)
   // - note manual submission fallback

   const codeBlock = `<div class="ts-paragraph" data-wm="Completion code">
     ${UI.esc('Your completion code is:')}
     <div style="margin:12px 0 16px 0;">
      <span class="ts-tag">${UI.esc(codeDisplay)}</span>
     </div>
    </div>`;

   const redirectBlock = url.length
    ? `<div class="ts-paragraph" data-wm="Redirect instructions">
      ${UI.esc('Clicking the button below will redirect you to the study platform to submit the study.')}
     </div>
     <div class="ts-paragraph" data-wm="Redirect link">
      <a href="${UI.esc(urlDisplay)}" target="_blank" rel="noopener noreferrer">${UI.esc('Open redirect link')}</a>
     </div>
     <div class="ts-paragraph" data-wm="Redirect fallback"><i>${UI.esc('If the redirect does not work, you can manually submit using the code above.')}</i></div>
    `
    : `<div class="ts-paragraph" data-wm="No redirect">
      ${UI.esc('[MISSING REDIRECT URL — set CFG.END.redirect_url]')}
     </div>`;

   // Render should be identical in preview vs non-preview. We therefore do not show
   // preview-only messaging here.
   const previewNote = '';

   const btnRow = `<div style="margin-top:14px;" data-wm="Finish button">${UI.Button({ id:'ts_finish_btn', label: COPY.END.redirect_btn, isContinue:false })}</div>`;

   return wrapPage(
    UI.Header(COPY.END.redirect_h) +
    codeBlock +
    redirectBlock +
    previewNote +
    btnRow
   );
  },
  choices: "NO_KEYS",
  on_start: () => {
   try {
    jsPsych.data.addProperties({
     completion_code: (CFG.END.completion_code || '').toString(),
     redirect_url: (CFG.END.redirect_url || '').toString(),
    });
   } catch (_) {}
  },
  on_load: () => {
   const btn = document.getElementById('ts_finish_btn');
   if (!btn) return;

   btn.addEventListener('click', () => {
    const url = (CFG.END.redirect_url || '').toString().trim();
    const payload = { redirect_url: url, completion_code: (CFG.END.completion_code || '').toString() };

    jsPsych.finishTrial(payload);
   });
  },
  on_finish: (data) => {
   // Redirect after finishing (so the trial ends cleanly), matching the reference pattern.
   // NOTE: Do not suppress in preview; render/behavior should be identical.
   const url = (CFG.END.redirect_url || '').toString().trim();
   if (url) {
    try { window.location.href = url; } catch (_) {}
   }
   data.redirect_url = data.redirect_url ?? url;
   data.completion_code = data.completion_code ?? (CFG.END.completion_code || '').toString();
  },
  data: { page_tag: 'end_redirect' },
 };
}




function trial_Round(blockNum, globalRoundNum){
 const inputId = `ts_in_${blockNum}_${globalRoundNum}`;
 const btnId = `ts_btn_${blockNum}_${globalRoundNum}`;
 const helpId = `ts_help_${blockNum}_${globalRoundNum}`;

 return {
  type: jsPsychHtmlKeyboardResponse,
  choices: 'NO_KEYS',
  data: { trial_tag: 'round', block: blockNum, round_global: globalRoundNum },
  on_start: (trial) => {
   // NOTE: stimulus is evaluated before on_start in jsPsych 8 parameter processing.
   // Round state is therefore built inside stimulus (below) to avoid undefined access.
  },
  stimulus: function() {
   // IMPORTANT (jsPsych 8): parameter functions are invoked with the trial context
   // bound as `this`. Do not rely on a positional argument being passed.
   const trial = this;
   // Guard so we never dereference undefined on early parameter evaluation passes.
   trial.data = trial.data || {};

   // Build the round state once per (block, globalRound) key. This avoids any surprises
   // if jsPsych reuses trial objects internally.
   const key = `${blockNum}_${globalRoundNum}`;
   let state = ROUND_STATE_CACHE.get(key);
   if (!state) {
    state = GEN.buildRound(blockNum, globalRoundNum);
    ROUND_STATE_CACHE.set(key, state);
   }

   // Mirror state into the trial's data payload each time stimulus is evaluated.
   trial.data.censoring_rule = state.rule;
   trial.data.sample_size_true = state.n;
   trial.data.recorded_values = state.recorded.slice();
   trial.data.machine_identity = state.machine;
   trial.data.cutoff_value = state.cutoff;
   trial.data.sampled_values = state.sampled.slice();
   const header = UI.Header(COPY.ROUND.info_h(globalRoundNum), { subheader: `Block ${blockNum}` });
   const shading = GEN.shadingFor(state);
   const showHatch = (blockNum === 3) && (state.rule !== CFG.RULES.RANDOM_DROP);
   const showSolid = (state.rule !== CFG.RULES.RANDOM_DROP);
   const ctx = {
    showRuleLine: true,
     showThresholdLine: false,
    showSampleSizeLine: false,
     showMachineLine: false,
    showSampled: false,
    showRecorded: true,
    shading,
    // Match "What you will see" page legend behavior: show machine/cutoff legend consistently.
    includeLegend: false,
    includeMachineLegend: true,
    legendCtx: { showSampled: false, showRecorded: true, showSolid, showHatch },
   };
   const box = buildGeneratorBoxHtml(state, ctx);
   const q = `<div class="ts-inline-title" data-wm="Question">${UI.esc(COPY.ROUND.q)}</div>`;
   const input = UI.InputPercent({ id: inputId, buttonId: btnId, helpId });
   return wrapPage(header + box + q + input);
  },
  on_load: () => {
   const input = document.getElementById(inputId);
   const btn = document.getElementById(btnId);
   const help = document.getElementById(helpId);
   let touched = false;

   const setHelp = (msg) => { if (help) help.textContent = msg || ''; };
   const parse = () => {
    const raw = (input?.value ?? '').trim();
    if (raw === '') return { ok:false, val:null, reason:'blank' };
    if (!/^\d{1,3}$/.test(raw)) return { ok:false, val:null, reason:'format' };
    const v = parseInt(raw, 10);
    if (Number.isNaN(v)) return { ok:false, val:null, reason:'nan' };
    if (v < 0 || v > 100) return { ok:false, val:null, reason:'range' };
    return { ok:true, val:v, reason:null };
   };

   const refresh = () => {
    if (PREVIEW_MODE) { btn.disabled = false; setHelp(''); return; }
    const res = parse();
    if (!touched) { btn.disabled = true; setHelp(''); return; }
    if (!res.ok) { btn.disabled = true; setHelp('Please enter an integer from 0 to 100.'); return; }
    btn.disabled = false; setHelp('');
   };

   if (btn) btn.disabled = !PREVIEW_MODE;
   input?.addEventListener('input', () => { touched = true; refresh(); });
   input?.addEventListener('change', () => { touched = true; refresh(); });
   input?.addEventListener('keydown', () => { touched = true; });

   btn?.addEventListener('click', () => {
    const res = parse();
    if (!PREVIEW_MODE && (!touched || !res.ok)) return;
    jsPsych.finishTrial({ response_percent: res.ok ? res.val : null, response_touched: touched, preview_mode: PREVIEW_MODE });
   });

   refresh();
  },
  on_finish: (data) => {
   data.response_percent = data.response_percent ?? null;
   data.response_touched = data.response_touched ?? false;
   // No internal state is stored on the data object.
  },
 };
}

/********************
 * SECTION G: PREVIEW UI (WATERMARKS + JUMP)
 ********************/

const PREVIEW = (() => {
 const anchors = Object.freeze([
  { id:'A0', label:'Overview + Block 1 Instructions', order:0 },
  { id:'A2', label:'Block 2 Transition', order:2 },
  { id:'A4', label:'Block 3 Transition', order:4 },
 ]);

 let targetOrder = 0;
 // If user used Jump-to, persist the target across reloads.
 try {
  const stored = window.sessionStorage.getItem('ts_preview_targetOrder');
  if (stored !== null && stored !== '') targetOrder = Math.max(0, parseInt(stored, 10) || 0);
  // One-shot: clear after reading so future runs start from the beginning unless the user jumps again.
  try { window.sessionStorage.removeItem('ts_preview_targetOrder'); } catch (e) {}
 } catch (e) {}

 const shouldIncludeOrder = (order) => order >= targetOrder;
 const setTargetById = (id) => {
  const a = anchors.find(x => x.id === id);
  if (!a) return;
  targetOrder = a.order;
  try { window.sessionStorage.setItem('ts_preview_targetOrder', String(targetOrder)); } catch (e) {}
 };

 const installOverlays = () => {
  if (!PREVIEW_MODE) return;

  if (!document.getElementById('ts_preview_wm')) {
   const wm = document.createElement('div');
   wm.id = 'ts_preview_wm';
   wm.className = 'ts-preview-watermark';
   document.body.appendChild(wm);
  }

  if (!document.getElementById('ts_hover_tag')) {
   const ht = document.createElement('div');
   ht.id = 'ts_hover_tag';
   ht.className = 'ts-hover-tag';
   document.body.appendChild(ht);

   document.addEventListener('mouseover', (ev) => {
    const el = ev.target instanceof HTMLElement ? ev.target.closest('[data-wm]') : null;
    if (!el) return;
    const tag = el.getAttribute('data-wm');
    if (!tag) return;
    ht.textContent = `Component: ${tag}`;
    ht.style.display = 'block';
   });
   document.addEventListener('mouseout', () => { ht.style.display = 'none'; });
  }

  if (!document.getElementById('ts_jump_btn')) {
   const jb = document.createElement('button');
   jb.id = 'ts_jump_btn';
   jb.className = 'ts-jump-btn';
   jb.textContent = 'Jump to…';
   document.body.appendChild(jb);

   const menu = document.createElement('div');
   menu.id = 'ts_jump_menu';
   menu.className = 'ts-jump-menu';
   menu.innerHTML = anchors.map(a => `<button class="ts-jump-item" data-anchor="${a.id}">${a.label}</button>`).join('');
   document.body.appendChild(menu);

   jb.addEventListener('click', () => {
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
   });

   menu.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const id = t.getAttribute('data-anchor');
    if (!id) return;
    setTargetById(id);
    menu.style.display = 'none';
    // Reload ensures jsPsych restarts and conditional sections apply deterministically.
    try { window.location.reload(); } catch (e) {}
   });

   document.addEventListener('click', (ev) => {
    if (ev.target === jb || menu.contains(ev.target)) return;
    menu.style.display = 'none';
   });
  }
 };

 const updateWatermark = () => {
  if (!PREVIEW_MODE) return;
  const wm = document.getElementById('ts_preview_wm');
  if (!wm) return;
  const idx = jsPsych.getProgress().current_trial_global;
  const pageNum = Math.max(1, idx);
  wm.textContent = `Preview • Page ${pageNum}`;
 };

 return { anchors, shouldIncludeOrder, installOverlays, updateWatermark };
})();

/********************
 * SECTION H: TIMELINE LAYER (ORDERING / BRANCHING ONLY)
 ********************/

function makeBlockRounds(blockNum, startGlobal){
 const rounds = [];
 for (let i = 0; i < CFG.BLOCKS[blockNum].rounds; i++) rounds.push(trial_Round(blockNum, startGlobal + i));
 return rounds;
}

function conditionalSection(order, trials){
 return {
  timeline: trials,
  conditional_function: () => !PREVIEW_MODE || PREVIEW.shouldIncludeOrder(order),
 };
}

const timeline = [];

const previewOverlayHook = {
 type: jsPsychCallFunction,
 func: () => {
  if (PREVIEW_MODE) {
   PREVIEW.installOverlays();
   PREVIEW.updateWatermark();
  }
 }
};

timeline.push(conditionalSection(0, [previewOverlayHook, trial_Consent(), ...trial_OverviewPages(), previewOverlayHook, ...trial_BlockInstructions(1)]));

timeline.push(conditionalSection(1, [previewOverlayHook, trial_BlockTransitionToRounds(1), previewOverlayHook, ...makeBlockRounds(1, 1)]));

timeline.push(conditionalSection(2, [previewOverlayHook, trial_Transition(COPY.GENERAL.t_to_b2, 'transition_to_b2'), previewOverlayHook, ...trial_BlockInstructions(2)]));

timeline.push(conditionalSection(3, [previewOverlayHook, trial_BlockTransitionToRounds(2), previewOverlayHook, ...makeBlockRounds(2, 11)]));

timeline.push(conditionalSection(4, [previewOverlayHook, trial_Transition(COPY.GENERAL.t_to_b3, 'transition_to_b3'), previewOverlayHook, ...trial_BlockInstructions(3)]));

timeline.push(conditionalSection(5, [previewOverlayHook, trial_BlockTransitionToRounds(3), previewOverlayHook, ...makeBlockRounds(3, 21)]));



timeline.push(conditionalSection(6, [previewOverlayHook, trial_Feedback(), previewOverlayHook, trial_RedirectOrComplete()]));
/********************
 * SECTION I: INIT
 ********************/

const jsPsych = initJsPsych({
 on_trial_start: () => { try { if (PREVIEW_MODE) setTimeout(() => PREVIEW.updateWatermark(), 0); } catch(e){} },
  on_trial_finish: () => { try { if (PREVIEW_MODE) setTimeout(() => PREVIEW.updateWatermark(), 0); } catch(e){} },
  show_progress_bar: true,
 auto_update_progress_bar: true,
});

jsPsych.run(timeline);

