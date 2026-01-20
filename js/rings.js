/**
 * Ringritning för visualiseringen av verksamhetscykeln
 * Hanterar bakgrundsringar, veckoring och periodring
 */

import { MONTHS_LIST } from './config.js';
import { getIsoWeekRange } from './utils.js';
import { toggleRing, togglePeriod } from './state.js';

/**
 * Ritar bakgrundssegment för ringarna
 * @param {d3.Selection} gRingBands - Grupp för ringband
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @param {d3.ScaleTime} angleScale - Vinkelskala
 * @param {Object} arcs - Båggeneratorer
 * @param {Object} state - Applikationens tillstånd
 * @param {Function} refreshHighlights - Återanrop för markeringar
 */
export function renderRings(gRingBands, config, layout, angleScale, arcs, state, refreshHighlights) {
  const year = config.year;
  const ringColors = config.ringColors;

  for (let i = 0; i < layout.ringCount; i++) {
    const r0 = layout.ringInner + i * arcs.ringGap;
    const r1 = layout.ringInner + (i + 1) * arcs.ringGap;

    MONTHS_LIST.forEach((_, mIdx) => {
      const d0 = new Date(year, mIdx, 1);
      const d1 = new Date(year, mIdx + 1, 1);
      const startA = angleScale(d0) + Math.PI / 2;
      const endA = angleScale(d1) + Math.PI / 2;

      const ringSegment = gRingBands.append("path")
        .attr("d", arcs.ringArc({
          innerRadius: r0 + 1,
          outerRadius: r1 - 1,
          startAngle: startA,
          endAngle: endA
        }))
        .attr("fill", ringColors[i] || "rgba(200,200,200,0.1)")
        .attr("class", "ring-segment")
        .attr("data-month", mIdx)
        .attr("data-ring", i);

      ringSegment.append("title")
        .text(`${state.ringNames[i].replace(/_/g, ' ')} - ${MONTHS_LIST[mIdx]}`);

      ringSegment
        .on("mouseover", () => {
          state.hoveredRing = i;
          refreshHighlights();
        })
        .on("mouseout", () => {
          state.hoveredRing = null;
          refreshHighlights();
        })
        .on("click", () => {
          toggleRing(state, i);
          refreshHighlights();
        });
    });
  }
}

/**
 * Ritar veckoringen
 * @param {d3.Selection} gWeeks - Grupp för veckor
 * @param {d3.Selection} gLabels - Grupp för etiketter
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @param {d3.ScaleTime} angleScale - Vinkelskala
 * @param {Object} arcs - Båggeneratorer
 */
export function renderWeekRing(gWeeks, gLabels, config, layout, angleScale, arcs) {
  const year = config.year;
  const now = new Date();
  const currentWeek = d3.timeFormat("%V")(now);
  const isCurrentYear = now.getFullYear() === year;

  // 2026 har 53 veckor (startar på en torsdag)
  const totalWeeks = (year === 2026) ? 53 : 52;

  for (let w = 1; w <= totalWeeks; w++) {
    const { start: startW, end: endW } = getIsoWeekRange(year, w);

    if (startW > endW) continue;

    const startA = angleScale(startW) + Math.PI / 2;
    const endWPlus1 = new Date(endW);
    endWPlus1.setDate(endW.getDate() + 1);
    endWPlus1.setHours(0, 0, 0, 0);
    const endA = angleScale(endWPlus1) + Math.PI / 2;

    const isCurrent = isCurrentYear && +currentWeek === w;

    // Veckosegment
    gWeeks.append("path")
      .attr("d", arcs.weekArc({ startAngle: startA, endAngle: endA }))
      .attr("class", `week-segment ${isCurrent ? 'is-current' : ''}`)
      .attr("fill", isCurrent ? layout.currentWeekColor : layout.weekRingColor)
      .attr("stroke", layout.weekSeparatorColor)
      .attr("stroke-width", layout.weekSeparatorWidth)
      .append("title")
      .text(`Vecka ${w}`);

    // Veckonummeretikett
    const midA = (startA + endA) / 2 - Math.PI / 2;
    const tx = ((arcs.weekBandR0 + arcs.weekBandR1) / 2) * Math.cos(midA);
    const ty = ((arcs.weekBandR0 + arcs.weekBandR1) / 2) * Math.sin(midA);

    gLabels.append("text")
      .attr("x", tx)
      .attr("y", ty)
      .attr("class", `week-label week-label-${w}${isCurrent ? ' is-current' : ''}`)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", `${layout.weekLabelFontSize}px`)
      .style("fill", isCurrent ? "#fff" : "rgba(0,0,0,0.55)")
      .style("font-weight", "700")
      .style("pointer-events", "none")
      .text(w);
  }
}

/**
 * Ritar periodsegment i periodringen
 * @param {d3.Selection} gPeriodRing - Grupp för periodring
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @param {d3.ScaleTime} angleScale - Vinkelskala
 * @param {Object} arcs - Båggeneratorer
 * @param {Object} state - Applikationens tillstånd
 * @param {Function} refreshHighlights - Återanrop för markeringar
 */
export function renderPeriodRing(gPeriodRing, config, layout, angleScale, arcs, state, refreshHighlights) {
  const year = config.year;
  const periodDividerWeeks = config.periodDividerWeeks;
  const periodColors = config.periodColors;
  const numPeriods = periodDividerWeeks.length;

  for (let t = 0; t < numPeriods; t++) {
    const startWeek = periodDividerWeeks[t];
    const endWeek = periodDividerWeeks[(t + 1) % numPeriods];

    const startDate = getIsoWeekRange(year, startWeek).start;
    const endDate = getIsoWeekRange(year, endWeek).start;

    let startAngle = angleScale(startDate) + Math.PI / 2;
    let endAngle = angleScale(endDate) + Math.PI / 2;

    // Hantera varvning över årsskiftet
    if (endWeek <= startWeek) {
      endAngle += 2 * Math.PI;
    }

    const periodColor = periodColors[t] ?? layout.monthRingColor;

    gPeriodRing.append("path")
      .attr("d", arcs.periodArc({ startAngle, endAngle }))
      .attr("class", "period-segment")
      .attr("fill", periodColor)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .attr("data-start-week", startWeek)
      .attr("data-end-week", endWeek)
      .attr("data-wraps", endWeek <= startWeek ? "true" : "false")
      .attr("data-color", periodColor)
      .style("cursor", "pointer")
      .on("mouseover", function () {
        state.hoveredPeriod = t;
        refreshHighlights();
      })
      .on("mouseout", function () {
        state.hoveredPeriod = null;
        refreshHighlights();
      })
      .on("click", function () {
        togglePeriod(state, t);
        refreshHighlights();
      });
  }
}

/**
 * Ritar segmentfilterknappar (verksamhet, ekonomi, kvalitet)
 * @param {d3.Selection} main - Huvudgrupp för SVG
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @param {Object} arcs - Båggeneratorer
 * @param {Object} state - Applikationens tillstånd
 * @param {Array} allVisibleEvents - Alla synliga händelser
 * @param {Function} applyFilter - Återanrop för att tillämpa filter
 */
export function renderSegmentButtons(main, config, layout, arcs, state, allVisibleEvents, applyFilter) {
  const btnColors = config.segmentButtonsColors;

  // Kontrollera tillgänglighet baserat på data
  const hasVerksamhet = allVisibleEvents.some(ev => ev.verksamhet === true);
  const hasEkonomi = allVisibleEvents.some(ev => ev.ekonomi === true);
  const hasKvalitet = allVisibleEvents.some(ev => ev.kvalitet === true);

  const gapRad = 2 * Math.PI / 180;
  const sectorSize = 20 * Math.PI / 180;

  const segmentData = [
    {
      id: 'verksamhet',
      label: 'Verksamhet',
      startAngle: -1.5 * sectorSize + gapRad / 2,
      endAngle: -0.5 * sectorSize - gapRad / 2,
      color: btnColors.verksamhet,
      activeColor: layout.segmentButtonActiveColor,
      disabled: !hasVerksamhet
    },
    {
      id: 'ekonomi',
      label: 'Ekonomi',
      startAngle: -0.5 * sectorSize + gapRad / 2,
      endAngle: 0.5 * sectorSize - gapRad / 2,
      color: btnColors.ekonomi,
      activeColor: layout.segmentButtonActiveColor,
      disabled: !hasEkonomi
    },
    {
      id: 'kvalitet',
      label: 'Kvalitét',
      startAngle: 0.5 * sectorSize + gapRad / 2,
      endAngle: 1.5 * sectorSize - gapRad / 2,
      color: btnColors.kvalitet,
      activeColor: layout.segmentButtonActiveColor,
      disabled: !hasKvalitet
    }
  ];

  const gSegmentButtons = main.append("g").attr("class", "segment-buttons");

  // Initiera segmentfilter baserat på datatillgänglighet
  state.segmentFilters = {
    verksamhet: hasVerksamhet,
    ekonomi: hasEkonomi,
    kvalitet: hasKvalitet
  };

  segmentData.forEach(btn => {
    const isActive = state.segmentFilters[btn.id];

    const group = gSegmentButtons.append("g")
      .attr("class", "segment-btn-group")
      .attr("data-id", btn.id)
      .style("cursor", btn.disabled ? "not-allowed" : "pointer")
      .style("opacity", btn.disabled ? 0.3 : 1);

    group.append("path")
      .attr("d", arcs.segmentButtonArc({ startAngle: btn.startAngle, endAngle: btn.endAngle }))
      .attr("class", "segment-btn-bg")
      .attr("fill", isActive ? btn.activeColor : btn.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", layout.segmentButtonStrokeWidth);

    const midAngle = (btn.startAngle + btn.endAngle) / 2;
    const rLabel = (layout.segmentButtonInnerRadius + layout.segmentButtonOuterRadius) / 2;
    const tx = rLabel * Math.sin(midAngle);
    const ty = -rLabel * Math.cos(midAngle);
    const rotateDeg = midAngle * 180 / Math.PI;

    group.append("text")
      .attr("x", tx)
      .attr("y", ty)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("transform", `rotate(${rotateDeg}, ${tx}, ${ty})`)
      .style("font-size", `${layout.segmentButtonFontSize}px`)
      .style("font-weight", "bold")
      .style("fill", isActive ? layout.segmentButtonActiveTextColor : layout.segmentButtonTextColor)
      .style("pointer-events", "none")
      .text(btn.label);

    group.on("click", function (event) {
      event.stopPropagation();
      if (btn.disabled) return;

      state.segmentFilters[btn.id] = !state.segmentFilters[btn.id];
      applyFilter();
      updateSegmentButtonsVisuals(gSegmentButtons, segmentData, state, layout);
    });
  });

  return { gSegmentButtons, segmentData };
}

/**
 * Uppdaterar segmentknapparnas utseende baserat på tillstånd
 * @param {d3.Selection} gSegmentButtons - Grupp för segmentknappar
 * @param {Array} segmentData - Data för segmentknappar
 * @param {Object} state - Applikationens tillstånd
 * @param {Object} layout - Layoutkonfiguration
 */
export function updateSegmentButtonsVisuals(gSegmentButtons, segmentData, state, layout) {
  gSegmentButtons.selectAll(".segment-btn-group").each(function () {
    const grp = d3.select(this);
    const id = grp.attr("data-id");
    const isActive = state.segmentFilters[id];
    const btnDef = segmentData.find(b => b.id === id);

    grp.select("path")
      .transition().duration(200)
      .attr("fill", isActive ? btnDef.activeColor : btnDef.color);

    grp.select("text")
      .style("fill", isActive ? layout.segmentButtonActiveTextColor : layout.segmentButtonTextColor);
  });
}
