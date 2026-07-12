// Farmgate — 1-page PDF export.
// Builds a print-only summary sheet (#print-sheet, styled by css/print.css)
// from the currently loaded crop's data, then triggers the browser's native
// print dialog — the user chooses "Save as PDF" there. No PDF library
// needed; this is a print-layout problem, not a PDF-generation problem.
//
// Depends on: FarmgateApp (state), FarmgateDemandCurve (getCurrentEntries),
// FarmgatePriceTest (getLastResults). All optional/guarded — export still
// works (with fewer sections) if a crop hasn't fully loaded yet, though the
// button should really only be reachable once a crop is loaded since it
// lives inside a hidden sheet.

const FarmgatePdfExport = (function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function fmtMoney(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    const neg = n < 0;
    return (neg ? "-$" : "$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  function fmtMoney2(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    const neg = n < 0;
    return (neg ? "-$" : "$") + Math.abs(n).toFixed(2);
  }
  function fmtNum(n, dp) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    return n.toLocaleString(undefined, { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 2 });
  }

  const CONFIDENCE_LABELS = {
    qld_specific: "QLD-specific",
    east_coast: "East-coast AU",
    australia_general: "Australia general",
    global_estimate: "Global estimate",
  };

  function buildBenchmarkSection(benchmark) {
    if (!benchmark) return "";
    const dateStr = benchmark.last_updated ? new Date(benchmark.last_updated).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "unknown date";
    const confLabel = CONFIDENCE_LABELS[benchmark.confidence] || benchmark.confidence || "Unknown";
    return `
      <div class="print-section">
        <h2>Price Benchmark</h2>
        <div class="print-meta">Looked up ${escapeHtml(dateStr)} &nbsp;·&nbsp; Confidence: ${escapeHtml(confLabel)} &nbsp;·&nbsp; Source: ${escapeHtml(benchmark.source || "unknown")}</div>
        <div class="print-stat-row">
          <div class="print-stat"><span class="print-stat-label">Wholesale low</span><span class="print-stat-value">${fmtMoney2(benchmark.wholesale_low)}/kg</span></div>
          <div class="print-stat"><span class="print-stat-label">Wholesale high</span><span class="print-stat-value">${fmtMoney2(benchmark.wholesale_high)}/kg</span></div>
          <div class="print-stat"><span class="print-stat-label">DTC low</span><span class="print-stat-value">${fmtMoney2(benchmark.dtc_low)}/kg</span></div>
          <div class="print-stat"><span class="print-stat-label">DTC high</span><span class="print-stat-value">${fmtMoney2(benchmark.dtc_high)}/kg</span></div>
        </div>
        <div class="print-reasoning">${escapeHtml(benchmark.reasoning || "(No reasoning provided.)")}</div>
      </div>
    `;
  }

  function buildDemandSection(entries) {
    if (!entries || entries.length === 0) {
      return `
        <div class="print-section">
          <h2>Demand Curve</h2>
          <div class="print-meta">No buyer contacts logged yet.</div>
        </div>
      `;
    }
    const rows = entries
      .map(
        (e) => `
        <tr>
          <td>${escapeHtml(e.buyer_name || "—")}</td>
          <td>${fmtMoney2(Number(e.price))}</td>
          <td>${fmtNum(Number(e.volume_kg_wk))}</td>
          <td>${escapeHtml(e.buyer_type || "—")}</td>
          <td>${escapeHtml((e.evidence_level || "stated").replace(/^\w/, (c) => c.toUpperCase()))}</td>
        </tr>`
      )
      .join("");
    return `
      <div class="print-section">
        <h2>Demand Curve — ${entries.length} contact${entries.length === 1 ? "" : "s"} logged</h2>
        <table>
          <thead><tr><th>Buyer</th><th>Price ($/kg)</th><th>Vol (kg/wk)</th><th>Type</th><th>Evidence</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function buildChartSection() {
    const sourceSvg = $("demandChart");
    if (!sourceSvg || !sourceSvg.innerHTML.trim()) return "";
    // Clone the already-rendered chart SVG (drawn by chart.js) rather than
    // re-implementing chart drawing here — keeps this module simple and
    // guarantees the printed chart always matches what's on screen.
    const clone = sourceSvg.cloneNode(true);
    clone.classList.add("print-chart");
    clone.removeAttribute("id");
    return `
      <div class="print-section">
        <h2>Demand Curve Chart</h2>
        ${clone.outerHTML}
      </div>
    `;
  }

  function buildResultsSection(results) {
    if (!results || !results.priceTest || !results.margin) return "";
    const pt = results.priceTest;
    const m = results.margin;
    return `
      <div class="print-section">
        <h2>Price Test — at ${fmtMoney2(pt.price)}/kg</h2>
        <div class="print-stat-row">
          <div class="print-stat"><span class="print-stat-label">Sellable volume</span><span class="print-stat-value">${fmtNum(pt.vol, 2)} kg/wk</span></div>
          <div class="print-stat"><span class="print-stat-label">Weekly revenue</span><span class="print-stat-value">${fmtMoney(pt.revenue)}</span></div>
          <div class="print-stat"><span class="print-stat-label">Annualised (48wk)</span><span class="print-stat-value">${fmtMoney(pt.revenue * 48)}</span></div>
        </div>
      </div>
      <div class="print-section">
        <h2>Planting Size &amp; Margin</h2>
        <div class="print-stat-row">
          <div class="print-stat"><span class="print-stat-label">Annual demand</span><span class="print-stat-value">${fmtNum(m.annualDemand)} kg</span></div>
          <div class="print-stat"><span class="print-stat-label">Acres required</span><span class="print-stat-value">${fmtNum(m.acresRequired, 2)}</span></div>
          <div class="print-stat"><span class="print-stat-label">Annual revenue</span><span class="print-stat-value">${fmtMoney(m.revenue)}</span></div>
          <div class="print-stat"><span class="print-stat-label">Annual costs</span><span class="print-stat-value">${fmtMoney(m.varCosts + m.fixedCost)}</span></div>
          <div class="print-stat"><span class="print-stat-label">Net margin</span><span class="print-stat-value">${fmtMoney(m.netMargin)}</span></div>
          <div class="print-stat"><span class="print-stat-label">Margin per kg</span><span class="print-stat-value">${fmtMoney2(m.marginPerKg)}</span></div>
        </div>
      </div>
    `;
  }

  function buildPrintSheet() {
    const benchmark = (typeof FarmgateApp !== "undefined") ? FarmgateApp.state.currentBenchmark : null;
    const entries = (typeof FarmgateDemandCurve !== "undefined") ? FarmgateDemandCurve.getCurrentEntries() : [];
    const results = (typeof FarmgatePriceTest !== "undefined") ? FarmgatePriceTest.getLastResults() : null;

    if (!benchmark) {
      return `<div class="print-section"><h1>Farmgate</h1><div class="print-meta">No crop loaded — search for a crop before exporting.</div></div>`;
    }

    const cropTitle = escapeHtml(benchmark.display_name || "Unknown crop");
    const generatedDate = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

    return `
      <h1>${cropTitle} — Crop Economics Summary</h1>
      <div class="print-meta">Generated ${generatedDate} by Farmgate. Prices are AI-researched starting points, not verified market data.</div>
      ${buildBenchmarkSection(benchmark)}
      ${buildDemandSection(entries)}
      ${buildChartSection()}
      ${buildResultsSection(results)}
      <footer>Farmgate — personal crop research tool. See docs/SPEC.md in the project repo for methodology notes.</footer>
    `;
  }

  function exportToPdf() {
    const printSheet = $("print-sheet");
    if (!printSheet) {
      console.error("[FarmgatePdfExport] #print-sheet element not found in DOM.");
      return;
    }
    printSheet.innerHTML = buildPrintSheet();
    // Small delay to let the browser paint the newly injected content
    // (including the cloned SVG) before the print dialog opens.
    setTimeout(() => {
      window.print();
    }, 50);
  }

  function init() {
    const btn = $("exportPdfBtn");
    if (btn) btn.addEventListener("click", exportToPdf);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    exportToPdf,
    // exposed for testing:
    _buildPrintSheet: buildPrintSheet,
  };
})();
