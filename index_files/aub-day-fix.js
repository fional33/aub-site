(() => {
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Motion tuning
  const SCRAMBLE_MS   = 650;     // total random-scramble time
  const SCR_MIN_DUR   = 55;      // per-hop ms during scramble (faster)
  const SCR_MAX_DUR   = 95;      // per-hop ms during scramble (slower)
  const SETTLE_TICKS  = 4;       // 3 slow ticks + final
  const SETTLE_BASE   = 90;      // first settle tick duration (ms)
  const SETTLE_GROW   = 1.55;    // growth factor between ticks

  let DIGIT_H = 40; // updated after measuring

  // ---------- Utilities ----------
  const pad = (n, d = MIN_DIGITS) => String(n).padStart(d, '0');
  const rootEl = () => document.querySelector(SELECTOR);
  const clampPosPx = v => (v|0) + 'px'; // integer px

  // ---------- Styles (no background boxes, no transforms) ----------
  function injectStyle() {
    if (document.getElementById('aub-day-style')) return;
    const style = document.createElement('style');
    style.id = 'aub-day-style';
    style.textContent = `
      ${SELECTOR}{
        position:relative;display:inline-flex;gap:.08em;
        white-space:nowrap;
        font-variant-numeric:tabular-nums;
        font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:auto !important;
        text-rendering:optimizeLegibility;
        filter:none !important; transform:none !important;
      }
      /* hide any stray static layer */
      ${SELECTOR} > :not(.slot){display:none !important}

      ${SELECTOR} .slot{
        position:relative;display:inline-block;overflow:hidden;
        width:.72em;
        height:var(--aub-h,40px);
        line-height:var(--aub-h,40px);
        background:transparent !important;    /* <-- no black boxes */
        border-radius:0 !important;
        padding:0 !important;
      }
      ${SELECTOR} .digit{
        position:absolute;left:0;right:0;top:0;
        height:var(--aub-h,40px);
        line-height:var(--aub-h,40px);
        filter:none !important; opacity:1 !important;
        will-change:auto; /* keep as normal text rendering */
      }
    `;
    document.head.appendChild(style);
  }

  // Measure digit height in whole pixels and store to --aub-h
  function measureAndSetHeight(root) {
    const probeSlot = document.createElement('span');
    probeSlot.className = 'slot';
    const probe = document.createElement('span');
    probe.className = 'digit';
    probe.textContent = '0';
    probeSlot.style.visibility = 'hidden';
    probeSlot.style.position = 'absolute';
    root.appendChild(probeSlot);
    probeSlot.appendChild(probe);
    const h = Math.max(10, Math.round(probe.getBoundingClientRect().height));
    DIGIT_H = h;
    root.style.setProperty('--aub-h', h + 'px');
    probeSlot.remove();
    return h;
  }

  function wipeRoot(root){ if (root) root.replaceChildren(); }

  function ensureSlots(count) {
    const root = rootEl(); if (!root) return [];
    let slots = Array.from(root.querySelectorAll('.slot'));
    while (slots.length < count) {
      const slot = document.createElement('span');
      slot.className = 'slot';
      const d = document.createElement('span');
      d.className = 'digit';
      d.textContent = '0';
      d.style.top = '0px';
      slot.appendChild(d);
      root.appendChild(slot);
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
  }

  // Instant set (no animation)
  function renderDigit(slot, d) {
    let el = slot.querySelector('.digit');
    if (!el) {
      el = document.createElement('span');
      el.className = 'digit';
      slot.appendChild(el);
    }
    el.textContent = String(d);
    el.style.top = '0px';
  }

  // Slide old up and new in from below using integer top px (crisp)
  function slideToDigit(slot, newDigit, durationMs) {
    const oldEl = slot.querySelector('.digit');
    const newEl = document.createElement('span');
    newEl.className = 'digit';
    newEl.textContent = String(newDigit);
    newEl.style.top = clampPosPx(DIGIT_H);
    slot.appendChild(newEl);

    const t0 = performance.now();
    function step(now){
      const p = Math.min(1, (now - t0) / durationMs);
      const yNew = Math.round(DIGIT_H * (1 - p));
      const yOld = Math.round(-DIGIT_H * p);
      newEl.style.top = clampPosPx(yNew);
      if (oldEl) oldEl.style.top = clampPosPx(yOld);
      if (p < 1) requestAnimationFrame(step);
      else {
        if (oldEl) oldEl.remove();
        newEl.style.top = '0px';
      }
    }
    requestAnimationFrame(step);
  }

  // ---------- Day math (UTC) ----------
  function getLaunchDateUTC() {
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw  = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
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

  // ---------- SHUFFLE (random) → slow last 3–4 ticks → reveal ----------
  function shuffleTo(target) {
    const root = rootEl(); if (!root) return;
    const finalStr = String(target);
    const slots = ensureSlots(Math.max(MIN_DIGITS, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length,'0').split('').map(Number);

    const lastShown = slots.map(s => {
      const n = parseInt(s.querySelector('.digit')?.textContent || '0', 10);
      return Number.isFinite(n) ? n : 0;
    });

    // Phase A: random scramble with crisp short slides
    const t0 = performance.now();
    const nextAt = slots.map(() => 0);

    function scramble(now){
      const t = Math.min(1, (now - t0) / SCRAMBLE_MS);
      // interval eases from SCR_MIN_DUR to SCR_MAX_DUR
      const dur = SCR_MIN_DUR + (SCR_MAX_DUR - SCR_MIN_DUR) * t;

      slots.forEach((slot, i) => {
        if (now >= nextAt[i]) {
          const hop = 1 + Math.floor(Math.random()*3);
          const nxt = (lastShown[i] + hop) % 10;
          slideToDigit(slot, nxt, dur);
          lastShown[i] = nxt;
          nextAt[i] = now + (dur * (0.9 + Math.random()*0.3)); // desync
        }
      });

      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    }

    // Phase B: last 3–4 ticks slower, then final
    function settle(){
      slots.forEach((slot, i) => {
        const final = finalDigits[i];
        let cur = lastShown[i];
        const dist = (final - cur + 10) % 10;
        const steps = Math.max(SETTLE_TICKS, 3);

        const queue = [];
        for (let s = steps; s > 1; s--) {
          const n = (cur + Math.max(1, Math.round(dist*(s-1)/steps))) % 10;
          queue.push(n); cur = n;
        }
        queue.push(final);

        let delay = 0;
        queue.forEach((digit, idx) => {
          const dur = SETTLE_BASE * Math.pow(SETTLE_GROW, idx); // slows toward end
          setTimeout(() => slideToDigit(slot, digit, dur), delay);
          delay += dur + 18; // tiny gap to accentuate steps
        });
      });

      const tail = SETTLE_BASE * Math.pow(SETTLE_GROW, Math.max(SETTLE_TICKS,3)) + 220;
      setTimeout(() => setLabel(finalStr.padStart(2,'0')), tail);
    }

    requestAnimationFrame(scramble);
  }

  function updateDayDisplay(){ shuffleTo(pad(computeDayUTC())); }
  function scheduleRollover(){ setTimeout(() => { updateDayDisplay(); scheduleRollover(); }, msUntilNextUtcMidnight()); }

  // Guard: keep only .slot children (prevents any static overlap)
  function guardRoot(root) {
    const mo = new MutationObserver(() => {
      const bad = Array.from(root.childNodes).some(n => !(n.nodeType === 1 && n.classList.contains('slot')));
      if (bad) {
        const current = root.getAttribute('aria-label')?.match(/\d+/)?.[0] || pad(computeDayUTC());
        wipeRoot(root);
        const slots = ensureSlots(current.length);
        current.split('').forEach((d,i) => renderDigit(slots[i], d));
      }
    });
    mo.observe(root, { childList: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    injectStyle();
    const root = rootEl(); if (!root) return;

    // Clean slate & measure for whole-px motion
    wipeRoot(root);
    measureAndSetHeight(root);

    const today = pad(computeDayUTC());
    const slots = ensureSlots(today.length);
    today.split('').forEach((d,i) => renderDigit(slots[i], d));
    setLabel(today);

    // Show life once
    setTimeout(() => shuffleTo(today), 40);

    // Midnight UTC rollover
    scheduleRollover();

    // Re-measure on resize
    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => measureAndSetHeight(root), 80);
    });

    guardRoot(root);
  });
})();
