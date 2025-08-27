(() => {
  // --- Launch day in UTC ---
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
      || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // wipe any previous markup to prevent double-layers
  root.textContent = '';
  injectCSS(true);

  // ------- cache (no .clear() on WeakMap; we just replace it) -------
  let hCache = new WeakMap();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { hCache = new WeakMap(); });
  }

  // ------- DOM builders -------
  function buildReel(loopCount = 3) {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
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
    for (let i = slots.length; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'aub-slot';
      s.setAttribute('aria-hidden', 'true');
      s.appendChild(buildReel());
      root.prepend(s); // keeps tens on the left
    }
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (const s of slots) if (!s.querySelector('.aub-reel')) {
      s.innerHTML = ''; s.appendChild(buildReel());
    }
    return slots;
  }

  // ------- geometry / transforms -------
  function cellH(slot) {
    let h = hCache.get(slot);
    if (!h) {
      const probe = document.createElement('span');
      probe.className = 'aub-cell';
      probe.style.visibility = 'hidden';
      probe.innerHTML = '<span class="aub-glyph">0</span>';
      slot.appendChild(probe);
      h = Math.max(1, Math.round(probe.getBoundingClientRect().height || 1));
      probe.remove();
      hCache.set(slot, h);
    }
    return h;
  }
  function setY(slot, y) {
    const reel = slot.querySelector('.aub-reel'); if (!reel) return;
    reel._y = y;
    reel.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  }
  function snapToDigit(slot, d) {
    const h = cellH(slot);
    const idx = 10 + ((d % 10) + 10) % 10; // middle loop
    setY(slot, h * idx);
  }
  function animateY(slot, toY, ms, ease, done) {
    const reel = slot.querySelector('.aub-reel'); if (!reel) return;
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

  // ------- shuffle pipeline: immediate snap -> scramble -> soft ticks -------
  function showImmediately(targetStr) {
    const slots = ensureSlots(targetStr.length);
    const digits = targetStr.padStart(slots.length, '0').split('').map(n => +n);
    slots.forEach((s, i) => snapToDigit(s, digits[i]));
  }

  function animateTo(targetStr) {
    const slots = ensureSlots(targetStr.length);
    const final = targetStr.padStart(slots.length, '0').split('').map(n => +n);

    // start at random digits (visible right away)
    for (let i = 0; i < slots.length; i++) snapToDigit(slots[i], Math.floor(Math.random() * 10));

    // scramble targets (forward-only, staggered)
    const startY = slots.map(s => s.querySelector('.aub-reel')._y);
    const targetY = slots.map((s, i) => {
      const h = cellH(s);
      const baseSpins = 5.2 - i * 0.9;          // fewer on the left
      const jitter    = 0.9 + Math.random() * 0.5;
      const extra     = Math.floor(Math.random() * 10);
      const spins     = Math.max(3, baseSpins * jitter);
      return startY[i] + h * (spins * 10 + extra);
    });

    // Phase A: smooth scramble
    const SCRAMBLE_MS = 480;
    const t0 = performance.now();
    (function scramble(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const v = easeOutCubic(t);
      for (let i = 0; i < slots.length; i++) {
        setY(slots[i], startY[i] + (targetY[i] - startY[i]) * v);
      }
      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    })(performance.now());

    // Phase B: three soft ticks → final
    function settle() {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        const h = cellH(slot);
        const fd = final[i];

        const curIndex = Math.round(reel._y / h);
        let finIndex = Math.ceil(curIndex / 10) * 10 + fd;
        if (finIndex - curIndex < 3) finIndex += 10; // ≥ 3 ticks

        const seq = [finIndex - 3, finIndex - 2, finIndex - 1, finIndex];
        const per = [90, 110, 130, 160];  // smooth → slower
        const delay = 50 * i;             // slight left→right cascade

        (function run(j = 0) {
          if (j >= seq.length) return;
          setTimeout(() => {
            animateY(slot, h * seq[j], per[j], easeOutCubic, () => run(j + 1));
          }, delay);
        })();
      }
    }
  }

  // ------- day logic -------
  const daySinceLaunch = () =>
    Math.max(0, Math.floor((Date.now() - LAUNCH_UTC.getTime()) / 86400000));

  function updateDay() {
    const n = daySinceLaunch();
    const label = String(n).padStart(2, '0');
    root.setAttribute('aria-label', `DAY ${label}`);
    showImmediately(label);     // visible instantly
    animateTo(label);           // then shuffle to it
  }

  updateDay();

  // refresh exactly at midnight UTC
  (function scheduleMidnightUTC() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // ------- console helpers -------
  window.AUB_SHUFFLE = (n) => animateTo(String(n).padStart(2, '0'));
  window.AUB_TUNE_Y  = (em) => root.style.setProperty('--aub-y-nudge', `${em}em`);
  window.AUB_TUNE_X  = (em) => root.style.setProperty('--aub-x-nudge', `${em}em`);
  window.AUB_SIZE    = (px) => root.style.setProperty('--aub-size', `${px}px`);
  window.AUB_STATUS  = () => {
    const slots = Array.from(root.querySelectorAll('.aub-slot'));
    return slots.map(s => ({ h: cellH(s), y: s.querySelector('.aub-reel')._y }));
  };

  // ------- CSS -------
  function injectCSS(force=false) {
    const prev = document.getElementById('aub-odo-css');
    if (force && prev) prev.remove();
    if (document.getElementById('aub-odo-css')) return;

    const css = `
.aub-day-odometer{
  --aub-size: 72px;              /* overall scale */
  --aub-y-nudge:-0.06em;         /* vertical seam micro-adjust */
  --aub-x-nudge:0em;             /* horizontal micro-adjust */
  display:inline-flex; gap:.08em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
}
.aub-slot{
  position:relative; display:inline-block;
  width:calc(var(--aub-size) * .66);
  height:calc(var(--aub-size) * 2);         /* top+bottom panels */
  overflow:hidden; border-radius:.22em; background:#000;
  isolation:isolate; filter:drop-shadow(0 2px 7px rgba(0,0,0,.35));
}
.aub-slot::after{ /* seam line */
  content:""; position:absolute; left:0; right:0; top:50%; height:1px;
  background:rgba(255,255,255,.06); pointer-events:none;
}
.aub-reel{ display:block; transform:translate3d(0,0,0); }
.aub-cell{
  display:flex; align-items:center; justify-content:center;
  width:100%; height:var(--aub-size);      /* each half height */
  contain:layout paint;
}
.aub-glyph{
  display:inline-block;
  font-size:calc(var(--aub-size) * 1.22);  /* spans the seam */
  font-weight:800; line-height:1;
  color:#fff; text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased;
  transform: translate(var(--aub-x-nudge), var(--aub-y-nudge));
  text-shadow: 0 0 .35em rgba(255,255,255,.28); /* soft glow */
}
`;
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();

