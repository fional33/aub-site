(() => {
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Shuffle feel
  const SCRAMBLE_MS = 800;     // overall scramble time
  const SETTLE_TICKS = 4;      // 3 slow ticks + final
  const SETTLE_BASE = 85;      // initial delay between final ticks
  const SETTLE_GROW = 1.7;     // ease-out growth between ticks

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const pad = (n, d = MIN_DIGITS) => String(n).padStart(d, '0');
  const rootEl = () => document.querySelector(SELECTOR);

  // ---------- Styles: bring back slot boxes, kill pseudo content, remove blur ----------
  function injectStyle() {
    if (document.getElementById('aub-day-style')) return;
    const style = document.createElement('style');
    style.id = 'aub-day-style';
    style.textContent = `
      ${SELECTOR}{
        position:relative;display:inline-flex;gap:.08em;
        font-variant-numeric:tabular-nums;white-space:nowrap
      }
      /* make sure no CSS inserts duplicate digits */
      ${SELECTOR}::before,${SELECTOR}::after{content:none !important}

      /* Black boxes (customizable via --aub-slot-bg) */
      ${SELECTOR} .slot{
        position:relative;display:inline-block;
        width:.70em;height:1em;line-height:1em;overflow:hidden;
        background:var(--aub-slot-bg,#000);border-radius:.18em;padding:0 .08em;
      }

      ${SELECTOR} .digit{
        position:absolute;left:0;right:0;top:0;
        line-height:1em;transform:translateY(0);
        opacity:1;
        transition:transform 120ms cubic-bezier(.2,.8,.2,1),opacity 120ms linear;
        will-change:transform,opacity;
        -webkit-font-smoothing:subpixel-antialiased;
        -moz-osx-font-smoothing:grayscale;
        text-rendering:optimizeLegibility;
      }
      /* No filter:blur anywhere (keeps type crisp) */
      ${SELECTOR} .digit.enter{transform:translateY(1em);opacity:0}
      ${SELECTOR} .digit.enter.active{transform:translateY(0);opacity:1}
      ${SELECTOR} .digit.leave{transform:translateY(-1em);opacity:0}

      /* If anything non-slot sneaks in, hide it */
      ${SELECTOR} > :not(.slot){display:none !important}
    `;
    document.head.appendChild(style);
  }

  // total wipe so no static/ghost nodes remain
  function wipeRoot(root) { if (root) root.replaceChildren(); }

  function ensureSlots(count) {
    const root = rootEl(); if (!root) return [];
    let slots = Array.from(root.querySelectorAll('.slot'));
    while (slots.length < count) {
      const slot = document.createElement('span');
      slot.className = 'slot';
      const d = document.createElement('span');
      d.className = 'digit';
      d.textContent = '0';
      slot.appendChild(d);
      root.appendChild(slot);
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
    requestAnimationFrame(() => enter.classList.add('active'));

    old.classList.add('leave');
    old.addEventListener('transitionend', () => old.remove(), { once: true });
    enter.addEventListener('transitionend', () => {
      enter.classList.remove('enter','active');
    }, { once: true });
  }

  // ---------- Day math (UTC) ----------
  function getLaunchDateUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  }
  function computeDayUTC() {
    const launch = getLaunchDateUTC();
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset()*60000;
    const day = Math.floor((nowUTC - launch.getTime())/86400000) + 1;
    return Math.max(1, day);
  }
  function msUntilNextUtcMidnight() {
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset()*60000;
    const d = new Date(nowUTC);
    const nextMid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1, 0,0,0,100);
    return Math.max(1000, nextMid - nowUTC);
  }

  function setLabel(dayStr) {
    const root = rootEl();
    if (root) root.setAttribute('aria-label', `DAY ${dayStr}`);
  }

  function setDigitsInstant(dayStr) {
    const slots = ensureSlots(Math.max(MIN_DIGITS, dayStr.length));
    const digits = dayStr.padStart(slots.length,'0').split('');
    slots.forEach((slot, i) => {
      const cur = slot.querySelector('.digit');
      if (cur) cur.textContent = digits[i];
      else swapDigit(slot, digits[i]);
    });
    setLabel(dayStr.padStart(2,'0'));
  }

  // ---------- SHUFFLE → slow 3 ticks → reveal (no blur) ----------
  function shuffleTo(target) {
    const root = rootEl(); if (!root) return;
    const finalStr = String(target);
    const slots = ensureSlots(Math.max(MIN_DIGITS, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length,'0').split('').map(Number);

    const lastShown = slots.map(s => {
      const n = parseInt(s.querySelector('.digit')?.textContent || '0', 10);
      return Number.isFinite(n) ? n : 0;
    });

    const speeds = slots.map(() => 38 + Math.random()*20); // per-slot rate
    const nextAt = slots.map(() => 0);

    const t0 = performance.now();
    let settling = false;

    function loop(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const slow = 1 - 0.60 * easeOutCubic(t); // slows a bit toward the end

      if (!settling) {
        slots.forEach((slot, i) => {
          if (now >= nextAt[i]) {
            const hop = 1 + Math.floor(Math.random()*3);
            const next = (lastShown[i] + hop) % 10;
            swapDigit(slot, next);
            lastShown[i] = next;

            const dps = Math.max(8, speeds[i]*slow);
            nextAt[i] = now + 1000/dps + Math.random()*25;
          }
        });

        if (t >= 1) {
          settling = true;
          slots.forEach((slot, i) => {
            const final = finalDigits[i];
            let cur = lastShown[i];
            const dist = (final - cur + 10) % 10;
            const steps = Math.max(SETTLE_TICKS, 3);

            const queue = [];
            for (let s = steps; s > 1; s--) {
              const n = (cur + Math.max(1, Math.round(dist*(s-1)/steps))) % 10;
              queue.push(n);
              cur = n;
            }
            queue.push(final);

            let delay = SETTLE_BASE + Math.random()*35;
            queue.forEach((digit) => {
              setTimeout(() => { swapDigit(slot, digit); lastShown[i] = digit; }, Math.round(delay));
              delay *= SETTLE_GROW;
            });
          });

          const settleTail = SETTLE_BASE * Math.pow(SETTLE_GROW, Math.max(SETTLE_TICKS,3)+1) + 200;
          setTimeout(() => setLabel(finalStr.padStart(2,'0')), Math.round(settleTail));
        }
      }
      if (!settling) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function updateDayDisplay() {
    const day = pad(computeDayUTC());
    shuffleTo(day);
  }
  function scheduleRollover() {
    setTimeout(() => { updateDayDisplay(); scheduleRollover(); }, msUntilNextUtcMidnight());
  }

  // Guard: if anything tries to reinsert static DOM, rebuild cleanly
  function guardRoot(root) {
    const mo = new MutationObserver(() => {
      const bad = Array.from(root.childNodes).some(n => !(n.nodeType === 1 && n.classList.contains('slot')));
      if (bad) {
        const current = root.getAttribute('aria-label')?.match(/\d+/)?.[0] || pad(computeDayUTC());
        wipeRoot(root);
        const slots = ensureSlots(current.length);
        current.split('').forEach((d,i) => swapDigit(slots[i], d));
      }
    });
    mo.observe(root, { childList: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    const root = rootEl(); if (!root) return;

    // Full wipe so there’s no static duplicate behind
    wipeRoot(root);

    // Initial draw (crisp)
    const today = pad(computeDayUTC());
    const slots = ensureSlots(today.length);
    today.split('').forEach((d,i) => swapDigit(slots[i], d));
    setLabel(today);

    // Light “alive” shuffle to same value
    setTimeout(() => shuffleTo(today), 50);

    // Midnight UTC rollover
    scheduleRollover();

    // Watch for stray DOM
    guardRoot(root);
  });
})();
