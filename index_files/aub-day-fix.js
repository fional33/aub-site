(() => {
  // ===== LAUNCH DATE (UTC) =====
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
      || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // Clean out any previous markup so we don't double-render
  root.textContent = '';
  injectCSS(true);

  // ---------- DOM builders ----------
  function buildReel() {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    // 3 loops of 0..9 so we can always scroll forward and land cleanly
    for (let r = 0; r < 3; r++) {
      for (let d = 0; d < 10; d++) {
        const cell = document.createElement('span');
        cell.className = 'aub-cell';
        const glyph = document.createElement('span');
        glyph.className = 'aub-glyph';
        glyph.textContent = d;
        cell.appendChild(glyph);
        reel.appendChild(cell);
      }
    }
    reel._y = 0; // current absolute offset in px
    return reel;
  }

  function ensureSlots(count) {
    let slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (let i = slots.length; i < count; i++) {
      const slot = document.createElement('span');
      slot.className = 'aub-slot';
      slot.setAttribute('aria-hidden', 'true');
      slot.appendChild(buildReel());
      root.prepend(slot);
    }
    // guarantee each has a reel
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

  function setReel(slot, y, withTransition = false, dur = 0, ease = '') {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return;
    reel._y = y;
    reel.style.transition = withTransition ? `transform ${dur}ms ${ease}` : 'none';
    reel.style.transform = `translate3d(0, ${-Math.round(y)}px, 0)`;
  }

  function snapToDigit(slot, digit) {
    const h = cellH(slot);
    // Land in the middle loop (index + 10) so we always have room to move forward
    setReel(slot, h * (10 + ((digit % 10 + 10) % 10)));
  }

  // ---------- Motion: smooth scramble -> 3 soft ticks ----------
  function animateTo(targetStr) {
    const slots = ensureSlots(targetStr.length);
    const final = targetStr.padStart(slots.length, '0').split('').map(n => +n);

    // (1) randomize start states & cache starting Y
    const startY = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const startDigit = Math.floor(Math.random() * 10);
      snapToDigit(slots[i], startDigit);
      startY[i] = slots[i].querySelector('.aub-reel')._y;
    }

    // (2) compute forward targets (always increasing Y → always scrolls the same direction)
    const targetY = new Array(slots.length);
    for (let i = 0; i < slots.length; i++) {
      const h = cellH(slots[i]);
      const baseSpins = 10 - i * 1.5;           // fewer spins on leftmost
      const jitter = 0.8 + Math.random() * 0.5; // per-slot variation
      const extraDigits = Math.floor(Math.random() * 10);
      const spins = Math.max(3, baseSpins * jitter);
      targetY[i] = startY[i] + h * (spins * 10 + extraDigits);
    }

    // (3) scramble: time-based lerp from startY -> targetY with smooth deceleration
    const A_MS = 700;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const t0 = performance.now();
    root.classList.add('is-anim');

    function scramble(now) {
      const t = Math.min(1, (now - t0) / A_MS);
      const v = easeOut(t);
      for (let i = 0; i < slots.length; i++) {
        const y = startY[i] + (targetY[i] - startY[i]) * v;
        setReel(slots[i], y, false);
      }
      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    }

    // (4) settle: three soft ticks to the final digits
    function settle() {
      const TICKS = 3;
      const STEP = 120; // ms between tick starts
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        const h = cellH(slot);
        const fd = final[i];

        // compute absolute Y for each tick (always forward, then final)
        const seq = [];
        for (let k = TICKS; k >= 0; k--) {
          const d = (fd - (TICKS - k) + 20) % 10;
          seq.push(h * (10 + d));
        }

        seq.forEach((y, idx) => {
          const delay = Math.round(STEP * (idx + 1) * (1 + i * 0.07));
          setTimeout(() => {
            // small, snappy, non-janky transition
            setReel(slot, y, true, 110 + idx * 30, 'cubic-bezier(.18,.9,.14,1)');
            if (i === slots.length - 1 && idx === seq.length - 1) {
              setTimeout(() => root.classList.remove('is-anim'), 160);
            }
          }, delay);
        });
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
  (function scheduleMidnightUTC() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // ---------- Console helpers ----------
  window.AUB_SHUFFLE = (n) => animateTo(String(n).padStart(2, '0'));
  window.AUB_TUNE_Y  = (em) => root.style.setProperty('--aub-y-nudge', `${em}em`);
  window.AUB_TUNE_X  = (em) => root.style.setProperty('--aub-x-nudge', `${em}em`);

  // ---------- Styles (centered + crisp, no overlays) ----------
  function injectCSS(force=false) {
    const old = document.getElementById('aub-odo-css');
    if (force && old) old.remove();
    if (document.getElementById('aub-odo-css')) return;

    const css = `
.aub-day-odometer{
  display:inline-flex; gap:.075em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
  --aub-y-nudge:-0.06em;          /* vertical seam tune, tweak via AUB_TUNE_Y(x)  */
  --aub-x-nudge:0em;              /* horizontal centering tweak via AUB_TUNE_X(x) */
}
.aub-slot{
  position:relative; display:inline-block;
  width:1.05ch; height:1.8ch;     /* ch ties to the “0” glyph width → strong centering */
  overflow:hidden; border-radius:.16em; background:#000; isolation:isolate;
  filter:drop-shadow(0 2px 8px rgba(0,0,0,.35));
}
.aub-slot::after{ /* subtle seam only */
  content:""; position:absolute; left:0; right:0; top:50%; height:1px;
  background:rgba(255,255,255,.05); pointer-events:none;
}
.aub-reel{ display:block; transform:translate3d(0,0,0); }
.is-anim .aub-reel{ will-change:transform; }  /* only while moving → avoids budget warning */
.aub-cell{
  display:flex; align-items:center; justify-content:center;
  width:100%; height:1ch;         /* one digit tall per cell */
  font-weight:800; font-size:1.7ch; line-height:1; color:#fff;
  text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased;
}
.aub-glyph{
  display:inline-block;
  transform: translate(var(--aub-x-nudge), var(--aub-y-nudge));
}
`;
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();

