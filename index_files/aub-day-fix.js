// aub-day-fix.js — odometer day calc (UTC) + smooth rAF shuffle
(() => {
  const ROOT_SEL = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // --- Launch date (UTC) ---
  function readLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]');
    const s = (meta && meta.content) || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(s);
    return isNaN(d) ? new Date('2025-08-25T00:00:00Z') : d;
  }
  const LAUNCH_UTC = readLaunchUTC();

  // --- Day math in UTC (1-based: launch day = 01) ---
  const dayIndexUTC = (d) =>
    Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);

  function currentDayNumber() {
    const today = new Date();
    const diff = Math.max(0, dayIndexUTC(today) - dayIndexUTC(LAUNCH_UTC)) + 1;
    return diff;
  }

  function msUntilNextUtcMidnight() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return next - now;
  }

  // --- DOM helpers ---
  function getRoot() {
    return document.querySelector(ROOT_SEL);
  }

  function ensureSlots(root, count) {
    let slots = Array.from(root.querySelectorAll('.slot'));
    // Create a first slot if none exists
    if (!slots.length) {
      const s = document.createElement('span');
      s.className = 'slot';
      s.textContent = '0';
      root.appendChild(s);
      slots = [s];
    }
    // Grow to desired count
    while (slots.length < count) {
      const clone = slots[0].cloneNode(true);
      clone.textContent = '0';
      root.prepend(clone);
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    // Trim extras
    while (slots.length > count) {
      const el = slots.shift();
      el.remove();
    }
    return slots;
  }

  function setDigits(root, n) {
    const str = String(n).padStart(MIN_DIGITS, '0');
    const slots = ensureSlots(root, str.length);
    for (let i = 0; i < slots.length; i++) {
      slots[i].textContent = str[i];
    }
  }

  // --- Smooth movement engine: random scramble → decel settle ---
  // Keep old API: one argument (target)
  function shuffleTo(targetNumber) {
    const root = getRoot();
    if (!root) return;

    const CFG = {
      SCRAMBLE_MS: 900,   // total random phase time
      MIN_INTERVAL: 20,   // fastest random tick (ms)
      MAX_INTERVAL: 85,   // slowest random tick (ms) near the end
      JITTER_MS: 18,      // per-lane small randomness
      LAST_TICKS: 4,      // 3 pre-final + final
      FINAL_TICK_BASE: 70,
      FINAL_TICK_GROW: 1.45,
      LANE_DELAY: 22      // slight cascade per digit
    };

    const prefersReduced =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDigits(root, targetNumber);
      return;
    }

    const finalStr = String(targetNumber);
    const digits = Math.max(MIN_DIGITS, finalStr.length);
    const slots = ensureSlots(root, digits);
    const finals = finalStr.padStart(digits, '0').split('').map(x => +x);

    root.classList.add('is-scrambling');
    root.classList.remove('is-final');

    const shown = new Int8Array(digits);
    const nextTickAt = new Float64Array(digits);
    const settleTimes = new Array(digits);
    const t0 = performance.now();
    const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    for (let i = 0; i < digits; i++) {
      const cur = parseInt(slots[i].textContent, 10);
      shown[i] = Number.isFinite(cur) ? (cur % 10) : 0;
      nextTickAt[i] = t0 + Math.random() * 40 + i * 10;
    }

    // Precompute settle schedule
    for (let i = 0; i < digits; i++) {
      let acc = t0 + CFG.SCRAMBLE_MS + i * CFG.LANE_DELAY;
      const seq = [];
      for (let k = 0; k < CFG.LAST_TICKS - 1; k++) {
        acc += (k === 0 ? CFG.FINAL_TICK_BASE : CFG.FINAL_TICK_BASE * Math.pow(CFG.FINAL_TICK_GROW, k));
        seq.push({ when: acc, final: false });
      }
      acc += CFG.FINAL_TICK_BASE * Math.pow(CFG.FINAL_TICK_GROW, CFG.LAST_TICKS - 1);
      seq.push({ when: acc, final: true });
      settleTimes[i] = seq;
    }

    let phase = 'scramble';

    function frame(now) {
      if (phase === 'scramble') {
        const t = Math.min(1, (now - t0) / CFG.SCRAMBLE_MS);
        const eased = easeOutExpo(t);
        const interval = CFG.MIN_INTERVAL + (CFG.MAX_INTERVAL - CFG.MIN_INTERVAL) * eased;

        for (let i = 0; i < digits; i++) {
          if (now >= nextTickAt[i]) {
            let r;
            do { r = (Math.random() * 10) | 0; } while (r === shown[i]);
            shown[i] = r;
            slots[i].textContent = String(r);
            nextTickAt[i] = now + interval + Math.random() * CFG.JITTER_MS + i * 2;
          }
        }
        if (t >= 1) phase = 'settle';
      }

      if (phase === 'settle') {
        let allDone = true;
        for (let i = 0; i < digits; i++) {
          const seq = settleTimes[i];
          while (seq.length && now >= seq[0].when) {
            const step = seq.shift();
            let v;
            if (step.final) {
              v = finals[i];
            } else {
              do { v = (Math.random() * 10) | 0; } while (v === shown[i] || v === finals[i]);
            }
            if (v !== shown[i]) {
              shown[i] = v;
              slots[i].textContent = String(v);
            }
          }
          if (seq.length) allDone = false;
        }
        if (allDone) {
          root.classList.remove('is-scrambling');
          root.classList.add('is-final');
          return;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Expose for console testing
  window.AUB_SHUFFLE = shuffleTo;

  // --- Boot: compute "DAY NN", animate now, and schedule UTC rollover ---
  function updateDay() {
    const root = getRoot();
    if (!root) return;
    const day = currentDayNumber();
    root.setAttribute('aria-label', 'DAY ' + String(day).padStart(2, '0'));
    shuffleTo(day);
  }

  function boot() {
    const root = getRoot();
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
