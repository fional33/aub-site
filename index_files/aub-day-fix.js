(() => {
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Motion: SNAP-only updates (no translate) to stay razor sharp
  const SCRAMBLE_MS  = 520;  // quick shuffly burst
  const SCR_MIN      = 40;   // faster at start
  const SCR_MAX      = 90;   // slower near end
  const SETTLE_TICKS = 4;    // 3 slow ticks + final
  const SETTLE_BASE  = 90;
  const SETTLE_GROW  = 1.55;

  function injectStyle(){
    if (document.getElementById('aub-day-style')) return;
    const style = document.createElement('style');
    style.id = 'aub-day-style';
    style.textContent = `
      ${SELECTOR}{
        position:relative;display:inline-flex;gap:.08em;white-space:nowrap;
        font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:subpixel-antialiased; -moz-osx-font-smoothing:auto;
        text-rendering:optimizeLegibility; transform:none !important; filter:none !important;
      }
      /* If some stray element sits in the container, hide it */
      ${SELECTOR} > :not(.slot){display:none !important}
      ${SELECTOR} .slot{
        position:relative;display:inline-block;overflow:hidden;
        width:.72em;height:var(--aub-h,40px);line-height:var(--aub-h,40px);
      }
      ${SELECTOR} .digit{
        position:relative;display:block;height:var(--aub-h,40px);line-height:var(--aub-h,40px);
      }
    `;
    document.head.appendChild(style);
  }

  const rootEl = () => document.querySelector(SELECTOR);
  const pad = (n, d = MIN_DIGITS) => String(n).padStart(d, '0');

  function measure(root){
    const probeSlot = document.createElement('span');
    probeSlot.className = 'slot'; probeSlot.style.visibility = 'hidden'; probeSlot.style.position = 'absolute';
    const d = document.createElement('span'); d.className = 'digit'; d.textContent = '0';
    probeSlot.appendChild(d); root.appendChild(probeSlot);
    const h = Math.max(10, Math.round(d.getBoundingClientRect().height));
    root.style.setProperty('--aub-h', h + 'px'); probeSlot.remove();
    return h;
  }

  // Hard reset: remove ALL children (kills static text nodes) and rebuild
  function buildSlots(count){
    const root = rootEl(); if (!root) return [];
    root.textContent = ''; // nuke any static numbers / text nodes
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++){
      const s = document.createElement('span'); s.className = 'slot';
      const d = document.createElement('span'); d.className = 'digit'; d.textContent = '0';
      s.appendChild(d); frag.appendChild(s);
    }
    root.appendChild(frag);
    return Array.from(root.querySelectorAll('.slot'));
  }

  function setDigit(slot, d){
    let el = slot.querySelector('.digit');
    if (!el){ el = document.createElement('span'); el.className = 'digit'; slot.appendChild(el); }
    el.textContent = String(d);
  }

  // ---------- Day math (UTC) ----------
  function getLaunchDateUTC(){
    const meta = document.querySelector('meta[name="aub-launch-utc"]')?.content;
    const raw = meta || window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
    const d = new Date(raw);
    return isNaN(+d) ? new Date('2025-08-25T00:00:00Z') : d;
  }
  function computeDayUTC(){
    const launch = getLaunchDateUTC();
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset()*60000;
    const day = Math.floor((nowUTC - launch.getTime())/86400000) + 1;
    return Math.max(1, day);
  }
  function msUntilNextUtcMidnight(){
    const now = new Date();
    const nowUTC = now.getTime() + now.getTimezoneOffset()*60000;
    const d = new Date(nowUTC);
    const nextMid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()+1, 0,0,0,100);
    return Math.max(1000, nextMid - nowUTC);
  }
  function setLabel(dayStr){ rootEl()?.setAttribute('aria-label', `DAY ${dayStr}`); }

  // ---------- SHUFFLE (snap) → slow 3–4 ticks → reveal ----------
  function shuffleTo(target){
    const root = rootEl(); if (!root) return;
    const finalStr = String(target);
    const needed = Math.max(MIN_DIGITS, finalStr.length);

    // If slot count mismatches or container still has text, rebuild fresh
    const haveSlots = Array.from(root.querySelectorAll('.slot'));
    const textNodesRemain = Array.from(root.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim() !== '');
    const slots = (haveSlots.length !== needed || textNodesRemain) ? buildSlots(needed) : haveSlots;

    const finalDigits = finalStr.padStart(slots.length,'0').split('').map(Number);
    const lastShown = slots.map(s => parseInt(s.querySelector('.digit')?.textContent || '0', 10) || 0);

    // Phase A: random scramble (SNAP updates only)
    const start = performance.now();
    const nextAt = slots.map(() => 0);

    (function scramble(now){
      const t = Math.min(1, (now - start)/SCRAMBLE_MS);
      const dur = SCR_MIN + (SCR_MAX - SCR_MIN) * t;
      slots.forEach((slot, i) => {
        if (now >= nextAt[i]){
          const hop = 1 + Math.floor(Math.random()*3);
          const nxt = (lastShown[i] + hop) % 10;
          setDigit(slot, nxt);
          lastShown[i] = nxt;
          nextAt[i] = now + dur * (0.9 + Math.random()*0.3);
        }
      });
      if (t < 1) requestAnimationFrame(scramble);
      else settle();
    })(performance.now());

    // Phase B: last ticks slow down, then final (SNAP)
    function settle(){
      slots.forEach((slot, i) => {
        const final = finalDigits[i];
        let cur = lastShown[i];
        const dist = (final - cur + 10) % 10;
        const steps = Math.max(SETTLE_TICKS, 3);
        const queue = [];
        for (let s = steps; s > 1; s--){
          const n = (cur + Math.max(1, Math.round(dist*(s-1)/steps))) % 10;
          queue.push(n); cur = n;
        }
        queue.push(final);

        let delay = 0;
        queue.forEach((digit, idx) => {
          const stepDur = Math.round(SETTLE_BASE * Math.pow(SETTLE_GROW, idx));
          setTimeout(() => setDigit(slot, digit), delay);
          delay += stepDur;
        });
      });

      const tail = Math.round(SETTLE_BASE * Math.pow(SETTLE_GROW, Math.max(SETTLE_TICKS,3)));
      setTimeout(() => setLabel(finalStr.padStart(2,'0')), tail + 40);
    }
  }

  function update(){ shuffleTo(pad(computeDayUTC())); }
  function scheduleRollover(){ setTimeout(() => { update(); scheduleRollover(); }, msUntilNextUtcMidnight()); }

  document.addEventListener('DOMContentLoaded', () => {
    const root = rootEl(); if (!root) return;

    // Singleton guard to prevent double init overlap
    if (root.dataset.aubInit === '1') return;
    root.dataset.aubInit = '1';

    injectStyle();

    // Force integer font-size to avoid fractional rasterization
    const cs = getComputedStyle(root);
    const fs = parseFloat(cs.fontSize);
    if (fs && Math.abs(fs - Math.round(fs)) > 0.01){ root.style.fontSize = Math.round(fs) + 'px'; }

    const today = pad(computeDayUTC());
    buildSlots(today.length);            // <- wipes static nodes and builds fresh
    const slots = Array.from(root.querySelectorAll('.slot'));
    today.split('').forEach((d,i) => setDigit(slots[i], d));
    setLabel(today);

    measure(root);
    setTimeout(() => shuffleTo(today), 60); // initial life
    scheduleRollover();

    let rt; window.addEventListener('resize', () => {
      clearTimeout(rt); rt = setTimeout(() => measure(root), 100);
    });
  });
})();
