cat > index_files/aub-day-fix.js <<'JS'
/*!
 * AUB Day Odometer (UTC) — fast shuffly scramble → 3 slower ticks → reveal
 * - Day N is UTC-based (N=1 on launch day) and rolls over at UTC midnight.
 * - Auto-grows digit slots as N gains digits.
 */

(() => {
  const msPerDay = 24 * 60 * 60 * 1000;

  function getLaunchUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]');
    if (meta?.content) return new Date(meta.content);
    if (window.AUB_LAUNCH_UTC) return new Date(window.AUB_LAUNCH_UTC);
    return new Date('2025-08-25T00:00:00Z'); // fallback
  }
  function utcMidnight(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  function dayNumberUTC(launchUTC, now = new Date()) {
    const a = utcMidnight(launchUTC).getTime();
    const b = utcMidnight(now).getTime();
    const diff = Math.floor((b - a) / msPerDay);
    return Math.max(1, diff + 1);
  }
  function msUntilNextUTCMidnight(now = new Date()) {
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 50
    ));
    return next.getTime() - now.getTime();
  }

  function getRoot() { return document.querySelector('.aub-day-odometer'); }
  function ensureSlots(count) {
    const root = getRoot();
    if (!root) return [];
    let slots = Array.from(root.querySelectorAll('.slot'));
    while (slots.length < count) {
      const span = document.createElement('span');
      span.className = 'slot';
      span.textContent = '0';
      root.prepend(span); // grow left
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    while (slots.length > count) {
      slots[0]?.remove();
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
  }
  function setAriaLabel(day) {
    const root = getRoot();
    if (root) root.setAttribute('aria-label', 'DAY ' + String(day).padStart(2, '0'));
  }

  // ---- Animation: scramble → slow ticks → final
  let animToken = 0;
  function shuffleTo(targetNumber) {
    const root = getRoot(); if (!root) return;
    const token = ++animToken;
    const finalStr = String(targetNumber);
    const slots = ensureSlots(finalStr.length);
    const finalDigits = finalStr.padStart(slots.length, '0').split('').map(Number);

    const already = slots.every((el, i) => (parseInt(el.textContent || '0', 10) || 0) === finalDigits[i]);

    // Phase A: fast, shuffly scramble with easing out
    const SCRAMBLE_MS = 900;
    const MIN_INTERVAL = 18;
    const MAX_INTERVAL = 100;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
    const start = performance.now();
    const last = Array(slots.length).fill(0);

    function scramble(now) {
      if (token !== animToken) return;
      const t = Math.min(1, (now - start) / SCRAMBLE_MS);
      const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * easeOutCubic(t);

      slots.forEach((el, i) => {
        const jitter = Math.random() * 70;
        if (now - last[i] >= interval + jitter) {
          el.textContent = Math.floor(Math.random() * 10);
          last[i] = now;
        }
      });

      if (t < 1 && !already) requestAnimationFrame(scramble);
      else settle();
    }

    function settle() {
      if (token !== animToken) return;
      const SETTLE_STEPS = 4;  // 3 random + final
      const BASE_DELAY = 55;   // overall quicker
      const GROW = 1.35;       // gently slow down

      slots.forEach((el, i) => {
        const seq = [];
        for (let k = 0; k < SETTLE_STEPS - 1; k++) {
          let d; do { d = Math.floor(Math.random() * 10); } while (d === finalDigits[i]);
          seq.push(d);
        }
        seq.push(finalDigits[i]); // final

        let delay = BASE_DELAY + i * 30; // slight cascade per slot
        seq.forEach((d, idx) => {
          setTimeout(() => {
            if (token !== animToken) return;
            el.textContent = d;
            if (idx === seq.length - 1) el.textContent = finalDigits[i]; // belt & suspenders
          }, Math.round(delay));
          delay *= GROW;
        });
      });
    }

    requestAnimationFrame(scramble);
  }

  function updateDay() {
    const root = getRoot(); if (!root) return;
    const launch = getLaunchUTC();
    const day = dayNumberUTC(launch, new Date());
    setAriaLabel(day);
    shuffleTo(day);
    root.dataset.dayValue = String(day);
  }
  function scheduleRollover() {
    const ms = msUntilNextUTCMidnight();
    setTimeout(() => {
      updateDay();
      setInterval(updateDay, msPerDay);
    }, ms);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { updateDay(); scheduleRollover(); });
  } else {
    updateDay(); scheduleRollover();
  }

  // Debug helpers (run in DevTools if you want to test animation)
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
JS

