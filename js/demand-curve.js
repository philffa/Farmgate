// Farmgate — demand curve builder.
// Renders the buyer/demand table (#demandRows), handles add/edit/delete with
// immediate persistence to Supabase, shows a sync-status indicator, and
// triggers a chart redraw after every change.
//
// Depends on: FarmgateApp (js/app.js, for state + the onCropLoaded hook),
// FarmgateDB (js/supabase-client.js), FarmgateChart (js/chart.js).

const FarmgateDemandCurve = (function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const EVIDENCE_OPTIONS = [
    { value: "stated", label: "Stated (asked)" },
    { value: "anchored", label: "Anchored to substitute" },
    { value: "trial", label: "Trial order placed" },
    { value: "repeat", label: "Repeat / standing order" },
  ];

  let currentEntries = []; // local mirror of FarmgateApp.state.currentDemandEntries
  let currentCropName = null;

  function setSyncStatus(message, kind) {
    const el = $("demandSyncIndicator");
    if (!el) return;
    el.textContent = message || "";
    el.className = "sync-indicator" + (kind ? " " + kind : "");
  }

  function statCard(label, value, cls) {
    return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${cls || ""}">${value}</div></div>`;
  }

  function fmt(n, dp) {
    if (!isFinite(n)) return "—";
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp || 2, maximumFractionDigits: dp || 2 });
  }

  // ---------------- Rendering ----------------

  function renderTable() {
    const tbody = $("demandRows");
    if (!tbody) return;

    tbody.innerHTML = currentEntries
      .map((row, i) => {
        const evidenceOptionsHtml = EVIDENCE_OPTIONS.map(
          (opt) => `<option value="${opt.value}" ${row.evidence_level === opt.value ? "selected" : ""}>${opt.label}</option>`
        ).join("");

        return `
        <tr data-idx="${i}">
          <td><input type="text" data-f="buyer_name" value="${escapeAttr(row.buyer_name || "")}"></td>
          <td data-label="Price $/kg"><input type="number" step="0.1" data-f="price" value="${row.price ?? ""}"></td>
          <td data-label="Vol kg/wk"><input type="number" step="0.1" data-f="volume_kg_wk" value="${row.volume_kg_wk ?? ""}"></td>
          <td data-label="Type"><input type="text" data-f="buyer_type" value="${escapeAttr(row.buyer_type || "")}"></td>
          <td data-label="Evidence"><select class="commit-select" data-f="evidence_level">${evidenceOptionsHtml}</select></td>
          <td><button class="row-del" data-idx="${i}" title="Remove row">✕</button></td>
        </tr>`;
      })
      .join("");

    // Wire input/select change handlers
    tbody.querySelectorAll("tr").forEach((tr) => {
      const idx = Number(tr.dataset.idx);
      tr.querySelectorAll("input, select").forEach((el) => {
        const eventName = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(eventName, () => handleFieldChange(idx, el.dataset.f, el.value, el));
      });
    });
    tbody.querySelectorAll(".row-del").forEach((btn) => {
      btn.addEventListener("click", () => handleDeleteRow(Number(btn.dataset.idx)));
    });
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderStats() {
    const valid = currentEntries.filter((d) => Number(d.price) > 0);
    const n = valid.length;
    const avgPrice = n ? valid.reduce((a, d) => a + Number(d.price), 0) / n : 0;
    const totalVol = valid.reduce((a, d) => a + (Number(d.volume_kg_wk) || 0), 0);
    const maxP = n ? Math.max(...valid.map((d) => Number(d.price))) : 0;
    const minP = n ? Math.min(...valid.map((d) => Number(d.price))) : 0;

    $("demandStats").innerHTML = [
      statCard("Contacts logged", n),
      statCard("Avg price ($/kg)", "$" + fmt(avgPrice)),
      statCard("Total wkly volume (kg)", fmt(totalVol)),
      statCard("Price range ($/kg)", n ? "$" + fmt(minP) + " – $" + fmt(maxP) : "—"),
    ].join("");
  }

  function redrawChart(testPriceLine) {
    FarmgateChart.draw("demandChart", currentEntries, testPriceLine);
  }

  function renderAll() {
    renderTable();
    renderStats();
    redrawChart(getTestPriceValue());
    // Let Part III (price test) know the demand data changed, if that
    // module has registered itself. Loosely coupled via a global hook
    // rather than a hard dependency, since Stage 7 may not exist yet
    // when this file first loads.
    if (typeof FarmgatePriceTest !== "undefined" && typeof FarmgatePriceTest.recalc === "function") {
      FarmgatePriceTest.recalc();
    }
  }

  function getTestPriceValue() {
    const el = $("testPrice");
    return el ? parseFloat(el.value) || 0 : 0;
  }

  // ---------------- Field editing + persistence ----------------

  async function handleFieldChange(idx, field, rawValue, inputEl) {
    const row = currentEntries[idx];
    if (!row) return;

    const isNumeric = field === "price" || field === "volume_kg_wk";
    const value = isNumeric ? parseFloat(rawValue) || 0 : rawValue;
    row[field] = value;

    // Re-render stats/chart immediately for responsiveness, even before the
    // save round-trip completes.
    renderStats();
    redrawChart(getTestPriceValue());
    if (typeof FarmgatePriceTest !== "undefined" && typeof FarmgatePriceTest.recalc === "function") {
      FarmgatePriceTest.recalc();
    }

    setSyncStatus("Saving…", "saving");
    try {
      if (row.id) {
        await FarmgateDB.updateDemandEntry(row.id, { [field]: value });
      } else {
        // Row doesn't exist in the DB yet (e.g. field changed before any
        // save happened) — insert it now.
        const saved = await FarmgateDB.insertDemandEntry(currentCropName, {
          buyer_name: row.buyer_name || "",
          price: row.price || 0,
          volume_kg_wk: row.volume_kg_wk || 0,
          buyer_type: row.buyer_type || "",
          evidence_level: row.evidence_level || "stated",
        });
        row.id = saved.id;
      }
      setSyncStatus("Saved.", "saved");
    } catch (err) {
      console.error("[FarmgateDemandCurve] save failed:", err);
      setSyncStatus("Save failed: " + err.message, "error");
    }
  }

  async function handleAddRow() {
    const newRow = {
      buyer_name: "New buyer",
      price: 0,
      volume_kg_wk: 0,
      buyer_type: "Restaurant",
      evidence_level: "stated",
    };
    currentEntries.push(newRow);
    renderAll();

    setSyncStatus("Saving…", "saving");
    try {
      const saved = await FarmgateDB.insertDemandEntry(currentCropName, newRow);
      newRow.id = saved.id;
      setSyncStatus("Saved.", "saved");
    } catch (err) {
      console.error("[FarmgateDemandCurve] insert failed:", err);
      setSyncStatus("Save failed: " + err.message, "error");
    }
  }

  async function handleDeleteRow(idx) {
    const row = currentEntries[idx];
    if (!row) return;
    currentEntries.splice(idx, 1);
    renderAll();

    if (row.id) {
      setSyncStatus("Deleting…", "saving");
      try {
        await FarmgateDB.deleteDemandEntry(row.id);
        setSyncStatus("Deleted.", "saved");
      } catch (err) {
        console.error("[FarmgateDemandCurve] delete failed:", err);
        setSyncStatus("Delete failed: " + err.message, "error");
      }
    }
  }

  // ---------------- Init / crop-loaded hook ----------------

  function onNewCropLoaded(benchmark, demandEntries) {
    currentCropName = FarmgateDB.normalizeCropName(benchmark.crop_name || benchmark.display_name);
    currentEntries = (demandEntries || []).map((r) => Object.assign({}, r)); // shallow copy, don't mutate app state directly
    setSyncStatus("", "");
    renderAll();
  }

  function init() {
    const addBtn = $("addDemandRow");
    if (addBtn) addBtn.addEventListener("click", handleAddRow);

    if (typeof FarmgateApp !== "undefined" && typeof FarmgateApp.onCropLoaded === "function") {
      FarmgateApp.onCropLoaded(onNewCropLoaded);
    } else {
      console.error("[FarmgateDemandCurve] FarmgateApp not found — check script load order in index.html (app.js must load before this file). Falling back to a delayed retry.");
      // Defensive fallback: retry shortly in case of a load-order issue.
      setTimeout(init, 50);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    // Exposed for Stage 7 (price test) to read current entries without
    // needing its own Supabase round-trip.
    getCurrentEntries: () => currentEntries,
    redrawChart,
  };
})();
