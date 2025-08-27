(() => {
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Shuffle feel
  const SCRAMBLE_MS = 700;    // fast overall scramble
  const SETTLE_TICKS = 4;     // 3 slow ticks + final
  const SETTLE_BASE = 80;     // initial settle delay
  const SETTLE_GROW = 1.65;   // ease-out growth between ticks

  // ---------- Utilities ----------
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const pad = (n, d = MIN_DIGITS) => String(n).padStart(d, '0');
  const rootEl = () => document.querySelector(SELECTOR);

  // ---------- Styles (no blur; whole-pixel movement only) ----------
  function injectStyle() {
    if (document.getElementById('aub-day-style')) return;
    const style = document.createElement('style');
    style.id = 'aub-day-style';
    style.textContent = `
      ${SELECTOR}{
        position:relative;display:inline-flex;gap:.08em;
        font-variant-numeric:tabular-nums;
        font-feature-settings:"tnum" 1;
        white-space:nowrap;
        -webkit-font-smoothing:auto !important;
        filter:none !important;
        transform:none !important;
      }
      ${SELECTOR}::before,${SELECTOR}::after{content:none !important}

      ${SELECTOR} .slot{
        position:relative;display:inline-block;overflow:hidden;
        width:.72em;height:var(--aub-h,40px);line-height:var(--aub-h,40px);
        background:var(--aub-slot-bg,#000);border-radius:.18em;padding:0 .08em;
      }

      ${SELECTOR} .digit{
        position:absolute;left:0;right:0;top:0;
        height:var(--aub-h,40px);line-height:var(--aub-h,40px);
        transform:translateY(var(--aub-y,0px));
        transition:transform 110ms cubic-bezier(.2,.8,.2,1);
        will-change:auto;            /* avoid forcing GPU text */
        filter:none !important;
        backface-visibility:hidden;  /* avoids flicker */
        text-rendering:optimizeLegibility;
      }
      ${SELECTOR} .digit.enter{ --aub-y: var(--aub-h,40px); }
      ${SELECTOR} .digit.enter.active{ --aub-y: 0px; }
      ${SELECTOR} .digit.leave{ --aub-y: calc(-1 * var(--aub-h,40px)); }

      /* Hide anything that isn't a slot so no static layer overlaps */
      ${SELECTOR} > :not(.slot){display:none !important}
    `;
    document.head.appendChild(style);
  }

  // Measure digit height in integer pixels and store in --aub-h
  function measureAndSetHeight(root) {
    // make a hidden digit with the same font to measure
    const probeSlot = document.createElement('span');
    probeSlot.className = 'slot';
    const probe = document.createElement('span');
    probe.className = 'digit';
    probe.textContent = '0';
    probeSlot.style.visibility = 'hidden';
    probeSlot.style.position = 'absolute';
    root.appendChild(probeSlot);
    probeSlot.appendChild(probe);

    // Use the actual rendered height, snap to full pixel
    const h = Math.max(10, Math.round(probe.getBoundingClientRect().height));
    root.style.setProperty('--aub-h', h + 'px');

    probeSlot.remove();
    return h;
  }

  // Clean start (no ghost/static)
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

    // Enter below in whole-pixel step, then move up; old slides up and is removed
    const enter = document.createElement('span');
    enter.className = 'digit enter';
    enter.textContent = String(newDigit);
    slot.appendChild(enter);
    requestAnimationFrame(() => enter.classList.add('active'));

    old.classList.add('leave');
    old.addEventListener('transitionend', () => old.remove(), { once: true });
    enter.addEventListener('transitionend', () => {
      enter.classList.remove('enter','active');
      enter.style.removeProperty('--aub-y'); // keep future moves crisp
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

  // ---------- SHUFFLE (random, quick) → slow 3 ticks → reveal ----------
  function shuffleTo(target) {
    const root = rootEl(); if (!root) return;
    const finalStr = String(target);
    const slots = ensureSlots(Math.max(MIN_DIGITS, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length,'0').split('').map(Number);

    const lastShown = slots.map(s => {
      const n = parseInt(s.querySelector('.digit')?.textContent || '0', 10);
      return Number.isFinite(n) ? n : 0;
    });

    const speeds = slots.map(() => 42 + Math.random()*18); // per-slot rate
    const nextAt = slots.map(() => 0);

    const t0 = performance.now();
    let settling = false;

    function loop(now) {
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      const slow = 1 - 0.55 * easeOutCubic(t); // mild slow-down

      if (!settling) {
        slots.forEach((slot, i) => {
          if (now >= nextAt[i]) {
            const hop = 1 + Math.floor(Math.random()*3);
            const next = (lastShown[i] + hop) % 10;
            swapDigit(slot, next);
            lastShown[i] = next;

            const dps = Math.max(10, speeds[i]*slow);
            nextAt[i] = now + 1000/dps + Math.random()*20;
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

            let delay = SETTLE_BASE + Math.random()*30;
            queue.forEach((digit) => {
              setTimeout(() => { swapDigit(slot, digit); lastShown[i] = digit; }, Math.round(delay));
              delay *= SETTLE_GROW;
            });
          });

          const settleTail = SETTLE_BASE * Math.pow(SETTLE_GROW, Math.max(SETTLE_TICKS,3)+1) + 160;
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

  // Guard: rebuild if anything tries to inject non-slot DOM
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

    // Clean slate, measure pixel height to avoid fractional transforms
    wipeRoot(root);
    measureAndSetHeight(root);

    const today = pad(computeDayUTC());
    const slots = ensureSlots(today.length);
    today.split('').forEach((d,i) => swapDigit(slots[i], d));
    setLabel(today);

    // Tiny shuffle-to-same to show life
    setTimeout(() => shuffleTo(today), 40);

    // Midnight UTC rollover
    scheduleRollover();

    // Keep crisp if fonts resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => measureAndSetHeight(root), 80);
    });

    guardRoot(root);
  });
})();
