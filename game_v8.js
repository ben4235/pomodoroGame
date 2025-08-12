// ======= Focus Forge: Idle TD (minimal) — v8 =======
// Visual feedback, runs 24/7. Towers shoot circles (enemies). Break/Paused = place/upgrade.
// Includes: pause-freeze, no auto-resume, IndexedDB save, null-safe bindings, DOM-ready.
// Big red error banner if anything throws, so we can fix fast.

window.onerror = (m)=>{const b=document.createElement('div');b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;background:#ff453a;color:#fff;padding:8px 10px;border-radius:10px;font:12px -apple-system,system-ui;z-index:9999';b.textContent='JS error: '+m;document.body.appendChild(b);};

document.addEventListener('DOMContentLoaded', ()=>{

// ---------- config ----------
const ALLOW_SHOP_WHEN_PAUSED = true; // allow tower edit while paused
const TD = {
  laneYRatio: 0.6,     // lane vertical position (0..1 of world height)
  enemyBaseHP: 20,
  enemyHPGrowth: 1.10, // per wave
  enemySpeed: 55,      // px/s base
  spawnEvery: 1.8,     // seconds
  coinPerKill: 6,      // points per basic enemy
  towerSlots: 6,
  towerCostBase: 50,
  towerCostScale: 1.6,
  towerDamageBase: 6,
  towerDamageScale: 1.35,
  towerFireBase: 0.9,  // seconds between shots
  towerFireScale: 0.93,
  towerRangeBase: 110,
  towerRangeScale: 1.08,
  bulletSpeed: 260,    // px/s
};

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const now = () => Date.now();
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const fmt = ms => { const t=Math.ceil(ms/1000), m=String(Math.floor(t/60)).padStart(2,'0'), s=String(t%60).padStart(2,'0'); return `${m}:${s}`; };

// ---------- IndexedDB ----------
let db; const DB='ff_save_db', VER=1, STORE='save';
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);
  r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);};
  r.onerror=()=>rej(r.error); r.onsuccess=()=>{db=r.result; res(db);} });}
function idbSet(k,v){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});}
function idbGet(k){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);});}

// ---------- state ----------
const S = {
  points:0, grit:0, upgrades:{income:0, efficiency:0, streak:0, visuals:0}, streak:0,
  t:{mode:'focus', running:false, focus:25, short:5, long:15, goal:4, done:0, endAt:null, last:now(), remain:0},
  td:{
    wave:1, lives:10, coinsEarned:0,
    slots: [], // [{x,y,level}] length TD.towerSlots
  }
};

// ---------- elements ----------
const E = {
  time: $('#time'), pill: $('#modePill'), prog: $('#phaseProg'), phase: $('#phaseLabel'),
  pts: $('#points'), rate: $('#rate'), stk: $('#streak'), grit: $('#gritBadge'),
  inputs: { f:$('#focusLen'), s:$('#breakLen'), l:$('#longLen'), g:$('#roundsLen') },
  world: $('#world'),
  tabTimer: $('#tabTimer'), tabShop: $('#tabShop'), tabPrestige: $('#tabPrestige'),
  cardTimer: $('#timerCard'), cardShop: $('#shopCard'), cardPrestige: $('#prestigeCard'),
  start: $('#startBtn'), pause: $('#pauseBtn'), reset: $('#resetBtn'),
  prev: $('#calcPrestige'), doPrest: $('#doPrest'), prestigeInfo: $('#prestigeInfo'),
};

// ---------- inject minimal CSS for TD overlay/editor ----------
(function injectStyle(){
  const css = `
  #tdCanvas{position:absolute; inset:0; width:100%; height:100%}
  #world{position:relative}
  #tdEditBtn{margin-top:8px; display:inline-flex; align-items:center; gap:6px; background:#262b48; color:#fff; border:none; border-radius:10px; padding:10px 12px; font-weight:800}
  #tdEditBtn[disabled]{opacity:.6}
  #tdOverlay{position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; z-index:9998; align-items:center; justify-content:center}
  .td-card{background:#171a2b; border:1px solid #2a2f4d; border-radius:14px; width:min(520px,92%); padding:14px}
  .td-row{display:flex; gap:8px; align-items:center; justify-content:space-between; margin:6px 0}
  .td-small{color:#9aa0b7; font-size:12px}
  .td-btn{background:#6c8cff; color:#fff; border:none; border-radius:10px; padding:8px 12px; font-weight:800}
  .td-btn[disabled]{opacity:.5}
  `;
  const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el);
})();

// ---------- TD runtime data (not saved) ----------
let cvs, ctx, W=0, H=0, laneY=0, lastSpawn=0, enemies=[], bullets=[];
function resizeCanvas(){
  if(!E.world) return;
  if(!cvs){
    cvs = document.createElement('canvas'); cvs.id='tdCanvas'; E.world.appendChild(cvs);
    ctx = cvs.getContext('2d');
  }
  const r = E.world.getBoundingClientRect();
  W = cvs.width = Math.floor(r.width * devicePixelRatio);
  H = cvs.height = Math.floor(r.height * devicePixelRatio);
  cvs.style.width = r.width + 'px'; cvs.style.height = r.height + 'px';
  laneY = Math.floor(H * TD.laneYRatio);
}

// ---------- tower slots layout ----------
function ensureSlots(){
  if (S.td.slots.length) return;
  const margin = 40 * devicePixelRatio;
  const step = (W - margin*2) / (TD.towerSlots-1 || 1);
  for(let i=0;i<TD.towerSlots;i++){
    S.td.slots.push({ x: Math.floor(margin + step*i), y: Math.floor(H*0.35), level: 0 });
  }
}
function towerStats(level){
  if(level<=0) return null;
  return {
    dmg: TD.towerDamageBase * Math.pow(TD.towerDamageScale, level-1),
    fire: TD.towerFireBase * Math.pow(TD.towerFireScale, level-1),
    range: TD.towerRangeBase * Math.pow(TD.towerRangeScale, level-1),
  };
}
function towerCost(level){ // next cost
  return Math.floor(TD.towerCostBase * Math.pow(TD.towerCostScale, level));
}

// ---------- enemies & bullets ----------
function spawnEnemy(){
  const hp = TD.enemyBaseHP * Math.pow(TD.enemyHPGrowth, S.td.wave-1);
  enemies.push({ x: -20*devicePixelRatio, y: laneY, r: 9*devicePixelRatio, hp, max:hp, speed: TD.enemySpeed*devicePixelRatio });
}
function stepEnemies(dt){
  for(const e of enemies){ e.x += e.speed*dt; }
  // reached end?
  enemies = enemies.filter(e=>{
    if(e.x >= W + 20*devicePixelRatio){
      S.td.lives = Math.max(0, S.td.lives-1);
      return false;
    }
    return true;
  });
}
function stepBullets(dt){
  for(const b of bullets){
    const dx = b.tx - b.x, dy = b.ty - b.y;
    const d = Math.hypot(dx,dy) || 1;
    const vx = (dx/d)*TD.bulletSpeed*devicePixelRatio, vy=(dy/d)*TD.bulletSpeed*devicePixelRatio;
    b.x += vx*dt; b.y += vy*dt;
    // hit target?
    const t = b.target;
    if(t && Math.hypot(t.x-b.x, t.y-b.y) <= t.r + 2*devicePixelRatio){
      t.hp -= b.dmg;
      b.dead = true;
      if(t.hp<=0){
        t.dead = true;
        S.points += TD.coinPerKill; // reward points for kill
        S.td.coinsEarned += TD.coinPerKill;
      }
    }
  }
  bullets = bullets.filter(b=>!b.dead && b.x>=-10 && b.x<=W+10 && b.y>=-10 && b.y<=H+10);
  enemies = enemies.filter(e=>!e.dead);
}
function fireFrom(slot, stats, tNow){
  if(!slot.nextFire) slot.nextFire = 0;
  if(tNow < slot.nextFire) return;
  // find nearest in range
  const range = stats.range*devicePixelRatio;
  let best=null, bestD=1e9;
  for(const e of enemies){
    const d = Math.hypot(e.x - slot.x, e.y - slot.y);
    if(d <= range && d < bestD){ best=e; bestD=d; }
  }
  if(best){
    slot.nextFire = tNow + stats.fire;
    bullets.push({ x: slot.x, y: slot.y, tx: best.x, ty: best.y, target: best, dmg: stats.dmg });
  }
}
function stepTowers(tNow){
  for(const s of S.td.slots){
    if(s.level>0){
      const st = towerStats(s.level);
      fireFrom(s, st, tNow);
    }
  }
}

// ---------- waves ----------
let waveTimer = 0;
function stepWaves(dt){
  waveTimer += dt;
  if (waveTimer >= 20){ waveTimer = 0; S.td.wave++; }
  // spawning
  lastSpawn += dt;
  if(lastSpawn >= TD.spawnEvery){
    lastSpawn = 0;
    spawnEnemy();
  }
}

// ---------- draw ----------
function draw(){
  if(!ctx) return;
  ctx.clearRect(0,0,W,H);

  // lane
  ctx.strokeStyle = '#2a2f4d';
  ctx.lineWidth = 2*devicePixelRatio;
  ctx.beginPath(); ctx.moveTo(0,laneY); ctx.lineTo(W,laneY); ctx.stroke();

  // end zone
  ctx.strokeStyle='#ff453a'; ctx.strokeRect(W-20*devicePixelRatio, laneY-20*devicePixelRatio, 20*devicePixelRatio, 40*devicePixelRatio);

  // enemies
  for(const e of enemies){
    const hpPct = clamp(e.hp/e.max,0,1);
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
    // hp bar
    ctx.fillStyle = '#ff453a'; ctx.fillRect(e.x-e.r, e.y-e.r-6*devicePixelRatio, e.r*2, 3*devicePixelRatio);
    ctx.fillStyle = '#34c759'; ctx.fillRect(e.x-e.r, e.y-e.r-6*devicePixelRatio, e.r*2*hpPct, 3*devicePixelRatio);
  }

  // bullets
  ctx.fillStyle = '#6c8cff';
  for(const b of bullets){ ctx.fillRect(b.x-2*devicePixelRatio, b.y-2*devicePixelRatio, 4*devicePixelRatio, 4*devicePixelRatio); }

  // towers/slots
  for(const s of S.td.slots){
    if(s.level>0){
      ctx.fillStyle = '#9eaefe';
      ctx.fillRect(s.x-8*devicePixelRatio, s.y-8*devicePixelRatio, 16*devicePixelRatio, 16*devicePixelRatio);
      // range (subtle)
      ctx.strokeStyle='#2b2f4d'; ctx.beginPath(); ctx.arc(s.x,s.y,towerStats(s.level).range*devicePixelRatio,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.fillStyle = '#2b2f4d';
      ctx.fillRect(s.x-6*devicePixelRatio, s.y-6*devicePixelRatio, 12*devicePixelRatio, 12*devicePixelRatio);
    }
  }

  // HUD overlay
  ctx.fillStyle='#cfd3ff';
  ctx.font = `${12*devicePixelRatio}px -apple-system,system-ui`;
  ctx.fillText(`Wave ${S.td.wave} • Lives ${S.td.lives} • Earned +${S.td.coinsEarned}`, 10*devicePixelRatio, 16*devicePixelRatio);
}

// ---------- runtime loop ----------
let last = performance.now()/1000;
function loop(){
  const t = performance.now()/1000;
  const dt = Math.min(0.05, t - last); // cap
  last = t;

  stepWaves(dt);
  stepEnemies(dt);
  stepTowers(t);
  stepBullets(dt);
  draw();

  // simple fail condition → reset wave but keep towers
  if(S.td.lives<=0){ S.td.wave=1; S.td.lives=10; enemies.length=0; bullets.length=0; }

  requestAnimationFrame(loop);
}

// ---------- Pomodoro logic (same as v7 with pause-freeze) ----------
const msFor = m => (m==='focus'?S.t.focus:m==='short'?S.t.short:S.t.long)*60*1000;
const left = () => S.t.running ? (S.t.endAt ? Math.max(0, S.t.endAt - now()) : 0) : (S.t.remain || 0);
function setMode(m){ S.t.mode = m; if ($('#modePill')) $('#modePill').textContent = (m==='focus'?'Focus':m==='short'?'Break':'Long Break')+' • '+fmt(msFor(m)); }
function schedule(ms){ S.t.endAt = now()+ms; S.t.running=true; S.t.last=now(); S.t.remain=0; persist(); }
function completePhase(){
  S.t.running=false;
  if(S.t.mode==='focus'){ S.t.done++; S.streak++; setMode((S.t.done % S.t.goal === 0) ? 'long' : 'short'); }
  else { setMode('focus'); }
  persist(); schedule(msFor(S.t.mode));
}
function updateTimerView(){
  const L = left(), tot = msFor(S.t.mode);
  if(E.time)  E.time.textContent = fmt(S.t.running ? L : (S.t.remain || tot));
  if(E.prog)  E.prog.value = Math.max(0, Math.min(1, (tot - L) / tot));
  if(E.phase) E.phase.textContent = (S.t.mode==='focus'?'Focus phase':'Break phase')+
     ' • Ends at ' + new Date(now()+L).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}
function start(){ if (!S.t.running) { const ms = (S.t.remain > 0 ? S.t.remain : (left() || msFor(S.t.mode))); schedule(ms); } }
function pause(){ S.t.remain = left(); S.t.endAt = null; S.t.running = false; persist(); updateTimerView(); }
function reset(){ S.t.running=false; S.t.done=0; S.streak=0; setMode('focus'); S.t.endAt=null; S.t.remain=0; persist(); updateTimerView(); hud(); }

// ---------- earnings (points/sec from upgrades, in addition to TD kills) ----------
const mSt = ()=>1 + S.streak*(0.10 + 0.05*S.upgrades.streak);
const mGr = ()=>1 + 0.05*S.grit;
const mEf = ()=>1 + 0.08*S.upgrades.efficiency;
const base = ()=>1 + 1.2*S.upgrades.income;
const gainRate = ()=> base()*mEf()*mSt()*mGr();
function earn(){
  if (S.t.running && S.t.mode==='focus'){
    const n=now(); const ds=Math.max(0, Math.floor((n - S.t.last)/1000));
    if (ds>0){ S.t.last=n; const g=gainRate()*ds; S.points+=g; persist(); }
  } else { S.t.last = now(); }
}

// ---------- UI/HUD ----------
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
  setMode(S.t.mode); updateTimerView(); hud();
}

// ---------- editor overlay (towers) ----------
let overlay, editBtn;
function canEdit(){ return ALLOW_SHOP_WHEN_PAUSED ? (!S.t.running || S.t.mode!=='focus') : (S.t.mode!=='focus'); }

function ensureEditor(){
  if(!editBtn){
    editBtn = document.createElement('button');
    editBtn.id='tdEditBtn'; editBtn.textContent='Edit Defense';
    E.world && E.world.parentElement && E.world.parentElement.insertBefore(editBtn, E.world.nextSibling);
    editBtn.addEventListener('click', openEditor);
  }
  editBtn.disabled = !canEdit();

  if(!overlay){
    overlay = document.createElement('div'); overlay.id='tdOverlay';
    overlay.innerHTML = `<div class="td-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">Defense Layout</h3>
        <button class="td-btn" id="tdClose">Close</button>
      </div>
      <div class="td-small" id="tdInfo" style="margin-top:6px"></div>
      <div id="tdSlots"></div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#tdClose').addEventListener('click', ()=> overlay.style.display='none');
  }
}

function openEditor(){
  if(!canEdit()) return;
  const wrap = overlay.querySelector('#tdSlots');
  const info = overlay.querySelector('#tdInfo');
  wrap.innerHTML='';

  S.td.slots.forEach((s, i)=>{
    const cost = towerCost(s.level);
    const row = document.createElement('div');
    row.className='td-row';
    row.innerHTML = `
      <div>
        <div>Slot ${i+1} — ${s.level>0?('Lv '+s.level):'Empty'}</div>
        <div class="td-small">${s.level>0 ? `DMG ${towerStats(s.level).dmg.toFixed(1)} • Rng ${Math.round(towerStats(s.level).range)} • Fire ${towerStats(s.level).fire.toFixed(2)}s` : 'Place a basic tower'}</div>
      </div>
      <div>
        <button class="td-btn" data-i="${i}" ${(!canEdit() || S.points<cost)?'disabled':''}>${s.level>0?'Upgrade':'Place'} (${cost} pts)</button>
      </div>`;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('button[data-i]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = parseInt(btn.getAttribute('data-i'),10);
      const slot = S.td.slots[i];
      const cost = towerCost(slot.level);
      if(S.points >= cost){
        S.points -= cost;
        slot.level += 1;
        persist(); hud();
        overlay.style.display='none';
      }
    });
  });

  info.textContent = `Lives: ${S.td.lives} • Wave: ${S.td.wave} • Coins earned in run: +${S.td.coinsEarned}`;
  overlay.style.display='flex';
}

// ---------- visibility behavior ----------
document.addEventListener('visibilitychange', ()=>{ if (document.hidden && S.t.running) pause(); });

// ---------- main 1s tick (pomodoro earnings + UI refresh) ----------
setInterval(()=>{
  if(S.t.running && left()<=0) completePhase();
  else earn();
  updateTimerView(); hud();
  if(editBtn) editBtn.disabled = !canEdit();
  persist();
}, 1000);

// ---------- init ----------
function boot(){
  resizeCanvas(); ensureSlots(); requestAnimationFrame(loop);
  window.addEventListener('resize', ()=>{ resizeCanvas(); ensureSlots(); });
  ensureEditor();
}

idbOpen().then(()=>idbGet('game')).then(s=>{
  if(s) Object.assign(S,s);
}).finally(()=>{
  if (S.t.running) { // no auto-resume on load
    S.t.remain = S.t.endAt ? Math.max(0, S.t.endAt - Date.now()) : 0;
    S.t.endAt = null; S.t.running = false;
  }
  hydrate();
  boot();
});

// ---------- controls (null-safe) ----------
E.start && E.start.addEventListener('click', start);
E.pause && E.pause.addEventListener('click', pause);
E.reset && E.reset.addEventListener('click', reset);
E.prev && E.prev.addEventListener('click', ()=> E.prestigeInfo && (E.prestigeInfo.textContent = 'Earn 100,000 pts for +1 Grit.')); // keep simple

}); // DOMContentLoaded
