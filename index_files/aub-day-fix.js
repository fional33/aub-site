(() => {
  const launchStr =
    document.querySelector('meta[name="aub-launch-utc"]')?.content ||
    window.AUB_LAUNCH_UTC || '2025-08-25T00:00:00Z';
  const LAUNCH_UTC = new Date(launchStr);
  if (isNaN(LAUNCH_UTC)) return;

  const root = document.querySelector('.aub-day-odometer');
  if (!root) return;

  const SLOT_CLASS = 'slot';

  function ensureSlots(count){
    let slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    if (!slots.length) {
      const span = document.createElement('span');
      span.className = SLOT_CLASS;
      span.textContent = '0';
      root.append(span);
      slots = [span];
    }
    while (slots.length < count){
      const clone = slots[0].cloneNode(true);
      clone.textContent = '0';
      root.prepend(clone);
      slots = Array.from(root.querySelectorAll('.' + SLOT_CLASS));
    }
    return slots;
  }

  function renderInstant(n){
    const s = String(n);
    const slots = ensureSlots(s.length);
    const padded = s.padStart(slots.length,'0').split('');
    slots.forEach((el,i)=> el.textContent = padded[i]);
  }

  // Longer shuffle with smooth ease-out
  function shuffleTo(target){
    const finalStr = String(target);
    const slots = ensureSlots(finalStr.length);
    const finalDigits = finalStr.padStart(slots.length,'0').split('').map(d=>+d);
    const startDigits = slots.map(s => +s.textContent || 0);

    const DURATION_MS = 2600;     // longer
    const CYCLES_BASE = 22;       // more spins
    const CYCLES_SPREAD = 12;     // random extra spins
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    const stepsPerSlot = slots.map((_, i) => {
      const diff = (finalDigits[i] - startDigits[i] + 10) % 10;
      const cycles = CYCLES_BASE + i * 2 + Math.floor(Math.random() * CYCLES_SPREAD);
      return cycles * 10 + diff;
    });

    const t0 = performance.now();
    function tick(now){
      const t = Math.min(1, (now - t0) / DURATION_MS);
      const eased = easeOutCubic(t);
      slots.forEach((el, i) => {
        const k = Math.floor(stepsPerSlot[i] * eased);
        el.textContent = (startDigits[i] + k) % 10;
      });
      if (t < 1) requestAnimationFrame(tick);
      else slots.forEach((el, i) => { el.textContent = finalDigits[i]; });
    }
    requestAnimationFrame(tick);
  }

  function dayNumberUTC(date){
    const launchMid = Date.UTC(
      LAUNCH_UTC.getUTCFullYear(), LAUNCH_UTC.getUTCMonth(), LAUNCH_UTC.getUTCDate()
    );
    const nowMid = Date.UTC(
      date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()
    );
    const days = Math.floor((nowMid - launchMid) / 86400000) + 1;
    return Math.max(1, days);
  }

  function updateDay(animated){
    const day = dayNumberUTC(new Date());
    const prev = Number(root.dataset.day || '0');
    root.setAttribute('aria-label', `DAY ${String(day).padStart(2,'0')}`);
    root.dataset.day = String(day);
    if (animated && day !== prev) shuffleTo(day);
    else if (!prev) shuffleTo(day); // animate on first paint
    else renderInstant(day);
  }

  function msUntilNextUtcMidnight(){
    const n = new Date();
    const next = new Date(Date.UTC(
      n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1, 0, 0, 0
    ));
    return next.getTime() - n.getTime();
  }

  // init + precise UTC rollover + safety ping
  updateDay(true);
  setTimeout(() => {
    updateDay(true);
    setInterval(() => updateDay(true), 24*3600*1000);
  }, msUntilNextUtcMidnight() + 50);
  setInterval(() => updateDay(false), 5*60*1000);
})();
