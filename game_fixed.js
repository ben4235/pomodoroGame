
// Focus Forge - fixed game.js (no truncation), iOS-friendly heartbeat

const $ = s => document.querySelector(s);
const now = () => Date.now();
const fmt = (ms) => { const t = Math.ceil(ms/1000); const m = String(Math.floor(t/60)).padStart(2,'0'); const s = String(t%60).padStart(2,'0'); return `${m}:${s}`; };

// ---- IndexedDB minimal wrapper ----
const DB='ff_save_db', VER=1, STORE='save'; let db;
function dbOpen(){ return new Promise((res,rej)=>{ const r = indexedDB.open(DB,VER);
  r.onupgradeneeded = e => { const d=e.target.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
  r.onerror = ()=>rej(r.error); r.onsuccess = ()=>{ db=r.result; res(db); };
});}
function dbSet(k,v){ return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>res(1); tx.onerror=()=>rej(tx.error); });}
function dbGet(k){ return new Promise((res,rej)=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error); });}

// ---- State ----
const st = {
  points:0, grit:0, up:{ income:0, eff:0, str:0, vis:0 }, streak:0,
  t:{ m:'focus', run:false, f:25, s:5, l:15, g:4, d:0, e:null, last: now() }
};

async function load(){ try{ await dbOpen(); const s = await dbGet('game'); if(s) Object.assign(st, s); } catch(e){} hydrate(); }
function save(){ dbSet('game', st).catch(()=>{}); }

// ---- UI refs ----
const el = {
  time: $('#time'), pill: $('#modePill'), prog: $('#phaseProg'), phase: $('#phaseLabel'),
  pts: $('#points'), rate: $('#rate'), stk: $('#streak'), grit: $('#gritBadge'),
  world: $('#world'), shopList: $('#shopList'), shopNote: $('#shopNotice')
};

// ---- Timer helpers ----
function msFor(m){ return (m==='focus'?st.t.f : m==='short'?st.t.s : st.t.l) * 60 * 1000; }
function left(){ return st.t.e ? Math.max(0, st.t.e - now()) : 0; }
function setMode(m){ st.t.m=m; el.pill.textContent = (m==='focus'?'Focus':m==='short'?'Break':'Long Break') + ' • ' + fmt(msFor(m)); }
function schedule(ms){ st.t.e = now()+ms; st.t.run=true; st.t.last=now(); save(); pulse(); }
function complete(){ st.t.run=false; if(st.t.m==='focus'){ st.t.d++; st.streak++; setMode(st.t.d % st.t.g === 0 ? 'long' : 'short'); } else { setMode('focus'); } save(); schedule(msFor(st.t.m)); }
function updateTimer(){ const L=left(), tot=msFor(st.t.m); el.time.textContent = fmt(st.t.run?L:tot); el.prog.value = Math.max(0, Math.min(1,(tot-L)/tot)); el.phase.textContent = (st.t.m==='focus'?'Focus phase':'Break phase') + ' • Ends at ' + new Date(now()+L).toLocaleTimeString([],{hour:'2-digit', minute:'2-digit'}); }

// ---- Earnings ----
function mSt(){ return 1 + st.streak * (0.10 + 0.05*st.up.str); }
function mGr(){ return 1 + 0.05 * st.grit; }
function mEf(){ return 1 + 0.08 * st.up.eff; }
function base(){ return 1 + 1.2 * st.up.income; }
function rate(){ return base()*mEf()*mSt()*mGr(); }
function earn(){ if(st.t.run && st.t.m==='focus'){ const n=now(); const ds = Math.max(0, Math.floor((n - st.t.last)/1000)); if(ds>0){ st.t.last=n; const earned = rate()*ds; st.points += earned; floatGain(earned); save(); } } else { st.t.last = now(); } }

// ---- Shop ----
const defs = [
  {k:'income', n:'Income', d:'+1.2 base pts/sec per level', c:50,  x:1.25},
  {k:'eff',    n:'Efficiency', d:'+8% total earnings per level', c:250, x:1.35},
  {k:'str',    n:'Streak Engine', d:'+5% per streak step per level', c:500, x:1.42},
  {k:'vis',    n:'Visual Boost', d:'More sparks & screen juice (cosmetic)', c:150, x:1.35}
];
function cost(k,l){ const d = defs.find(x=>x.k===k); return Math.floor(d.c * Math.pow(d.x, l)); }
function canShop(){ return st.t.m !== 'focus'; }
function buy(k){ if(!canShop()) return; const l=st.up[k], c=cost(k,l); if(st.points>=c){ st.points-=c; st.up[k]=l+1; save(); renderShop(); hud(); gain('-'+c.toLocaleString()); } }
function renderShop(){
  el.shopList.innerHTML = '';
  defs.forEach(d=>{
    const l = st.up[d.k], c = cost(d.k,l), disabled = (!canShop() || st.points < c);
    const div = document.createElement('div'); div.className='item';
    div.innerHTML = `
      <div>
        <h4>${d.n} <span class="small">Lv ${l}</span></h4>
        <p class="small">${d.d}</p>
        <div class="small">Next Cost: <span class="cost">${c.toLocaleString()}</span> pts</div>
      </div>
      <div><button class="btn-primary" data-k="${d.k}" ${disabled?'disabled':''}>Buy</button></div>`;
    el.shopList.appendChild(div);
  });
  el.shopList.querySelectorAll('button[data-k]').forEach(b=> b.addEventListener('click', ()=> buy(b.getAttribute('data-k')) ));
  noteShop();
}
function noteShop(){ el.shopNote.textContent = canShop() ? '' : 'Shop is only available during Breaks.'; }

// ---- Prestige ----
function gritGain(x){ return Math.floor(x/100000); }
function prevPrest(){ const g=gritGain(st.points); $('#prestigeInfo').textContent = g>0 ? `You would gain ${g} Grit (+${g*5}% permanent).` : 'Earn 100,000 pts to gain your first Grit.'; }
function doPrest(){ const g=gritGain(st.points); if(g<=0){ $('#prestigeInfo').textContent='Not enough points to convert.'; return; } st.grit+=g; st.points=0; st.up={income:0,eff:0,str:0,vis:0}; st.streak=0; reset(); save(); hud(); renderShop(); $('#gritBadge').textContent='Grit: '+st.grit; $('#prestigeInfo').textContent=`Prestiged! New Grit: ${st.grit} (+${st.grit*5}% permanent).`; }

// ---- Controls & HUD ----
function start(){ if(!st.t.run){ const L = left() || msFor(st.t.m); schedule(L); } }
function pause(){ st.t.run=false; save(); }
function reset(){ st.t.run=false; st.t.d=0; st.streak=0; setMode('focus'); st.t.e=null; save(); }
function hud(){ el.pts.textContent = st.points.toLocaleString(undefined,{maximumFractionDigits:2}); el.rate.textContent = rate().toLocaleString(undefined,{maximumFractionDigits:2}) + '/s'; el.stk.textContent = st.streak; el.grit.textContent = 'Grit: ' + st.grit; }

// ---- Visuals ----
const world = $('#world');
function floatGain(val){ if(!st.t.run || st.t.m!=='focus') return; if(Math.random() < 0.25 + 0.05*st.up.vis){ const g=document.createElement('div'); g.className='gain'; g.style.left=(20+Math.random()*(world.clientWidth-40))+'px'; g.style.top=(60+Math.random()*60)+'px'; g.textContent='+'+Math.max(1,Math.floor(val)).toLocaleString(); world.appendChild(g); setTimeout(()=>g.remove(),1200); } }
function gain(t){ const g=document.createElement('div'); g.className='gain'; g.style.left=(world.clientWidth-90)+'px'; g.style.top='18px'; g.textContent=t; world.appendChild(g); setTimeout(()=>g.remove(),1200); }
function pulse(){ world.style.boxShadow='0 0 22px #6c8cff66 inset'; setTimeout(()=> world.style.boxShadow='none', 260); }

// ---- Events ----
$('#startBtn').addEventListener('click', start);
$('#pauseBtn').addEventListener('click', pause);
$('#resetBtn').addEventListener('click', reset);
$('#calcPrestige').addEventListener('click', prevPrest);
$('#doPrest').addEventListener('click', doPrest);
['focusLen','breakLen','longLen','roundsLen'].forEach(id=>{
  const i = document.getElementById(id);
  i.addEventListener('change', ()=>{
    const v = Math.max(1, parseInt(i.value||'1',10));
    if(id==='focusLen') st.t.f=v;
    if(id==='breakLen') st.t.s=v;
    if(id==='longLen') st.t.l=v;
    if(id==='roundsLen') st.t.g=v;
    save(); setMode(st.t.m);
  });
});

// ---- Loop ----
setInterval(()=>{
  if(st.t.run && left()<=0) complete(); else earn();
  updateTimer(); hud(); save();
}, 1000);

// ---- Init ----
function hydrate(){
  document.getElementById('focusLen').value = st.t.f;
  document.getElementById('breakLen').value = st.t.s;
  document.getElementById('longLen').value = st.t.l;
  document.getElementById('roundsLen').value = st.t.g;
  setMode(st.t.m); updateTimer(); hud(); renderShop();
}
load();
