(() => {
  // =========================
  // CONFIG
  // =========================
  const ROOT_SEL = '.aub-day-odometer';
  const MIN_DIGITS = 2; // show at least "02"

  // shuffle feel
  const LOOPS_BASE   = 6;
  const LOOPS_JITTER = 4;
  const FAST_MIN     = 60;
  const FAST_MAX     = 120;
  const LAST_TICKS   = [180, 260, 360];
  const EASE         = 'cubic-bezier(.25,.9,.1,1)';

  // =========================
  // DAY (UTC)
  // =========================
  function getLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw  = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  }
  function computeDayUTC() {
    const launch = getLaunchUTC().getTime();
    const now    = Date.now();
    const tzoff  = new Date().getTimezoneOffset() * 60000;
    const nowUTC = now + tzoff;
    return Math.max(1, Math.floor((nowUTC - launch) / 86400000) + 1);
  }
  function msUntilNextUtcMidnight() {
    const n      = new Date();
    const nowUTC = n.getTime() + n.getTimezoneOffset() * 60000;
    const d      = new Date(nowUTC);
    const next   = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 50);
    return Math.max(500, next - nowUTC);
  }
  const pad2 = v => String(v).padStart(MIN_DIGITS, '0');

  // =========================
  // STYLE (namespaced + corrected stacking)
  // =========================
  function injectStyle() {
    if (document.getElementById('aub-flip-style')) return;
    const s = document.createElement('style');
    s.id = 'aub-flip-style';
    s.textContent = `
      ${ROOT_SEL} {
        display:inline-flex; gap:12px; position:relative; white-space:nowrap;
        font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
      }

      /* column wrapper */
      ${ROOT_SEL} .aub-col {
        position:relative; width:140px; height:200px; perspective:1000px;
        display:inline-block; border-top:1px solid #393939; box-shadow:0 3px 10px #111;
        border-radius:6px; overflow:hidden; background:#1a1a1a;
      }

      /* seam line sits ABOVE digits (thin) */
      ${ROOT_SEL} .aub-col::before {
        content:""; position:absolute; left:0; top:50%; width:100%; height:1px;
        transform:translateY(-.5px); border-bottom:1px solid rgba(0,0,0,.55);
        z-index:4; pointer-events:none;
      }

      /* lower-half tint behind everything */
      ${ROOT_SEL} .aub-col::after {
        content:""; position:absolute; left:0; bottom:0; width:100%; height:calc(50% - 1px);
        background:linear-gradient(#262626, #1b1b1b); border-top:1px solid #0005;
        box-shadow:inset 0 15px 50px #1a1a1a;
        z-index:1; pointer-events:none;
      }

      /* flip card (now explicitly above column ::after, below seam) */
      ${ROOT_SEL} .aub-card {
        position:absolute; inset:0; transform-style:preserve-3d;
        transform:rotateX(0deg) translateZ(0.001px);
        will-change:transform; backface-visibility:hidden; -webkit-backface-visibility:hidden;
        border-radius:5px; z-index:2;
      }

      /* faces: clipped halves */
      ${ROOT_SEL} .aub-card::before,
      ${ROOT_SEL} .aub-card::after {
        position:absolute; left:0; width:100%; overflow:hidden;
        color:#fff; display:flex; align-items:center; justify-content:center;
        backface-visibility:hidden; -webkit-backface-visibility:hidden;
        font-size:145px; line-height:1; letter-spacing:0;
        text-shadow:0 0.5px 0.5px #222;
      }

      /* top half shows current digit */
      ${ROOT_SEL} .aub-card::before {
        content:attr(data-num); top:0; height:50%;
        background:linear-gradient(#1c1c1c,#111); border-radius:5px 5px 0 0;
        box-shadow:inset 0 15px 50px #0f0f0f;
        transform-origin:center bottom; z-index:3;
      }

      /* bottom half sits at 50%, rotated 180° to face down */
      ${ROOT_SEL} .aub-card::after {
        content:attr(data-num-next); top:50%; height:50%;
        background:linear-gradient(#252525,#1a1a1a);
        border-bottom:1px solid #4448; border-radius:0 0 5px 5px;
        box-shadow:inset 0 15px 50px #1a1a1a;
        transform:rotateX(180deg); transform-origin:center top; z-index:2;
      }

      /* Kill any legacy nodes inside the odometer to avoid double layers */
      ${ROOT_SEL} > :not(.aub-col) { display:none !important; }
    `;
    document.head.appendChild(s);
  }

  // =========================
  // BUILD / RESET
  // =========================
  const rootEl = () => document.querySelector(ROOT_SEL);

  function buildCols(count){
    const root = rootEl(); if (!root) return [];
    root.textContent = ''; // remove legacy children
    const frag = document.createDocumentFragment();
    for (let i=0; i<count; i++){
      const col  = document.createElement('div');
      col.className = 'aub-col';
      const card = document.createElement('div');
      card.className = 'aub-card';
      // seed digits so content renders immediately
      card.dataset.num = '0';
      card.dataset.numNext = '1';
      col.appendChild(card);
      frag.appendChild(col);
    }
    root.appendChild(frag);
    return Array.from(root.querySelectorAll('.aub-col'));
  }

  // =========================
  // FLIP ENGINE
  // =========================
  function flipOnce(col, nextDigit, dur, cb){
    const card = col.querySelector('.aub-card');
    const cur  = parseInt(card.dataset.num || '0', 10) || 0;

    // update faces
    card.dataset.num     = String(cur);
    card.dataset.numNext = String(nextDigit);

    // animate
    requestAnimationFrame(() => {
      card.style.transition = `transform ${Math.max(50,dur)}ms ${EASE}`;
      card.style.transform  = 'rotateX(-180deg) translateZ(0.001px)';
      const done = () => {
        card.removeEventListener('transitionend', done);
        card.style.transition = 'none';
        card.style.transform  = 'rotateX(0deg) translateZ(0.001px)';
        card.dataset.num      = String(nextDigit);
        card.dataset.numNext  = String((nextDigit + 1) % 10);
        cb && cb();
      };
      // safety timeout in case transitionend is missed
      const to = setTimeout(done, Math.max(60, dur) + 40);
      card.addEventListener('transitionend', () => { clearTimeout(to); done(); }, { once:true });
    });
  }

  function flipSequence(col, startDigit, steps, durations, onDone){
    let cur = startDigit % 10;
    let i = 0;
    const tick = () => {
      if (i >= steps) { onDone && onDone(); return; }
      const next = (cur + 1) % 10;
      const dur  = durations[i];
      flipOnce(col, next, dur, () => { cur = next; i++; tick(); });
    };
    tick();
  }

  function planDurations(total){
    const body = Math.max(0, total - LAST_TICKS.length);
    const durs = [];
    for (let i=0;i<body;i++){
      const t = body ? i/(body-1 || 1) : 1;
      const base = FAST_MIN + (FAST_MAX - FAST_MIN) * t;
      const jitter = (Math.random()*2-1) * 20; // ±20ms
      durs.push(Math.max(40, Math.round(base + jitter)));
    }
    LAST_TICKS.forEach(ms => durs.push(ms)); // slow 3-tick finish
    return durs;
  }

  // =========================
  // SHUFFLE TO TARGET
  // =========================
  function shuffleTo(targetStr){
    const root = rootEl(); if (!root) return;
    const need = Math.max(MIN_DIGITS, targetStr.length);
    const cols = (root.querySelectorAll('.aub-col').length === need)
      ? Array.from(root.querySelectorAll('.aub-col'))
      : buildCols(need);

    const digits = targetStr.padStart(need,'0').split('').map(n => +n);
    const doneFlags = new Array(need).fill(false);
    const onColDone = () => {
      if (doneFlags.every(Boolean)) root.setAttribute('aria-label', `DAY ${targetStr}`);
    };

    cols.forEach((col, idx) => {
      const startJitter = Math.round(Math.random()*120);
      setTimeout(() => {
        const card  = col.querySelector('.aub-card');
        const start = parseInt(card.dataset.num || '0', 10) || 0;
        const final = digits[idx];

        const loops = LOOPS_BASE + (cols.length - 1 - idx) * 2 + Math.floor(Math.random()*LOOPS_JITTER);
        const delta = (final - start + 10) % 10;
        const totalSteps = loops * 10 + Math.max(0, delta);

        const durs = planDurations(totalSteps);
        flipSequence(col, start, totalSteps, durs, () => { doneFlags[idx] = true; onColDone(); });
      }, startJitter);
    });
  }

  // =========================
  // TICK + ROLLOVER
  // =========================
  function updateDay(){
    const v = pad2(computeDayUTC());
    const root = rootEl(); if (!root) return;
    root.dataset.current = v;
    shuffleTo(v);
  }
  function scheduleRollover(){
    setTimeout(() => { updateDay(); scheduleRollover(); }, msUntilNextUtcMidnight());
  }

  // =========================
  // INIT
  // =========================
  document.addEventListener('DOMContentLoaded', () => {
    const root = rootEl(); if (!root) return;
    if (root.dataset.aubInit === '1') return;
    root.dataset.aubInit = '1';

    injectStyle();

    // snap font-size to integer px for sharpness
    const fs = parseFloat(getComputedStyle(root).fontSize);
    if (fs && Math.abs(fs - Math.round(fs)) > 0.01) root.style.fontSize = Math.round(fs) + 'px';

    const v = pad2(computeDayUTC());
    buildCols(Math.max(MIN_DIGITS, v.length));
    root.setAttribute('aria-label', `DAY ${v}`);
    setTimeout(updateDay, 40);
    scheduleRollover();
  });
})();
