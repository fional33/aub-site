(() => {
  const ROOT = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // --- tuning: faster & smoother ---
  const LOOPS_BASE = 5;            // base 0–9 cycles per column
  const LOOPS_JITTER = 4;          // randomness per column
  const SPEED_PER_STEP = 14;       // ms per fast step (phase 1)
  const FINAL_TICKS = [170, 220, 300]; // last 3 slower steps
  const EASE_FAST = 'cubic-bezier(.25,.9,.1,1)';
  const EASE_SLOW = 'cubic-bezier(.2,.65,.12,1)';

  // ---------- UTC day ----------
  const launchUTC = () => {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw  = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  };
  const dayUTC = () => {
    const z = new Date();
    const nowUTC = z.getTime() + z.getTimezoneOffset()*60000;
    const d0 = launchUTC().getTime();
    return Math.max(1, Math.floor((nowUTC - d0)/86400000) + 1);
  };
  const msToNextUtcMidnight = () => {
    const z = new Date();
    const nowUTC = z.getTime() + z.getTimezoneOffset()*60000;
    const d = new Date(nowUTC);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1, 0,0,0,50);
    return Math.max(500, next - nowUTC);
  };
  const pad2 = v => String(v).padStart(MIN_DIGITS, '0');

  // ---------- styles (pure black card; NO gray halves) ----------
  function injectStyle() {
    if (document.getElementById('aub-roller-style')) return;
    const s = document.createElement('style');
    s.id = 'aub-roller-style';
    s.textContent = `
      ${ROOT} {
        display:inline-flex; gap:12px; white-space:nowrap; position:relative;
        font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
      }
      ${ROOT} .aub-col{
        position:relative; width:140px; height:200px; overflow:hidden;
        border-radius:6px; background:#0d0d0d; box-shadow:0 3px 10px #111;
        border-top:1px solid #393;    /* subtle rim; keep card pure black inside */
      }
      ${ROOT} .aub-track{
        position:absolute; left:0; top:0; will-change:transform;
        transform:translateY(0);
      }
      ${ROOT} .aub-cell{
        width:140px; display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:145px; line-height:1; letter-spacing:0;
        text-shadow:none; filter:none; user-select:none;
      }
      /* hide any legacy children that caused double numbers */
      ${ROOT} > :not(.aub-col){ display:none !important; }
    `;
    document.head.appendChild(s);
  }

  const rootEl = () => document.querySelector(ROOT);

  function ensureCols(n) {
    const root = rootEl(); if (!root) return [];
    if (root.dataset.aubInit !== '1') { root.dataset.aubInit = '1'; root.textContent = ''; }
    const have = root.querySelectorAll('.aub-col').length;
    if (have !== n) {
      root.textContent = '';
      const frag = document.createDocumentFragment();
      for (let i=0;i<n;i++){
        const col = document.createElement('div'); col.className = 'aub-col';
        const track = document.createElement('div'); track.className = 'aub-track';
        col.appendChild(track); frag.appendChild(col);
      }
      root.appendChild(frag);
    }
    return Array.from(root.querySelectorAll('.aub-col'));
  }

  function setDigitImmediately(col, digit){
    // Rebuild minimal track to a single cell = crisp & no residual transforms
    const track = col.querySelector('.aub-track');
    const h = col.clientHeight;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    track.innerHTML = '';
    const cell = document.createElement('div'); cell.className = 'aub-cell';
    cell.style.height = h + 'px';
    cell.textContent = String(digit);
    track.appendChild(cell);
    col.dataset.d = String(digit);
    // force reflow
    void track.offsetHeight;
  }

  function buildTrackForSteps(col, startDigit, steps){
    const track = col.querySelector('.aub-track');
    const h = col.clientHeight;
    track.style.transition = 'none';
    track.style.transform = 'translateY(0)';
    track.innerHTML = '';
    for (let k=0; k<=steps; k++){
      const cell = document.createElement('div');
      cell.className = 'aub-cell';
      cell.style.height = h + 'px';
      cell.textContent = String((startDigit + k) % 10);
      track.appendChild(cell);
    }
    void track.offsetHeight;
  }

  function tweenTo(col, stepIndex, dur, ease, cb){
    const track = col.querySelector('.aub-track');
    track.style.transition = `transform ${Math.max(40,dur)}ms ${ease}`;
    const h = col.clientHeight;
    track.style.transform = `translateY(${-h*stepIndex|0}px)`;
    const done = () => { track.removeEventListener('transitionend', done); cb && cb(); };
    const t = setTimeout(done, dur + 40); // safety
    track.addEventListener('transitionend', () => { clearTimeout(t); done(); }, { once:true });
  }

  function animateColumn(col, finalDigit, columnIndex, columnsTotal){
    const start = parseInt(col.dataset.d ?? '0', 10) || 0;
    if (start === finalDigit) { setDigitImmediately(col, finalDigit); return; }

    // randomized loops; leftmost spins more for fun
    const loops = LOOPS_BASE + Math.floor(Math.random()*LOOPS_JITTER) + (columnsTotal-1-columnIndex);
    const delta = (finalDigit - start + 10) % 10;
    const totalSteps = loops*10 + delta;

    // phase plan: long smooth scroll, then 3 slow ticks
    const fastSteps = Math.max(0, totalSteps - FINAL_TICKS.length);
    const fastDuration = Math.max(220, Math.round(fastSteps * (SPEED_PER_STEP + (Math.random()*10 - 5))));
    const jitterStart = Math.round(Math.random()*120);

    // build track large enough for this whole run
    buildTrackForSteps(col, start, totalSteps);

    // kickoff (desync columns slightly)
    setTimeout(() => {
      if (fastSteps > 0) {
        tweenTo(col, fastSteps, fastDuration, EASE_FAST, () => {
          // final 3 gentle ticks
          let idx = fastSteps;
          (function slowTick(i){
            if (i >= FINAL_TICKS.length) {
              // snap to final & compact track
              setDigitImmediately(col, finalDigit);
              return;
            }
            idx += 1;
            tweenTo(col, idx, FINAL_TICKS[i], EASE_SLOW, () => slowTick(i+1));
          })(0);
        });
      } else {
        // fewer than 3 steps total → just do the slow ticks we have
        let idx = 0, left = totalSteps;
        const seq = FINAL_TICKS.slice(-left);
        (function doStep(i){
          if (i >= seq.length) { setDigitImmediately(col, finalDigit); return; }
          idx += 1; tweenTo(col, idx, seq[i], EASE_SLOW, () => doStep(i+1));
        })(0);
      }
    }, jitterStart);
  }

  function shuffleTo(targetStr){
    const root = rootEl(); if (!root) return;
    const need = Math.max(MIN_DIGITS, targetStr.length);
    const cols = ensureCols(need);
    const digits = targetStr.padStart(need,'0').split('').map(n => +n);
    cols.forEach((col, i) => animateColumn(col, digits[i], i, need));
    root.setAttribute('aria-label', `DAY ${targetStr}`);
  }

  function updateDay(){
    shuffleTo(pad2(dayUTC()));
  }
  function scheduleRollover(){
    setTimeout(() => { updateDay(); scheduleRollover(); }, msToNextUtcMidnight());
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = rootEl(); if (!root) return;
    injectStyle();

    // Snap font-size to whole px for crispness
    const fs = parseFloat(getComputedStyle(root).fontSize);
    if (fs && Math.abs(fs - Math.round(fs)) > 0.01) root.style.fontSize = Math.round(fs) + 'px';

    // start state
    const v = pad2(dayUTC());
    ensureCols(Math.max(MIN_DIGITS, v.length)).forEach((col, i) => setDigitImmediately(col, +v[i]));
    root.setAttribute('aria-label', `DAY ${v}`);

    // run first shuffle shortly after mount
    setTimeout(updateDay, 60);
    scheduleRollover();
  });
})();
