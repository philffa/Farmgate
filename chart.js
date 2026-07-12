// Farmgate — demand curve chart rendering.
// Ported from the single-file prototype's drawChart() function, adapted to
// read the Supabase row shape (price, volume_kg_wk, evidence_level) instead
// of the prototype's in-memory shape (price, vol, evidence).
//
// No dependencies beyond a target <svg> element in the DOM.

const FarmgateChart = (function () {
  "use strict";

  const COLORS = {
    leafDeep: "#42502C",
    ink: "#3D3226",
    inkSoft: "#6B5F4E",
    line: "#D9CFB8",
    rust: "#93412F",
    harvest: "#C17A3D",
  };

  // Visual weight by evidence strength — deliberately carried over unchanged
  // from the prototype: stated (asked) is the weakest/lightest, repeat
  // orders are the strongest/most solid. See docs/SPEC.md for why this
  // matters (revealed preference > stated preference).
  const EVIDENCE_STYLE = {
    stated:   { r: 5,   fill: "none", stroke: COLORS.harvest, sw: 2,   op: 0.85 },
    anchored: { r: 5.5, fill: COLORS.harvest, stroke: COLORS.ink, sw: 1,   op: 0.7 },
    trial:    { r: 7,   fill: COLORS.harvest, stroke: COLORS.ink, sw: 1.2, op: 1 },
    repeat:   { r: 8,   fill: COLORS.leafDeep, stroke: COLORS.ink, sw: 1.4, op: 1 },
  };

  /**
   * Draw the demand curve chart.
   * @param {string} svgElementId - id of the target <svg> element
   * @param {Array}  entries - array of { price, volume_kg_wk, evidence_level }
   * @param {number|null} testPriceLine - if set, draws a horizontal marker line at this price
   */
  function draw(svgElementId, entries, testPriceLine) {
    const svg = document.getElementById(svgElementId);
    if (!svg) return;

    // Accept both the Supabase row shape and simple {price, vol, evidence}
    // for flexibility, but normalize to one internal shape immediately.
    const points = (entries || [])
      .map((d) => ({
        price: Number(d.price) || 0,
        vol: Number(d.volume_kg_wk !== undefined ? d.volume_kg_wk : d.vol) || 0,
        evidence: d.evidence_level || d.evidence || "stated",
      }))
      .filter((d) => d.price > 0 || d.vol > 0);

    const W = 820, H = 340, M = { t: 20, r: 30, b: 50, l: 60 };
    const plotW = W - M.l - M.r, plotH = H - M.t - M.b;

    const maxPrice = Math.max(1, ...points.map((d) => d.price)) * 1.2;
    const maxVol = Math.max(1, ...points.map((d) => d.vol)) * 1.2;

    const x = (vol) => M.l + (vol / maxVol) * plotW;
    const y = (price) => M.t + plotH - (price / maxPrice) * plotH;

    let svgContent = "";

    // Grid lines + axis tick labels
    const gridN = 4;
    for (let i = 0; i <= gridN; i++) {
      const gy = M.t + (plotH / gridN) * i;
      const priceVal = maxPrice - (maxPrice / gridN) * i;
      svgContent += `<line x1="${M.l}" y1="${gy}" x2="${M.l + plotW}" y2="${gy}" stroke="${COLORS.line}" stroke-width="1"/>`;
      svgContent += `<text x="${M.l - 10}" y="${gy + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" fill="${COLORS.inkSoft}">$${priceVal.toFixed(0)}</text>`;
    }
    for (let i = 0; i <= gridN; i++) {
      const gx = M.l + (plotW / gridN) * i;
      const volVal = (maxVol / gridN) * i;
      svgContent += `<line x1="${gx}" y1="${M.t}" x2="${gx}" y2="${M.t + plotH}" stroke="${COLORS.line}" stroke-width="1"/>`;
      svgContent += `<text x="${gx}" y="${M.t + plotH + 22}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="${COLORS.inkSoft}">${volVal.toFixed(0)}</text>`;
    }

    // Axis labels
    svgContent += `<text x="${M.l + plotW / 2}" y="${H - 8}" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="${COLORS.ink}">Volume demanded (kg/week)</text>`;
    svgContent += `<text x="18" y="${M.t + plotH / 2}" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="${COLORS.ink}" transform="rotate(-90 18 ${M.t + plotH / 2})">Price ($/kg)</text>`;

    // Connecting dashed line, sorted by volume, showing the rough demand curve shape
    const sorted = [...points].sort((a, b) => a.vol - b.vol);
    if (sorted.length > 1) {
      const path = "M " + sorted.map((d) => `${x(d.vol)},${y(d.price)}`).join(" L ");
      svgContent += `<path d="${path}" fill="none" stroke="${COLORS.leafDeep}" stroke-width="2" stroke-dasharray="5,4" opacity="0.55"/>`;
    }

    // Data points, styled by evidence strength
    points.forEach((d) => {
      const st = EVIDENCE_STYLE[d.evidence] || EVIDENCE_STYLE.stated;
      svgContent += `<circle cx="${x(d.vol)}" cy="${y(d.price)}" r="${st.r}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.sw}" opacity="${st.op}"/>`;
    });

    // Optional test-price marker line (Part III integration)
    if (typeof testPriceLine === "number" && testPriceLine > 0 && testPriceLine <= maxPrice) {
      const ty = y(testPriceLine);
      svgContent += `<line x1="${M.l}" y1="${ty}" x2="${M.l + plotW}" y2="${ty}" stroke="${COLORS.rust}" stroke-width="1.5" stroke-dasharray="2,3"/>`;
      svgContent += `<text x="${M.l + plotW - 4}" y="${ty - 6}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" fill="${COLORS.rust}">test price</text>`;
    }

    svg.innerHTML = svgContent;
  }

  return { draw };
})();
