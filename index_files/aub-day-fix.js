/* AUB Day Odometer – standalone, smooth 60fps shuffle */
(() => {
  // ---------- CONFIG ----------
  const LAUNCH_UTC  = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
    || window.AUB_LAUNCH_UTC
    || '2025-08-25T00:00:00Z'
  );
  const DIGITS      = '0123456789';
  const REPEAT_ROWS = 8;      // total rows = 10 * REPEAT_ROWS (enough headroom to spin)
  const EASE        = 'cubic-bezier(.20,.70,.10,1)'; // buttery ease
  const FONT_STACK  = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  const GLYPH_GLOW  = '0 0 6px rgba(255,255,255,.55), 0 0 16px rgba(255,255,255,.15)';

  // ---------- CSS (injected once) ----------
  const SID = 'aub-day-css';
  if (!document.getElementById(SID)) {
    const s = document.createElement('style'); s.id = SID;
    s.textContent = `
    .aub-day-odometer{
      --aub-size: 45px;              /* height per digit */
      --aub-width-mult: 1.10;        /* width = height * mult  */
      --aub-gap: 6px;
      display:inline-flex; align-items:center; gap:var(--aub-gap);
      color:#fff; font:700 calc(var(--aub-size)*0.84)/1 ${FONT_STACK};
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    }
    .aub-day-odometer .aub-label{ margin-right:10px; letter-spacing:.06em; opacity:.9; }
    .aub-slot{
      position:relative; overflow:hidden; background:#000;
      height:var(--aub-size); width:calc(var(--aub-size)*var(--aub-width-mult));
      min-width:calc(var(--aub-size)*var(--aub-width-mult));
      display:block; border-radius:6px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
    }
    .aub-reel{
      position:absolute; left:0; top:0; right:0;
      transform: translate3d(0,0,0);
    }
    .aub-glyph{
      height:var(--aub-size);
      display:flex; align-items:center; justify-content:center;
      text-shadow:${GLYPH_GLOW};
      letter-spacing:-.02em;
      user-select:none; pointer-events:none;
    }
    .aub-day-odometer .aub-gap{ width:calc(var(--aub-gap)*1.5); height:1px; }
    `;
    document.head.appendChild(s);
  }

  // ---------- DOM bootstrap ----------
  function ensureRoot(){
    let root = document.querySelector('.aub-day-odometer');
    if (!root) {
      root = document.createElement('div');
      root.className = 'aub-day-odometer';
      document.body.prepend(root);
    }
    if (!root.querySelector('.aub-label')) {
      const lb = document.createElement('span');
      lb.className = 'aub-label';
      lb.textContent = 'DAY';
      root.prepend(lb);
    }
    return root;
  }

  function ensureSlots(n){
    const root = ensureRoot();
    let slots = Array.from(root.querySelectorAll('.aub-slot'));
    const gap = root.querySelector('.aub-gap') || root.appendChild(Object.assign(document.createElement('i'), {className:'aub-gap'}));

    // add missing slots
    while (slots.length < n){
      const slot = document.createElement('div');
      slot.className = 'aub-slot';
      const reel = document.createElement('div');
      reel.className = 'aub-reel';

      // build digits 0–9 repeated, plus one extra 0 to ease exact landing
      let html = '';
      for (let r=0; r<REPEAT_ROWS; r++){
        for (let i=0; i<10; i++){
          html += `<div class="aub-glyph">${DIGITS[i]}</div>`;
        }
      }
      html += `<div class="aub-glyph">0</div>`;
      reel.innerHTML = html;

      // randomize starting offset so reels aren’t synced
      const h = sizePx();
      const startRow = (Math.random()*10|0) + 10; // skip a couple rows down
      reel.style.transform = `translate3d(0,${-startRow*h}px,0)`;
      reel.dataset.row = String(startRow);

      slot.appendChild(reel);
      gap.before(slot);
      slots.push(slot);
    }

    // trim extra slots
    while (slots.length > n){
      slots.pop().remove();
    }
    return Array.from(root.querySelectorAll('.aub-slot'));
  }

  // ---------- Helpers ----------
  const sizePx = () => parseFloat(getComputedStyle(document.querySelector('.aub-day-odometer')).getPropertyValue('--aub-size')) || 45;

  function currentRow(reel){
    return Number(reel.dataset.row || '0');
  }

  function spinReelToDigit(reel, finalDigit, {cycles=12, duration=1200}={}){
    // map glyph index 0..9 to the row we want to land on
    const start = currentRow(reel);
    const diff  = (finalDigit - (start % 10) + 10) % 10;
    const steps = cycles*10 + diff;                   // total digit steps
    const target = start + steps;

    // transition (add will-change only during motion)
    const h = sizePx();
    reel.style.willChange = 'transform';
    reel.style.transition = `transform ${duration}ms ${EASE}`;
    reel.style.transform  = `translate3d(0,${-target*h}px,0)`;

    const cleanup = () => {
      reel.removeEventListener('transitionend', cleanup);
      reel.style.transition = 'none';
      // collapse position so translate values stay small:
      const normalized = (target % (10*REPEAT_ROWS));
      reel.style.transform = `translate3d(0,${-normalized*h}px,0)`;
      reel.dataset.row = String(normalized);
      // give the compositor a frame to settle, then drop will-change
      requestAnimationFrame(() => (reel.style.willChange = 'auto'));
    };
    reel.addEventListener('transitionend', cleanup);
  }

  function shuffleTo(num, {scramble=650, settle=800}={}){
    const root  = ensureRoot();
    const s     = String(num).padStart(2,'0'); // 2 digits
    const slots = ensureSlots(s.length);
    root.setAttribute('aria-label', `DAY ${s}`);

    // Phase A: quick random scramble (desynced)
    slots.forEach((slot, i) => {
      const reel = slot.firstElementChild;
      const randDigit = Math.floor(Math.random()*10);
      const dur  = scramble + Math.floor(i*70) + Math.floor(Math.random()*80);
      spinReelToDigit(reel, randDigit, {cycles: 6 + (i*2), duration: dur});
    });

    // Phase B: 3 slow ticks to the final value
    setTimeout(() => {
      [...s].forEach((ch, i) => {
        const reel = slots[i].firstElementChild;
        const d = Number(ch);
        // three gentle approach spins with shorter cycles, then land
        const seq = [
          {cycles: 3 + i, dur: 220},
          {cycles: 2 + i, dur: 260},
          {cycles: 1 + i, dur: 320},
          {cycles: 1 + i, dur: settle + i*120}
        ];
        let t = 0;
        seq.forEach((step, k) => {
          t += (k ? seq[k-1].dur + 30 : 0);
          setTimeout(() => {
            const target = (k === seq.length-1) ? d : Math.floor(Math.random()*10);
            spinReelToDigit(reel, target, {cycles: step.cycles, duration: step.dur});
          }, t);
        });
      });
    }, scramble + 40);
  }

  // Day math (UTC, 1-indexed, rolls at UTC midnight)
  function dayNumber(){
    const ms = Date.now() - LAUNCH_UTC.getTime();
    return Math.max(1, Math.floor(ms/86400000) + 1);
  }

  // ---------- Public helpers ----------
  window.AUB_SIZE = (h=45, wMult=1.10) => {
    const root = ensureRoot();
    root.style.setProperty('--aub-size', `${h}px`, 'important');
    root.style.setProperty('--aub-width-mult', String(wMult), 'important');
    // also lock slot width/height directly to beat any external CSS
    root.querySelectorAll('.aub-slot').forEach(el => {
      el.style.height = `${h}px`;
      const w = (h * wMult).toFixed(2)+'px';
      el.style.width = w; el.style.minWidth = w;
    });
    return {h, w: h*wMult};
  };
  window.AUB_SHUFFLE = (n) => shuffleTo(n);
  window.AUB_TUNE_Y  = (delta=0) => {
    // vertical micro-nudge by adjusting reel base row fractional offset
    ensureSlots(2).forEach(s => {
      const reel = s.firstElementChild;
      const h = sizePx();
      const cur = reel.style.transform.match(/translate3d\(0,(-?[\d.]+)px,0\)/);
      const y = cur ? parseFloat(cur[1]) : 0;
      reel.style.transform = `translate3d(0,${y + delta*h}px,0)`;
    });
  };
  window.AUB_STATUS = () => {
    const slots = ensureSlots(2);
    const h = sizePx();
    return slots.map(s => ({ h, y: s.firstElementChild.style.transform }));
  };

  // ---------- Boot ----------
  const n = dayNumber();
  shuffleTo(n, {scramble: 500, settle: 700});
  // midnight UTC rollover
  const tick = () => {
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()+1, 0,0,0,0);
    setTimeout(() => { shuffleTo(dayNumber(), {scramble: 450, settle: 650}); tick(); }, next - now);
  };
  tick();
})();
