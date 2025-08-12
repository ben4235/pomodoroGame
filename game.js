
const $=s=>document.querySelector(s);const now=()=>Date.now();const fmt=ms=>{let t=Math.ceil(ms/1000),m=String(Math.floor(t/60)).padStart(2,'0'),s=String(t%60).padStart(2,'0');return m+':'+s};
// IndexedDB
const DB='ff_save_db',VER=1,STORE='save';let db;
function dbOpen(){return new Promise((res,rej)=>{let r=indexedDB.open(DB,VER);r.onupgradeneeded=e=>{let d=e.target.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE)};r.onerror=()=>rej(r.error);r.onsuccess=()=>{db=r.result;res(db)}})}
function dbSet(k,v){return new Promise((res,rej)=>{let tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,k);tx.oncomplete=()=>res(1);tx.onerror=()=>rej(tx.error)})}
function dbGet(k){return new Promise((res,rej)=>{let tx=db.transaction(STORE,'readonly');let rq=tx.objectStore(STORE).get(k);rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)})}
// State
const st={points:0,grit:0,up:{income:0,eff:0,str:0,vis:0},streak:0,t:{m:'focus',run:false,f:25,s:5,l:15,g:4,d:0,e:null,last:now()}};
async function load(){try{await dbOpen();let s=await dbGet('game');if(s)Object.assign(st,s);}catch{} hydrate()}
function save(){dbSet('game',st).catch(()=>{})}
// Tabs
const tabs={tabTimer:'timerCard',tabShop:'shopCard',tabPrestige:'prestigeCard'};for(let id in tabs){document.getElementById(id).onclick=()=>{document.querySelectorAll('.tabbar button').forEach(b=>b.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('main>section').forEach(s=>s.style.display='none');document.getElementById(tabs[id]).style.display='block';noteShop()}};
// Elements
const el={time:$('#time'),pill:$('#modePill'),prog:$('#phaseProg'),phase:$('#phaseLabel'),pts:$('#points'),rate:$('#rate'),stk:$('#streak'),gr:$('#gritBadge'),world:$('#world'),shop:$('#shopList'),shopNote:$('#shopNotice')};
const inp={f:$('#focusLen'),s:$('#breakLen'),l:$('#longLen'),g:$('#roundsLen')};
// Timer
function msFor(m){return (m==='focus'?st.t.f:m==='short'?st.t.s:st.t.l)*60*1000}
function left(){return st.t.e?Math.max(0,st.t.e-now()):0}
function setMode(m){st.t.m=m;el.pill.textContent=(m==='focus'?'Focus':m==='short'?'Break':'Long Break')+' • '+fmt(msFor(m))}
function schedule(ms){st.t.e=now()+ms;st.t.run=true;st.t.last=now();save();pulse()}
function complete(){st.t.run=false;if(st.t.m==='focus'){st.t.d++;st.streak++;setMode(st.t.d%st.t.g==0?'long':'short')}else{setMode('focus')}save();schedule(msFor(st.t.m))}
function upd(){let L=left(),tot=msFor(st.t.m);el.time.textContent=fmt(st.t.run?L:tot);$('#phaseProg').value=Math.max(0,Math.min(1,(tot-L)/tot));el.phase.textContent=(st.t.m==='focus'?'Focus phase':'Break phase')+' • Ends at '+new Date(now()+L).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
// Earnings
function mSt(){return 1+st.streak*(.10+.05*st.up.str)}function mGr(){return 1+.05*st.grit}function mEf(){return 1+.08*st.up.eff}function base(){return 1+1.2*st.up.income}
function rate(){return base()*mEf()*mSt()*mGr()}
function earn(){if(st.t.run&&st.t.m==='focus'){let n=now(),ds=Math.max(0,Math.floor((n-st.t.last)/1000));if(ds>0){st.t.last=n;let earned=rate()*ds;st.points+=earned;floatGain(earned);save()}}else{st.t.last=now()}}
// Shop
const defs=[{k:'income',n:'Income',d:'+1.2 base pts/sec per level',c:50,x:1.25},{k:'eff',n:'Efficiency',d:'+8% total earnings per level',c:250,x:1.35},{k:'str',n:'Streak Engine',d:'+5% per streak step per level',c:500,x:1.42},{k:'vis',n:'Visual Boost',d:'More sparks & juice (cosmetic)',c:150,x:1.35}];
function cost(k,l){let d=defs.find(x=>x.k==k);return Math.floor(d.c*Math.pow(d.x,l))}
function canShop(){return st.t.m!=='focus'}
function buy(k){if(!canShop())return;let l=st.up[k],c=cost(k,l);if(st.points>=c){st.points-=c;st.up[k]=l+1;save();renderShop();hud();gain('-'+c.toLocaleString())}}
function renderShop(){el.shop.innerHTML='';defs.forEach(d=>{let l=st.up[d.k],c=cost(d.k,l),dis=!canShop()||st.points<c;let div=document.createElement('div');div.className='item';div.innerHTML=`<div><h4>${d.n} <span class="small">Lv ${l}</span></h4><div class="small">${d.d}</div><div class="small">Next Cost: <span class="cost">${c.toLocaleString()}</span> pts</div></div><div><button class="btn-primary" data-upg="${d.k}" ${dis?'disabled':''}>Buy</button></div>`;el.shop.appendChild(div)});el.shop.querySelectorAll('button[data-upg]').forEach(b=>b.onclick=()=>buy(b.getAttribute('data-upg')))}
function noteShop(){el.shopNote.textContent=canShop()?'':'Shop is only available during Breaks.'}
// Prestige
function gritGain(x){return Math.floor(x/100000)}function prevPrest(){let g=gritGain(st.points);$('#prestigeInfo').textContent=g>0?`You would gain ${g} Grit (+${g*5}% permanent).`:'Earn 100,000 pts to gain your first Grit.'}
function doPrest(){let g=gritGain(st.points);if(g<=0){$('#prestigeInfo').textContent='Not enough points to convert.';return}st.grit+=g;st.points=0;st.up={income:0,eff:0,str:0,vis:0};st.streak=0;reset();save();hud();renderShop();$('#gritBadge').textContent='Grit: '+st.grit;$('#prestigeInfo').textContent=`Prestiged! New Grit: ${st.grit} (+${st.grit*5}% permanent).`}
// Controls/HUD
function start(){if(!st.t.run){let L=left()||msFor(st.t.m);schedule(L)}}
function pause(){st.t.run=false;save()}
function reset(){st.t.run=false;st.t.d=0;st.streak=0;setMode('focus');st.t.e=null;save()}
function hud(){el.pts.textContent=st.points.toLocaleString(undefined,{maximumFractionDigits:2});el.rate.textContent=rate().toLocaleString(undefined,{maximumFractionDigits:2})+'/s';el.stk.textContent=st.streak;el.gr.textContent='Grit: '+st.grit}
// Visuals
let world=$('#world'),sparks=[];
function spawn(){let g=document.createElement('div');g.className='gain';g.style.left=(world.clientWidth-80)+'px';g.style.top='10px';g.textContent='+ Focus!';world.appendChild(g);setTimeout(()=>g.remove(),1000)}
function floatGain(val){if(!st.t.run||st.t.m!=='focus')return;if(Math.random()<0.2+.05*st.up.vis){let g=document.createElement('div');g.className='gain';g.style.left=(20+Math.random()*(world.clientWidth-40))+'px';g.style.top=(60+Math.random()*60)+'px';g.textContent='+'+Math.max(1,Math.floor(val)).toLocaleString();world.appendChild(g);setTimeout(()=>g.remove(),1200)}}
function gain(txt){let g=document.createElement('div');g.className='gain';g.style.left=(world.clientWidth-90)+'px';g.style.top='20px';g.textContent=txt;world.appendChild(g);setTimeout(()=>g.remove(),1200)}
function pulse(){world.style.boxShadow='0 0 22px #6c8cff66 inset';setTimeout(()=>world.style.boxShadow='none',250)}
// Events
$('#startBtn').onclick=start;$('#pauseBtn').onclick=pause;$('#resetBtn').onclick=reset;
$('#calcPrestige').onclick=prevPrest;$('#doPrest').onclick=doPrest;
['focusLen','breakLen','longLen','roundsLen'].forEach(id=>{let i=document.getElementById(id);i.onchange=()=>{let v=Math.max(1,parseInt(i.value||'1'));if(id==='focusLen')st.t.f=v;if(id==='breakLen')st.t.s=v;if(id==='longLen')st.t.l=v;if(id==='roundsLen')st.t.g=v;save();setMode(st.t.m)}});
// Loop
setInterval(()=>{if(st.t.run&&left()<=0){complete()}else{earn()}upd();hud();save()},1000);
// Init
function hydrate(){document.getElementById('focusLen').value=st.t.f;document.getElementById('breakLen').value=st.t.s;document.getElementById('longLen').value=st.t.l;document.getElementById('roundsLen').value=st.t.g;setMode(st.t.m);upd();hud();renderShop()}
load();
