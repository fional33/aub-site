(() => {
  // =========================
  // CONFIG
  // =========================
  const ROOT_SEL = '.aub-day-odometer'; // container for the day digits
  const MIN_DIGITS = 2;                 // always show at least 2 digits (e.g., 03)

  // Shuffle feel
  const LOOPS_BASE = 6;      // base full cycles (0→9) per leftmost digit
  const LOOPS_JITTER = 4;    // extra random cycles
  const FAST_MIN = 60;       // ms per fast flip (start)
  const FAST_MAX = 120;      // ms per fast flip (before slow ticks)
  const LAST_TICKS = [180, 260, 360]; // last 3 slower flips
  const EASE = 'cubic-bezier(.25,.9,.1,1)';

  // =========================
  // DAY (UTC) CALC
  // =========================
  function getLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  }
  function computeDayUTC() {
    const launch = getLaunchUTC().getTime();
    const now = Date.now();
    const tz = new Date().getTimezoneOffset() * 60000;
    const nowUTC = now + tz;
    // Day 1 on launch UTC day
    return Math.max(1, Math.floor((nowUTC - launch) / 86400000) + 1);
  }
  function msUntilNextUtcMidnight() {
    const n = new Date();
    const nowUTC = n.getTime() + n.getTimezoneOffset() * 60000;
    const d = new Date(nowUTC);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 50);
    return Math.max(500, next - nowUTC);
  }
  const pad2 = v => String(v).padStart(MIN_DIGITS, '0');

  // =========================
  // STYLE INJECTION (Flip-card look; no auto keyframes)
  // =========================
  function injectStyle() {
    if (document.getElementById('aub-flip-style')) return;
    const s = document.createElement('style');
    s.id = 'aub-flip-style';
    s.textContent = `
      ${ROOT_SEL}{
        display:inline-flex; gap:12px; position:relative; white-space:nowrap;
        font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
      }
      ${ROOT_SEL} .nums{
        position:relative; width:140px; height:200px; perspective:1000px;
        display:inline-block; border-top:1px solid #393939; box-shadow:0 3px 10px #111;
        border-radius:6px; overflow:hidden; background:#1a1a1a;
      }
      /* Soft mid seam (much lighter than the heavy "black box") */
      ${ROOT_SEL} .nums::before{
        content:""; position:absolute; left:0; top:50%; width:100%; height:1px;
        transform:translateY(-1px); border-bottom:1px solid rgba(0,0,0,.45);
        z-index:5; pointer-events:none;
      }
      /* Lower half background (subtle, not a big black slab) */
      ${ROOT_SEL} .nums::after{
        content:""; position:absolute; left:0; bottom:0; width:100%; height:calc(50% - 1px);
        background:linear-gradient(#262626, #1b1b1b); border-top:1px solid #0005;
        box-shadow:inset 0 15px 50px #1a1a1a;
        z-index:0; pointer-events:none;
      }
      ${ROOT_SEL} .num{
        position:absolute; inset:0; transform-style:preserve-3d; transform:rotateX(0deg);
        will-change:transform; border-radius:5px;
        /* Disables any auto keyframe animations from templates */
        animation:none !important;
      }
      ${ROOT_SEL} .num::before,
      ${ROOT_SEL} .num::after{
        position:absolute; left:0; width:100%; color:#eee; display:block;
        text-align:center; backface-visibility:hidden; -webkit-backface-visibility:hidden;
        font-size:145px; text-shadow:0 0.5px 0.5px #222; /* tiny, crisp */
      }
      ${ROOT_SEL} .num::before{
        content:attr(data-num); top:0; height:50%; line-height:138px;
        background:linear-gradient(#1c1c1c,#111); border-radius:5px 5px 0 0;
        box-shadow:inset 0 15px 50px #0f0f0f;
        z-index:2;
      }
      ${ROOT_SEL} .num::after{
        content:attr(data-num-next); top:0; height:calc(50% - 1px); line-height:0;
        transform:rotateX(180deg);
        background:linear-gradient(#252525,#1a1a1a);
        border-bottom:1px solid #4448; border-radius:0 0 5px 5px;
        box-shadow:inset 0 15px 50px #1a1a1a;
      }
      /* Prevent any legacy children from showing → no double overlay */
      ${ROOT_SEL} > :not(.nums){ display:none !important; }
    `;
    document.head.appendChild(s);
  }

  // =========================
  // BUILD / RESET
  // =========================
  function rootEl(){ return document.querySelector(ROOT_SEL); }

  function buildCols(count){
    const root = rootEl(); if (!root) return [];
    // Nuke anything inside to avoid duplicates/overlaps
    root.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i=0;i<count;i++){
      const wrap = document.createElement('div');
      wrap.className = 'nums';
      const card = document.createElement('div');
      card.className = 'num';
      card.dataset.num = '0';
      card.dataset.numNext = '1';
      wrap.appendChild(card);
      frag.appendChild(wrap);
    }
    root.appendChild(frag);
    return Array.from(root.querySelectorAll('.nums'));
  }

  // =========================
  // FLIP ENGINE (JS-driven)
  // =========================
  function flipOnce(wrap, nextDigit, dur, cb){
    const card = wrap.querySelector('.num');
    const cur = parseInt(card.dataset.num || '0', 10) || 0;
    // prepare faces
    card.dataset.num = String(cur);
    card.dataset.numNext = String(nextDigit);
    // animate
    requestAnimationFrame(() => {
      card.style.transition = `transform ${Math.max(50,dur)}ms ${EASE}`;
      card.style.transform  = 'rotateX(-180deg)';
      const done = () => {
        card.removeEventListener('transitionend', done);
        // settle state
        card.style.transition = 'none';
        card.style.transform  = 'rotateX(0deg)';
        card.dataset.num = String(nextDigit);
        card.dataset.numNext = String((nextDigit + 1) % 10);
        cb && cb();
      };
      card.addEventListener('transitionend', done, { once:true });
    });
  }

  function flipSequence(wrap, startDigit, steps, durations, onDone){
    let cur = startDigit % 10;
    let i = 0;
    const tick = () => {
      if (i >= steps) { onDone && onDone(); return; }
      const next = (cur + 1) % 10;
      const dur  = durations[i];
      flipOnce(wrap, next, dur, () => {
        cur = next; i++; tick();
      });
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
    // tail (3 slower, dramatic)
    LAST_TICKS.forEach(ms => durs.push(ms));
    return durs;
  }

  // =========================
  // SHUFFLE → FINAL
  // =========================
  function shuffleTo(targetStr){
    const root = rootEl(); if (!root) return;
    const need = Math.max(MIN_DIGITS, targetStr.length);
    const cols = (root.querySelectorAll('.nums').length === need)
      ? Array.from(root.querySelectorAll('.nums'))
      : buildCols(need);

    const digits = targetStr.padStart(need,'0').split('').map(n => +n);
    const doneFlags = new Array(need).fill(false);
    const onColDone = () => {
      if (doneFlags.every(Boolean)) {
        root.setAttribute('aria-label', `DAY ${targetStr}`);
      }
    };

    cols.forEach((wrap, idx) => {
      // desync columns a bit so they don't look robotic
      const startJitter = Math.round(Math.random()*120);
      setTimeout(() => {
        const card = wrap.querySelector('.num');
        const start = parseInt(card.dataset.num || '0', 10) || 0;
        const final = digits[idx];

        const loops = LOOPS_BASE + (cols.length - 1 - idx) * 2 + Math.floor(Math.random()*LOOPS_JITTER);
        const delta = (final - start + 10) % 10;
        const totalSteps = loops * 10 + Math.max(0, delta);

        const durs = planDurations(totalSteps);
        flipSequence(wrap, start, totalSteps, durs, () => {
          doneFlags[idx] = true;
          onColDone();
        });
      }, startJitter);
    });
  }

  // =========================
  // TICK DAY + ROLLOVER
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

    // crisp fonts: snap font-size to integer px
    const fs = parseFloat(getComputedStyle(root).fontSize);
    if (fs && Math.abs(fs - Math.round(fs)) > 0.01) root.style.fontSize = Math.round(fs) + 'px';

    // build fresh columns and animate to current UTC day
    const v = pad2(computeDayUTC());
    buildCols(Math.max(MIN_DIGITS, v.length));
    root.setAttribute('aria-label', `DAY ${v}`);
    setTimeout(updateDay, 40);
    scheduleRollover();
  });
})();
