/* Focus Forge — minimal but complete game_v10.js
   Works with your current index.html IDs.
   Saves to localStorage. No service‑worker changes needed.
*/

(function () {
  // ---- helpers
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => Date.now();
  const fmt = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(t / 60)).padStart(2, "0");
    const s = String(t % 60).padStart(2, "0");
    return `${m}:${s}`;
  };
  const fmtClock = (d) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // ---- elements
  const E = {
    // header badges
    grit: $("#gritBadge"),
    gold: $("#goldBadge"),
    pill: $("#modePill"),
    // timer card
    time: $("#time"),
    pts: $("#points"),
    rate: $("#rate"),
    streak: $("#streak"),
    prog: $("#phaseProg"),
    phase: $("#phaseLabel"),
    world: $("#world"),
    start: $("#startBtn"),
    pause: $("#pauseBtn"),
    reset: $("#resetBtn"),
    inFocus: $("#focusLen"),
    inShort: $("#breakLen"),
    inLong: $("#longLen"),
    inRounds: $("#roundsLen"),
    // tabs & cards
    tabTimer: $("#tabTimer"),
    tabShop: $("#tabShop"),
    tabPrestige: $("#tabPrestige"),
    tabSettings: $("#tabSettings"),
    cardTimer: $("#timerCard"),
    cardShop: $("#shopCard"),
    cardPrestige: $("#prestigeCard"),
    cardSettings: $("#settingsCard"),
  };

  // ---- state (persistent)
  const SAVE_KEY = "ff.save.v10";
  const S = load() || {
    points: 0,
    gold: 0,
    grit: 0,
    streak: 0,
    // pomodoro
    t: {
      mode: "focus", // focus | short | long
      focus: 25,
      short: 5,
      long: 15,
      roundsGoal: 4,
      roundsDone: 0,
      running: false,
      endAt: null,
      remain: 0, // ms when paused
      lastTick: now(),
    },
    // trivial TD state
    td: { wave: 1, lives: 10, earned: 0 },
  };

  // put values into inputs
  E.inFocus.value = S.t.focus;
  E.inShort.value = S.t.short;
  E.inLong.value = S.t.long;
  E.inRounds.value = S.t.roundsGoal;

  // ---- save/load
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    } catch {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ---- UI sync
  function setMode(m) {
    S.t.mode = m;
    const label =
      m === "focus" ? "Focus" : m === "short" ? "Break" : "Long Break";
    E.pill.textContent = `${label} • ${fmt(minutesToMs(mLen(m)))}`;
  }
  function mLen(mode) {
    return mode === "focus"
      ? S.t.focus
      : mode === "short"
      ? S.t.short
      : S.t.long;
  }
  function minutesToMs(min) {
    return Math.max(1, Number(min)) * 60 * 1000;
  }
  function syncBadges() {
    E.grit.textContent = `Grit: ${S.grit}`;
    E.gold.textContent = `Gold: ${S.gold}`;
    E.streak.textContent = S.streak;
    E.pts.textContent = Math.floor(S.points);
  }

  // ---- timer core
  function schedule(ms) {
    S.t.running = true;
    S.t.remain = 0;
    S.t.endAt = now() + ms;
    S.t.lastTick = now();
    save();
    renderTimer(); // immediate
  }
  function leftMs() {
    if (!S.t.running) return S.t.remain || minutesToMs(mLen(S.t.mode));
    return Math.max(0, (S.t.endAt || 0) - now());
  }
  function completePhase() {
    S.t.running = false;
    S.t.remain = 0;
    if (S.t.mode === "focus") {
      S.streak += 1;
      S.points += Math.round(mLen("focus") * 60); // +1/s during focus
      S.t.roundsDone += 1;
      if (S.t.roundsDone >= S.t.roundsGoal) {
        S.t.roundsDone = 0;
        setMode("long");
      } else {
        setMode("short");
      }
    } else {
      // break -> back to focus
      setMode("focus");
    }
    save();
    renderTimer();
  }
  function startTimer() {
    if (S.t.running) return;
    const ms = S.t.remain || minutesToMs(mLen(S.t.mode));
    schedule(ms);
  }
  function pauseTimer() {
    if (!S.t.running) return;
    S.t.remain = leftMs();
    S.t.running = false;
    S.t.endAt = null;
    save();
    renderTimer();
  }
  function resetTimer() {
    S.t.running = false;
    S.t.remain = 0;
    S.t.endAt = null;
    S.t.mode = "focus";
    S.t.roundsDone = 0;
    E.prog.value = 0;
    renderTimer();
    save();
  }

  function renderTimer() {
    const l = leftMs();
    E.time.textContent = fmt(l);
    const total = minutesToMs(mLen(S.t.mode));
    E.prog.value = clamp(1 - l / total, 0, 1);
    const ends =
      S.t.running && S.t.endAt
        ? fmtClock(new Date(S.t.endAt))
        : "--:--";
    const label =
      S.t.mode === "focus" ? "Focus phase" : "Break phase";
    E.phase.textContent = `${label} • Ends at ${ends}`;
    E.rate.textContent = S.t.mode === "focus" ? "1/s" : "0/s";
    E.pill.textContent =
      (S.t.mode === "focus"
        ? "Focus"
        : S.t.mode === "short"
        ? "Break"
        : "Long Break") +
      " • " +
      fmt(total);
    syncBadges();
  }

  // tick once per second
  setInterval(() => {
    if (!S.t.running) return;
    if (leftMs() <= 0) {
      completePhase();
      const ms = minutesToMs(mLen(S.t.mode));
      schedule(ms);
      return;
    }
    // passive income display during focus
    if (S.t.mode === "focus") {
      const dt = (now() - S.t.lastTick) / 1000;
      S.t.lastTick = now();
      S.points += dt; // rate 1/s display only; tally at phase end too
    }
    renderTimer();
    save();
  }, 1000);

  // ---- inputs -> state
  E.inFocus.addEventListener("change", () => {
    S.t.focus = clamp(Number(E.inFocus.value || 25), 1, 240);
    setMode(S.t.mode);
    save();
    renderTimer();
  });
  E.inShort.addEventListener("change", () => {
    S.t.short = clamp(Number(E.inShort.value || 5), 1, 120);
    setMode(S.t.mode);
    save();
    renderTimer();
  });
  E.inLong.addEventListener("change", () => {
    S.t.long = clamp(Number(E.inLong.value || 15), 1, 240);
    setMode(S.t.mode);
    save();
    renderTimer();
  });
  E.inRounds.addEventListener("change", () => {
    S.t.roundsGoal = clamp(Number(E.inRounds.value || 4), 1, 12);
    save();
  });

  // ---- buttons
  E.start.addEventListener("click", startTimer);
  E.pause.addEventListener("click", pauseTimer);
  E.reset.addEventListener("click", resetTimer);

  // ---- tabs
  function show(card) {
    const map = {
      timer: E.cardTimer,
      shop: E.cardShop,
      prest: E.cardPrestige,
      set: E.cardSettings,
    };
    Object.values(map).forEach((n) => n && (n.style.display = "none"));
    card.style.display = "block";
    [E.tabTimer, E.tabShop, E.tabPrestige, E.tabSettings].forEach((b) =>
      b && b.classList.remove("active")
    );
    if (card === E.cardTimer) E.tabTimer.classList.add("active");
    if (card === E.cardShop) E.tabShop.classList.add("active");
    if (card === E.cardPrestige) E.tabPrestige.classList.add("active");
    if (card === E.cardSettings) E.tabSettings.classList.add("active");
  }
  E.tabTimer.addEventListener("click", () => show(E.cardTimer));
  E.tabShop.addEventListener("click", () => show(E.cardShop));
  E.tabPrestige.addEventListener("click", () => show(E.cardPrestige));
  E.tabSettings.addEventListener("click", () => show(E.cardSettings));

  // ---- TD visual (super simple)
  let cvs, ctx, W = 0, H = 0, laneY = 0;
  let enemies = [], bullets = [];
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  function ensureCanvas() {
    if (!cvs) {
      cvs = document.createElement("canvas");
      cvs.id = "tdCanvas";
      E.world.appendChild(cvs);
      ctx = cvs.getContext("2d");
      window.addEventListener("resize", resize);
    }
    resize();
  }
  function resize() {
    const r = E.world.getBoundingClientRect();
    W = Math.max(200, Math.floor(r.width * dpr));
    H = Math.max(120, Math.floor(r.height * dpr));
    cvs.width = W; cvs.height = H;
    cvs.style.width = Math.floor(W / dpr) + "px";
    cvs.style.height = Math.floor(H / dpr) + "px";
    laneY = Math.floor(H * 0.6);
  }

  function spawnEnemy() {
    const hp = 10 + S.td.wave * 3;
    enemies.push({
      x: -20 * dpr, y: laneY, r: 8 * dpr,
      hp, max: hp, speed: (40 + S.td.wave * 2) * dpr
    });
  }
  let spawnAcc = 0, waveT = 0;
  function step(dt) {
    waveT += dt;
    if (waveT > 20) { waveT = 0; S.td.wave++; }

    spawnAcc += dt;
    if (spawnAcc > 1.6) { spawnAcc = 0; spawnEnemy(); }

    // move enemies
    enemies.forEach(e => e.x += e.speed * dt);
    // bullets towards end
    bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; });

    // collisions & cleanup
    bullets.forEach(b => {
      const e = b.target;
      if (!e) b.dead = true;
      else if (Math.hypot(e.x - b.x, e.y - b.y) <= e.r + 2 * dpr) {
        e.hp -= b.dmg; b.dead = true;
        if (e.hp <= 0) { e.dead = true; S.points += 6; S.td.earned += 6; }
      }
    });
    bullets = bullets.filter(b => !b.dead);
    enemies = enemies.filter(e => {
      if (e.dead) return false;
      if (e.x > W + 20 * dpr) { S.td.lives = Math.max(0, S.td.lives - 1); return false; }
      return true;
    });

    // simple shooter from 3 slots
    const slots = [
      { x: Math.floor(W * 0.2), y: Math.floor(H * 0.35), fire: 0 },
      { x: Math.floor(W * 0.5), y: Math.floor(H * 0.35), fire: 0 },
      { x: Math.floor(W * 0.8), y: Math.floor(H * 0.35), fire: 0 },
    ];
    const t = performance.now() / 1000;
    slots.forEach(s => {
      if (s.fire > t) return;
      const target = enemies.find(e => Math.hypot(e.x - s.x, e.y - s.y) < 120 * dpr);
      if (target) {
        s.fire = t + 0.7;
        const dx = target.x - s.x, dy = target.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        bullets.push({
          x: s.x, y: s.y, vx: (dx / d) * 240 * dpr, vy: (dy / d) * 240 * dpr,
          target, dmg: 6
        });
      }
    });

    // draw
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#2a2f4d"; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(0, laneY); ctx.lineTo(W, laneY); ctx.stroke();
    ctx.strokeStyle = "#ff453a";
    ctx.strokeRect(W - 20 * dpr, laneY - 20 * dpr, 20 * dpr, 40 * dpr);
    // enemies
    enemies.forEach(e => {
      ctx.fillStyle = "#ffcc00";
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      const pct = clamp(e.hp / e.max, 0, 1);
      ctx.fillStyle = "#ff453a"; ctx.fillRect(e.x - e.r, e.y - e.r - 6 * dpr, e.r * 2, 3 * dpr);
      ctx.fillStyle = "#34c759"; ctx.fillRect(e.x - e.r, e.y - e.r - 6 * dpr, e.r * 2 * pct, 3 * dpr);
    });
    // bullets
    ctx.fillStyle = "#6c8cff";
    bullets.forEach(b => ctx.fillRect(b.x - 2 * dpr, b.y - 2 * dpr, 4 * dpr, 4 * dpr));
    // slots
    ctx.fillStyle = "#9eaefe";
    slots.forEach(s => ctx.fillRect(s.x - 8 * dpr, s.y - 8 * dpr, 16 * dpr, 16 * dpr));
    // hud
    ctx.fillStyle = "#cfd3ff";
    ctx.font = `${12 * dpr}px -apple-system,system-ui`;
    ctx.fillText(`Wave ${S.td.wave} • Lives ${S.td.lives} • Earned +${S.td.earned}`, 10 * dpr, 16 * dpr);
  }

  // animation loop
  ensureCanvas();
  let last = performance.now() / 1000;
  function loop() {
    const t = performance.now() / 1000;
    const dt = Math.min(0.05, t - last); last = t;
    step(dt);
    requestAnimationFrame(loop);
  }
  loop();

  // initial render
  setMode(S.t.mode);
  renderTimer();
  syncBadges();
  show(E.cardTimer);
})();
