(() => {
  // --- Launch day (UTC) ---
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
      || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // Reset any old markup to prevent overlaps
  root.textContent = '';
  injectCSS(true);

  // ---------- DOM ----------
  function buildReel() {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    // 3 loops of 0..9 gives us plenty of forward travel room
    for (let r = 0; r < 3; r++) {
      for (let d = 0; d <= 9; d++) {
        const cell = document.createElement('span');
        cell.className = 'aub-cell';
        const g = document.createElement('span');
        g.className = 'aub-glyph';
        g.textContent = d;
        cell.appendChild(g);
        reel.appendChild(cell);
      }
    }
    reel._y = 0;
    return reel;
  }

  function ensureSlots(count) {
    let slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (let i = slots.length; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'aub-slot';
      s.setAttribute('aria-hidden', 'true');
      s.appendChild(buildReel());
      root.prepend(s);
    }
    // guarantee a reel in each
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (const s of slots) if (!s.querySelector('.aub-reel')) {
      s.innerHTML = '';
      s.appendChild(buildReel());
    }
    return slots;
  }

  // ---------- Geometry ----------
  const hCache = new WeakMap();
  function cellH(slot) {
    let h = hCache.get(slot);
    if (!h) {
      const c = slot.querySelector('.aub-cell');
      h = Math.max(1, Math.round(c?.getBoundingClientRect().height || 0));
      hCache.set(slot, h);
    }
    return h;
  }

  function setY(slot, y) {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return;
    reel._y = y;
    reel.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  }

  function snapToDigit(slot, d) {
    const h = cellH(slot);
    // land on the middle loop so we can always travel forward
    setY(slot, h * (10 + ((d % 10 + 10) % 10)));
  }

  // Small helper for rAF animations
  function animateY(slot, toY, ms, ease, done) {
    const reel = slot.querySelector('.aub-reel');
    const fromY = reel._y;
    const t0 = performance.now();
    reel.style.willChange = 'transform';
    function tick(now) {
      const t = Math.min(1, (now - t0) / ms);
      const v = ease(t);
      setY(slot, fromY + (toY - fromY) * v);
      if (t < 1) requestAnimationFrame(tick);
      else { reel.style.willChange = 'auto'; done && done(); }
    }
    requestAnimationFrame(tick);
  }

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  // ---------- Main animation: scramble → 3 soft ticks → final ----------
  function animateTo(targetStr) {
    const slots = ensureSlots(targetStr.length);
    const final = targetStr.padStart(slots.length, '0').split('').map(n => +n);

    // Randomize distinct start digits, center loop
    const startY = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      snapToDigit(slots[i], Math.floor(Math.random() * 10));
      startY[i] = slots[i].querySelector('.aub-reel')._y;
    }

    // Forward-only scramble targets
    const targetY = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const h = cellH(slots[i]);
      // faster and a little “shuffly”; fewer spins on leftmost digit
      const baseSpins = 6 - i * 1.0;
      const jitter = 0.8 + Math.random() * 0.6;
      const extra = Math.floor(Math.random() * 10);
      const spins = Math.max(3, baseSpins * jitter);
      targetY[i] = startY[i] + h * (spins * 10 + extra);
    }

    // Phase A: smooth scramble (shorter & high-FPS)
    const SCRAMBLE_MS = 650;
    const t0 = performance.now();
    function scramble(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const v = easeOutCubic(t);
      for (let i = 0; i < slots.length; i++) {
        const y = startY[i] + (targetY[i] - startY[i]) * v;
        setY(slots[i], y);
      }
      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    }

    // Phase B: three soft ticks that decelerate into the final digit
    function settle() {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        const h = cellH(slot);
        const fd = final[i];

        const curIndex = Math.round(reel._y / h);
        let finIndex = Math.ceil(curIndex / 10) * 10 + fd;
        if (finIndex - curIndex < 3) finIndex += 10; // guarantee ≥3 steps

        const seq = [finIndex - 3, finIndex - 2, finIndex - 1, finIndex];
        const per = [110, 120, 130, 150]; // durations; last the slowest
        const delays = 80 * i; // slight stagger per slot

        (function run(j = 0) {
          if (j >= seq.length) return;
          setTimeout(() => {
            animateY(slot, h * seq[j], per[j], easeOutCubic, () => run(j + 1));
          }, delays);
        })();
      }
    }

    requestAnimationFrame(scramble);
  }

  // ---------- Day logic ----------
  const daySinceLaunch = () =>
    Math.max(0, Math.floor((Date.now() - LAUNCH_UTC.getTime()) / 86400000));

  function updateDay() {
    const n = daySinceLaunch();
    const label = String(n).padStart(2, '0');
    root.setAttribute('aria-label', `DAY ${label}`);
    animateTo(label);
  }

  updateDay();

  // Midnight (UTC) rollover
  (function scheduleMidnightUTC() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // Console helpers
  window.AUB_SHUFFLE = (n) => animateTo(String(n).padStart(2, '0'));
  window.AUB_TUNE_Y  = (em) => root.style.setProperty('--aub-y-nudge', `${em}em`);
  window.AUB_TUNE_X  = (em) => root.style.setProperty('--aub-x-nudge', `${em}em`);

  // ---------- CSS: perfectly centered, crisp text, thin seam only ----------
  function injectCSS(force=false) {
    const old = document.getElementById('aub-odo-css');
    if (force && old) old.remove();
    if (document.getElementById('aub-odo-css')) return;

    const css = `
.aub-day-odometer{
  display:inline-flex; gap:.08em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
  --aub-y-nudge:-0.06em;     /* tweak via AUB_TUNE_Y(x) if the seam is a hair off */
  --aub-x-nudge:0em;         /* tweak via AUB_TUNE_X(x) if glyph is a hair left/right */
}
.aub-slot{
  position:relative; display:inline-block;
  /* exact 2× cell height to make seam sit in the middle */
  --cell-h: 1.0em;
  width:1.05ch; height:calc(var(--cell-h) * 2);
  overflow:hidden; border-radius:.16em; background:#000;
  isolation:isolate; filter:drop-shadow(0 2px 7px rgba(0,0,0,.35));
}
.aub-slot::after{
  content:""; position:absolute; left:0; right:0; top:50%; height:1px;
  background:rgba(255,255,255,.06); pointer-events:none;
}
.aub-reel{ display:block; transform:translate3d(0,0,0); }
.aub-cell{
  display:flex; align-items:center; justify-content:center;
  width:100%; height:var(--cell-h);
  font-size:1.7ch; font-weight:800; line-height:1; color:#fff;
  text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased;
}
.aub-glyph{
  display:inline-block;
  transform: translate(var(--aub-x-nudge), var(--aub-y-nudge));
  backface-visibility:hidden; transform-style:preserve-3d;
  text-shadow: 0 0 10px rgba(255,255,255,.25); /* subtle glow */
}
`;
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();

