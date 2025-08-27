(() => {
  // ===== CONFIG (UTC launch) =====
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
    || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  // Wipe any old markup to avoid double layers
  root.textContent = '';
  injectCSS(true);

  // ---------- DOM ----------
  function buildReel() {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    // 2 loops of 0..9 so we can scroll past and land cleanly
    for (let r = 0; r < 2; r++) {
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
    // Make sure each has a reel (in case of prior partial DOM)
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (const s of slots) {
      if (!s.querySelector('.aub-reel')) {
        s.innerHTML = '';
        s.appendChild(buildReel());
      }
    }
    return slots;
  }

  // ---------- Geometry helpers ----------
  const cellHeightCache = new WeakMap();
  function cellH(slot) {
    let h = cellHeightCache.get(slot);
    if (!h) {
      const c = slot.querySelector('.aub-cell');
      h = Math.max(1, Math.round(c?.getBoundingClientRect().height || 0));
      cellHeightCache.set(slot, h);
    }
    return h;
  }

  function jumpToDigit(slot, digit) {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return;
    const h = cellH(slot);
    const off = Math.round(h * ((((digit % 10) + 10) % 10) + 10)); // snap to whole px
    const prev = reel.style.transition;
    reel.style.transition = 'none';
    reel.style.transform = `translate3d(0, ${-off}px, 0)`;
    // force style apply
    reel.offsetHeight;
    reel.style.transition = prev;
  }

  // ---------- Animation ----------
  // Smooth, high-FPS rAF loop for Phase A (scramble), then 3 slow ticks (settle).
  function scrambleThenReveal(targetStr) {
    const slots = ensureSlots(targetStr.length);
    const finalDigits = targetStr.padStart(slots.length, '0').split('').map(n => +n);

    // Randomize start to avoid “same numbers”
    slots.forEach(s => jumpToDigit(s, Math.floor(Math.random() * 10)));

    // PHASE A: continuous smooth scramble that decelerates
    const A_MS = 700;                     // total scramble time (fast & smooth)
    const t0   = performance.now();
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    root.classList.add('is-anim');        // enables will-change only while animating

    function tick(now) {
      const t = Math.min(1, (now - t0) / A_MS);
      const v = easeOut(t);               // 0→1, slows toward the end

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        if (!reel) continue;
        const h = cellH(slot);

        // Per-slot randomization so reels don’t sync
        const baseSpin = 12 - i * 2;      // fewer spins for leftmost
        const jitter   = 0.8 + Math.random() * 0.4;
        const spins    = (baseSpin * (1 - v) + 1) * jitter; // decelerate
        const px       = Math.round(h * (10 + spins));      // always ≥ one full loop

        // No CSS transitions here; pure transform for max FPS
        reel.style.transition = 'none';
        reel.style.transform  = `translate3d(0, ${-px}px, 0)`;
      }
      if (t < 1) requestAnimationFrame(tick);
      else settle();
    }

    function settle() {
      // PHASE B: three gentle ticks into the final number
      // Uses short transitions to give that satisfying “tick… tick… reveal”
      const TICKS = 3;
      const STEP  = 120; // ms between tick starts
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        if (!reel) continue;

        const fd = finalDigits[i];
        for (let k = 0; k <= TICKS; k++) {
          const d = (fd - (TICKS - k) + 20) % 10;
          const delay = Math.round(STEP * (k + 1) * (1 + i * 0.08));
          setTimeout(() => {
            const h   = cellH(slot);
            const off = Math.round(h * (10 + d));
            reel.style.transition = `transform ${120 + k * 30}ms cubic-bezier(.18,.9,.14,1)`;
            reel.style.transform  = `translate3d(0, ${-off}px, 0)`;
            if (k === TICKS && i === slots.length - 1) {
              // turn off will-change once the very last tick completes
              setTimeout(() => root.classList.remove('is-anim'), 180);
            }
          }, delay);
        }
      }
    }

    requestAnimationFrame(tick);
  }

  // ---------- Day logic ----------
  const daySinceLaunch = () => Math.max(0,
    Math.floor((Date.now() - LAUNCH_UTC.getTime()) / 86400000)
  );

  function updateDay() {
    const n = daySinceLaunch();
    const label = String(n).padStart(2, '0');
    root.setAttribute('aria-label', `DAY ${label}`);
    scrambleThenReveal(label);
  }

  updateDay();
  // UTC midnight rollover
  (function scheduleMidnight() {
    const n = new Date();
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0));
    setTimeout(() => { updateDay(); setInterval(updateDay, 86400000); }, next - n);
  })();

  // ---------- Debug helpers in console ----------
  window.AUB_SHUFFLE = (n) => scrambleThenReveal(String(n).padStart(2, '0'));
  window.AUB_TUNE    = (em) => root.style.setProperty('--aub-glyph-nudge', `${em}em`);

  // ---------- Styles (movement only; no overlay halves) ----------
  function injectCSS(force=false) {
    const old = document.getElementById('aub-odo-css');
    if (force && old) old.remove();
    if (document.getElementById('aub-odo-css')) return;

    const css = `
.aub-day-odometer{
  display:inline-flex; gap:.06em; align-items:center;
  font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
  --aub-glyph-nudge:-0.08em; /* tweak with AUB_TUNE(x) if seam looks off */
}
.aub-slot{
  position:relative; display:inline-block; width:.49em; height:.88em;
  overflow:hidden; border-radius:.12em; background:#000; isolation:isolate;
  /* minimal shadow; no blurs that would smear glyphs */
  filter:drop-shadow(0 2px 8px rgba(0,0,0,.35));
}
.aub-slot::after{ /* thin seam line only */
  content:""; position:absolute; left:0; right:0; top:50%; height:1px;
  background:rgba(255,255,255,.05); pointer-events:none;
}
.aub-reel{
  display:block; transform:translate3d(0,0,0);
}
.is-anim .aub-reel{ will-change:transform; } /* will-change only while moving */
.aub-cell{
  display:flex; align-items:center; justify-content:center;
  width:100%; height:1em; overflow:visible !important;
  font-weight:800; font-size:1.16em; line-height:1; color:#fff;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
.aub-glyph{ transform:translateY(var(--aub-glyph-nudge)); }
`;
    const style = document.createElement('style');
    style.id = 'aub-odo-css';
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
