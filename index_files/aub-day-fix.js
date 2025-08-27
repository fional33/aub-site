(() => {
  // ===== Launch day (UTC) =====
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
      || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // Reset any previous markup/styles
  root.textContent = '';
  injectCSS(true);

  // ------- DOM -------
  function buildReel(loopCount = 3) {
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
    for (let i = slots.length; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'aub-slot';
      s.setAttribute('aria-hidden', 'true');
      s.appendChild(buildReel());
      root.prepend(s); // tens on the left
    }
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (const s of slots) if (!s.querySelector('.aub-reel')) {
      s.innerHTML = ''; s.appendChild(buildReel());
    }
    return slots;
  }

  // ------- geometry / transforms (one FULL slot per digit step) -------
  const slotH = (slot) => Math.max(1, Math.round(slot.getBoundingClientRect().height || 1));
  function setY(slot, y) {
    const reel = slot.querySelector('.aub-reel'); if (!reel) return;
    reel._y = y;
    reel.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  }
  function snapToDigit(slot, d) {
    const h = slotH(slot);
    const idx = 10 + ((d % 10) + 10) % 10; // use middle loop
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

  // ------- pipeline -------
  function showInstant(str) {
    const slots = ensureSlots(str.length);
    const digits = str.padStart(slots.length, '0').split('').map(n => +n);
    slots.forEach((s, i) => snapToDigit(s, digits[i]));
  }
  function shuffleTo(str) {
    const slots = ensureSlots(str.length);
    const final = str.padStart(slots.length, '0').split('').map(n => +n);

    // start from random visible digits (instant)
    slots.forEach(s => snapToDigit(s, Math.floor(Math.random() * 10)));

    // SCRAMBLE (fluid)
    const startY = slots.map(s => s.querySelector('.aub-reel')._y);
    const tgtY   = slots.map((s, i) => {
      const h = slotH(s);
      const spins = Math.max(2.5, (4.2 - i * 0.7) * (0.9 + Math.random() * 0.5));
      const extra = Math.floor(Math.random() * 10); // desync
      return startY[i] + h * (spins * 10 + extra);
    });

    const SCRAMBLE_MS = 520;
    const t0 = performance.now();
    (function scramble(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const v = easeOutCubic(t);
      for (let i = 0; i < slots.length; i++) {
        setY(slots[i], startY[i] + (tgtY[i] - startY[i]) * v);
      }
      if (t < 1) requestAnimationFrame(scramble); else settle();
    })(performance.now());

    // SETTLE: three gentle ticks then final (slower at the end)
    function settle() {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        const h = slotH(slot);
        const fd = final[i];

        const curIdx = Math.round(reel._y / h);
        let finIdx = Math.ceil(curIdx / 10) * 10 + fd;
        if (finIdx - curIdx < 3) finIdx += 10; // ensure ≥3 ticks

        const seq = [finIdx - 3, finIdx - 2, finIdx - 1, finIdx];
        const per = [90, 110, 140, 180]; // progressive slow-down
        const delay = 60 * i;            // left→right cascade

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
    showInstant(label);   // render immediately (no more blank cards)
    shuffleTo(label);     // then animate
  }

  // kickoff + midnight UTC rollover
  requestAnimationFrame(updateDay);
  (function scheduleMidnightUTC() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // ------- console helpers (F12) -------
  window.AUB_SHUFFLE = (n) => shuffleTo(String(n).padStart(2, '0'));
  window.AUB_SIZE    = (px) => root.style.setProperty('--aub-size', `${px}px`);
  window.AUB_TUNE_Y  = (em) => root.style.setProperty('--aub-y-nudge', `${em}em`);
  window.AUB_TUNE_X  = (em) => root.style.setProperty('--aub-x-nudge', `${em}em`);
  window.AUB_STATUS  = () => Array.from(root.querySelectorAll('.aub-slot')).map(s => ({
    h: slotH(s), y: s.querySelector('.aub-reel')._y
  }));

  // ------- CSS (full-height digit cell; overlays don’t hide text) -------
  function injectCSS(force=false) {
    const prev = document.getElementById('aub-odo-css');
    if (force && prev) prev.remove();
    if (document.getElementById('aub-odo-css')) return;

    const css = `
.aub-day-odometer{
  --aub-size: 72px;
  --aub-y-nudge:-0.02em;  /* tiny seam tweak */
  --aub-x-nudge: 0em;
  display:inline-flex; gap:.08em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
}
.aub-slot{
  position:relative; display:inline-block;
  width:calc(var(--aub-size) * .62);
  height:calc(var(--aub-size) * 2);         /* FULL window = one digit cell */
  overflow:hidden; border-radius:.22em; background:#000;
  isolation:isolate; filter:drop-shadow(0 2px 7px rgba(0,0,0,.35));
}
.aub-slot::after{ /* seam line */
  content:""; position:absolute; left:0; right:0; top:50%; height:1px;
  background:rgba(255,255,255,.055); pointer-events:none;
}
.aub-slot::before{ /* soft panel shading */
  content:""; position:absolute; inset:0; pointer-events:none;
  background:
    linear-gradient(to bottom, rgba(255,255,255,.08), rgba(0,0,0,0) 48%),
    linear-gradient(to top,    rgba(0,0,0,.22),      rgba(0,0,0,0) 52%);
  mix-blend-mode: normal;
}
.aub-reel{ display:block; transform:translate3d(0,0,0); }
.aub-cell{
  display:flex; align-items:center; justify-content:center;
  width:100%; height:calc(var(--aub-size) * 2);  /* full slot height */
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
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();

