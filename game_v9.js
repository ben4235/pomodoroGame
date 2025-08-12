// ===== Focus Forge v9 — top‑down idle TD with points→gold economy =====

window.onerror = (m)=>{const b=document.createElement('div');b.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;background:#ff453a;color:#fff;padding:8px 10px;border-radius:10px;font:12px -apple-system,system-ui;z-index:9999';b.textContent='JS error: '+m;document.body.appendChild(b);};

document.addEventListener('DOMContentLoaded', ()=>{

// -------- config --------
const SHOP_ONLY_DURING_BREAK = true;      // no upgrades while paused
const BOSS_EVERY = 10;                    // waves
const TD = {
  laneCount: 3,
  enemyBaseHP: 30,
  enemyHPGrowth: 1.12,
  enemySpeed: 60,
  spawnEvery: 1.7,
  bossHPx: 12,
  coinPerKill: 6, // points from kills (still allowed)
  bulletSpeed: 280,
  // towers
  slotsPerLane: 2,                        // total slots = laneCount * slotsPerLane
  baseRange: 110, rangeScale: 1.08,
  baseDmg: 6,   dmgScale: 1.35,
  baseFire: 0.9, fireScale: 0.93,
  // economy
  mineBaseCost: 100, mineCostScale: 1.6,
  mineGoldPerMin: 6, mineYieldScale: 1.28,  // per level
  towerBaseCostGold: 50, towerCostScale: 1.65
};

// -------- helpers --------
const $ = s => document.querySelector(s);
const now = () => Date.now();
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const fmt = ms => { const t=Math.ceil(ms/1000), m=String(Math.floor(t/60)).padStart(2,'0'), s=String(t%60).padStart(2,'0'); return `${m}:${s}`; };

// -------- IDB --------
let db; const DB='ff_save_db', VER=2, STORE='save';
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);
  r.onupgradeneeded=e=>{const d=e.target.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);};
  r.onerror=()=>rej(r.error); r.onsuccess=()=>{db=r.result; res(db);} });}
function idbSet(k,v){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});}
function idbGet(k){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);});}
function idbDel(k){return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);});}

// -------- state --------
const S = {
  points:0, gold:0, grit:0,
  upgrades:{income:0, efficiency:0, streak:0, visuals:0, mineLv:0},
  streak:0,
  t:{mode:'focus', running:false, focus:25, short:5, long:15, goal:4, done:0, endAt:null, last:now(), remain:0},
  td:{ wave:1, lives:15, coinsEarned:0, lastGoldTick:now(), slots:[], enemies:[], bullets:[], boss:false }
};

// -------- elements --------
const E = {
  time: $('#time'), pill: $('#modePill'), prog: $('#phaseProg'), phase: $('#phaseLabel'),
  pts: $('#points'), rate: $('#rate'), stk: $('#streak'), grit: $('#gritBadge'),
  gold: $('#goldBadge'),
  inputs: { f:$('#focusLen'), s:$('#breakLen'), l:$('#longLen'), g:$('#roundsLen') },
  world: $('#world'),
  start: $('#startBtn'), pause: $('#pauseBtn'), reset: $('#resetBtn'),
  resetSave: $('#resetSave'),
};

// -------- audio (chime at end of focus) --------
let audioCtx=null, chimeBuf=null, audioArmed=false;
function armAudio(){ if(audioArmed) return; audioArmed=true; try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); makeChime(); }catch{} }
function makeChime(){ if(!audioCtx) return; // simple 2‑tone
  const dur=0.35, o1=audioCtx.createOscillator(), g=audioCtx.createGain();
  o1.type='sine'; o1.frequency.setValueAtTime(880,audioCtx.currentTime);
  const o2=audioCtx.createOscillator(); o2.type='sine'; o2.frequency.setValueAtTime(1320,audioCtx.currentTime+dur*0.6);
  g.gain.value=0; g.connect(audioCtx.destination);
  const rec = audioCtx.createGain(); rec.connect(g);
  // pre-render into buffer via OfflineAudioContext
}
function playChime(){ if(!audioCtx) return; const o=audioCtx.createOscillator(), g=audioCtx.createGain();
  o.type='sine'; const t=audioCtx.currentTime; o.frequency.setValueAtTime(880,t); o.frequency.linearRampToValueAtTime(1320,t+0.25);
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.2,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.5);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t+0.5);
}

// -------- canvas / layout (top‑down) --------
let cvs, ctx, W=0, H=0, lanes=[];
function resizeCanvas(){
  if(!E.world) return;
  if(!cvs){ cvs=document.createElement('canvas'); cvs.id='tdCanvas'; E.world.appendChild(cvs); ctx=cvs.getContext('2d'); }
  const r=E.world.getBoundingClientRect();
  W=cvs.width=Math.floor(r.width*devicePixelRatio);
  H=cvs.height=Math.floor(r.height*devicePixelRatio);
  cvs.style.width=r.width+'px'; cvs.style.height=r.height+'px';
  // lanes evenly spaced vertically
  lanes = [];
  const top=30*devicePixelRatio, bottom=H-40*devicePixelRatio;
  const gap=(bottom-top)/(TD.laneCount-1 || 1);
  for(let i=0;i<TD.laneCount;i++){ lanes.push(Math.floor(top + gap*i)); }
}
function ensureSlots(){
  if (S.td.slots.length) {
    // adjust y if resize
    S.td.slots.forEach((s,i)=>{ s.y = lanes[Math.floor(i/TD.slotsPerLane)] || s.y; });
    return;
  }
  for(let li=0; li<TD.laneCount; li++){
    for(let si=0; si<TD.slotsPerLane; si++){
      const x = Math.floor((si+1) * (W/(TD.slotsPerLane+1)));
      const y = lanes[li];
      S.td.slots.push({x,y, level:0, type:'gun', nextFire:0});
    }
  }
}

// ----- towers, enemies, bullets -----
const TowerKinds = {
  gun:  {name:'Gun',   range:TD.baseRange, dmg:TD.baseDmg, fire:TD.baseFire, color:'#9eaefe'},
  slow: {name:'Slow',  range:TD.baseRange*1.1, dmg:TD.baseDmg*0.6, fire:TD.baseFire*1.1, slow:0.5, color:'#6cd4ff'},
  splash:{name:'Splash',range:TD.baseRange*0.9, dmg:TD.baseDmg*0.8, fire:TD.baseFire*1.15, splash:40, color:'#ffd54a'},
};
function kindStats(kind, lv){
  const k=TowerKinds[kind]; const s={
    range: k.range*Math.pow(1.06,lv-1),
    dmg:   k.dmg*Math.pow(TD.dmgScale,lv-1),
    fire:  k.fire*Math.pow(TD.fireScale,lv-1),
    slow:  k.slow||0,
    splash:k.splash||0,
    color: k.color
  }; return s;
}
function towerCostGold(lv){ return Math.floor(TD.towerBaseCostGold * Math.pow(TD.towerCostScale, lv)); }

function spawnEnemy(){
  const lane = lanes[Math.floor(Math.random()*lanes.length)];
  const wave=S.td.wave, boss=(wave % BOSS_EVERY===0);
  const hp = TD.enemyBaseHP*Math.pow(TD.enemyHPGrowth, wave-1)*(boss?TD.bossHPx:1);
  const speed = TD.enemySpeed*(boss?0.7:1)*(0.95+Math.random()*0.1)*devicePixelRatio;
  S.td.enemies.push({ x: Math.random()*W, y: -12*devicePixelRatio, laneY: lane, r: boss?12*devicePixelRatio:8*devicePixelRatio, hp, max:hp, speed, slowTil:0, boss });
}
function stepEnemies(dt){
  for(const e of S.td.enemies){
    // move toward its lane first (vertical), then down
    if(e.y < e.laneY) e.y += e.speed*dt*1.2;
    else e.y += e.speed*dt*(e.slowTil>now()?0.5:1);
  }
  // reach base?
  S.td.enemies = S.td.enemies.filter(e=>{
    if(e.y >= H-20*devicePixelRatio){
      S.td.lives = Math.max(0, S.td.lives- (e.boss?3:1));
      return false;
    }
    return true;
  });
}
function stepBullets(dt){
  for(const b of S.td.bullets){
    const t=b.target; if(!t) {b.dead=true; continue;}
    const dx=t.x-b.x, dy=t.y-b.y, d=Math.hypot(dx,dy)||1;
    const vx=(dx/d)*TD.bulletSpeed*devicePixelRatio, vy=(dy/d)*TD.bulletSpeed*devicePixelRatio;
    b.x+=vx*dt; b.y+=vy*dt;
    if(Math.hypot(t.x-b.x, t.y-b.y) <= t.r + 2*devicePixelRatio){
      // impact
      t.hp -= b.dmg;
      if(b.slow && t.slowTil<now()) t.slowTil = now()+1200; // 1.2s slow
      if(b.splash){
        for(const e of S.td.enemies){
          if(e!==t && Math.hypot(e.x-t.x, e.y-t.y) <= b.splash) e.hp -= b.dmg*0.6;
        }
      }
      b.dead=true;
      if(t.hp<=0){
        t.dead=true;
        const reward = TD.coinPerKill*(t.boss?8:1);
        S.points += reward; S.td.coinsEarned += reward;
      }
    }
  }
  S.td.bullets = S.td.bullets.filter(b=>!b.dead);
  S.td.enemies = S.td.enemies.filter(e=>!e.dead);
}
function fireFrom(slot, tNow){
  if(slot.level<=0) return;
  if(tNow < slot.nextFire) return;
  const st = kindStats(slot.type, slot.level);
  // choose nearest in range under the slot (same lane preferred)
  let best=null, bestD=1e9;
  for(const e of S.td.enemies){
    const d=Math.hypot(e.x-slot.x, e.y-slot.y);
    if(d <= st.range*devicePixelRatio && d < bestD) { best=e; bestD=d; }
  }
  if(best){
    slot.nextFire = tNow + st.fire;
    S.td.bullets.push({ x:slot.x, y:slot.y, target:best, dmg:st.dmg, slow:st.slow, splash:st.splash });
  }
}
let spawnTimer=0, waveTimer=0;
function stepWaves(dt, tNow){
  waveTimer += dt; spawnTimer += dt;
  if(spawnTimer >= TD.spawnEvery){ spawnTimer=0; spawnEnemy(); }
  if(waveTimer >= 22){ waveTimer=0; S.td.wave++; }
  for(const s of S.td.slots) fireFrom(s, tNow);
}

// -------- drawing --------
function draw(){
  if(!ctx) return;
  ctx.clearRect(0,0,W,H);

  // base rectangle
  ctx.strokeStyle='#ff453a'; ctx.lineWidth=2*devicePixelRatio;
  ctx.strokeRect(0, H-24*devicePixelRatio, W, 20*devicePixelRatio);

  // lanes
  ctx.strokeStyle='#2a2f4d';
  for(const y of lanes){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // enemies
  for(const e of S.td.enemies){
    const hpPct=clamp(e.hp/e.max,0,1);
    ctx.fillStyle = e.boss ? '#ff9f0a' : '#ffcc00';
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill();
    // HP bar
    ctx.fillStyle='#ff453a'; ctx.fillRect(e.x-e.r, e.y-e.r-6*devicePixelRatio, e.r*2, 3*devicePixelRatio);
    ctx.fillStyle='#34c759'; ctx.fillRect(e.x-e.r, e.y-e.r-6*devicePixelRatio, e.r*2*hpPct, 3*devicePixelRatio);
  }

  // bullets
  ctx.fillStyle='#6c8cff';
  for(const b of S.td.bullets){ ctx.fillRect(b.x-2*devicePixelRatio,b.y-2*devicePixelRatio,4*devicePixelRatio,4*devicePixelRatio); }

  // towers
  for(const s of S.td.slots){
    ctx.fillStyle = s.level>0 ? (TowerKinds[s.type].color) : '#2b2f4d';
    const sz = s.level>0 ? 16 : 12;
    ctx.fillRect(s.x-sz/2*devicePixelRatio, s.y-sz/2*devicePixelRatio, sz*devicePixelRatio, sz*devicePixelRatio);
    if(s.level>0){
      ctx.strokeStyle='#2b2f4d'; ctx.beginPath();
      ctx.arc(s.x, s.y, kindStats(s.type,s.level).range*devicePixelRatio, 0, Math.PI*2); ctx.stroke();
    }
  }

  // HUD
  ctx.fillStyle='#cfd3ff';
  ctx.font = `${12*devicePixelRatio}px -apple-system,system-ui`;
  ctx.fillText(`Wave ${S.td.wave} • Lives ${S.td.lives} • Earned +${S.td.coinsEarned}`, 10*devicePixelRatio, 16*devicePixelRatio);
}

// -------- economy: Mine → Gold --------
function mineCost(lv){ return Math.floor(TD.mineBaseCost * Math.pow(TD.mineCostScale, lv)); }
function mineGoldPerSec(lv){ return (TD.mineGoldPerMin/60) * Math.pow(TD.mineYieldScale, lv); }
function tickGold(){
  const lv = S.upgrades.mineLv;
  if(lv<=0) return;
  const nowMs = now(), dtSec = Math.max(0, (nowMs - S.td.lastGoldTick)/1000);
  if(dtSec>0){
    S.gold += mineGoldPerSec(lv) * dtSec;
    S.td.lastGoldTick = nowMs;
  }
}
function buyMineLv(){
  const c = mineCost(S.upgrades.mineLv);
  if(!canShop() || S.points < c) return;
  S.points -= c; S.upgrades.mineLv++; S.td.lastGoldTick = now(); persist(); hud(); showToast(`Mine Lv ${S.upgrades.mineLv} (+Gold)`);
}
function buyTower(slotIndex, kind){
  if(!canShop()) return;
  const s = S.td.slots[slotIndex]; const cost = towerCostGold(s.level);
  if(S.gold >= cost){
    S.gold -= cost; s.level += 1; s.type = kind || s.type;
    persist(); hud(); showToast(`Upgraded ${TowerKinds[s.type].name} → Lv ${s.level}`);
  }
}

// -------- Pomodoro --------
const msFor = m => (m==='focus'?S.t.focus:m==='short'?S.t.short:S.t.long)*60*1000;
const left = () => S.t.running ? (S.t.endAt ? Math.max(0, S.t.endAt - now()) : 0) : (S.t.remain || 0);
function setMode(m){ S.t.mode = m; if ($('#modePill')) $('#modePill').textContent = (m==='focus'?'Focus':m==='short'?'Break':'Long Break')+' • '+fmt(msFor(m)); }
function schedule(ms){ S.t.endAt = now()+ms; S.t.running=true; S.t.last=now(); S.t.remain=0; persist(); }
function completePhase(){
  S.t.running=false;
  if(S.t.mode==='focus'){ S.t.done++; S.streak++; setMode((S.t.done % S.t.goal === 0) ? 'long' : 'short'); playChime(); }
  else { setMode('focus'); }
  persist(); schedule(msFor(S.t.mode));
}
function updateTimerView(){
  const L = left(), tot = msFor(S.t.mode);
  if(E.time)  E.time.textContent = fmt(S.t.running ? L : (S.t.remain || tot));
  if($('#phaseProg')) $('#phaseProg').value = Math.max(0, Math.min(1, (tot - L) / tot));
  if($('#phaseLabel')) $('#phaseLabel').textContent = (S.t.mode==='focus'?'Focus phase':'Break phase')+
     ' • Ends at ' + new Date(now()+L).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}
function start(){ if (!S.t.running) { armAudio(); const ms = (S.t.remain > 0 ? S.t.remain : (left() || msFor(S.t.mode))); schedule(ms); } }
function pause(){ S.t.remain = left(); S.t.endAt = null; S.t.running = false; persist(); updateTimerView(); }
function reset(){ S.t.running=false; S.t.done=0; S.streak=0; setMode('focus'); S.t.endAt=null; S.t.remain=0; persist(); updateTimerView(); hud(); }

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
function canShop(){ return SHOP_ONLY_DURING_BREAK ? (S.t.mode!=='focus') : (!S.t.running || S.t.mode!=='focus'); }

// -------- HUD / persist --------
function hud(){
  if(E.pts)  E.pts.textContent = S.points.toLocaleString(undefined,{maximumFractionDigits:1});
  if(E.gold) E.gold.textContent = 'Gold: ' + Math.floor(S.gold).toLocaleString();
  if(E.rate) E.rate.textContent = gainRate().toLocaleString(undefined,{maximumFractionDigits:1})+'/s';
  if(E.stk)  E.stk.textContent = S.streak;
  if(E.grit) E.grit.textContent = 'Grit: '+S.grit;
}
function persist(){ idbSet('game', S).catch(()=>{}); }
function hydrate(){
  const I=E.inputs;
  if(I.f) I.f.value=S.t.focus; if(I.s) I.s.value=S.t.short; if(I.l) I.l.value=S.t.long; if(I.g) I.g.value=S.t.goal;
  setMode(S.t.mode); updateTimerView(); hud();
}

// -------- editor: simple modal using alerts (fast) --------
function showToast(t){ const d=document.createElement('div'); d.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#262b48;color:#fff;padding:8px 12px;border-radius:10px;font:12px -apple-system;z-index:9999'; d.textContent=t; document.body.appendChild(d); setTimeout(()=>d.remove(),1200); }
function editDefense(){
  if(!canShop()) { showToast('Edit available on Breaks only'); return; }
  // quick picker: choose slot then tower kind
  const idx = prompt(`Slot index to upgrade/place (1-${S.td.slots.length})?`);
  const i = (idx?parseInt(idx,10):NaN) - 1;
  if(isNaN(i)|| i<0 || i>=S.td.slots.length) return;
  const kind = prompt('Tower type: gun, slow, splash', S.td.slots[i].type || 'gun');
  if(!['gun','slow','splash'].includes(kind)) return;
  buyTower(i, kind);
}

// -------- reset progress --------
async function resetProgress(){
  if(!confirm('Reset all progress? This cannot be undone.')) return;
  await idbDel('game');
  // soft reset in memory
  Object.assign(S, {
    points:0, gold:0, grit:0,
    upgrades:{income:0, efficiency:0, streak:0, visuals:0, mineLv:0},
    streak:0,
    t:{mode:'focus', running:false, focus:25, short:5, long:15, goal:4, done:0, endAt:null, last:now(), remain:0},
    td:{ wave:1, lives:15, coinsEarned:0, lastGoldTick:now(), slots:[], enemies:[], bullets:[], boss:false }
  });
  ensureSlots(); persist(); hud(); updateTimerView(); showToast('Progress reset');
}

// -------- main loop --------
let lastT = performance.now()/1000;
function loop(){
  const t = performance.now()/1000, dt = Math.min(0.05, t-lastT); lastT=t;
  // TD sim
  stepWaves(dt, t);
  stepEnemies(dt);
  stepBullets(dt);
  draw();
  if(S.td.lives<=0){ S.td.wave=1; S.td.lives=15; S.td.enemies.length=0; S.td.bullets.length=0; }
  requestAnimationFrame(loop);
}

// -------- intervals --------
setInterval(()=>{
  // pomodoro & earnings
  if(S.t.running && left()<=0) completePhase(); else earn();
  tickGold();
  updateTimerView(); hud(); persist();
}, 1000);

// -------- init --------
function boot(){
  resizeCanvas(); ensureSlots(); requestAnimationFrame(loop);
  window.addEventListener('resize', ()=>{ resizeCanvas(); ensureSlots(); });
  // add "Edit Defense" button below canvas if not exists
  if(!$('#tdEditBtn')){
    const btn=document.createElement('button');
    btn.id='tdEditBtn'; btn.className='btn'; btn.textContent='Edit Defense';
    E.world && E.world.parentElement && E.world.parentElement.insertBefore(btn, E.world.nextSibling);
    btn.addEventListener('click', editDefense);
  }
  if(E.resetSave) E.resetSave.addEventListener('click', resetProgress);
  // quick mine purchase gesture: long-press Start -> buy Mine
  if(E.start) E.start.addEventListener('contextmenu', e=>{ e.preventDefault(); buyMineLv(); });
  // first user click -> enable audio
  document.body.addEventListener('click', armAudio, {once:true});
}

idbOpen().then(()=>idbGet('game')).then(s=>{
  if(s) Object.assign(S,s);
}).finally(()=>{
  if (S.t.running) { S.t.remain = S.t.endAt ? Math.max(0, S.t.endAt - Date.now()) : 0; S.t.endAt = null; S.t.running = false; }
  hydrate(); boot();
});

// -------- controls --------
E.start && E.start.addEventListener('click', start);
E.pause && E.pause.addEventListener('click', pause);
E.reset && E.reset.addEventListener('click', reset);
// keep inputs synced
Object.entries(E.inputs).forEach(([k,input])=>{
  if(!input) return;
  input.addEventListener('change', ()=>{
    const v=Math.max(1, parseInt(input.value||'1',10));
    if(k==='f') S.t.focus=v; if(k==='s') S.t.short=v; if(k==='l') S.t.long=v; if(k==='g') S.t.goal=v;
    persist(); setMode(S.t.mode); updateTimerView();
  });
});

}); // DOMContentLoaded
