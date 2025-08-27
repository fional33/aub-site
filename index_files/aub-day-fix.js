(() => {
  // ====== CONFIG ======
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Scramble timing & feel
  const SCRAMBLE_MS = 950;   // overall scramble time (fast but smooth)
  const SETTLE_TICKS = 4;    // how many slow ticks before reveal (3–4 looks great)
  const SETTLE_BASE = 110;   // first slow tick delay (ms)
  const SETTLE_GROW = 1.7;   // larger = more slowing at the end

  // ====== Utilities ======
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const pad = (n, d=MIN_DIGITS) => String(n).padStart(d, '0');

  function injectStyle() {
    if (document.getElementById('aub-day-style')) return;
    const css = `
      ${SELECTOR} { display:inline-flex; gap:.06em; font-variant-numeric: tabular-nums; }
      ${SELECTOR} .slot { position:relative; display:inline-block; width:0.65em; height:1em; overflow:hidden; }
      ${SELECTOR} .digit{
        position:absolute; inset:0 auto auto 0; line-height:1em;
        transform:translateY(0); opacity:1;
        transition: transform 140ms ease, opacity 140ms ease, filter 140ms ease;
        will-change: transform, opacity, filter;
      }
      ${SELECTOR} .digit.enter { transform:translateY(40%); opacity:0; filter:blur(2px); }
      ${SELECTOR} .digit.enter.active { transform:translateY(0); opacity:1; filter:blur(0); }
      ${SELECTOR} .digit.leave { transform:translateY(-40%); opacity:0; filter:blur(2px); }
      /* optional: spacing + aesthetics */
      ${SELECTOR} .slot { letter-spacing:0; }
    `;
    const style = document.createElement('style');
    style.id = 'aub-day-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function rootEl() { return document.querySelector(SELECTOR); }

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

  function swapDigit(slot, newDigit) {
    const old = slot.querySelector('.digit');
    if (!old) {
      const d = document.createElement('span');
      d.className = 'digit';
      d.textContent = String(newDigit);
      slot.appendChild(d);
      return;
    }
    if (old.textContent === String(newDigit)) return;

    const enter = document.createElement('span');
    enter.className = 'digit enter';
    enter.textContent = String(newDigit);
    slot.appendChild(enter);

    // next frame → run transition
    requestAnimationFrame(() => enter.classList.add('active'));

    // old leaves upward
    old.classList.add('leave');
    old.addEventListener('transitionend', () => old.remove(), { once: true });
    enter.addEventListener('transitionend', () => {
      enter.classList.remove('enter', 'active');
    }, { once: true });
  }

  // ====== Day math (UTC) ======
  function getLaunchDateUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  }

  function computeDayUTC() {
    const launch = getLaunchDateUTC();
    const now = new Date();
    // Convert local now→UTC ms
    const nowUTC = now.getTime() + now.getTimezoneOffset() * 60000;
    const day = Math.floor((nowUTC - launch.getTime()) / 86400000) + 1;
    return Math.max(1, day);
  }

  function msUntilNextUtcMidnight() {
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset() * 60000;
    const d = new Date(nowUTC);
    const nextMid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 80);
    return Math.max(1000, nextMid - nowUTC);
  }

  // ====== Display helpers ======
  function setLabel(dayStr) {
    const root = rootEl();
    if (root) root.setAttribute('aria-label', `DAY ${dayStr}`);
  }

  function setDigitsInstant(dayStr) {
    const root = rootEl();
    if (!root) return;
    const slots = ensureSlots(Math.max(MIN_DIGITS, dayStr.length));
    const digits = dayStr.padStart(slots.length, '0').split('');
    slots.forEach((slot, i) => {
      const cur = slot.querySelector('.digit');
      if (cur) cur.textContent = digits[i];
      else swapDigit(slot, digits[i]);
    });
    setLabel(dayStr.padStart(2, '0'));
  }

  // ====== Smooth SHUFFLE → slow ticks → reveal ======
  function shuffleTo(target) {
    const root = rootEl();
    if (!root) return;
    const finalStr = String(target);
    const slots = ensureSlots(Math.max(MIN_DIGITS, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length, '0').split('').map(Number);

    // keep per-slot state to avoid sync’d jumps
    const lastShown = slots.map(s => {
      const n = parseInt(s.querySelector('.digit')?.textContent || '0', 10);
      return Number.isFinite(n) ? n : 0;
    });
    const speeds = slots.map(() => 38 + Math.random() * 22); // digits/sec at start
    const nextAt = slots.map(() => 0);

    const t0 = performance.now();
    let settling = false;

    function loop(now) {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / SCRAMBLE_MS);
      const slow = 1 - 0.6 * easeOutCubic(t); // decelerate across scramble

      // Phase A: random scramble (smooth rAF cadence, jitter per slot)
      if (!settling) {
        slots.forEach((slot, i) => {
          if (now >= nextAt[i]) {
            // hop by 1–3 forward to look random; update via smooth flip
            const hop = 1 + Math.floor(Math.random() * 3); // 1..3
            const next = (lastShown[i] + hop) % 10;
            swapDigit(slot, next);
            lastShown[i] = next;

            // next change time based on current (slowing) speed
            const dps = Math.max(8, speeds[i] * slow); // lower bound keeps some motion
            nextAt[i] = now + 1000 / dps + Math.random() * 35; // tiny jitter
          }
        });

        if (t >= 1) {
          settling = true;

          // Phase B: 3–4 slower ticks toward final
          slots.forEach((slot, i) => {
            const final = finalDigits[i];
            let cur = lastShown[i];
            const dist = (final - cur + 10) % 10;
            const steps = Math.max(SETTLE_TICKS, 3);

            // build a monotonic queue approaching final
            const queue = [];
            for (let s = steps; s > 1; s--) {
              const n = (cur + Math.max(1, Math.round(dist * (s - 1) / steps))) % 10;
              queue.push(n);
              cur = n;
            }
            queue.push(final);

            // schedule with growing delays (slows down before reveal)
            let delay = SETTLE_BASE + Math.random() * 40;
            queue.forEach((digit) => {
              setTimeout(() => {
                swapDigit(slot, digit);
                lastShown[i] = digit;
              }, Math.round(delay));
              delay *= SETTLE_GROW;
            });
          });

          // finalize label after the slowest settle
          const settleTail = SETTLE_BASE * Math.pow(SETTLE_GROW, Math.max(SETTLE_TICKS, 3) + 1) + 220;
          setTimeout(() => setLabel(finalStr.padStart(2, '0')), Math.round(settleTail));
        }
      }

      if (!settling) requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  }

  // ====== Public flow ======
  function updateDayDisplay() {
    const day = computeDayUTC();
    const s = pad(day);
    // entrance animation every time we set it
    shuffleTo(s);
  }

  function scheduleRollover() {
    setTimeout(() => {
      updateDayDisplay();      // animate to the new day at UTC midnight
      scheduleRollover();      // schedule next midnight
    }, msUntilNextUtcMidnight());
  }

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    const root = rootEl();
    if (!root) return;

    // Show the current day immediately (no shuffle), then animate in
    const today = pad(computeDayUTC());
    setDigitsInstant(today);
    setTimeout(() => shuffleTo(today), 60); // initial entrance shuffle
    scheduleRollover();
  });
})();
