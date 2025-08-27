// aub-day-fix.js — 60fps continuous reel scroll + UTC day + midnight rollover
(() => {
  const ROOT_SEL = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // ---------- Inject minimal CSS for crisp, smooth reels ----------
  const CSS_ID = 'aub-odo-css';
  if (!document.getElementById(CSS_ID)) {
    const css = document.createElement('style');
    css.id = CSS_ID;
    css.textContent = `
      ${ROOT_SEL} {
        display:inline-flex; gap:.06em; align-items:center;
        font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
      }
      ${ROOT_SEL} .slot {
        position:relative; display:inline-block; overflow:hidden;
        height:1em; width:.66em; /* width can be adjusted in your site CSS */
      }
      ${ROOT_SEL} .reel { position:absolute; left:0; top:0; will-change: transform; transform:translate3d(0,0,0); }
      ${ROOT_SEL} .digit { height:1em; line-height:1em; text-align:center; }
      ${ROOT_SEL}.is-scrambling .digit { pointer-events:none; }
    `;
    document.head.appendChild(css);
  }

  // ---------- Launch date (UTC) ----------
  function readLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]');
    const s = (meta && meta.content) || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(s);
    return isNaN(d) ? new Date('2025-08-25T00:00:00Z') : d;
  }
  const LAUNCH_UTC = readLaunchUTC();

  // ---------- Day math in UTC (1-based) ----------
  const dayIndexUTC = d => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
  function currentDayNumber() {
    const today = new Date();
    return Math.max(0, dayIndexUTC(today) - dayIndexUTC(LAUNCH_UTC)) + 1;
  }
  function msUntilNextUtcMidnight() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return next - now;
  }

  // ---------- Structure (reel-based, continuous scroll) ----------
  const N_REPEAT = 4; // 0..9 repeated this many times in each reel
  function buildSlots(root, count) {
    // First-time init: remove any static text to avoid overlays/blur
    root.classList.add('aub-odo-ready');
    root.replaceChildren();

    const slots = [];
    for (let i = 0; i < count; i++) {
      const slot = document.createElement('span');
      slot.className = 'slot';
      const reel = document.createElement('div');
      reel.className = 'reel';
      for (let r = 0; r < N_REPEAT; r++) {
        for (let d = 0; d < 10; d++) {
          const div = document.createElement('div');
          div.className = 'digit';
          div.textContent = d;
          reel.appendChild(div);
        }
      }
      slot.appendChild(reel);
      // State for smooth animation
      slot._pos = Math.random() * 10; // fractional current digit position
      slot._start = slot._pos;
      slot._end = slot._pos;
      slot._t0 = 0;
      slot._t1 = 0;
      slot._delay = 0;
      slots.push(slot);
      root.appendChild(slot);
    }
    return slots;
  }

  function ensureSlots(root, count) {
    let slots = Array.from(root.querySelectorAll('.slot'));
    if (!slots.length) return buildSlots(root, count);

    // If existing count differs, rebuild cleanly (prevents overlap artifacts)
    if (slots.length !== count) return buildSlots(root, count);
    return slots;
  }

  function measureDigitHeight(root) {
    const probe = root.querySelector('.digit');
    let h = probe ? probe.getBoundingClientRect().height : 0;
    if (!h || h < 1) {
      // Fallback to font-size estimate
      const fs = parseFloat(getComputedStyle(root).fontSize) || 16;
      h = fs * 1.0;
    }
    return h;
  }

  function setReel(slot, pos, digitH) {
    // pos: continuous digit index (0..∞), use modulo 10 for offset
    const y = -((pos % 10 + 10) % 10) * digitH;
    const reel = slot.firstChild;
    reel.style.transform = `translate3d(0, ${y}px, 0)`;
    slot._pos = pos;
  }

  // ---------- Easing ----------
  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);  // very smooth decel
  const easeOutExpo  = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

  // ---------- Main animation (continuous scrolling) ----------
  function spinTo(targetNumber) {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;

    const prefersReduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finalStr = String(targetNumber).padStart(MIN_DIGITS, '0');
    const digits = finalStr.length;

    const slots = ensureSlots(root, digits);
    const digitH = measureDigitHeight(root);

    if (prefersReduced) {
      // Jump to final, no motion
      for (let i = 0; i < digits; i++) {
        const d = +finalStr[i];
        setReel(slots[i], d, digitH);
      }
      root.setAttribute('aria-label', 'DAY ' + finalStr);
      return;
    }

    root.classList.add('is-scrambling');
    root.classList.remove('is-final');

    // Config tuned for smooth, high-FPS motion
    const CFG = {
      DURATION: 1100,       // total duration per digit
      CYCLES_BASE: 8,       // base full rotations
      CYCLES_SPREAD: 6,     // randomness per slot
      DELAY_PER_SLOT: 70,   // cascade across digits (ms)
      EASE: easeOutQuint
    };

    const now = performance.now();
    for (let i = 0; i < digits; i++) {
      const slot = slots[i];
      const curDigit = Math.round(slot._pos) % 10;
      const finalDigit = +finalStr[i];

      // total travel = full cycles + diff to land on final
      const diff = (finalDigit - curDigit + 10) % 10;
      const cycles = CFG.CYCLES_BASE + Math.floor(Math.random() * (CFG.CYCLES_SPREAD + 1)) + i; // slight increase on the left
      const travel = cycles * 10 + diff + Math.random() * 0.35; // tiny fractional variety

      slot._start = slot._pos;
      slot._end   = slot._pos + travel;
      slot._delay = i * CFG.DELAY_PER_SLOT + Math.random() * 25;
      slot._t0    = now + slot._delay;
      slot._t1    = slot._t0 + CFG.DURATION;
    }

    // rAF loop — updates are transform-only (GPU), so it’s buttery smooth
    function tick(t) {
      let allDone = true;
      for (let i = 0; i < digits; i++) {
        const slot = slots[i];
        const { _t0, _t1 } = slot;

        if (t < _t0) { allDone = false; continue; }
        const p = Math.min(1, (t - _t0) / (Math.max(16, _t1 - _t0)));
        const eased = CFG.EASE(p);
        const pos = slot._start + (slot._end - slot._start) * eased;
        setReel(slot, pos, digitH);
        if (p < 1) allDone = false;
      }
      if (!allDone) {
        requestAnimationFrame(tick);
      } else {
        root.classList.remove('is-scrambling');
        root.classList.add('is-final');
      }
    }
    requestAnimationFrame(tick);

    // ARIA label for screen readers
    root.setAttribute('aria-label', 'DAY ' + finalStr);
  }

  // Expose old API name for console tests
  function shuffleTo(n) { spinTo(n); }
  window.AUB_SHUFFLE = shuffleTo;

  // ---------- Boot: compute and animate, schedule UTC rollover ----------
  function updateDay() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    const day = currentDayNumber();
    spinTo(day);
  }

  function boot() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    updateDay();
    const delay = msUntilNextUtcMidnight() + 200;
    setTimeout(() => {
      updateDay();
      setInterval(updateDay, 24 * 60 * 60 * 1000);
    }, delay);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
