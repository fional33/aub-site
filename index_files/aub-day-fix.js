/* AUBSNAP — Odometer (DAY NN) — stable shuffler, persistent neon, size lock */
(function () {
  "use strict";

  // ===== Config =====
  const DEFAULT_HEIGHT = 60;      // px
  const DEFAULT_WIDTH_MULT = 0.66;
  const GLOW_REST = 1.0;
  const GLOW_ACTIVE = 1.0;
  const SCRAMBLE_MS = 700;
  const SETTLE_TICKS = [3, 4];
  const TICK_MS = [140, 220];
  const STYLE_ID = "aub-odometer-style";
  const EASE = t => 1 - Math.pow(1 - t, 3);
  const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
  const lerp = (a,b,t)=>a+(b-a)*t;
  const nowPerf = () => (typeof performance!=="undefined"?performance.now():Date.now());

  // ===== CSS (no transform on .aub-reel here; JS controls it) =====
  function ensureStyleTag() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
:root{
  --aub-size:${DEFAULT_HEIGHT}px;
  --aub-width-mult:${DEFAULT_WIDTH_MULT};
  --aub-glow:${GLOW_REST};
  --aub-seam-nudge-x:0px;
  --aub-seam-nudge-y:0px;
  --aub-slot-gap:0px;
  --aub-font-scale:0.86;
}
.aub-day-odometer.aub-day-odometer{
  position:relative;
  display:inline-flex;
  vertical-align:-0.1ch;
  transform:translateX(-0.5ch);
  flex:0 0 auto;
  width:auto;
  max-width:max-content;
  gap:var(--aub-slot-gap);
  padding:0;
  background:#000;
  color:#fff;
  border-radius:6px;
  overflow:hidden;
  font-variant-numeric:tabular-nums lining-nums;
  font-feature-settings:"tnum" 1, "lnum" 1;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}
.aub-day-odometer .aub-slot{
  position:relative;
  height:var(--aub-size);
  width:calc(var(--aub-size) * var(--aub-width-mult));
  flex:0 0 calc(var(--aub-size) * var(--aub-width-mult));
  overflow:hidden;
  contain:layout paint size;
}
.aub-day-odometer .aub-reel{
  position:absolute; left:0; top:0; width:100%;
  will-change:auto;
  /* transform applied by JS only */
}
.aub-day-odometer .aub-glyph{
  height:var(--aub-size);
  line-height:var(--aub-size);
  display:flex; align-items:center; justify-content:center;
  font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size:calc(var(--aub-size) * var(--aub-font-scale));
  color:#fff;
  text-shadow:
    0 0 1px rgba(0,220,255,0.95),
    0 0 4px rgba(0,220,255,0.92),
    0 0 10px rgba(0,220,255,0.88),
    0 0 22px rgba(0,220,255,0.78);
}
.aub-day-odometer .aub-slot::before,
.aub-day-odometer .aub-slot::after{
  content:""; position:absolute; left:0; right:0; height:50%;
  pointer-events:none;
  background:linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.00));
}
.aub-day-odometer .aub-slot::before{ top:0; }
.aub-day-odometer .aub-slot::after{ bottom:0; transform:scaleY(-1); }
`.trim();
    const tag=document.createElement("style");
    tag.id=STYLE_ID;
    tag.textContent=css;
    document.head.appendChild(tag);
  }

  // ===== Date math (UTC) =====
  function readLaunchUTC(){
    const meta=document.querySelector('meta[name="aub-launch-utc"]');
    const raw=(meta && meta.getAttribute("content")) || (window.AUB_LAUNCH_UTC||"")+""; if(!raw) return null;
    const d=new Date(raw); return isNaN(+d)?null:d;
  }
  function daysSinceLaunchUTC(launch){
    const n=new Date();
    const nowUTC=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate(),n.getUTCHours(),n.getUTCMinutes(),n.getUTCSeconds(),n.getUTCMilliseconds());
    const l=launch;
    const launchUTC=Date.UTC(l.getUTCFullYear(),l.getUTCMonth(),l.getUTCDate(),l.getUTCHours(),l.getUTCMinutes(),l.getUTCSeconds(),l.getUTCMilliseconds());
    return Math.max(1, Math.floor((nowUTC-launchUTC)/86400000)+1);
  }
  function msUntilNextUtcMidnight(){
    const n=new Date();
    const next=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()+1,0,0,0,0);
    const nowUTC=Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate(),n.getUTCHours(),n.getUTCMinutes(),n.getUTCSeconds(),n.getUTCMilliseconds());
    return Math.max(0,next-nowUTC);
  }
  const padNN = n => (String(n).length>=2?String(n):("0"+n).slice(-2));

  // ===== DOM =====
  function q(container){
    const slots=[...container.querySelectorAll(".aub-slot")];
    return { slots, reels: slots.map(n=>n.querySelector(".aub-reel")) };
  }
  function build(container,digits){
    container.innerHTML="";
    container.classList.add("aub-day-odometer","aub-day-odometer");
    for(let i=0;i<digits;i++){
      const slot=document.createElement("div"); slot.className="aub-slot";
      const reel=document.createElement("div"); reel.className="aub-reel";
      for(let d=0; d<=9; d++){
        const g=document.createElement("div"); g.className="aub-glyph"; g.textContent=String(d);
        reel.appendChild(g);
      }
      slot.appendChild(reel); container.appendChild(slot);
    }
    return q(container);
  }
  function measureSlotHeight(container){
    const one=container.querySelector(".aub-slot");
    if (one) return Math.round(one.getBoundingClientRect().height);
    const v=parseFloat(getComputedStyle(container).getPropertyValue("--aub-size")); return Math.round(v||DEFAULT_HEIGHT);
  }

  // ===== Animator =====
  function makeAnimator(container){
    const api={};
    let state={digits:2,value:0,slotHeight:0,anims:[]};

    function setGlow(target,ms){
      const start=parseFloat(getComputedStyle(container).getPropertyValue("--aub-glow"))||GLOW_REST;
      const t0=nowPerf(); const dur=Math.max(0,ms|0);
      (function loop(){
        const t=dur?clamp((nowPerf()-t0)/dur,0,1):1;
        const v=lerp(start,target,EASE(t));
        container.style.setProperty("--aub-glow",v.toFixed(3));
        if(t<1) requestAnimationFrame(loop);
      })();
    }
    function setReelTransform(reel,y){
      reel.style.setProperty("transform", `translate3d(var(--aub-seam-nudge-x), calc(var(--aub-seam-nudge-y) + ${(-y).toFixed(3)}px), 0)`, "important");
    }
    function getCurrentDigit(reel,slotH){
      const m=/translate3d\([^,]+,\s*calc\([^)]*\+\s*([-\d.]+)px\)/.exec(reel.style.transform);
      if(!m) return NaN; const y=-parseFloat(m[1]||"0"); const d=Math.round(y/slotH); return ((d%10)+10)%10;
    }
    function instantTo(value){
      const s=padNN(value);
      if(s.length!==state.digits){ state.digits=s.length; build(container,state.digits); }
      const {reels}=q(container); state.slotHeight=measureSlotHeight(container);
      for(let i=0;i<s.length;i++){ setReelTransform(reels[i], (+s[i])*state.slotHeight); }
      state.value=value;
    }
    function rndInt(a,b){ return (Math.random()*(b-a+1)+a)|0; }

    function animateTo(value){
      // Always animate unless explicitly opted out
      const s=padNN(value);
      if(s.length!==state.digits){ state.digits=s.length; build(container,state.digits); }
      const {reels}=q(container); state.slotHeight=measureSlotHeight(container);
      reels.forEach(r=>{ r.style.willChange="transform"; });

      const t0=nowPerf();
      const desync=[0,60,110,150];
      const targets=s.split("").map(Number);
      setGlow(GLOW_ACTIVE,160);

      // Kick one digit so we always see motion, even if same digit
      try {
        reels.forEach(r=>{
          const m=/translate3d\([^,]+,\s*calc\([^)]*\+\s*([-\d.]+)px\)/.exec(r.style.transform);
          const cur = m ? -parseFloat(m[1]||"0") : 0;
          const kick = cur + state.slotHeight;
          setReelTransform(r, kick);
        });
      } catch(_) {}

      const plans=targets.map((target,idx)=>{
        const start=getCurrentDigit(reels[idx],state.slotHeight); const base=isNaN(start)?0:start;
        const ticks=Math.floor(lerp(SETTLE_TICKS[0], SETTLE_TICKS[1]+0.999, Math.random()));
        const seq=[]; let d=base;
        for(let k=0;k<Math.max(0,ticks-1);k++){ d=(d+1)%10; seq.push(d); }
        seq.push(target);
        const durations=seq.map(()=>rndInt(TICK_MS[0],TICK_MS[1]));
        return {seq,durations};
      });

      let phase="scramble"; const lastDigit=new Array(reels.length).fill(null);
      (function loop(){
        const now=nowPerf();
        if(phase==="scramble"){
          const t=clamp((now-t0)/SCRAMBLE_MS,0,1); const ease=EASE(t);
          for(let i=0;i<reels.length;i++){
            const reel=reels[i]; const jitter=(Math.sin((now+i*137)*0.02)+1)*0.5;
            const rnd=Math.floor((ease*10 + 10*jitter + Math.random()*10))%10;
            if(rnd!==lastDigit[i]){ setReelTransform(reel, rnd*state.slotHeight); lastDigit[i]=rnd; }
          }
          if(t<1){ requestAnimationFrame(loop); return; }
          phase="settle";
          for(let i=0;i<reels.length;i++){ const p=plans[i]; (state.anims[i]={idx:i,step:0,seq:p.seq,durations:p.durations,t0:now+(desync[i]||0)}); }
          requestAnimationFrame(loop); return;
        }
        let allDone=true;
        for(let i=0;i<reels.length;i++){
          const a=state.anims[i]; if(!a) continue; if(a.step>=a.seq.length) continue; allDone=false;
          const dur=a.durations[a.step]; const t=clamp((now-a.t0)/dur,0,1);
          const targetDigit=a.seq[a.step];
          const prevDigit=a.step===0? (getCurrentDigit(reels[i],state.slotHeight) || targetDigit) : a.seq[a.step-1];
          const yPrev=prevDigit*state.slotHeight; const y=targetDigit*state.slotHeight;
          const yNow=lerp(yPrev,y,EASE(t)); setReelTransform(reels[i], yNow);
          if(t>=1){ setReelTransform(reels[i], y); a.step++; a.t0=now; }
        }
        if(!allDone){ requestAnimationFrame(loop); return; }
        reels.forEach(r=>{ r.style.willChange="auto"; });
        setGlow(GLOW_REST,280);
      })();

      state.value=value;
    }

    // API
    api.instantTo=instantTo;
    api.animateTo=animateTo;
    api.value=()=>state.value;
    api.slotHeight=()=>state.slotHeight;
    return api;
  }

  // ===== Boot =====
  function boot(){
    ensureStyleTag();

    const container=document.querySelector(".aub-day-odometer") || (()=>{const el=document.createElement("div"); el.className="aub-day-odometer aub-day-odometer"; document.body.appendChild(el); return el;})();
    build(container,2);
    const anim=makeAnimator(container);

    // Console helpers (defined immediately, even if update crashes)
    window.AUB_FORCE_MOTION = true;
    window.AUB_SIZE = function (heightPx,widthArg){
      const h=Math.max(16, +heightPx || DEFAULT_HEIGHT);
      document.documentElement.style.setProperty("--aub-size", h+"px");
      if(widthArg!==undefined && widthArg!==null){
        const w=+widthArg;
        if(w>0 && w<=3) document.documentElement.style.setProperty("--aub-width-mult", String(w));
        else if(w>3){ const mult=w/h; document.documentElement.style.setProperty("--aub-width-mult", String(mult.toFixed(4))); }
      }
      anim.instantTo(anim.value());
    };
    window.AUB_TUNE_Y=function(delta){
      const cur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--aub-seam-nudge-y"))||0;
      document.documentElement.style.setProperty("--aub-seam-nudge-y",(cur+(+delta||0)).toFixed(2)+"px");
      anim.instantTo(anim.value());
    };
    window.AUB_TUNE_X=function(delta){
      const cur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--aub-seam-nudge-x"))||0;
      document.documentElement.style.setProperty("--aub-seam-nudge-x",(cur+(+delta||0)).toFixed(2)+"px");
      anim.instantTo(anim.value());
    };
    window.AUB_SHUFFLE=function(n){ const v=Math.max(0, Math.floor(+n||0)); anim.animateTo(v); return v; };
    window.AUB_STATUS=function(){
      const slotH=anim.slotHeight();
      const reels=[...container.querySelectorAll(".aub-reel")];
      const offsets=reels.map(r=>{ const m=/translate3d\([^,]+,\s*calc\([^)]*\+\s*([-\d.]+)px\)/.exec(r.style.transform); return m?+m[1]:0; });
      return {
        height_px: slotH,
        width_mult: getComputedStyle(document.documentElement).getPropertyValue("--aub-width-mult").trim(),
        glow: getComputedStyle(container).getPropertyValue("--aub-glow").trim(),
        value: anim.value(),
        reel_offsets_px: offsets,
        slots: reels.length
      };
    };

    const launch=readLaunchUTC();
    const update=()=>{ const d=launch?daysSinceLaunchUTC(launch):0; anim.animateTo(d); };

    update();

    // Exact UTC midnight rollover
    (function schedule(){ const ms=clamp(msUntilNextUtcMidnight(),250,86400000); setTimeout(()=>{ update(); schedule(); }, ms); })();

    // Safety: resync every 60s
    setInterval(update, 60000);
  }

  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
