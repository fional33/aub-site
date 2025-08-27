(() => {
  const LAUNCH_UTC = new Date(
    document.querySelector('meta[name="aub-launch-utc"]')?.content
    || (window.AUB_LAUNCH_UTC ?? '2025-08-25T00:00:00Z')
  );

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  root.textContent = '';
  injectCSS(true); // force-replace style

  // --- DOM helpers ---
  function buildReel() {
    const reel = document.createElement('span');
    reel.className = 'aub-reel';
    for (let r = 0; r < 2; r++) {
      for (let d = 0; d < 10; d++) {
        const cell = document.createElement('span');
        cell.className = 'aub-cell';
        const glyph = document.createElement('span');
        glyph.className = 'aub-glyph';
        glyph.textContent = d;
        cell.appendChild(glyph);
        reel.appendChild(cell);
      }
    }
    return reel;
  }

  function ensureSlots(count) {
    let slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (let i = slots.length; i < count; i++) {
      const slot = document.createElement('span');
      slot.className = 'aub-slot';
      slot.setAttribute('aria-hidden','true');
      slot.appendChild(buildReel());
      root.prepend(slot);
    }
    slots = Array.from(root.querySelectorAll('.aub-slot'));
    for (const s of slots) {
      if (!s.firstElementChild || !s.firstElementChild.classList.contains('aub-reel')) {
        s.innerHTML = '';
        s.appendChild(buildReel());
      }
    }
    return slots;
  }

  // --- geometry / movement ---
  function cellH(slot){
    const c = slot.querySelector('.aub-cell');
    return Math.max(1, Math.round(c?.getBoundingClientRect().height || 0));
  }

  function setReel(slot, digit, {immediate=false, dur=0, ease='' } = {}) {
    const reel = slot.querySelector('.aub-reel');
    if (!reel) return;
    const h = cellH(slot);
    const off = Math.round(h * ((((digit % 10) + 10) % 10) + 10)); // snap to px
    if (dur) reel.style.transition = `transform ${dur}ms ${ease || 'cubic-bezier(.2,.7,.2,1)'}`;
    if (immediate) {
      const prev = reel.style.transition;
      reel.style.transition = 'none';
      reel.style.transform = `translate3d(0, ${-off}px, 0)`;
      reel.offsetHeight;
      reel.style.transition = prev;
    } else {
      reel.style.transform = `translate3d(0, ${-off}px, 0)`;
    }
  }

  // --- animation ---
  function scrambleThenReveal(target) {
    const str   = String(target);
    const slots = ensureSlots(str.length);
    const final = str.padStart(slots.length,'0').split('').map(n=>+n);

    // start from random digits
    slots.forEach(s => setReel(s, Math.floor(Math.random()*10), {immediate:true}));

    // Phase A: smooth shuffle (decelerate)
    const A_MS = 800, t0 = performance.now();
    const easeOut = t => 1 - Math.pow(1 - t, 3);

    function tick(now){
      const t = Math.min(1, (now - t0)/A_MS);
      const v = easeOut(t);
      for (let i=0;i<slots.length;i++){
        const slot = slots[i];
        const reel = slot.querySelector('.aub-reel');
        if (!reel) continue;
        const h = cellH(slot);
        const jitter = 0.9 + Math.random()*0.2;
        const spins = (16 - i*3) * (1 - v) * jitter + 2;
        const px = Math.round(h*10 + h*spins);
        reel.style.transition = 'transform 70ms cubic-bezier(.2,.7,.2,1)';
        reel.style.transform  = `translate3d(0, ${-px}px, 0)`;
      }
      if (t < 1) requestAnimationFrame(tick); else settle();
    }

    function settle(){
      const TICKS=3, STEP=120;
      slots.forEach((slot,i)=>{
        const fd = final[i];
        for (let k=0;k<=TICKS;k++){
          const d = (fd - (TICKS - k) + 20) % 10;
          const delay = Math.round(STEP*(k+1)*(1+i*0.08));
          setTimeout(()=> setReel(slot, d, {dur:120+k*20, ease:'cubic-bezier(.15,.9,.1,1)'}), delay);
        }
      });
    }

    requestAnimationFrame(tick);
  }

  // --- day / schedule ---
  const daySinceLaunch = () => Math.max(0,
    Math.floor((Date.now() - LAUNCH_UTC.getTime())/86400000)
  );

  function updateDay(){
    const n = daySinceLaunch();
    const label = String(n).padStart(2,'0');
    root.setAttribute('aria-label', `DAY ${label}`);
    scrambleThenReveal(label);
  }

  updateDay();
  (function scheduleMidnight(){
    const n=new Date();
    const next=new Date(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1,0,0,0));
    setTimeout(()=>{ updateDay(); setInterval(updateDay, 86400000); }, next-n);
  })();

  // testing/tuning helpers
  window.AUB_SHUFFLE = (n)=> scrambleThenReveal(String(n).padStart(2,'0'));
  window.AUB_TUNE = (em)=> root.style.setProperty('--aub-glyph-nudge', `${em}em`);

  // --- CSS ---
  function injectCSS(force=false){
    const old = document.getElementById('aub-odo-css');
    if (force && old) old.remove();

    if (document.getElementById('aub-odo-css')) return;
    const css = `
.aub-day-odometer{display:inline-flex;gap:.06em;align-items:center;
  font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;
  --aub-glyph-nudge:-0.08em;}
.aub-day-odometer .aub-slot{position:relative;display:inline-block;
  width:.58em;height:1em;overflow:hidden;border-radius:.12em;background:#000;
  filter:drop-shadow(0 0 10px rgba(208,232,255,.35)) drop-shadow(0 0 20px rgba(64,160,255,.22));
  contain:paint;isolation:isolate}
.aub-day-odometer .aub-reel{display:block;will-change:transform;transform:translate3d(0,0,0)}
.aub-day-odometer .aub-cell{display:flex;align-items:center;justify-content:center;
  width:100%;height:1em;overflow:visible !important;
  font-weight:800;font-size:1.1em;line-height:1;color:#f6fbff;
  text-shadow:none;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.aub-day-odometer .aub-glyph{transform:translateY(var(--aub-glyph-nudge));will-change:transform}
.aub-day-odometer .aub-slot::after{content:"";position:absolute;left:0;right:0;top:50%;
  height:1px;background:rgba(255,255,255,.04);pointer-events:none}
`;
    const style=document.createElement('style');
    style.id='aub-odo-css';
    style.textContent=css;
    document.head.appendChild(style);
  }
})();
