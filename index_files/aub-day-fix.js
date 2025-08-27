// aub-day-fix.js — 60fps reel scroll + UTC day + midnight rollover
(() => {
  const ROOT_SEL = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // ---------- CSS ----------
  const CSS_ID = 'aub-odo-css';
  if (!document.getElementById(CSS_ID)) {
    const css = document.createElement('style');
    css.id = CSS_ID;
    css.textContent = `
      ${ROOT_SEL} {
        display:inline-flex; gap:.06em; align-items:center;
        font-variant-numeric: tabular-nums;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      ${ROOT_SEL} .slot {
        position:relative; display:inline-block; overflow:hidden;
        height:1em; width:.66em;
        will-change: transform;
      }
      ${ROOT_SEL} .reel { position:absolute; left:0; top:0; transform:translate3d(0,0,0); }
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

  // ---------- Day math ----------
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

  // ---------- Motion policy (override-able) ----------
  function shouldReduceMotion() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return false;
    // Overrides to FORCE motion:
    if (window.AUB_FORCE_MOTION === true) return false;
    if (root.hasAttribute('data-force-motion')) return false;

    // Only respect reduced motion if the root explicitly opts in.
    // Add attribute data-respect-reduced-motion to root if you want to obey OS setting.
    if (root.hasAttribute('data-respect-reduced-motion')) {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }

  // ---------- Structure ----------
  const N_REPEAT = 4; // repeated 0..9 blocks
  function buildSlots(root, count) {
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
      slot._pos = Math.random() * 10;
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
    if (!slots.length || slots.length !== count) return buildSlots(root, count);
    return slots;
  }
  function measureDigitHeight(root) {
    const probe = root.querySelector('.digit');
    let h = probe ? probe.getBoundingClientRect().height : 0;
    if (!h || h < 1) {
      const fs = parseFloat(getComputedStyle(root).fontSize) || 16;
      h = fs;
    }
    return h;
  }
  function setReel(slot, pos, digitH) {
    const y = -((pos % 10 + 10) % 10) * digitH;
    slot.firstChild.style.transform = `translate3d(0, ${y}px, 0)`;
    slot._pos = pos;
  }

  // ---------- Easing ----------
  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

  // ---------- Main animation ----------
  function spinTo(targetNumber) {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;

    const finalStr = String(targetNumber).padStart(MIN_DIGITS, '0');
    const digits = finalStr.length;
    const slots = ensureSlots(root, digits);
    const digitH = measureDigitHeight(root);

    if (shouldReduceMotion()) {
      for (let i = 0; i < digits; i++) {
        setReel(slots[i], +finalStr[i], digitH);
      }
      root.setAttribute('aria-label', 'DAY ' + finalStr);
      return;
    }

    root.classList.add('is-scrambling');
    root.classList.remove('is-final');

    const CFG = {
      DURATION: 950,          // smooth total time
      CYCLES_BASE: 8,         // full rotations
      CYCLES_SPREAD: 6,       // randomness
      DELAY_PER_SLOT: 60,     // cascade
      EASE: easeOutQuint
    };

    const now = performance.now();
    for (let i = 0; i < digits; i++) {
      const slot = slots[i];
      const curDigit = Math.round(slot._pos) % 10;
      const finalDigit = +finalStr[i];
      const diff = (finalDigit - curDigit + 10) % 10;
      const cycles = CFG.CYCLES_BASE + Math.floor(Math.random() * (CFG.CYCLES_SPREAD + 1)) + i;
      const travel = cycles * 10 + diff + Math.random() * 0.25;
      slot._start = slot._pos;
      slot._end   = slot._pos + travel;
      slot._delay = i * CFG.DELAY_PER_SLOT + Math.random() * 20;
      slot._t0    = now + slot._delay;
      slot._t1    = slot._t0 + CFG.DURATION;
    }

    function tick(t) {
      let allDone = true;
      for (let i = 0; i < digits; i++) {
        const s = slots[i];
        if (t < s._t0) { allDone = false; continue; }
        const p = Math.min(1, (t - s._t0) / Math.max(16, s._t1 - s._t0));
        const eased = CFG.EASE(p);
        const pos = s._start + (s._end - s._start) * eased;
        setReel(s, pos, digitH);
        if (p < 1) allDone = false;
      }
      if (!allDone) requestAnimationFrame(tick);
      else {
        root.classList.remove('is-scrambling');
        root.classList.add('is-final');
      }
    }
    requestAnimationFrame(tick);

    root.setAttribute('aria-label', 'DAY ' + finalStr);
  }

  // Back-compat test hook
  function shuffleTo(n) { spinTo(n); }
  window.AUB_SHUFFLE = shuffleTo;

  // ---------- Boot / rollover ----------
  function updateDay() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    spinTo(currentDayNumber());
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
