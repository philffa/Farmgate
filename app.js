// Farmgate — main app glue.
// Owns overall app state (current crop, its benchmark, its demand entries)
// and wires the search box to FarmgateDB (Supabase) + GeminiLookup.
//
// Other modules (chart.js, pdf-export.js) read from `FarmgateApp.state` and
// are called from here once data is loaded — they don't fetch data themselves.
//
// Depends on: js/config.js, js/supabase-client.js, js/gemini-lookup.js,
// js/chart.js (Stage 6), js/pdf-export.js (Stage 8).

const FarmgateApp = (function () {
  "use strict";

  // ---------------- App state ----------------
  const state = {
    currentCropName: null,      // normalized key, e.g. "sugar apple"
    currentBenchmark: null,     // row from crop_benchmarks, or null
    currentDemandEntries: [],   // rows from demand_curve_entries
  };

  // ---------------- DOM helpers ----------------
  const $ = (id) => document.getElementById(id);

  function setStatus(message, kind) {
    const el = $("searchStatus");
    el.textContent = message || "";
    el.className = "search-status" + (kind ? " " + kind : "");
  }

  function showSheets(show) {
    ["sheetBenchmark", "sheetDemand", "sheetPriceTest", "sheetMargin"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle("hidden", !show);
    });
  }

  function confidenceLabel(confidence) {
    const labels = {
      qld_specific: "QLD-specific",
      east_coast: "East-coast AU",
      australia_general: "Australia general",
      global_estimate: "Global estimate",
    };
    return labels[confidence] || confidence || "Unknown";
  }

  function daysSince(dateString) {
    if (!dateString) return Infinity;
    const then = new Date(dateString).getTime();
    const now = Date.now();
    return (now - then) / (1000 * 60 * 60 * 24);
  }

  function formatDate(dateString) {
    if (!dateString) return "unknown date";
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ---------------- Benchmark rendering (Part I) ----------------
  function renderBenchmark() {
    const b = state.currentBenchmark;
    if (!b) return;

    $("benchmarkTitle").textContent = `Price benchmark — ${b.display_name}`;

    const staleThresholdDays = (typeof CONFIG !== "undefined" && CONFIG.STALE_AFTER_DAYS) || 180;
    const age = daysSince(b.last_updated);
    const isStale = age > staleThresholdDays;

    const badge = `<span class="confidence-badge ${b.confidence}">${confidenceLabel(b.confidence)}</span>`;
    const dateText = `Looked up ${formatDate(b.last_updated)}${b.source === "manual" ? " (manually entered)" : ""}`;
    const staleText = isStale
      ? ` <span class="stale-flag">— ${Math.round(age)} days old, consider refreshing</span>`
      : "";

    $("benchmarkDateLine").innerHTML = `${badge} &nbsp; ${dateText}${staleText}`;

    const fmt = (n) => (typeof n === "number" ? "$" + n.toFixed(2) : "—");

    $("benchmarkStats").innerHTML = [
      statCard("Wholesale low", fmt(b.wholesale_low)),
      statCard("Wholesale high", fmt(b.wholesale_high)),
      statCard("Direct-to-consumer low", fmt(b.dtc_low)),
      statCard("Direct-to-consumer high", fmt(b.dtc_high)),
    ].join("");

    $("benchmarkReasoning").textContent = b.reasoning || "(No reasoning provided.)";
  }

  function statCard(label, value, cls) {
    return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${cls || ""}">${value}</div></div>`;
  }

  // ---------------- Recent crops chips ----------------
  async function loadRecentCrops() {
    try {
      const recent = await FarmgateDB.listRecentCrops(12);
      const container = $("recentCrops");
      if (!recent || recent.length === 0) {
        container.innerHTML = "";
        return;
      }
      container.innerHTML = recent
        .map((c) => `<span class="recent-crop-chip" data-crop="${c.display_name}">${c.display_name}</span>`)
        .join("");
      container.querySelectorAll(".recent-crop-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          $("cropSearch").value = chip.dataset.crop;
          runSearch(chip.dataset.crop);
        });
      });

      try {
        const count = await FarmgateDB.countCrops();
        $("footerCropCount").textContent = `${count} crop${count === 1 ? "" : "s"} researched so far`;
      } catch (_) {
        // non-critical, ignore
      }
    } catch (err) {
      // Non-critical — recent crops chips are a convenience, not core function.
      console.warn("[FarmgateApp] could not load recent crops:", err.message);
    }
  }

  // ---------------- Search flow ----------------
  async function runSearch(rawName, forceRefresh) {
    const displayInput = (rawName || "").trim();
    if (!displayInput) {
      setStatus("Type a crop name to search.", "error");
      return;
    }

    $("searchBtn").disabled = true;
    setStatus(`Checking saved data for "${displayInput}"…`, "loading");

    try {
      let benchmark = null;
      if (!forceRefresh) {
        benchmark = await FarmgateDB.getBenchmark(displayInput);
      }

      if (benchmark) {
        setStatus(`Found saved data for "${benchmark.display_name}", last looked up ${formatDate(benchmark.last_updated)}.`, "found-cached");
      } else {
        setStatus(`No saved data for "${displayInput}" — asking Gemini for a price benchmark…`, "loading");
        const looked_up = await GeminiLookup.lookupCropPrice(displayInput);
        setStatus(`Saving new benchmark for "${looked_up.display_name}"…`, "loading");
        benchmark = await FarmgateDB.upsertBenchmark(displayInput, looked_up);
        setStatus(`New benchmark saved for "${benchmark.display_name}".`, "found-cached");
      }

      state.currentCropName = FarmgateDB.normalizeCropName(displayInput);
      state.currentBenchmark = benchmark;

      renderBenchmark();

      // Load demand curve entries for this crop.
      state.currentDemandEntries = await FarmgateDB.getDemandEntries(state.currentCropName);
      notifyCropLoaded(state.currentBenchmark, state.currentDemandEntries);

      showSheets(true);
      loadRecentCrops(); // refresh chips/footer count since this may be a newly added crop
    } catch (err) {
      console.error("[FarmgateApp] search failed:", err);
      setStatus(`Error: ${err.message}`, "error");
    } finally {
      $("searchBtn").disabled = false;
    }
  }

  // ---------------- Crop-loaded event listeners ----------------
  // Other modules (demand-curve.js, etc.) register interest here rather
  // than app.js needing to know about them in advance. Cleaner than a
  // single overwritable hook — supports multiple independent listeners.
  const cropLoadedListeners = [];

  function onCropLoaded(callback) {
    if (typeof callback === "function") cropLoadedListeners.push(callback);
  }

  function notifyCropLoaded(benchmark, demandEntries) {
    cropLoadedListeners.forEach((cb) => {
      try {
        cb(benchmark, demandEntries);
      } catch (err) {
        console.error("[FarmgateApp] a crop-loaded listener threw:", err);
      }
    });
  }

  // ---------------- Wiring ----------------
  function init() {
    $("searchBtn").addEventListener("click", () => runSearch($("cropSearch").value));
    $("cropSearch").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSearch($("cropSearch").value);
    });
    $("refreshBenchmarkBtn").addEventListener("click", () => {
      if (state.currentBenchmark) {
        runSearch(state.currentBenchmark.display_name, true);
      }
    });

    loadRecentCrops();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Public API — deliberately exposes state so later-stage modules
  // (chart.js, demand-curve.js, pdf-export.js) can read current crop/
  // benchmark/demand data without this module needing to know about them
  // in advance. Modules that want to react when a new crop finishes
  // loading should call FarmgateApp.onCropLoaded(callback) to subscribe —
  // do not assign to a property directly, multiple listeners are supported.
  return {
    state,
    runSearch,
    renderBenchmark,
    onCropLoaded,
  };
})();
