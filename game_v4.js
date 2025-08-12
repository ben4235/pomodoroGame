// ===== tiny error banner so we see issues on iPhone =====
window.onerror = (m,s,l,c,e) => {
  const b = document.createElement('div');
  b.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;background:#ff453a;color:#fff;padding:8px 10px;border-radius:10px;font:12px/1.4 -apple-system,system-ui;';
  b.textContent = 'JS error: ' + m;
  document.body.appendChild(b);
};

// ===== helpers =====
const $ = s => document.querySelector(s);
const now = () => Date.now();
const fmt = ms => { const t = Math.ceil(ms/1000), m = String(Math.floor(t/60)).padStart(2,'0'), s = String(t%60).padStart(2,'0'); return m+':'+s; };

// ===== simple IndexedDB save =====
let db;
const DB='ff_save_db', VER=1, STORE='save';
function idbOpen(){ return new Promise((res,rej)=>{ const r=indexedDB.open(DB,VER);
  r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);};
  r.onerror=()=>rej(r.error); r.onsuccess=()=>{db=r.result;res(db);} });}
function idbSet(k,v){ return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k);
  tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); });}
function idbGet(k){ return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k);
  rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error); });}

// ===== state =====
const S = {
  points: 0, grit: 0, upgrades:{ income:0, efficiency:0, streak:0, visuals:0 },
  streak: 0,
  t: { mode:'focus', running:false, focus:25, short:5, long:15, goal:4, done:0, endAt:null, last: now() }
};

// ===== ui els =====
const els = {
  time: $('#time'), pill: $('#modePill'), prog: $('#phaseProg'), phase: $('#phaseLabel'),
  pts: $('#points'), rate: $('#rate'), stk: $('#streak'), grit: $('#gritBadge'),
  inputs: { f:$('#focusLen'), s:$('#breakLen'), l:$('#longLen'), g:$('#roundsLen') },
  shopList: $('#shopList'), shopNote: $('#shopNotice'), world: $('#world')
};

// ===== tabs =====
[['#tabTimer','#timerCard'],['#tabShop','#shopCard'],['#tabPrestige','#prestigeCard']].forEach(([b,v])=>{
  $(b).addEventListener('click', ()=>{
    document.querySelectorAll('.tabbar button').forEach(x=>x.classList.remove('active'));
    document.querySelector(b).classList.add('active');
    document.querySelectorAll('main>section').forEach(x=>x.style.display='none');
    document.querySelector(v).style.display='block';
    updateShopNote();
  });
});

// ===== timer =====
const msFor = m => (m==='focus'?S.t.focus:m==='short'?S.t.short:S.t.long)*60*1000;
const left = () => S.t.endAt ? Math.max(0, S.t.endAt - now()) : 0;
function setMode(m){ S.t.mode=m; els.pill.textContent=(m==='focus'?'Focus':m==='short'?'Break':'Long Break')+' • '+fmt(msFor(m)); }
function schedule(ms){ S.t.endAt = now()+ms; S.t.running=true; S.t.last=now(); persist(); pulse(); }
function completePhase(){
  S.t.running=false;
  if(S.t.mode==='focus'){ S.t.done++; S.streak++; setMode( (S.t.done % S.t.goal === 0) ? 'long' : 'short' ); }
  else { setMode('focus'); }
  persist(); schedule(msFor(S.t.mode));
}
function updateTimerView(){
  const L = left(), tot = msFor(S.t.mode);
  els.time.textContent = fmt(S.t.running ? L : tot);
  els.prog.value = Math.max(0, Math.min(1, (tot-L)/tot));
  els.phase.textContent = (S.t.mode==='focus'?'Focus phase':'Break phase') + ' • Ends at ' +
    new Date(now()+L).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}
function start(){ if(!S.t.running){ const L = left() || msFor(S.t.mode); schedule(L); } }
function pause(){ S.t.running=false; persist(); }
function reset(){ S.t.running=false; S.t.done=0; S.streak=0; setMode('focus'); S.t.endAt=null; persist(); updateTimerView(); hud(); }

// ===== earnings =====
const mSt = ()=> 1 + S.streak*(0.10 + 0.05*S.upgrades.streak);
const mGr = ()=> 1 + 0.05*S.grit;
const mEf = ()=> 1 + 0.08*S.upgrades.efficiency;
const base = ()=> 1 + 1.2*S.upgrades.income;
const rate = ()=> base()*mEf()*mSt()*mGr();
function earn(){
  if(S.t.running && S.t.mode==='focus'){
    const n = now(); const ds = Math.max(0, Math.floor((n - S.t.last)/1000));
    if(ds>0){ S.t.last=n; const gained=rate()*ds; S.points+=gained; floatGain(gained); persist(); }
  } else { S.t.last = now(); }
}

// ===== shop =====
const defs = [
  {k:'income', n:'Income', d:'+1.2 base pts/sec per level', c:50,  x:1.25},
  {k:'efficiency', n:'Efficiency', d:'+8% total earnings per level', c:250, x:1.35},
  {k:'streak', n:'Streak Engine', d:'+5% per streak step per level', c:500, x:1.42},
  {k:'visuals', n:'Visual Boost', d:'More sparks & juice (cosmetic)', c:150, x:1.35}
];
const cost = (k,l) => { const d=defs.find(z=>z.k===k); return Math.floor(d.c*Math.pow(d.x,l)); };
const canShop = ()=> S.t.mode!=='focus';
function buy(k){
  if(!canShop()) return;
  const l = S.upgrades[k], c = cost(k,l);
  if(S.points >= c){ S.points -= c; S.upgrades[k]=l+1; persist(); renderShop(); hud(); banner('-'+c.toLocaleString()); }
}
function renderShop(){
  els.shopList.innerHTML = '';
  defs.forEach(d=>{
    const l = S.upgrades[d.k], c = cost(d.k,l), dis = (!canShop() || S.points<c);
    const div = document.createElement('div');
    div.className='item';
    div.innerHTML = `
      <div>
        <h4>${d.n} <span class="small">Lv ${l}</span></h4>
        <p class="small">${d.d}</p>
        <div class="small">Next Cost: <span class="cost">${c.toLocaleString()}</span> pts</div>
      </div>
      <div class="row"><button class="btn-primary" data-k="${d.k}" ${dis?'disabled':''}>Buy</button></div>`;
    els.shopList.appendChild(div);
  });
  els.shopList.querySelectorAll('button[data-k]').forEach(b=>{
    b.addEventListener('click', ()=> buy(b.getAttribute('data-k')));
  });
  updateShopNote();
}
function updateShopNote(){ els.shopNote.textContent = canShop() ? '' : 'Shop is only available during Breaks.'; }

// ===== prestige =====
const gritGain = x => Math.floor(x/100000);
function preview(){ const g=gritGain(S.points); $('#prestigeInfo').textContent = g>0 ? `You would gain ${g} Grit (+${g*5}% permanent).` : 'Earn 100,000 pts to gain your first Grit.'; }
function prestige(){ const g=gritGain(S.points); if(g<=0){ $('#prestigeInfo').textContent='Not enough points.'; return; }
  S.grit+=g; S.points=0; S.upgrades={income:0,efficiency:0,streak:0,visuals:0}; S.streak=0; reset(); persist(); hud(); renderShop();
  $('#gritBadge').textContent='Grit: '+S.grit; $('#prestigeInfo').textContent=`Prestiged! New Grit: ${S.grit} (+${S.grit*5}%).`;
}

// ===== visuals =====
function banner(txt){ const d=document.createElement('div'); d.className='gain'; d.style.cssText='position:absolute;right:10px;top:8px;color:#ffd54a;font-weight:900'; d.textContent=txt; els.world.appendChild(d); setTimeout(()=>d.remove(),1200); }
function floatGain(val){
  if(!(S.t.running && S.t.mode==='focus')) return;
  if(Math.random() < 0.2 + 0.05*S.upgrades.visuals){
    const g=document.createElement('div'); g.className='gain';
    const x=20+Math.random()*(els.world.clientWidth-40), y=60+Math.random()*80;
    g.style.left=x+'px'; g.style.top=y+'px'; g.textContent='+'+Math.max(1,Math.floor(val)).toLocaleString();
    els.world.appendChild(g); setTimeout(()=>g.remove(),1200);
  }
}
function pulse(){ els.world.style.boxShadow='0 0 22px #6c8cff66 inset'; setTimeout(()=>els.world.style.boxShadow='none',250); }

// ===== bind controls =====
$('#startBtn').addEventListener('click', start);
$('#pauseBtn').addEventListener('click', pause);
$('#resetBtn').addEventListener('click', reset);
$('#calcPrestige').addEventListener('click', preview);
$('#doPrest').addEventListener('click', prestige);
Object.entries(els.inputs).forEach(([k,input])=>{
  input.addEventListener('change', ()=>{
    const v=Math.max(1,parseInt(input.value||'1',10));
    if(k==='f') S.t.focus=v; if(k==='s') S.t.short=v; if(k==='l') S.t.long=v; if(k==='g') S.t.goal=v;
    persist(); setMode(S.t.mode); updateTimerView();
  });
});

// ===== HUD & loop =====
function hud(){ els.pts.textContent=S.points.toLocaleString(undefined,{maximumFractionDigits:2});
  els.rate.textContent = rate().toLocaleString(undefined,{maximumFractionDigits:2})+'/s';
  els.stk.textContent=S.streak; els.grit.textContent='Grit: '+S.grit; }
function persist(){ idbSet('game', S).catch(()=>{}); }
function hydrate(){ els.inputs.f.value=S.t.focus; els.inputs.s.value=S.t.short; els.inputs.l.value=S.t.long; els.inputs.g.value=S.t.goal; setMode(S.t.mode); updateTimerView(); hud(); renderShop(); }

// main interval
setInterval(()=>{
  if(S.t.running && left()<=0) completePhase();
  else earn();
  updateTimerView(); hud(); persist();
}, 1000);

// boot
idbOpen().then(()=>idbGet('game')).then(s=>{ if(s) Object.assign(S,s); }).finally(hydrate);
