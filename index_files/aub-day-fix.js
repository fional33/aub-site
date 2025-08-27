(() => {
  // --- Read launch day (UTC) ---
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
      || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // wipe any old markup to prevent overlays / duplicates
  root.textContent = '';
  injectCSS(true);

  // ---------- DOM builders ----------
  function buildReel(loopCount = 3) {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    // three loops 0..9 so we can always travel forward
    for (let r = 0; r < loopCount; r++) {
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
    // create up to count
    for (let i = slots.length; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'aub-slot';
      s.setAttribute('aria-hidden', 'true');
      s.appendChild(buildReel());
      root.prepend(s); // prepend so higher digits stay on the left
    }
    // ensure each has a reel
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (const s of slots) if (!s.querySelector('.aub-reel')) {
      s.innerHTML = '';
      s.appendChild(buildReel());
    }
    return slots;
  }

  // ---------- Geometry / transforms ----------
  const hCache = new WeakMap();
  function cellH(slot) {
    let h = hCache.get(slot);
    if (!h) {
      const c = slot.querySelector('.aub-cell');
      h = Math.round(c?.getBoundingClientRect().height || 0);
      if (!h) {
        // fallback measurement (font not ready yet)
        const tmp = document.createElement('span');
        tmp.className = 'aub-cell';
        tmp.style.visibility = 'hidden';
        tmp.textContent = '0';
        slot.appendChild(tmp);
        h = Math.round(tmp.getBoundingClientRect().height || 20);
        tmp.remove();
      }
      hCache.set(slot, h);
    }
    return Math.max(1, h);
  }

  function setY(slot, y) {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return;
    reel._y = y;
    reel.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  }

  function snapToDigit(slot, d) {
    const h = cellH(slot);
    // middle loop (index 10..19) so we always move forward
    const idx = 10 + ((d % 10) + 10) % 10;
    setY(slot, h * idx);
  }

  // rAF tween
  function animateY(slot, toY, ms, ease, done) {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return;
    const fromY = reel._y ?? 0;
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

  // ---------- Shuffle pipeline: scramble → 3 soft ticks → reveal ----------
  function animateTo(targetStr) {
    const slots = ensureSlots(targetStr.length);
    const final = targetStr.padStart(slots.length, '0').split('').map(n => +n);

    // randomize starting digit and center to the middle loop
    const startY = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      snapToDigit(slots[i], Math.floor(Math.random() * 10));
      startY[i] = slots[i].querySelector('.aub-reel')._y;
    }

    // choose scramble targets (forward-only, shuffly, shorter on left)
    const targetY = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const h = cellH(slots[i]);
      const baseSpins = 5.5 - i * 0.9;         // fewer spins on leftmost
      const jitter    = 0.85 + Math.random()*0.5;
      const extra     = Math.floor(Math.random() * 10);
      const spins     = Math.max(3, baseSpins * jitter);
      targetY[i] = startY[i] + h * (spins * 10 + extra);
    }

    // Phase A: smooth scramble (fast but fluid)
    const SCRAMBLE_MS = 520;
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

    // Phase B: three soft ticks decelerating into the final digit
    function settle() {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        const h = cellH(slot);
        const fd = final[i];

        const curIndex = Math.round(reel._y / h);
        let finIndex = Math.ceil(curIndex / 10) * 10 + fd;
        if (finIndex - curIndex < 3) finIndex += 10; // ensure ≥3 ticks

        const seq = [finIndex - 3, finIndex - 2, finIndex - 1, finIndex];
        const per = [90, 105, 120, 150]; // last is slowest for the reveal
        const delay = 60 * i;            // gentle left→right cascade

        (function run(j = 0) {
          if (j >= seq.length) return;
          setTimeout(() => {
            animateY(slot, h * seq[j], per[j], easeOutCubic, () => run(j + 1));
          }, delay);
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

  // refresh at midnight UTC
  (function scheduleMidnightUTC() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // ---------- Console helpers ----------
  window.AUB_SHUFFLE = (n) => animateTo(String(n).padStart(2, '0'));
  window.AUB_TUNE_Y  = (em) => root.style.setProperty('--aub-y-nudge', `${em}em`);
  window.AUB_TUNE_X  = (em) => root.style.setProperty('--aub-x-nudge', `${em}em`);
  window.AUB_STATUS  = () => {
    const slots = Array.from(root.querySelectorAll('.aub-slot'));
    return slots.map(s => ({ h: cellH(s), y: s.querySelector('.aub-reel')._y }));
  };

  // ---------- CSS ----------
  function injectCSS(force=false) {
    const prev = document.getElementById('aub-odo-css');
    if (force && prev) prev.remove();
    if (document.getElementById('aub-odo-css')) return;

    const css = `
.aub-day-odometer{
  display:inline-flex; gap:.08em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
  --aub-y-nudge:-0.06em;  /* nudge number across seam if needed */
  --aub-x-nudge:0em;
}
.aub-slot{
  position:relative; display:inline-block;
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
  contain: layout paint;  /* isolates each row for smoother compositing */
}
.aub-glyph{
  display:inline-block; backface-visibility:hidden; transform-style:preserve-3d;
  transform: translate(var(--aub-x-nudge), var(--aub-y-nudge));
  text-shadow: 0 0 .35em rgba(255,255,255,.28); /* soft glow */
}
`;
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // Recompute heights when fonts finish loading (prevents bad first measure)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => hCache.clear());
  }
})();

