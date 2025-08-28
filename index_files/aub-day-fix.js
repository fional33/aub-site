/* AUB Day Odometer — clean randomized reel with smooth decel + UTC midnight rollover
   - One visual set of digits (no overlays)
   - Randomized cycles per slot so it never looks the same
   - High-FPS rAF loop with easing; snaps to integer pixels to avoid blur
   - Respects prefers-reduced-motion unless window.AUB_FORCE_MOTION = true
   - Auto-rolls at next UTC midnight
*/
(() => {
  'use strict';

  // ===== CONFIG you might tweak later =====
  const SELECTOR = '.aub-day-odometer';
  const SLOTS = 2;                 // “DAY 03” → 2 digits
  const REEL_REPEATS = 32;         // 0..9 repeated this many times (covers long spins)
  const BASE_CYCLES = 9;           // min full 0→9 turns per slot before landing
  const CYCLE_SPREAD = 9;          // extra random turns [0..spread]
  const DURATION_MS = 900;         // spin time per shuffle (total), not per slot
  const GAP_EM = 0.12;             // visual spacing between slots
  const EASING = t => 1 - Math.pow(1 - t, 4);  // easeOutQuart
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content ||
    (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  // ===== one-time CSS so the component is self-contained =====
  const STYLE_ID = 'aub-day-odometer-inline-css';
  if (!document.getElementById(STYLE_ID)) {
    const css = `
      ${SELECTOR}{display:inline-flex;align-items:center;gap:${GAP_EM}em;}
      ${SELECTOR} .aub-slot{position:relative;display:inline-block;
        height:1em;width:1.15em;border-radius:6px;overflow:hidden;
        background:#000;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);}
      ${SELECTOR} .aub-window{position:absolute;inset:0;overflow:hidden;}
      ${SELECTOR} .aub-reel{position:absolute;left:0;top:0;will-change:transform;}
      ${SELECTOR} .aub-glyph{height:1em;line-height:1em;width:100%;
        display:block;text-align:center;font-variant-numeric:tabular-nums;}
      ${SELECTOR} .aub-gap{display:inline-block;width:0.25em;}
    `.replace(/\s+/g,' ');
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ===== helpers =====
  const prefersReduced = () =>
    !window.AUB_FORCE_MOTION && window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pad2 = n => String(Math.max(0, Math.min(99, n))).padStart(2, '0');

  function daySinceLaunchUTC() {
    const now = new Date();
    const diff = now.getTime() - LAUNCH_UTC.getTime();
    let d = Math.floor(diff / 86400000) + 1; // day 1 on launch day
    if (d < 1) d = 1;
    return d;
  }

  function nextUtcMidnightDelayMs() {
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1, 0, 0, 0, 30
    ));
    return Math.max(100, next.getTime() - now.getTime());
  }

  function q(sel, root=document){ return root.querySelector(sel); }

  // Build (or rebuild) the odometer internals to a single, clean structure
  function build(root) {
    if (!root || root.dataset.aubBuilt === '1') return root;
    root.dataset.aubBuilt = '1';
    // wipe anything that was server-rendered (prevents double numbers)
    root.textContent = '';

    const frag = document.createDocumentFragment();
    for (let i = 0; i < SLOTS; i++) {
      const slot = document.createElement('span');
      slot.className = 'aub-slot';
      const win = document.createElement('span');
      win.className = 'aub-window';
      const reel = document.createElement('span');
      reel.className = 'aub-reel';
      // Fill reel with 0..9 repeated
      for (let r = 0; r < REEL_REPEATS; r++) {
        for (let d = 0; d <= 9; d++) {
          const g = document.createElement('span');
          g.className = 'aub-glyph';
          g.textContent = String(d);
          reel.appendChild(g);
        }
      }
      win.appendChild(reel);
      slot.appendChild(win);
      frag.appendChild(slot);
      if (i === 0) {
        const gap = document.createElement('span');
        gap.className = 'aub-gap';
        frag.appendChild(gap);
      }
    }
    root.appendChild(frag);
    return root;
  }

  // Measure glyph height once
  function glyphHeight(root) {
    const g = q('.aub-glyph', root);
    const h = g ? g.getBoundingClientRect().height : 0;
    return h || parseFloat(getComputedStyle(g).lineHeight) || 0;
  }

  // Animate reels to a target 2-digit number with randomized spin cycles
  function shuffleTo(root, targetNumber) {
    if (!root) return;
    const target = pad2(targetNumber);
    root.setAttribute('aria-label', 'DAY ' + target);

    const slots = Array.from(root.querySelectorAll('.aub-slot'));
    const reels = slots.map(s => q('.aub-reel', s));
    const gh = glyphHeight(root);
    if (!gh) { // safety: if not measurable, just set instantly
      reels.forEach((reel, i) => {
        const d = Number(target[i]);
        reel.style.transform = `translate3d(0, ${-d*16}px, 0)`;
      });
      return;
    }

    // If reduced motion: snap immediately, no animation
    if (prefersReduced()) {
      reels.forEach((reel, i) => {
        const d = Number(target[i]);
        reel.style.transform = `translate3d(0, ${Math.round(-d * gh)}px, 0)`;
      });
      return;
    }

    // Figure current digit by nearest row; default to 0
    const curDigits = reels.map(reel => {
      const ty = parseFloat((reel.style.transform || '').match(/-?\d+(\.\d+)?/g)?.[1] || '0');
      const idx = Math.round(Math.abs(ty) / gh) % 10;
      return idx;
    });

    // Per-slot randomized total steps (full turns + diff to land on target)
    const totalSteps = reels.map((_, i) => {
      const from = curDigits[i] || 0;
      const to = Number(target[i]);
      const diff = (to - from + 10) % 10;
      const cycles = BASE_CYCLES + Math.floor(Math.random() * (CYCLE_SPREAD + 1)) + i; // slight stagger
      return cycles * 10 + diff; // how many glyph steps this slot will roll through
    });

    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = EASING(t);
      reels.forEach((reel, i) => {
        // Evolve from current glyph downwards by eased steps
        const from = curDigits[i] || 0;
        const steps = totalSteps[i] * eased;
        const pos = (from + steps);               // “which glyph index” (fractional)
        const y = -pos * gh;
        // snap to device pixels to avoid blur
        reel.style.transform = `translate3d(0, ${Math.round(y)}px, 0)`;
      });
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        // final snap to exact target within the first 0..9 block (keeps transform small)
        reels.forEach((reel, i) => {
          const d = Number(target[i]);
          reel.style.transform = `translate3d(0, ${Math.round(-d * gh)}px, 0)`;
        });
      }
    }
    requestAnimationFrame(tick);
  }

  function updateToToday(root) {
    const n = daySinceLaunchUTC();
    shuffleTo(root, n);
  }

  function scheduleRollover(root) {
    setTimeout(() => {
      updateToToday(root);
      scheduleRollover(root); // reschedule for next UTC midnight
    }, nextUtcMidnightDelayMs());
  }

  // ===== boot =====
  function init() {
    const root = document.querySelector(SELECTOR);
    if (!root) return;
    build(root);
    updateToToday(root);
    scheduleRollover(root);

    // Expose tiny console helpers for you:
    window.AUB_SHUFFLE = (n) => shuffleTo(root, n);
    window.AUB_FORCE_MOTION ??= false;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
