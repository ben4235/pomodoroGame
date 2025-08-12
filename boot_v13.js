// boot_v13.js  — tiny bootstrap & reset wiring

(function () {
  const $ = (s) => document.querySelector(s);

  // --- tab wiring (safe even if main game binds later) ---
  function show(id) {
    const cards = ["timerCard", "shopCard", "prestigeCard", "settingsCard"];
    const tabs  = ["tabTimer", "tabShop", "tabPrestige", "tabSettings"];
    cards.forEach(c => { const el = $("#" + c); if (el) el.style.display = (c === id ? "" : "none"); });
    tabs.forEach(t => { const el = $("#" + t); if (el) el.classList.toggle("active", ("tab" + id.replace("Card","")) === t); });
  }
  const tabMap = {
    tabTimer:    "timerCard",
    tabShop:     "shopCard",
    tabPrestige: "prestigeCard",
    tabSettings: "settingsCard",
  };
  Object.keys(tabMap).forEach(tid => {
    const b = $("#" + tid);
    if (b) b.addEventListener("click", () => show(tabMap[tid]));
  });

  // default view
  if ($("#timerCard")) show("timerCard");

  // --- hard reset handler (no confirm, per your request) ---
  async function hardReset() {
    // 1) Kill IndexedDB save
    try { indexedDB.deleteDatabase("ff_save_db"); } catch {}

    // 2) Clear localStorage keys we used
    try {
      // If you store specific keys, remove them explicitly; fallback to clear:
      Object.keys(localStorage)
        .filter(k => k.startsWith("ff_") || k.includes("focus-forge"))
        .forEach(k => localStorage.removeItem(k));
    } catch {}

    // 3) Clear service‑worker caches for this app
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(k => k.toLowerCase().includes("focus-forge") || k.toLowerCase().includes("ff_"))
          .map(k => caches.delete(k))
      );
    } catch {}

    // 4) Small delay to let deletions settle, then force a fresh load
    setTimeout(() => {
      // Avoid bfcache: replace() tends to fetch fresh
      location.replace(location.href.split("#")[0]);
    }, 150);
  }

  const resetBtn = $("#resetSave");
  if (resetBtn) resetBtn.addEventListener("click", hardReset);

  // Expose for debugging if needed
  window.__ffHardReset = hardReset;
})();
