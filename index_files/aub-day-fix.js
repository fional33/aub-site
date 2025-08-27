(() => {
  const ROOT_SEL = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Shuffle feel
  const LOOPS_BASE   = 6;      // base full 0–9 cycles per column
  const LOOPS_JITTER = 4;      // add randomness
  const FAST_MIN     = 70;     // ms per quick trap lift
  const FAST_MAX     = 140;
  const LAST_TICKS   = [180, 240, 320];  // final slow 3 reveals
  const EASE         = 'cubic-bezier(.25,.9,.1,1)';

  // ---------- UTC day ----------
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

  // ---------- styles (pure black card + gray trap) ----------
  function injectStyle() {
    if (document.getElementById('aub-trap-style')) return;
    const s = document.createElement('style');
    s.id = 'aub-trap-style';
    s.textContent = `
      ${ROOT_SEL} {
        display:inline-flex; gap:12px; white-space:nowrap; position:relative;
        font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
      }
      ${ROOT_SEL} .aub-col {
        position:relative; width:140px; height:200px; overflow:hidden;
        border-radius:6px; background:#0d0d0d;  /* fully black box */
        border-top:1px solid #393939; box-shadow:0 3px 10px #111;
      }
      /* seam line across the middle */
      ${ROOT_SEL} .aub-col::before {
        content:""; position:absolute; left:0; top:50%; width:100%; height:1px;
        transform:translateY(-.5px); border-bottom:1px solid rgba(0,0,0,.7);
        z-index:3; pointer-events:none;
      }
      /* the digit (single element spanning both halves) */
      ${ROOT_SEL} .aub-digit {
        position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:145px; line-height:1; letter-spacing:0;
        text-shadow:0 .5px .5px #222;
        z-index:1;  /* sits under the trap */
        user-select:none;
      }
      /* gray "trap" cover that slides upward to reveal the digit */
      ${ROOT_SEL} .aub-trap {
        position:absolute; left:0; top:50%; width:100%; height:50%;
        background:linear-gradient(#2a2a2a,#1f1f1f);  /* gray trap */
        border-top:1px solid #0006; box-shadow:inset 0 15px 50px #202020;
        transform:translateY(0); will-change:transform;
        z-index:2;
      }
      /* while lifted */
      ${ROOT_SEL} .aub-trap--lift {
        transition:transform var(--dur,160ms) ${EASE};
        transform:translateY(-100%);  /* lifts off the card to reveal number */
      }

      /* Hide any legacy children that could overlap */
      ${ROOT_SEL} > :not(.aub-col) { display:none !important; }
    `;
    document.head.appendChild(s);
  }

  const rootEl = () => document.querySelector(ROOT_SEL);

  function buildCols(count){
    const root = rootEl(); if (!root) return [];
    root.textContent = '';
    const frag = document.createDocumentFragment();
    for (let i=0; i<count; i++){
      const col   = document.createElement('div');
      col.className = 'aub-col';
      const digit = document.createElement('div');
      digit.className = 'aub-digit';
      digit.textContent = '0';
      digit.setAttribute('aria-hidden','true');
      const trap  = document.createElement('div');
      trap.className = 'aub-trap';
      col.appendChild(digit);
      col.appendChild(trap);
      frag.appendChild(col);
    }
    root.appendChild(frag);
    return Array.from(root.querySelectorAll('.aub-col'));
  }

  // ------- trap lift animation per step -------
  function liftTrap(col, duration, nextDigit, cb){
    const trap  = col.querySelector('.aub-trap');
    const digit = col.querySelector('.aub-digit');

    // Lift
    trap.style.setProperty('--dur', Math.max(50,duration) + 'ms');
    trap.classList.add('aub-trap--lift');

    const onDone = () => {
      trap.removeEventListener('transitionend', onDone);
      // While trap is up (revealed), swap to next digit
      digit.textContent = String(nextDigit);
      // Instantly reset trap to closed position for the next step
      trap.classList.remove('aub-trap--lift');
      trap.style.transition = 'none';
      trap.style.transform  = 'translateY(0)';  // closed (covers lower half)
      // force reflow to apply
      void trap.offsetHeight;
      trap.style.transition = '';
      cb && cb();
    };

    // Fallback safety timer
    const t = setTimeout(onDone, Math.max(60, duration) + 60);
    trap.addEventListener('transitionend', () => { clearTimeout(t); onDone(); }, { once:true });
  }

  function flipSequence(col, startDigit, steps, durations, onDone){
    let cur = startDigit % 10;
    let i = 0;
    (function tick(){
      if (i >= steps) { onDone && onDone(); return; }
      const next = (cur + 1) % 10;
      liftTrap(col, durations[i], next, () => { cur = next; i++; tick(); });
    })();
  }

  function planDurations(total){
    const body = Math.max(0, total - LAST_TICKS.length);
    const durs = [];
    for (let i=0;i<body;i++){
      const t = body ? i/(body-1 || 1) : 1;
      const base = FAST_MIN + (FAST_MAX - FAST_MIN) * t;
      const jitter = (Math.random()*2-1) * 20;
      durs.push(Math.max(40, Math.round(base + jitter)));
    }
    LAST_TICKS.forEach(ms => durs.push(ms));
    return durs;
  }

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
      const digitEl = col.querySelector('.aub-digit');
      const start   = parseInt(digitEl.textContent || '0', 10) || 0;
      const final   = digits[idx];

      const loops = LOOPS_BASE + (cols.length - 1 - idx) * 2 + Math.floor(Math.random()*LOOPS_JITTER);
      const delta = (final - start + 10) % 10;
      const totalSteps = loops * 10 + Math.max(0, delta);

      const durs = planDurations(totalSteps);

      // small desync per column
      const startJitter = Math.round(Math.random()*120);
      setTimeout(() => {
        flipSequence(col, start, totalSteps, durs, () => { doneFlags[idx] = true; onColDone(); });
      }, startJitter);
    });
  }

  // ----- tick + rollover -----
  function updateDay(){
    const v = pad2(computeDayUTC());
    const root = rootEl(); if (!root) return;
    root.dataset.current = v;
    shuffleTo(v);
  }
  function scheduleRollover(){
    setTimeout(() => { updateDay(); scheduleRollover(); }, msUntilNextUtcMidnight());
  }

  // ----- init -----
  document.addEventListener('DOMContentLoaded', () => {
    const root = rootEl(); if (!root) return;
    if (root.dataset.aubInit === '1') return;
    root.dataset.aubInit = '1';

    injectStyle();

    // snap font-size to whole px for sharpness
    const fs = parseFloat(getComputedStyle(root).fontSize);
    if (fs && Math.abs(fs - Math.round(fs)) > 0.01) root.style.fontSize = Math.round(fs) + 'px';

    const v = pad2(computeDayUTC());
    buildCols(Math.max(MIN_DIGITS, v.length));
    root.setAttribute('aria-label', `DAY ${v}`);
    setTimeout(updateDay, 40);
    scheduleRollover();
  });
})();
