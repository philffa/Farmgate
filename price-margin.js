// Farmgate — price test (Part III) and planting/margin (Part IV) calculators.
// Ported from the single-file prototype's renderPriceTest()/renderMargin()
// logic, adapted to read demand entries via FarmgateDemandCurve.getCurrentEntries()
// (Supabase-backed rows: price, volume_kg_wk) instead of the prototype's
// in-memory demandData array (price, vol).
//
// Depends on: FarmgateDemandCurve (js/demand-curve.js), which must load
// before this file.

const FarmgatePriceTest = (function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function statCard(label, value, cls) {
    return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${cls || ""}">${value}</div></div>`;
  }

  function fmt(n, dp) {
    if (!isFinite(n)) return "—";
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp === undefined ? 2 : dp, maximumFractionDigits: dp === undefined ? 2 : dp });
  }
  function fmtInt(n) {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString();
  }
  function fmtMoney(n) {
    if (!isFinite(n)) return "—";
    const neg = n < 0;
    const v = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return (neg ? "-$" : "$") + v;
  }
  function fmtMoney2(n) {
    if (!isFinite(n)) return "—";
    const neg = n < 0;
    return (neg ? "-$" : "$") + Math.abs(n).toFixed(2);
  }

  function getVal(id) {
    const el = $(id);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  // ---------------- Part III: Test a price ----------------

  function renderPriceTest() {
    const priceInput = $("testPrice");
    const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;

    const entries = (typeof FarmgateDemandCurve !== "undefined") ? FarmgateDemandCurve.getCurrentEntries() : [];
    const qualifying = entries.filter((d) => Number(d.price) >= price && Number(d.price) > 0);
    const vol = qualifying.reduce((a, d) => a + (Number(d.volume_kg_wk) || 0), 0);
    const revenue = vol * price;

    const statsEl = $("priceTestStats");
    if (statsEl) {
      statsEl.innerHTML = [
        statCard("Buyers clearing this price", fmtInt(qualifying.length)),
        statCard("Sellable volume (kg/wk)", fmt(vol)),
        statCard("Weekly revenue", fmtMoney(revenue)),
        statCard("Annualised (48 wks)", fmtMoney(revenue * 48)),
      ].join("");
    }

    // Redraw the chart with the current test-price marker line.
    if (typeof FarmgateDemandCurve !== "undefined") {
      FarmgateDemandCurve.redrawChart(price);
    }

    return { vol, revenue, price };
  }

  // ---------------- Part IV: Planting size & margin ----------------

  const SUPPLY_FIELDS = [
    { id: "weeksYear", label: "Weeks of supply per year", note: "Allows for downtime/turnover between plantings", val: 48 },
    { id: "yieldArea", label: "Expected yield per acre per cut", note: "Your unit — kg per acre per harvest cut", val: 3000 },
    { id: "cuts", label: "Cuts obtainable per planting cycle", note: "1 for a single harvest crop, more for cut-and-come-again", val: 3 },
  ];
  const COST_FIELDS = [
    { id: "varCost", label: "Variable cost per kg", note: "Seed, fertiliser, packaging, harvest labour", val: 2.5 },
    { id: "freight", label: "Delivery / freight cost per kg", note: "Your cost to get product to the buyer", val: 0.5 },
    { id: "fixedCost", label: "Fixed annual costs ($)", note: "Irrigation running cost, equipment, insurance — not area-dependent", val: 5000 },
    { id: "plannedArea", label: "Planned plot size (acres)", note: "So you can compare against what's actually required", val: 1 },
  ];

  function renderFieldList(containerId, defs) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = defs
      .map(
        (f) => `
      <div class="field-row">
        <div>
          <span class="field-label">${f.label}</span>
          <span class="field-note">${f.note}</span>
        </div>
        <input type="number" step="0.1" id="${f.id}" value="${f.val}">
      </div>
    `
      )
      .join("");
    defs.forEach((f) => {
      const el = $(f.id);
      if (el) el.addEventListener("input", recalc);
    });
  }

  function renderMargin(priceTestResult) {
    const weeklyVol = priceTestResult.vol;
    const price = priceTestResult.price;
    const weeksYear = getVal("weeksYear");
    const yieldArea = getVal("yieldArea");
    const cuts = getVal("cuts");
    const varCost = getVal("varCost");
    const freight = getVal("freight");
    const fixedCost = getVal("fixedCost");
    const plannedArea = getVal("plannedArea");

    const annualDemand = weeklyVol * weeksYear;
    const yieldPerAcreYear = yieldArea * cuts;
    const acresRequired = yieldPerAcreYear > 0 ? annualDemand / yieldPerAcreYear : 0;
    const revenue = annualDemand * price;
    const varCosts = annualDemand * (varCost + freight);
    const netMargin = revenue - varCosts - fixedCost;
    const marginPerKg = annualDemand > 0 ? netMargin / annualDemand : 0;

    const statsEl = $("marginStats");
    if (statsEl) {
      statsEl.innerHTML = [
        statCard("Annual demand (kg)", fmtInt(annualDemand)),
        statCard("Acres required", fmt(acresRequired)),
        statCard("Annual revenue", fmtMoney(revenue)),
        statCard("Annual costs", fmtMoney(varCosts + fixedCost)),
        statCard("Net margin", fmtMoney(netMargin), netMargin < 0 ? "neg" : ""),
        statCard("Margin per kg", fmtMoney2(marginPerKg), marginPerKg < 0 ? "neg" : ""),
      ].join("");
    }

    const note = $("marginNote");
    if (note) {
      if (plannedArea > 0) {
        const ratio = acresRequired / plannedArea;
        if (ratio < 0.9) {
          note.textContent = `At this price, demand needs about ${fmt(acresRequired)} acres — less than your planned ${fmt(plannedArea, 1)} acres. You may have spare capacity for more buyers, another crop, or a lower price to capture more volume.`;
        } else if (ratio > 1.1) {
          note.textContent = `At this price, demand needs about ${fmt(acresRequired)} acres — more than your planned ${fmt(plannedArea, 1)} acres. Either raise the price above to shed lower-value buyers, or plan for more land.`;
        } else {
          note.textContent = `At this price, required acreage (${fmt(acresRequired)}) roughly matches your planned ${fmt(plannedArea, 1)} acres — a reasonable fit.`;
        }
      } else {
        note.textContent = "Set a planned plot size above to see how required acreage compares.";
      }
    }

    return { annualDemand, acresRequired, revenue, varCosts, fixedCost, netMargin, marginPerKg };
  }

  // ---------------- Recalc entry point ----------------
  // Called whenever anything upstream changes: the test price, any supply/
  // cost field, or the demand curve itself (via FarmgateDemandCurve calling
  // FarmgatePriceTest.recalc() after edits).
  let lastPriceTestResult = null;
  let lastMarginResult = null;

  function recalc() {
    lastPriceTestResult = renderPriceTest();
    lastMarginResult = renderMargin(lastPriceTestResult);
  }

  function getLastResults() {
    return {
      priceTest: lastPriceTestResult,
      margin: lastMarginResult,
    };
  }

  function init() {
    renderFieldList("supplyInputs", SUPPLY_FIELDS);
    renderFieldList("costInputs", COST_FIELDS);

    const priceInput = $("testPrice");
    if (priceInput) priceInput.addEventListener("input", recalc);

    // Run once immediately in case a crop is already loaded (e.g. this
    // script loaded after a search already completed) — harmless no-op
    // (all zeros) if nothing has been searched yet.
    recalc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    recalc,
    getLastResults,
  };
})();
