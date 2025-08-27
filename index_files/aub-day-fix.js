(() => {
  'use strict';

  // ====== CONFIG ======
  // Launch time (UTC) is read from:
  //  1) <meta name="aub-launch-utc" content="YYYY-MM-DDTHH:MM:SSZ">
  //  2) window.AUB_LAUNCH_UTC
  //  3) fallback below
  const FALLBACK_LAUNCH_ISO = '2025-08-25T00:00:00Z'; // change if you never set the meta/global

  const MS_DAY = 86400000;

  // --- helpers ---
  function getRoot() {
    return document.querySelector('.aub-day-odometer');
  }

  function getLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]');
    const iso = (meta && meta.content) || (typeof window !== 'undefined' && window.AUB_LAUNCH_UTC) || FALLBACK_LAUNCH_ISO;
    const d = new Date(iso);
    return isNaN(d) ? new Date(FALLBACK_LAUNCH_ISO) : d;
  }

  function utcMidnightMs(d) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function computeDayUTC() {
    const now = new Date();
    const launch = getLaunchUTC();
    const diffDays = Math.floor((utcMidnightMs(now) - utcMidnightMs(launch)) / MS_DAY);
    const day = Math.max(1, diffDays + 1);  // Day 1 = launch day (UTC)
    return day;
  }

  function msUntilNextUtcMidnight(now = new Date()) {
    const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(0, nextMidnight - now.getTime()) + 20; // tiny cushion
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // Ensure there are at least n slots. Creates/clones <span class="slot">0</span>
  function ensureSlots(n) {
    const root = getRoot();
    if (!root) return [];
    let slots = Array.from(root.querySelectorAll('.slot'));
    if (slots.length === 0) {
      root.textContent = '';
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'slot';
        s.textContent = '0';
        root.appendChild(s);
      }
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    while (slots.length < n) {
      const clone = (slots[0] || document.createElement('span')).cloneNode(true);
      clone.className = 'slot';
      clone.textContent = '0';
      // prepend so new digits appear on the left
      root.prepend(clone);
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
  }

  // ============ ANIMATION: RANDOM SCRAMBLE → SLOW 3–4 TICKS → REVEAL ============
  // Faster, more "shuffly" scramble with a short slow reveal
function shuffleTo(target) {
  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  const finalStr = String(target);
  const slots = ensureSlots(finalStr.length);
  const finalDigits = finalStr.padStart(slots.length, '0').split('').map(Number);

  // Phase A: quick random scramble
  const SCRAMBLE_MS = 1200;   // was ~2100
  const MIN_INTERVAL = 22;    // more frequent changes
  const MAX_INTERVAL = 120;   // still eases out
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  const start = performance.now();
  const lastUpdate = Array(slots.length).fill(0);

  function scramble(now) {
    const t = Math.min(1, (now - start) / SCRAMBLE_MS);
    const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * easeOutCubic(t);

    slots.forEach((el, i) => {
      const jitter = Math.random() * 60;               // extra desync
      if (now - lastUpdate[i] >= interval + jitter) {
        el.textContent = Math.floor(Math.random() * 10);
        lastUpdate[i] = now;
      }
    });

    if (t < 1) requestAnimationFrame(scramble);
    else settle();
  }

  // Phase B: 3 quick slow-down ticks, then reveal
  function settle() {
    const SETTLE_STEPS = 4;   // 3 pre-final + final
    const SETTLE_BASE_MS = 70;
    const SETTLE_GROW = 1.5;

    slots.forEach((el, i) => {
      const seq = [];
      for (let k = 0; k < SETTLE_STEPS - 1; k++) {
        let d;
        do { d = Math.floor(Math.random() * 10); } while (d === finalDigits[i]);
        seq.push(d);
      }
      seq.push(finalDigits[i]);

      let delay = SETTLE_BASE_MS + i * 35;            // tiny per-digit stagger
      seq.forEach(d => { setTimeout(() => { el.textContent = d; }, Math.round(delay)); delay *= SETTLE_GROW; });
    });
  }

  requestAnimationFrame(scramble);
}


    // Phase B: last 3–4 numbers slow down per slot, then reveal final
    function settle() {
      const SETTLE_STEPS = 4;     // 3 pre-final digits + final
      const BASE_DELAY = 150;     // first slow tick
      const GROW = 1.4;           // each tick slower than the last
      const STAGGER = 80;         // slight cascade across slots (ms)

      slots.forEach((el, i) => {
        const seq = [];
        for (let k = SETTLE_STEPS - 1; k >= 0; k--) {
          seq.push((finalDigits[i] - k + 10) % 10);
        }

        let delay = i * STAGGER;
        let stepDelay = BASE_DELAY;

        seq.forEach((digit) => {
          setTimeout(() => { el.textContent = String(digit); }, Math.round(delay));
          delay += stepDelay;
          stepDelay = Math.round(stepDelay * GROW);
        });
      });
    }

    requestAnimationFrame(scramble);
  }

  function renderDay() {
    const root = getRoot();
    if (!root) return;
    const day = computeDayUTC();

    // update a11y label like "DAY 02"
    root.setAttribute('aria-label', 'DAY ' + pad2(day));
    shuffleTo(day);
  }

  function boot() {
    // avoid double timers if this file gets loaded twice
    if (window.__AUB_DAY && window.__AUB_DAY.timer) {
      clearTimeout(window.__AUB_DAY.timer);
    }
    window.__AUB_DAY = window.__AUB_DAY || {};

    renderDay();

    // precise UTC midnight rollover
    const schedule = () => {
      const wait = msUntilNextUtcMidnight();
      window.__AUB_DAY.timer = setTimeout(() => {
        renderDay();
        schedule(); // schedule the next midnight
      }, wait);
    };
    schedule();

    // if the tab was hidden over midnight, fix when visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) renderDay();
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
