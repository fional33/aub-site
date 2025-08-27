(() => {
  const SELECTOR = '.aub-day-odometer';
  const MIN_DIGITS = 2;

  // Motion (all SNAP—no sliding = zero blur)
  const SCRAMBLE_MS  = 650;     // total scramble time
  const SCR_MIN      = 60;      // faster at start
  const SCR_MAX      = 110;     // slower near end
  const SETTLE_TICKS = 4;       // 3 slow ticks + final
  const SETTLE_BASE  = 110;
  const SETTLE_GROW  = 1.6;

  // ---------- Styles: no transforms/filters, tabular nums ----------
  function injectStyle(){
    if (document.getElementById('aub-day-style')) return;
    const style = document.createElement('style');
    style.id = 'aub-day-style';
    style.textContent = `
      ${SELECTOR}{
        position:relative;display:inline-flex;gap:.08em;white-space:nowrap;
        font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1;
        -webkit-font-smoothing:subpixel-antialiased; -moz-osx-font-smoothing:auto;
        text-rendering:optimizeLegibility;
        transform:none !important; filter:none !important; opacity:1 !important;
      }
      /* hide any stray static layer */
      ${SELECTOR} > :not(.slot){display:none !important}

      ${SELECTOR} .slot{
        position:relative;display:inline-block;overflow:hidden;
        width:.72em; height:var(--aub-h,40px); line-height:var(--aub-h,40px);
        background:transparent !important; border:0; border-radius:0; padding:0;
      }
      ${SELECTOR} .digit{
        position:relative; display:block;
        height:var(--aub-h,40px); line-height:var(--aub-h,40px);
        text-shadow:none !important; filter:none !important; opacity:1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  const rootEl = () => document.querySelector(SELECTOR);
  const pad = (n, d = MIN_DIGITS) => String(n).padStart(d, '0');

  function measure(root){
    const slot = document.createElement('span');
    slot.className = 'slot'; slot.style.visibility = 'hidden'; slot.style.position = 'absolute';
    const d = document.createElement('span'); d.className = 'digit'; d.textContent = '0';
    slot.appendChild(d); root.appendChild(slot);
    const h = Math.max(10, Math.round(d.getBoundingClientRect().height));
    root.style.setProperty('--aub-h', h + 'px'); slot.remove();
    return h;
  }

  function ensureSlots(count){
    const root = rootEl(); if (!root) return [];
    let slots = Array.from(root.querySelectorAll('.slot'));
    while (slots.length < count){
      const s = document.createElement('span'); s.className = 'slot';
      const d = document.createElement('span'); d.className = 'digit'; d.textContent = '0';
      s.appendChild(d); root.appendChild(s);
      slots = Array.from(root.querySelectorAll('.slot'));
    }
    return slots;
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

  // Detect a transformed ancestor (causes grayscale AA/softness)
  function nearestTransformedAncestor(el){
    let cur = el;
    while(cur && cur !== document.body){
      const cs = getComputedStyle(cur);
      if (cs.transform !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none' || parseFloat(cs.opacity) < 1){
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // ---------- SHUFFLE (snap) → slow 3 ticks → reveal ----------
  function shuffleTo(target){
    const root = rootEl(); if (!root) return;
    const finalStr = String(target);
    const slots = ensureSlots(Math.max(MIN_DIGITS, finalStr.length));
    const finalDigits = finalStr.padStart(slots.length,'0').split('').map(Number);

    const lastShown = slots.map(s => parseInt(s.querySelector('.digit')?.textContent || '0', 10) || 0);

    // Phase A: random scramble (SNAP updates)
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

    // Phase B: last ticks slower, then final (SNAP)
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

  document.addEventListener('DOMContentLoaded', async () => {
    injectStyle();
    const root = rootEl(); if (!root) return;

    // force integer font-size to avoid fractional rasterization
    const cs = getComputedStyle(root);
    const fs = parseFloat(cs.fontSize);
    if (fs && Math.abs(fs - Math.round(fs)) > 0.01){ root.style.fontSize = Math.round(fs) + 'px'; }

    measure(root);

    const culprit = nearestTransformedAncestor(root);
    if (culprit){ console.warn('[aub-day] Transformed ancestor can cause blur:', culprit); }

    const today = pad(computeDayUTC());
    const slots = ensureSlots(today.length);
    today.split('').forEach((d,i) => setDigit(slots[i], d));
    setLabel(today);

    setTimeout(() => shuffleTo(today), 60); // show life once
    scheduleRollover();

    let rt; window.addEventListener('resize', () => {
      clearTimeout(rt); rt = setTimeout(() => measure(root), 100);
    });
  });
})();
