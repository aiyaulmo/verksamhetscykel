/**
 * SVG-uppsättning och lagerhantering för visualiseringen av verksamhetscykeln
 */

import { MONTHS_LIST } from './config.js';

/**
 * Skapar och konfigurerar huvud-SVG
 * @param {Object} layout - Layoutkonfiguration
 * @returns {Object} SVG-uppsättning med elementreferenser och skalor
 */
export function setupSvg(layout) {
  const svg = d3.select("#wheel");
  const W = layout.canvasWidth;
  const H = layout.canvasHeight;
  const cx = W / 2 + layout.centerOffsetX;
  const cy = H / 2 + layout.centerOffsetY;

  svg.attr("viewBox", `0 0 ${W} ${H}`);

  // Huvudgrupp centrerad på hjulet
  const main = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);

  return {
    svg,
    main,
    width: W,
    height: H,
    centerX: cx,
    centerY: cy
  };
}

/**
 * Skapar SVG-lager i korrekt z-ordning
 * @param {d3.Selection} main - Huvudgrupp för SVG
 * @returns {Object} Referenser till alla lagergrupper
 */
export function createLayers(main) {
  return {
    gRingBands: main.append("g").attr("class", "ring-bands"),
    gWeeks: main.append("g").attr("class", "weeks"),
    gMonths: main.append("g").attr("class", "months"),
    gGrid: main.append("g").attr("class", "grid"),
    gPeriodRing: main.append("g").attr("class", "period-ring"),
    gConnectors: main.append("g").attr("class", "connectors"),
    gCenter: main.append("g").attr("class", "center-content"),
    gMarkers: main.append("g").attr("class", "markers"),
    gLabels: main.append("g").attr("class", "labels")
  };
}

/**
 * Skapar tid-till-vinkel-skalan
 * @param {number} year - Året för visualiseringen
 * @returns {d3.ScaleTime} D3 tidsskala
 */
export function createAngleScale(year) {
  const startYear = new Date(year, 0, 1);
  const endYear = new Date(year + 1, 0, 1);

  return d3.scaleTime()
    .domain([startYear, endYear])
    .range([-Math.PI / 2, 3 * Math.PI / 2]);
}

/**
 * Skapar båggeneratorer för olika ringtyper
 * @param {Object} layout - Layoutkonfiguration
 * @returns {Object} Båggeneratorfunktioner
 */
export function createArcGenerators(layout) {
  const ringGap = (layout.ringOuter - layout.ringInner) / layout.ringCount;
  const weekRingCenter = (layout.ringOuter + layout.monthBandR0) / 2;
  const weekBandR0 = weekRingCenter - layout.weekRingThickness / 2;
  const weekBandR1 = weekRingCenter + layout.weekRingThickness / 2;

  return {
    ringArc: d3.arc(),

    weekArc: d3.arc()
      .innerRadius(weekBandR0)
      .outerRadius(weekBandR1),

    monthArc: d3.arc()
      .innerRadius(layout.monthBandR0)
      .outerRadius(layout.monthBandR1),

    periodArc: d3.arc()
      .innerRadius(layout.periodRingR0)
      .outerRadius(layout.periodRingR1),

    segmentButtonArc: d3.arc()
      .innerRadius(layout.segmentButtonInnerRadius)
      .outerRadius(layout.segmentButtonOuterRadius)
      .cornerRadius(layout.segmentButtonCornerRadius),

    // Beräknade värden
    ringGap,
    weekBandR0,
    weekBandR1
  };
}

/**
 * Ritar centertexten
 * @param {d3.Selection} gCenter - Centergrupp
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 */
/**
 * Uppdaterar centertexten
 * @param {d3.Selection} gCenter - Centergrupp
 * @param {string} text - Text att visa
 * @param {Object} layout - Layoutkonfiguration
 * @param {number} [fontSize] - Valfri teckenstorlek (använder layout.centerTextFontSize om ej angivet)
 */
export function updateCenterText(gCenter, text, layout, fontSize = null) {
  // Kontrollera om texten redan visas (för att undvika onödig omritning)
  // Vi gör en enkel kontroll på första raden om den finns
  const selection = gCenter.select(".center-label");
  const currentFirstLine = selection.empty() ? "" : selection.text();

  // Rensa alltid för att vara säker på korrekt layout om vi inte har avancerad diffning
  gCenter.selectAll(".center-label").remove();

  if (!text) return;

  let lines;
  // Hantera " & " för kompatibilitet med standardtexten (t.ex. "Vision & Strategi")
  // Om texten innehåller explicit radbrytning \n använder vi det
  if (text.includes("\n")) {
    lines = text.split("\n");
  } else if (text.includes(" & ")) {
    // För gamla "Vision & Strategi"-formatet
    const parts = text.split(" & ");
    lines = parts.map((p, i) => i < parts.length - 1 ? p + " &" : p);
  } else {
    lines = [text];
  }

  const fs = fontSize || layout.centerTextFontSize;
  const lineHeight = layout.centerTextLineHeight;

  const totalHeight = (lines.length - 1) * lineHeight;
  const startY = (-totalHeight / 2) + layout.centerTextOffsetY;

  lines.forEach((line, i) => {
    gCenter.append("text")
      .attr("y", startY + i * lineHeight)
      .attr("text-anchor", "middle")
      .attr("class", "center-label")
      .style("font-size", `${fs}px`)
      .style("fill", layout.centerTextColor)
      .style("font-weight", layout.centerTextFontWeight || "700")
      .style("font-family", layout.centerTextFontFamily || "var(--font-display)")
      .text(line);
  });
}

/**
 * Ritar rutnätscirklar
 * @param {d3.Selection} gGrid - Rutnätsgrupp
 * @param {Object} layout - Layoutkonfiguration
 */
export function renderGridCircles(gGrid, layout) {
  const ringGap = (layout.ringOuter - layout.ringInner) / layout.ringCount;

  for (let i = 0; i <= layout.ringCount; i++) {
    const r = layout.ringInner + i * ringGap;
    gGrid.append("circle")
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", layout.gridLineWidth);
  }
}

/**
 * Ritar radiella skiljelinjer för månader
 * @param {d3.Selection} gGrid - Rutnätsgrupp
 * @param {Object} layout - Layoutkonfiguration
 * @param {d3.ScaleTime} angleScale - Vinkelskala
 * @param {number} year - Året
 */
export function renderRadialSeparators(gGrid, layout, angleScale, year) {
  MONTHS_LIST.forEach((_, i) => {
    const d0 = new Date(year, i, 1);
    const a = angleScale(d0);

    gGrid.append("line")
      .attr("x1", layout.ringInner * Math.cos(a))
      .attr("y1", layout.ringInner * Math.sin(a))
      .attr("x2", layout.monthBandR1 * Math.cos(a))
      .attr("y2", layout.monthBandR1 * Math.sin(a))
      .attr("stroke", "rgba(255,255,255,1.0)")
      .attr("stroke-width", layout.gridLineWidth);
  });
}

/**
 * Hämtar radien för en specifik ring
 * @param {string|number} ring - Ringidentifierare
 * @param {Object} layout - Layoutkonfiguration
 * @param {Object} ringMap - Mappning från ringnamn till index
 * @returns {number} Radievärde
 */
export function getRadius(ring, layout, ringMap) {
  const ringGap = (layout.ringOuter - layout.ringInner) / layout.ringCount;

  if (ring === "manad") {
    return (layout.monthBandR0 + layout.monthBandR1) / 2;
  }

  const ringIdx = (typeof ring === 'string') ? (ringMap[ring] ?? 0) : ring;
  return layout.ringInner + ringIdx * ringGap + ringGap / 2;
}
