(() => {
  // ---------- CONFIG ----------
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
      || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );
  const LOOPS = 14;                 // tall reels so we never run out
  const SLOT_ASPECT = 0.62;         // width = size * aspect
  const SIZE_PX = 72;               // default height for HALF (panel); full slot = 2*SIZE_PX

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // wipe any old DOM/CSS
  root.textContent = '';
  injectCSS(true);

  // ---------- DOM ----------
  function buildReel(loopCount = LOOPS) {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    for (let r = 0; r < loopCount; r++) {
      for (let d = 0; d < 10; d++) {
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
    while (slots.length < count) {
      const s = document.createElement('span');
      s.className = 'aub-slot';
      s.appendChild(buildReel());
      root.prepend(s); // left-most first
      slots = Array.from(root.querySelectorAll('.aub-slot'));
    }
    // make sure each slot has a reel
    for (const s of slots) if (!s.querySelector('.aub-reel')) {
      s.innerHTML = ''; s.appendChild(buildReel());
    }
    return slots;
  }

  // ---------- geometry / transforms ----------
  const slotH = (slot) => Math.max(1, Math.round(slot.getBoundingClientRect().height || 1));
  const reelH = (slot) => slot.querySelector('.aub-reel').scrollHeight;

  function setY(slot, y) {
    const reel = slot.querySelector('.aub-reel'); if (!reel) return;
    reel._y = y;
    reel.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  }

  function midIndex(digit) {
    return Math.floor(LOOPS / 2) * 10 + ((digit % 10 + 10) % 10);
  }

  function snapToDigit(slot, digit) {
    const h = slotH(slot);
    setY(slot, h * midIndex(digit));
  }

  function animateY(slot, toY, ms, ease, done) {
    const reel = slot.querySelector('.aub-reel'); if (!reel) return;
    const fromY = reel._y ?? 0;
    const maxY = reelH(slot) - slotH(slot);      // clamp so we never scroll past content
    toY = Math.min(toY, maxY);

    const t0 = performance.now();
    reel.style.willChange = 'transform';
    (function tick(now) {
      const t = Math.min(1, (now - t0) / ms);
      const v = ease(t);
      setY(slot, fromY + (toY - fromY) * v);
      if (t < 1) requestAnimationFrame(tick);
      else { reel.style.willChange = 'auto'; done && done(); }
    })(performance.now());
  }

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  // ---------- render pipeline ----------
  function showInstant(str) {
    const slots = ensureSlots(str.length);
    const digits = str.padStart(slots.length, '0').split('').map(n => +n);
    slots.forEach((s, i) => snapToDigit(s, digits[i]));
  }

  function shuffleTo(str) {
    const slots = ensureSlots(str.length);
    const final = str.padStart(slots.length, '0').split('').map(n => +n);

    // Start at a visible random digit (instant)
    slots.forEach(s => snapToDigit(s, Math.floor(Math.random() * 10)));

    // SCRAMBLE: fast & fluid, never overshoot
    const startY = slots.map(s => s.querySelector('.aub-reel')._y);
    const targets = slots.map((s, i) => {
      const h = slotH(s), maxY = reelH(s) - h;
      const spins = Math.max(2.6, (4.0 - i * 0.6) * (0.9 + Math.random() * 0.5));
      const extra = Math.floor(Math.random() * 10);
      return Math.min(startY[i] + h * (spins * 10 + extra), maxY);
    });

    const SCRAMBLE_MS = 520;
    const t0 = performance.now();
    (function scramble(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const v = easeOutCubic(t);
      for (let i = 0; i < slots.length; i++) {
        setY(slots[i], startY[i] + (targets[i] - startY[i]) * v);
      }
      if (t < 1) requestAnimationFrame(scramble); else settle();
    })(performance.now());

    // SETTLE: three gentle ticks → final (slows down)
    function settle() {
      slots.forEach((slot, i) => {
        const h = slotH(slot), maxY = reelH(slot) - h;
        const curIdx = Math.round(slot.querySelector('.aub-reel')._y / h);
        let finIdx = Math.ceil(curIdx / 10) * 10 + final[i];
        if (finIdx - curIdx < 3) finIdx += 10;              // ensure ≥3 ticks
        while (h * finIdx > maxY) finIdx -= 10;             // clamp into reel

        const seq = [finIdx - 3, finIdx - 2, finIdx - 1, finIdx];
        const per = [90, 110, 140, 180];
        const delay = 50 * i;

        (function step(j = 0) {
          if (j >= seq.length) return;
          setTimeout(() => {
            animateY(slot, h * seq[j], per[j], easeOutCubic, () => step(j + 1));
          }, delay);
        })();
      });
    }
  }

  // ---------- day calc + schedule ----------
  const daySinceLaunch = () =>
    Math.max(0, Math.floor((Date.now() - LAUNCH_UTC.getTime()) / 86400000));

  function updateDay() {
    const label = String(daySinceLaunch()).padStart(2, '0');
    root.setAttribute('aria-label', `DAY ${label}`);
    showInstant(label);   // no blank state
    shuffleTo(label);     // then animate
  }

  requestAnimationFrame(updateDay);
  (function scheduleMidnightUTC() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // ---------- console helpers ----------
  window.AUB_SHUFFLE = (n) => shuffleTo(String(n).padStart(2, '0'));
  window.AUB_SIZE    = (px = SIZE_PX) => root.style.setProperty('--aub-size', `${px}px`);
  window.AUB_TUNE_Y  = (em) => root.style.setProperty('--aub-y-nudge', `${em}em`);
  window.AUB_TUNE_X  = (em) => root.style.setProperty('--aub-x-nudge', `${em}em`);
  window.AUB_STATUS  = () => Array.from(root.querySelectorAll('.aub-slot')).map(s => ({
    h: slotH(s), max: reelH(s), y: s.querySelector('.aub-reel')._y
  }));

  // ---------- CSS ----------
  function injectCSS(force=false){
    const old = document.getElementById('aub-odo-css');
    if (force && old) old.remove();
    if (document.getElementById('aub-odo-css')) return;

    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = `
.aub-day-odometer{
  --aub-size:${SIZE_PX}px;
  --aub-y-nudge:-0.02em;  /* tiny vertical trim over the seam */
  --aub-x-nudge: 0em;
  display:inline-flex; gap:.08em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
}
.aub-slot{
  position:relative; display:inline-block;
  width:calc(var(--aub-size) * ${SLOT_ASPECT});
  height:calc(var(--aub-size) * 2);
  overflow:hidden; border-radius:.22em; background:#000; isolation:isolate;
  filter:drop-shadow(0 2px 7px rgba(0,0,0,.35));
}
.aub-slot::after{ /* seam */
  content:""; position:absolute; inset:auto 0 0 0; top:50%; height:1px;
  background:rgba(255,255,255,.055); pointer-events:none;
}
.aub-slot::before{ /* soft panel shading (non-opaque) */
  content:""; position:absolute; inset:0; pointer-events:none;
  background:
    linear-gradient(to bottom, rgba(255,255,255,.08), rgba(0,0,0,0) 48%),
    linear-gradient(to top,    rgba(0,0,0,.22),      rgba(0,0,0,0) 52%);
}
.aub-reel{ display:block; transform:translate3d(0,0,0); }
.aub-cell{
  display:flex; align-items:center; justify-content:center;
  width:100%; height:calc(var(--aub-size) * 2);
}
.aub-glyph{
  display:inline-block;
  font-size:calc(var(--aub-size) * 1.28);
  font-weight:800; line-height:1; letter-spacing:.01em;
  color:#fff; text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased;
  transform: translate(var(--aub-x-nudge), var(--aub-y-nudge));
  text-shadow: 0 0 .42em rgba(255,255,255,.26);
}
@media (prefers-reduced-motion: reduce){
  .aub-reel{ transition:none !important; }
}
`;
    document.head.appendChild(style);
  }
})();

