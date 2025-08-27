/* AUB DAY ODOMETER — UTC day counter with random scramble + slow settle
   - Reads launch UTC from:
       <meta name="aub-launch-utc" content="YYYY-MM-DDTHH:mm:ssZ">
     or window.AUB_LAUNCH_UTC (ISO string)
   - Rollover at UTC midnight
   - Two-phase animation: random scramble -> slow 3–4 ticks -> final
   - Exposes debug helpers: window.AUB_SET_DAY(n), window.AUB_FORCE_NOW(iso)
*/
(() => {
  'use strict';

  // -------------------- CONFIG --------------------
  const SELECTOR = '.aub-day-odometer';
  const SLOT_CLASS = 'slot';

  // Animation pacing (tuned for "faster & shuffly" with a short slow reveal)
  const SCRAMBLE_MS = 1200;      // length of random scramble phase
  const MIN_INTERVAL = 20;       // fastest random refresh (ms)
  const MAX_INTERVAL = 110;      // slows toward end of scramble (ms)
  const SETTLE_STEPS = 4;        // 3 pre-final ticks + final
  const SETTLE_BASE_MS = 70;     // first settle tick per digit
  const SETTLE_GROW = 1.5;       // multiplier between ticks (slows down)
  const PER_DIGIT_STAGGER = 35;  // slight rightward cascade (ms)

  // -------------------- STATE --------------------
  let launchUTC = parseLaunchUTC();               // Date object (UTC)
  let rafId = 0;                                  // current animation frame
  let midnightTimer = 0;                          // next UTC midnight timeout
  let visibleListenerAttached = false;            // once-only

  // Allow manual time override for testing
  let manualNow = null; // Date | null

  // -------------------- INIT --------------------
  onReady(() => {
    const root = document.querySelector(SELECTOR);
    if (!root) return;

    // Initial render
    updateDay({ animate: false });

    // Schedule rollover at next UTC midnight
    scheduleMidnightRollover();

    // When the tab becomes visible after midnight, catch up immediately
    if (!visibleListenerAttached) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          updateDay({ animate: true });
          rescheduleMidnightRollover();
        }
      });
      visibleListenerAttached = true;
    }
  });

  // -------------------- MAIN --------------------
  function updateDay({ animate }) {
    const root = document.querySelector(SELECTOR);
    if (!root) return;

    const now = manualNow ?? new Date();
    const dayNum = computeDayNumber(now, launchUTC); // 1-based, min 1
    const digits = String(dayNum);
    const width = Math.max(2, digits.length);

    // Prepare slots to required width
    const slots = ensureSlots(root, width);

    // Update aria-label for accessibility
    root.setAttribute('aria-label', `DAY ${pad(dayNum, width)}`);

    // Respect reduced motion
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReduced || !animate) {
      // No animation: snap to final digits
      setDigits(slots, digits);
      return;
    }

    // Animate to target
    animateShuffleTo(slots, digits);
  }

  // Random-scramble -> slow 3–4 ticks -> final
  function animateShuffleTo(slots, finalStr) {
    cancelFrame(); // in case something was running
    const finalDigits = finalStr.padStart(slots.length, '0').split('').map(n => Number(n));
    const start = performance.now();
    const lastUpdate = Array(slots.length).fill(0);

    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    function scramble(now) {
      const t = Math.min(1, (now - start) / SCRAMBLE_MS);
      const interval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * easeOutCubic(t);

      // randomize each slot with jitter so they don't sync
      for (let i = 0; i < slots.length; i++) {
        const el = slots[i];
        const jitter = Math.random() * 60;
        if (now - lastUpdate[i] >= interval + jitter) {
          el.textContent = (Math.random() * 10) | 0;
          lastUpdate[i] = now;
        }
      }
      if (t < 1) {
        rafId = requestAnimationFrame(scramble);
      } else {
        settle(); // move to slow ticks + final
      }
    }

    function settle() {
      // For each slot, show 3 random digits (not equal to final), then final.
      for (let i = 0; i < slots.length; i++) {
        const el = slots[i];
        const seq = [];
        for (let k = 0; k < SETTLE_STEPS - 1; k++) {
          let d;
          do { d = (Math.random() * 10) | 0; } while (d === finalDigits[i]);
          seq.push(d);
        }
        seq.push(finalDigits[i]);

        let delay = SETTLE_BASE_MS + i * PER_DIGIT_STAGGER;
        for (const d of seq) {
          setTimeout(() => { el.textContent = d; }, Math.round(delay));
          delay *= SETTLE_GROW;
        }
      }
    }

    rafId = requestAnimationFrame(scramble);
  }

  // -------------------- DOM HELPERS --------------------
  function ensureSlots(root, count) {
    let slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    // If root has no slots yet, create based on current text or empty
    if (slots.length === 0) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const s = document.createElement('span');
        s.className = SLOT_CLASS;
        s.textContent = '0';
        frag.appendChild(s);
      }
      root.textContent = ''; // clear any text nodes
      root.appendChild(frag);
      slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    }
    // If we need more slots, prepend to keep left-padding feel
    while (slots.length < count) {
      const clone = slots[0]?.cloneNode(true) ?? document.createElement('span');
      clone.className = SLOT_CLASS;
      clone.textContent = '0';
      root.prepend(clone);
      slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    }
    // If we have extra, remove from left
    while (slots.length > count) {
      root.removeChild(slots[0]);
      slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    }
    return slots;
  }

  function setDigits(slots, str) {
    const s = str.padStart(slots.length, '0');
    for (let i = 0; i < slots.length; i++) {
      slots[i].textContent = s[i];
    }
  }

  function cancelFrame() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  // -------------------- TIME/COUNT HELPERS --------------------
  function parseLaunchUTC() {
    // Priority: meta tag > global var > fallback
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const iso = meta || (typeof window !== 'undefined' && window.AUB_LAUNCH_UTC) || '2025-08-25T00:00:00Z';
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? d : new Date('2025-08-25T00:00:00Z');
  }

  function computeDayNumber(now, startUTC) {
    // Use UTC time difference, 1-based (Day 1 starts at launch UTC midnight)
    const ms = now.getTime() - startUTC.getTime();
    const day = Math.floor(ms / 86400000) + 1;
    return Math.max(1, day);
  }

  function pad(num, width) {
    const s = String(num);
    return s.length >= width ? s : '0'.repeat(width - s.length) + s;
  }

  // -------------------- MIDNIGHT ROLLOVER (UTC) --------------------
  function timeUntilNextUtcMidnight(now = manualNow ?? new Date()) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 50)); // 50ms after midnight
    return Math.max(0, next.getTime() - now.getTime());
  }

  function scheduleMidnightRollover() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
      updateDay({ animate: true });
      rescheduleMidnightRollover();
    }, timeUntilNextUtcMidnight());
  }

  function rescheduleMidnightRollover() {
    scheduleMidnightRollover();
  }

  // -------------------- READY --------------------
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // -------------------- DEBUG HOOKS --------------------
  // Force the display to a specific day number (animates)
  window.AUB_SET_DAY = function (n) {
    const root = document.querySelector(SELECTOR);
    if (!root) return;
    const slots = ensureSlots(root, Math.max(2, String(n).length));
    animateShuffleTo(slots, String(n));
    root.setAttribute('aria-label', `DAY ${pad(n, slots.length)}`);
  };

  // Override "now" (ISO string). Pass null to clear.
  window.AUB_FORCE_NOW = function (isoOrNull) {
    if (isoOrNull == null) {
      manualNow = null;
    } else {
      const d = new Date(isoOrNull);
      manualNow = Number.isFinite(d.getTime()) ? d : null;
    }
    updateDay({ animate: true });
    rescheduleMidnightRollover();
  };
})();

