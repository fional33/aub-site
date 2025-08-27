/*!
 * AUB Day Odometer (UTC) — shuffly scramble → 3 slow ticks → reveal
 * - Computes "DAY N" in UTC (N=1 on launch day), rolls at UTC midnight.
 * - Replaces any static digits with animated .slot spans (prevents "no shuffle").
 */
(() => {
  const MS_DAY = 24 * 60 * 60 * 1000;

  // --- UTC day math
  function getLaunchUTC() {
    const m = document.querySelector('meta[name="aub-launch-utc"]');
    if (m?.content) return new Date(m.content);
    if (window.AUB_LAUNCH_UTC) return new Date(window.AUB_LAUNCH_UTC);
    return new Date('2025-08-25T00:00:00Z'); // fallback
  }
  const utcMidnight = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  function dayNumberUTC(launchUTC, now = new Date()) {
    const a = utcMidnight(launchUTC).getTime();
    const b = utcMidnight(now).getTime();
    const diff = Math.floor((b - a) / MS_DAY);
    return Math.max(1, diff + 1);
  }
  function msUntilNextUTCMidnight(now = new Date()) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 50));
    return next.getTime() - now.getTime();
  }

  // --- DOM helpers
  const getRoot = () => document.querySelector('.aub-day-odometer');
  function setAriaLabel(day) {
    const root = getRoot(); if (root) root.setAttribute('aria-label', 'DAY ' + String(day).padStart(2, '0'));
  }

  // Build/normalize slots. If page has raw text digits, remove them first so animation is visible.
  function ensureSlots(minCount) {
    const root = getRoot();
    if (!root) return [];
    // remove everything that isn't a .slot
    Array.from(root.childNodes).forEach((n) => {
      if (!(n.nodeType === 1 && n.classList.contains?.('slot'))) root.removeChild(n);
    });
    let slots = Array.from(root.querySelectorAll('.slot'));
    if (slots.length === 0) {
      // First-time setup: start with empty container (no static digits)
      root.textContent = '';
    }
    while (slots.length < minCount) {
      const span = document.createElement('span');
      span.className = 'slot';
      span.textContent = '0';
      root.prepend(span); // grow left
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    while (slots.length > minCount) {
      slots[0]?.remove();
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
  }

  // --- Animation: scramble → slow 3 ticks → reveal
  let animToken = 0;
  function shuffleTo(targetNumber) {
    const root = getRoot(); if (!root) return;
    const token = ++animToken;

    const finalStr = String(targetNumber);
    const slots = ensureSlots(Math.max(2, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length, '0').split('').map(Number);

    // Scramble (quick, shuffly; eases out so it breathes a bit)
    const SCRAMBLE_MS = 800;
    const MIN_INTERVAL = 14;
    const MAX_INTERVAL = 85;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const start = performance.now();
    const lastTick = Array(slots.length).fill(0);

    function scramble(now) {
      if (token !== animToken) return;
      const t = Math.min(1, (now - start) / SCRAMBLE_MS);
      const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * easeOutCubic(t);

      slots.forEach((el, i) => {
        const jitter = Math.random() * 60;
        if (now - lastTick[i] >= interval + jitter) {
          el.textContent = Math.floor(Math.random() * 10);
          lastTick[i] = now;
        }
      });

      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    }

    function settle() {
      if (token !== animToken) return;
      const SETTLE_STEPS = 4;   // 3 random + final
      const BASE_DELAY = 45;    // a touch snappier overall
      const GROW = 1.30;        // slows gracefully across last ticks

      slots.forEach((el, i) => {
        // 3 pre-final numbers that aren't the final digit, then the final
        const seq = [];
        for (let k = 0; k < SETTLE_STEPS - 1; k++) {
          let d; do { d = Math.floor(Math.random() * 10); } while (d === finalDigits[i]);
          seq.push(d);
        }
        seq.push(finalDigits[i]);

        let delay = BASE_DELAY + i * 25; // slight cascade left→right
        seq.forEach((d, idx) => {
          setTimeout(() => {
            if (token !== animToken) return;
            el.textContent = d;
          }, Math.round(delay));
          delay *= GROW;
        });
      });
    }

    requestAnimationFrame(scramble);
  }

  // --- Wire-up & rollover
  function updateDay() {
    const root = getRoot(); if (!root) return;
    const day = dayNumberUTC(getLaunchUTC(), new Date());
    setAriaLabel(day);
    shuffleTo(day);                // always animates on call
    root.dataset.dayValue = String(day);
  }
  function scheduleRollover() {
    const ms = msUntilNextUTCMidnight();
    setTimeout(() => {
      updateDay();
      setInterval(updateDay, MS_DAY); // daily after that
    }, ms);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateDay(); scheduleRollover(); });
  } else {
    updateDay(); scheduleRollover();
  }

  // Dev helpers to test animation in console
  window.AUB_debugNext = () => {
    const el = getRoot(); if (!el) return;
    const n = (parseInt(el.dataset.dayValue || '1', 10) || 1) + 1;
    shuffleTo(n); el.dataset.dayValue = String(n); setAriaLabel(n);
  };
  window.AUB_setDay = (n) => {
    const el = getRoot(); if (!el) return;
    n = Math.max(1, parseInt(n, 10) || 1);
    shuffleTo(n); el.dataset.dayValue = String(n); setAriaLabel(n);
  };
})();
