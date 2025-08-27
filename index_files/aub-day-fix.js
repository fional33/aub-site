(() => {
  // ===== CONFIG =====
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Scramble feel (fast but readable)
  const SCRAMBLE_MS = 900;      // total scramble duration
  const MIN_INTERVAL = 110;     // never change faster than this per slot (ms)
  const SETTLE_TICKS = 4;       // 3–4 looks nice
  const SETTLE_BASE = 95;       // first slow tick delay (ms)
  const SETTLE_GROW = 1.65;     // easing of the last ticks

  // ===== Utilities =====
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const pad2 = n => String(n).padStart(MIN_DIGITS, '0');

  function injectStyle() {
    if (document.getElementById('aub-day-style-readable')) return;
    const css = `
      ${SELECTOR} {
        display:inline-flex; gap:.06em;
        font-variant-numeric: tabular-nums; font-feature-settings:"tnum" 1;
      }
      ${SELECTOR} .slot {
        position:relative; display:inline-block;
        width:0.70em; height:1.05em; overflow:hidden;
        contain:content; /* isolates painting/layout for crispness */
      }
      ${SELECTOR} .digit {
        position:absolute; inset:0 auto auto 0;
        line-height:1.05em; transform:translateY(0); opacity:1;
        transition: transform 100ms ease, opacity 100ms ease;
        will-change: transform, opacity;
        z-index:1; pointer-events:none;
        /* keep the glow, but no filter blur (filters cause unreadable halos) */
        text-shadow:
          0 0 .16em rgba(255,255,255,.35),
          0 0 .36em currentColor;
        -webkit-font-smoothing: antialiased;
        backface-visibility:hidden;
      }
      ${SELECTOR} .digit.enter { transform:translateY(40%); opacity:0; z-index:2; }
      ${SELECTOR} .digit.enter.active { transform:translateY(0); opacity:1; }
      ${SELECTOR} .digit.leave { transform:translateY(-40%); opacity:0; z-index:1; }
    `;
    const style = document.createElement('style');
    style.id = 'aub-day-style-readable';
    style.textContent = css;
    document.head.appendChild(style);
  }

  const rootEl = () => document.querySelector(SELECTOR);

  function ensureSlots(count) {
    const root = rootEl();
    if (!root) return [];
    let slots = Array.from(root.querySelectorAll('.slot'));
    while (slots.length < count) {
      const slot = document.createElement('span');
      slot.className = 'slot';
      const d = document.createElement('span');
      d.className = 'digit';
      d.textContent = '0';
      slot.appendChild(d);
      root.prepend(slot);
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
  }

  // Swap with strict single-active layering
  function swapDigit(slot, newDigit) {
    const newStr = String(newDigit);

    // If an entering digit exists, reuse it (don’t stack multiple enters)
    const entering = slot.querySelector('.digit.enter');
    if (entering) {
      if (entering.textContent !== newStr) entering.textContent = newStr;
      return;
    }

    // Current visible digit (not leaving)
    const current = slot.querySelector('.digit:not(.leave)') || slot.querySelector('.digit');
    if (current && current.textContent === newStr) return;

    const enter = document.createElement('span');
    enter.className = 'digit enter';
    enter.textContent = newStr;
    slot.appendChild(enter);

    // trigger transition to readable, single overlay
    requestAnimationFrame(() => enter.classList.add('active'));

    if (current) {
      current.classList.add('leave');
      current.addEventListener('transitionend', () => {
        if (current.parentNode === slot) current.remove();
      }, { once: true });
    }
    enter.addEventListener('transitionend', () => {
      enter.classList.remove('enter', 'active');
    }, { once: true });
  }

  // ===== Day math (UTC) =====
  function getLaunchDateUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  }

  function computeDayUTC() {
    const launch = getLaunchDateUTC();
    const now = new Date();
    const nowUTCms = now.getTime() + now.getTimezoneOffset() * 60000;
    const day = Math.floor((nowUTCms - launch.getTime()) / 86400000) + 1;
    return Math.max(1, day);
  }

  function msUntilNextUtcMidnight() {
    const now = new Date();
    const nowUTCms = now.getTime() + now.getTimezoneOffset() * 60000;
    const d = new Date(nowUTCms);
    const nextMid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 60);
    return Math.max(1000, nextMid - nowUTCms);
  }

  // ===== Display helpers =====
  function setLabel(dayStr) {
    const r = rootEl();
    if (r) r.setAttribute('aria-label', `DAY ${dayStr}`);
  }

  function setDigitsInstant(dayStr) {
    const r = rootEl();
    if (!r) return;
    const slots = ensureSlots(Math.max(MIN_DIGITS, dayStr.length));
    const digits = dayStr.padStart(slots.length, '0').split('');
    slots.forEach((slot, i) => {
      const cur = slot.querySelector('.digit');
      if (cur) {
        cur.classList.remove('enter', 'leave', 'active');
        cur.textContent = digits[i];
      } else {
        swapDigit(slot, digits[i]);
      }
    });
    setLabel(dayStr.padStart(2, '0'));
  }

  // ===== Readable SHUFFLE → slow ticks → reveal =====
  function shuffleTo(target) {
    const r = rootEl();
    if (!r) return;
    const finalStr = String(target);
    const slots = ensureSlots(Math.max(MIN_DIGITS, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length, '0').split('').map(Number);

    // per-slot timing & state
    const lastShown = slots.map(s => {
      const n = parseInt(s.querySelector('.digit')?.textContent || '0', 10);
      return Number.isFinite(n) ? n : 0;
    });
    const speeds = slots.map(() => 28 + Math.random() * 12); // base speed (used then clamped by MIN_INTERVAL)
    const nextAt = slots.map(() => 0);

    const t0 = performance.now();
    let settling = false;

    function loop(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const decel = 1 - 0.7 * easeOutCubic(t);

      if (!settling) {
        slots.forEach((slot, i) => {
          if (now >= nextAt[i]) {
            const hop = 1 + Math.floor(Math.random() * 3); // 1..3
            const nxt = (lastShown[i] + hop) % 10;
            swapDigit(slot, nxt);
            lastShown[i] = nxt;

            const dps = Math.max(6, speeds[i] * decel);  // clamp to keep readable
            const stepInterval = Math.max(MIN_INTERVAL, 1000 / dps);
            nextAt[i] = now + stepInterval + Math.random() * 30;
          }
        });

        if (t >= 1) {
          settling = true;

          // final slow ticks per slot (no stacking thanks to swapDigit guard)
          slots.forEach((slot, i) => {
            const final = finalDigits[i];
            let cur = lastShown[i];
            const dist = (final - cur + 10) % 10;
            const steps = Math.max(SETTLE_TICKS, 3);

            const queue = [];
            for (let s = steps; s > 1; s--) {
              const n = (cur + Math.max(1, Math.round(dist * (s - 1) / steps))) % 10;
              queue.push(n); cur = n;
            }
            queue.push(final);

            let delay = SETTLE_BASE + Math.random() * 30;
            queue.forEach(digit => {
              setTimeout(() => { swapDigit(slot, digit); lastShown[i] = digit; }, Math.round(delay));
              delay *= SETTLE_GROW;
            });
          });

          const tail = SETTLE_BASE * Math.pow(SETTLE_GROW, Math.max(SETTLE_TICKS, 3) + 1) + 160;
          setTimeout(() => setLabel(finalStr.padStart(2, '0')), Math.round(tail));
        }
      }

      if (!settling) requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  // ===== Public flow =====
  function updateDayDisplay() {
    const day = computeDayUTC();
    const s = pad2(day);
    shuffleTo(s);
  }

  function scheduleRollover() {
    setTimeout(() => { updateDayDisplay(); scheduleRollover(); }, msUntilNextUtcMidnight());
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    const r = rootEl();
    if (!r) return;

    const today = pad2(computeDayUTC());
    setDigitsInstant(today);        // draw crisp immediately
    setTimeout(() => shuffleTo(today), 50); // entrance shuffle (readable)
    scheduleRollover();
  });
})();
