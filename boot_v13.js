// Debug banner + safe tab binding so we can see JS is alive
(function(){
  function banner(msg, bg){
    const b=document.createElement('div');
    b.textContent=msg;
    b.style.cssText=`position:fixed;left:8px;right:8px;bottom:8px;
      background:${bg||'#262b48'};color:#fff;padding:8px 10px;border-radius:10px;
      font:12px -apple-system,system-ui;z-index:9999;opacity:.95`;
    document.body.appendChild(b); setTimeout(()=>b.remove(),1800);
  }
  window.addEventListener('error', e=>banner('JS error: '+(e.message||e), '#ff3b30'));

  document.addEventListener('DOMContentLoaded', ()=>{
    banner('Boot v13 loaded');

    const cards = {
      timer: document.getElementById('timerCard'),
      shop: document.getElementById('shopCard'),
      prest: document.getElementById('prestigeCard'),
      set: document.getElementById('settingsCard'),
    };
    const tabs = {
      timer: document.getElementById('tabTimer'),
      shop: document.getElementById('tabShop'),
      prest: document.getElementById('tabPrestige'),
      set: document.getElementById('tabSettings'),
    };

    function show(which){
      if(!cards.timer) return;
      Object.values(cards).forEach(c=> c && (c.style.display='none'));
      Object.values(tabs).forEach(t=> t && t.classList && t.classList.remove('active'));
      const map={timer:'timer',shop:'shop',prest:'prest',set:'set'};
      const key=map[which];
      cards[key] && (cards[key].style.display='block');
      tabs[key] && tabs[key].classList.add('active');
    }

    // If main game JS already bound these, adding another listener is OK.
    tabs.timer && tabs.timer.addEventListener('click', ()=>show('timer'));
    tabs.shop && tabs.shop.addEventListener('click',  ()=>show('shop'));
    tabs.prest && tabs.prest.addEventListener('click', ()=>show('prest'));
    tabs.set  && tabs.set.addEventListener('click',   ()=>show('set'));

    // start/pause/reset probes — won’t interfere with real handlers
    const s=document.getElementById('startBtn');
    const p=document.getElementById('pauseBtn');
    const r=document.getElementById('resetBtn');
    s && s.addEventListener('click', ()=>banner('start clicked'));
    p && p.addEventListener('click', ()=>banner('pause clicked'));
    r && r.addEventListener('click', ()=>banner('reset clicked'));

    // default view
    show('timer');
  });
})();
