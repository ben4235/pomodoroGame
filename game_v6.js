/* ================= Focus Forge — game_v6.js =================
   Fixes:
   - Pause freezes time (remain)
   - No auto-resume on open / when app is hidden
   - Optional shop-while-paused toggle
   - Null-safe bindings so missing buttons don’t crash
============================================================= */

// tiny visible error banner (so we know if anything breaks)
window.onerror = (m)=>{const b=document.createElement('div');b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;background:#ff453a;color:#fff;padding:8px 10px;border-radius:10px;font:12px -apple-system,system-ui;z-index:9999';b.textContent='JS error: '+m;document.body.appendChild(b);};

// -------- settings toggles --------
const ALLOW_SHOP_WHEN_PAUSED = true;   // set false to restrict shop to break only

// -------- helpers --------
const $ = s => document.querySelector(s);
const now = () => Date.now();
const fmt = ms => { const t=Math.ceil(ms/1000), m=String(Math.floor(t/60)).padStart(2,'0'), s=String(t%60).padStart(2,'0'); return `${m}:${s}`; };

// -------- IndexedDB (simple) --------
let db; const DB='ff_save_db', VER=1, STORE='save';
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);
  r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);};
  r.onerror=()=>rej(r.error); r.onsuccess=()=>{db=r.result; res(db);} });}
function idbSet(k,v){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});}
function idbGet(k){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);});}

// -------- state --------
const S = {
  points:0, grit:0, upgrades:{income:0, efficiency:0, streak:0, visuals:0}, streak:0,
  t:{mode:'focus', running:false, focus:25, short:5, long:15, goal:4, done:0,
     endAt:null, last:now(), remain:0} // remain = frozen ms when paused
};

// -------- elements (null-safe) --------
const E = {
  time: $('#time'), pill: $('#modePill'), prog: $('#phaseProg'), phase: $('#phaseLabel'),
  pts: $('#points'), rate: $('#rate'), stk: $('#streak'), grit: $('#gritBadge'),
  inputs: { f:$('#focusLen'), s:$('#breakLen'), l:$('#longLen'), g:$('#roundsLen') },
  shopList: $('#shopList'), shopNote: $('#shopNotice'), world: $('#world'),
  tabTimer: $('#tabTimer'), tabShop: $('#tabShop'), tabPrestige: $('#tabPrestige'),
  cardTimer: $('#timerCard'), cardShop: $('#shopCard'), cardPrestige: $('#prestigeCard'),
  start: $('#startBtn'), pause: $('#pauseBtn'), reset: $('#resetBtn'),
  prev: $('#calcPrestige'), doPrest: $('#doPrest'), prestigeInfo: $('#prestigeInfo')
};

// -------- tabs --------
function showCard(card){
  ['cardTimer','cardShop','cardPrestige'].forEach(k=> E[k] && (E[k].style.display = (E[k]===card?'block':'none')));
  ['tabTimer','tabShop','tabPrestige'].forEach(k=> E[k] && E[k].classList.remove('active'));
}
E.tabTimer && E.tabTimer.addEventListener('click', ()=>{ showCard(E.cardTimer); E.tabTimer.classList.add('active'); updateShopNote(); });
E.tabShop && E.tabShop.addEventListener('click',  ()=>{ showCard(E.cardShop);  E.tabShop.classList.add('active');  updateShopNote(); });
E.tabPrestige && E.tabPrestige.addEventListener('click', ()=>{ showCard(E.cardPrestige); E.tabPrestige.classList.add('active'); updateShopNote(); });

// -------- timer --------
const msFor = m => (m==='focus'?S.t.focus:m==='short'?S.t.short:S.t.long)*60*1000;
const left = () => S.t.running
  ? (S.t.endAt ? Math.max(0, S.t.endAt - now()) : 0)
  : (S.t.remain || 0);

function setMode(m){
  S.t.mode = m;
  if (E.pill) E.pill.textContent = (m==='focus'?'Focus':m==='short'?'Break':'Long Break')+' • '+fmt(msFor(m));
}

function schedule(ms){ // start/resume
  S.t.endAt = now() + ms;
  S.t.running = true;
  S.t.last = now();
  S.t.remain = 0;
  persist(); pulse();
}

function completePhase(){
  S.t.running = false;
  if (S.t.mode==='focus'){ S.t.done++; S.streak++; setMode((S.t.done % S.t.goal === 0) ? 'long' : 'short'); }
  else { setMode('focus'); }
  persist(); schedule(msFor(S.t.mode));
}

function updateTimerView(){
  const L = left(), tot = msFor(S.t.mode);
  if (E.time)  E.time.textContent = fmt(S.t.running ? L : (S.t.remain || tot));
  if (E.prog)  E.prog.value = Math.max(0, Math.min(1, (tot - L) / tot));
  if (E.phase) E.phase.textContent = (S.t.mode==='focus'?'Focus phase':'Break phase')+
     ' • Ends at ' + new Date(now()+L).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function start(){
  if (!S.t.running) {
    const ms = (S.t.remain > 0 ? S.t.remain : (left() || msFor(S.t.mode)));
    schedule(ms);
  }
}

function pause(){  // freeze
  S.t.remain = left();
  S.t.endAt = null;
  S.t.running = false;
  persist(); updateTimerView();
}

function reset(){
  S.t.running = false; S.t.done = 0; S.streak = 0;
  setMode('focus'); S.t.endAt = null; S.t.remain = 0;
  persist(); updateTimerView(); hud();
}

// -------- earnings --------
const mSt = ()=>1 + S.streak*(0.10 + 0.05*S.upgrades.streak);
const mGr = ()=>1 + 0.05*S.grit;
const mEf = ()=>1 + 0.08*S.upgrades.efficiency;
const base = ()=>1 + 1.2*S.upgrades.income;
const gainRate = ()=> base()*mEf()*mSt()*mGr();

function earn(){
  if (S.t.running && S.t.mode==='focus'){
    const n = now(); const ds = Math.max(0, Math.floor((n - S.t.last)/1000));
    if (ds>0){ S.t.last=n; const g=gainRate()*ds; S.points+=g; floatGain(g); persist(); }
  } else { S.t.last = now(); }
}

// -------- shop --------
const defs = [
  {k:'income',    n:'Income',        d:'+1.2 base pts/sec per level',   c:50,  x:1.25},
  {k:'efficiency',n:'Efficiency',    d:'+8% total earnings per level',  c:250, x:1.35},
  {k:'streak',    n:'Streak Engine', d:'+5% per streak step per level', c:500, x:1.42},
  {k:'visuals',   n:'Visual Boost',  d:'More sparks & juice (cosmetic)',c:150, x:1.35}
];
const cost = (k,l)=>{const d=defs.find(z=>z.k===k); return Math.floor(d.c*Math.pow(d.x,l));};
const canShop = ()=> ALLOW_SHOP_WHEN_PAUSED ? (!S.t.running || S.t.mode!=='focus') : (S.t.mode!=='focus');

function buy(k){
  if (!canShop()) return;
  const l=S.upgrades[k], c=cost(k,l);
  if (S.points>=c){ S.points-=c; S.upgrades[k]=l+1; persist(); renderShop(); hud(); banner('-'+c.toLocaleString()); }
}

function renderShop(){
  if (!E.shopList) return;
  E.shopList.innerHTML='';
  defs.forEach(d=>{
    const l=S.upgrades[d.k], c=cost(d.k,l), dis=(!canShop() || S.points<c);
    const div=document.createElement('div');
    div.className='item';
    div.innerHTML = `<div>
        <h4>${d.n} <span class="small">Lv ${l}</span></h4>
        <p class="small">${d.d}</p>
        <div class="small">Next Cost: <span class="cost">${c.toLocaleString()}</span> pts</div>
      </div>
      <div class="row"><button class="btn-primary" data-k="${d.k}" ${dis?'disabled':''}>Buy</button></div>`;
    E.shopList.appendChild(div);
  });
  E.shopList.querySelectorAll('button[data-k]').forEach(b=> b.addEventListener('click', ()=> buy(b.getAttribute('data-k')) ));
  updateShopNote();
}
function updateShopNote(){ if(E.shopNote) E.shopNote.textContent = canShop()? '' : 'Shop is only available during Breaks.'; }

// -------- prestige --------
const gritGain = x => Math.floor(x/100000);
function preview(){ if(!E.prestigeInfo) return; const g=gritGain(S.points); E.prestigeInfo.textContent = g>0 ? `You would gain ${g} Grit (+${g*5}% permanent).` : 'Earn 100,000 pts to gain your first Grit.'; }
function prestige(){
  const g=gritGain(S.points); if(g<=0){ if(E.prestigeInfo) E.prestigeInfo.textContent='Not enough points.'; return; }
  S.grit+=g; S.points=0; S.upgrades={income:0,efficiency:0,streak:0,visuals:0}; S.streak=0; reset(); persist(); hud(); renderShop();
  if(E.grit) E.grit.textContent='Grit: '+S.grit;
  if(E.prestigeInfo) E.prestigeInfo.textContent=`Prestiged! New Grit: ${S.grit} (+${S.grit*5}%).`;
}

// -------- visuals --------
function banner(txt){ if(!E.world) return; const d=document.createElement('div'); d.className='gain'; d.style.cssText='position:absolute;right:10px;top:8px;color:#ffd54a;font-weight:900'; d.textContent=txt; E.world.appendChild(d); setTimeout(()=>d.remove(),1200); }
function floatGain(val){
  if(!(S.t.running && S.t.mode==='focus') || !E.world) return;
  if(Math.random() < 0.2 + 0.05*S.upgrades.visuals){
    const g=document.createElement('div'); g.className='gain';
    const x=20+Math.random()*(E.world.clientWidth-40), y=60+Math.random()*80;
    g.style.left=x+'px'; g.style.top=y+'px'; g.textContent='+'+Math.max(1,Math.floor(val)).toLocaleString();
    E.world.appendChild(g); setTimeout(()=>g.remove(),1200);
  }
}
function pulse(){ if(E.world){ E.world.style.boxShadow='0 0 22px #6c8cff66 inset'; setTimeout(()=>E.world.style.boxShadow='none',250); } }

// -------- bind controls (null-safe) --------
E.start && E.start.addEventListener('click', start);
E.pause && E.pause.addEventListener('click', pause);
E.reset && E.reset.addEventListener('click', reset);
E.prev && E.prev.addEventListener('click', preview);
E.doPrest && E.doPrest.addEventListener('click', prestige);
Object.entries(E.inputs).forEach(([k,input])=>{
  if(!input) return;
  input.addEventListener('change', ()=>{
    const v=Math.max(1, parseInt(input.value||'1',10));
    if(k==='f') S.t.focus=v; if(k==='s') S.t.short=v; if(k==='l') S.t.long=v; if(k==='g') S.t.goal=v;
    persist(); setMode(S.t.mode); updateTimerView();
  });
});

// -------- HUD + loop --------
function hud(){
  if(E.pts)  E.pts.textContent = S.points.toLocaleString(undefined,{maximumFractionDigits:2});
  if(E.rate) E.rate.textContent = gainRate().toLocaleString(undefined,{maximumFractionDigits:2})+'/s';
  if(E.stk)  E.stk.textContent = S.streak;
  if(E.grit) E.grit.textContent = 'Grit: '+S.grit;
}
function persist(){ idbSet('game', S).catch(()=>{}); }
function hydrate(){
  if(E.inputs.f) E.inputs.f.value = S.t.focus;
  if(E.inputs.s) E.inputs.s.value = S.t.short;
  if(E.inputs.l) E.inputs.l.value = S.t.long;
  if(E.inputs.g) E.inputs.g.value = S.t.goal;
  setMode(S.t.mode); updateTimerView(); hud(); renderShop();
  if(E.cardTimer) { showCard(E.cardTimer); E.tabTimer && E.tabTimer.classList.add('active'); }
}

// -------- do not auto-resume on open --------
idbOpen().then(()=>idbGet('game')).then(s=>{
  if(s) Object.assign(S,s);
}).finally(()=>{
  if (S.t.running) { // convert to paused state on load
    S.t.remain = S.t.endAt ? Math.max(0, S.t.endAt - Date.now()) : 0;
    S.t.endAt = null; S.t.running = false;
  }
  hydrate();
});

// -------- auto-pause when app goes to background --------
document.addEventListener('visibilitychange', ()=>{
  if (document.hidden && S.t.running) pause();
});

// -------- main loop --------
setInterval(()=>{
  if(S.t.running && left()<=0) completePhase();
  else earn();
  updateTimerView(); hud(); persist();
}, 1000);
