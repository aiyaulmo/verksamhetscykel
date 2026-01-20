/**
 * Händelsemarkörer och interaktionshantering för visualiseringen av verksamhetscykeln
 */

import { RING_MAP } from './config.js';
import { wrapText, wrapTextToLines, getWorkdaysBetween, shapeGenerators } from './utils.js';
import { getRadius } from './svg-setup.js';
import { clearHoverCycle } from './state.js';

/**
 * Beräknar etikettpositioner för händelser
 * @param {Array} events - Lista med händelser
 * @param {Object} layout - Layoutkonfiguration
 * @param {d3.ScaleTime} angleScale - Vinkelskala
 * @param {number} labelR - Etikettradie
 * @returns {Array} Händelser med beräknade positioner
 */
export function calculateLabelPositions(events, layout, angleScale, labelR) {
  const labelData = events.map(ev => {
    const d = new Date(ev.date);
    const a = angleScale(d);

    const ringIdx = (typeof ev.ring === 'string') ? (RING_MAP[ev.ring] ?? 0) : ev.ring;
    let r;

    if (ev.placering === "linje") {
      const ringIdx2 = (typeof ev.ring_2 === 'string') ? (RING_MAP[ev.ring_2] ?? ringIdx) : (ev.ring_2 ?? ringIdx);
      const boundaryIdx = Math.max(ringIdx, ringIdx2);
      const finalLineIdx = (ringIdx === ringIdx2) ? (ringIdx + 1) : boundaryIdx;
      const ringGap = (layout.ringOuter - layout.ringInner) / layout.ringCount;
      r = layout.ringInner + finalLineIdx * ringGap;
    } else {
      r = getRadius(ev.ring, layout, RING_MAP);
    }

    const x = r * Math.cos(a);
    const y = r * Math.sin(a);

    const isLeft = (a >= Math.PI / 2 || a <= -Math.PI / 2);
    const lx = isLeft ? -layout.columnGapLeft : layout.columnGapRight;
    const approxY = labelR * Math.sin(a);

    return { ...ev, a, r, x, y, lx, ly: approxY, isLeft, dateObj: d };
  });

  // Sortera efter Y-position och fördela jämnt
  const leftLabels = labelData.filter(d => d.isLeft).sort((a, b) => a.ly - b.ly);
  const rightLabels = labelData.filter(d => !d.isLeft).sort((a, b) => a.ly - b.ly);

  distributeEvenly(leftLabels, layout.labelVerticalSpacingLeft);
  distributeEvenly(rightLabels, layout.labelVerticalSpacingRight);

  return labelData;
}

/**
 * Fördelar etiketter jämnt längs Y-axeln
 * @param {Array} subset - Lista med etikettdata
 * @param {number} spacing - Vertikalt avstånd
 */
function distributeEvenly(subset, spacing) {
  if (subset.length === 0) return;
  const totalHeight = (subset.length - 1) * spacing;
  const startY = -totalHeight / 2;
  subset.forEach((item, i) => {
    item.ly = startY + i * spacing;
  });
}

/**
 * Beräknar knäckpunkt för kopplingslinje
 * @param {Object} ev - Händelsedata med position
 * @param {number} lineEndX - Linjens slut-X
 * @param {number} lineEndY - Linjens slut-Y
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @returns {{elbowX: number, elbowY: number}}
 */
function calculateElbow(ev, lineEndX, lineEndY, config, layout) {
  const connectorElbowRadius = layout.connectorElbowRadius;

  // Kurvfaktorer per månadsgrupp
  const eventMonth = ev.dateObj.getMonth();
  let connectorCurveFactor;
  if ([0, 11].includes(eventMonth)) {
    connectorCurveFactor = layout.jd_connectorCurveFactor;
  } else if ([2, 3, 8, 9].includes(eventMonth)) {
    connectorCurveFactor = layout.maso_connectorCurveFactor;
  } else if ([1, 4, 7, 10].includes(eventMonth)) {
    connectorCurveFactor = layout.fman_connectorCurveFactor;
  } else {
    connectorCurveFactor = layout.jj_connectorCurveFactor;
  }

  const currentElbowAngle = ev.a;

  // Beräkna skärning med knäckradiecirkeln
  const dx = lineEndX - ev.x;
  const dy = lineEndY - ev.y;
  const a_coef = dx * dx + dy * dy;
  const b_coef = 2 * (ev.x * dx + ev.y * dy);
  const c_coef = ev.x * ev.x + ev.y * ev.y - connectorElbowRadius * connectorElbowRadius;
  const discriminant = b_coef * b_coef - 4 * a_coef * c_coef;

  let straightLineAngle = currentElbowAngle;
  if (discriminant >= 0 && a_coef !== 0) {
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b_coef - sqrtDisc) / (2 * a_coef);
    const t2 = (-b_coef + sqrtDisc) / (2 * a_coef);

    let bestT = null;
    for (const t of [t1, t2]) {
      if (t > 0 && t < 1) {
        bestT = t;
        break;
      }
    }
    if (bestT === null) {
      bestT = (Math.abs(t1 - 0.5) < Math.abs(t2 - 0.5)) ? t1 : t2;
    }

    const intersectX = ev.x + bestT * dx;
    const intersectY = ev.y + bestT * dy;
    straightLineAngle = Math.atan2(intersectY, intersectX);
  }

  // Interpolera vinkel
  let angleDiff = currentElbowAngle - straightLineAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  const interpolatedAngle = straightLineAngle + angleDiff * connectorCurveFactor;

  return {
    elbowX: connectorElbowRadius * Math.cos(interpolatedAngle),
    elbowY: connectorElbowRadius * Math.sin(interpolatedAngle)
  };
}

/**
 * Ritar händelsemarkörer och etiketter
 * @param {Object} layers - SVG-lagergrupper
 * @param {Array} labelData - Beräknade etikettpositioner
 * @param {Object} typeStyle - Stilmappar per typ
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @param {Object} state - Applikationens tillstånd
 * @param {Object} callbacks - Återanropsfunktioner
 * @returns {Array} Renderade händelser
 */
export function renderEvents(layers, labelData, typeStyle, config, layout, state, callbacks) {
  const { gMarkers, gConnectors, gCenter } = layers;
  const { refreshHighlights, updateCenterInfo, openCarousel, hideCarouselView } = callbacks;

  labelData.forEach((ev) => {
    const style = typeStyle[ev.type] || { fill: "white", shape: "circle" };

    const eventGroup = gMarkers.append("g")
      .attr("class", "event-group")
      .attr("data-id", ev.id)
      .attr("data-month", ev.dateObj.getMonth())
      .attr("role", "button")
      .attr("aria-label", `${ev.label} - ${ev.date}`);

    eventGroup.append("title")
      .text(`${ev.label}\n${ev.date}`);

    // Etikettext
    const textX = ev.lx;
    const textY = ev.ly;
    const padding = 12;

    const labelText = eventGroup.append("text")
      .attr("x", textX)
      .attr("y", textY)
      .attr("class", "event-label-ext")
      .attr("text-anchor", "start")
      .attr("dominant-baseline", "middle")
      .style("fill", layout.eventLabelColor)
      .style("font-size", `${layout.eventLabelFontSize}px`)
      .text(ev.label)
      .call(wrapText, layout.labelWrapWidth);

    const bbox = labelText.node().getBBox();
    const textWidth = bbox.width;

    // Slutpunkter för kopplingslinje
    const lineEndX = ev.isLeft ? (ev.lx + textWidth + padding) : (ev.lx - padding);
    const lineEndY = ev.ly;

    const { elbowX, elbowY } = calculateElbow(ev, lineEndX, lineEndY, config, layout);
    const polylinePath = `M ${ev.x},${ev.y} L ${elbowX},${elbowY} L ${lineEndX},${lineEndY}`;

    // Kopplingsgrupp
    const connectorGroup = gConnectors.append("g")
      .attr("class", "connector-group")
      .attr("data-id", ev.id);

    // Vit kontur
    connectorGroup.append("path")
      .attr("d", polylinePath)
      .attr("class", "connector-halo")
      .attr("stroke", "#fff")
      .attr("stroke-width", layout.connectorLineWidth + 4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .attr("opacity", 0);

    // Kopplingslinje
    connectorGroup.append("path")
      .attr("d", polylinePath)
      .attr("class", "connector-line")
      .attr("data-stroke", style.fill)
      .attr("stroke", style.fill)
      .attr("stroke-width", layout.connectorLineWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .attr("opacity", 0.6);

    // Markör
    const marker = eventGroup.append("g")
      .attr("class", "marker-wrap")
      .attr("transform", `translate(${ev.x}, ${ev.y})`);

    marker.append("path")
      .attr("d", shapeGenerators[style.shape || "circle"](layout.markerBaseSize))
      .attr("fill", style.fill)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Träffyta
    eventGroup.append("rect")
      .attr("x", ev.lx - 10)
      .attr("y", bbox.y - 5)
      .attr("width", layout.labelWrapWidth + 20)
      .attr("height", bbox.height + 10)
      .attr("fill", "transparent")
      .attr("class", "label-hit-area");

    // Händelseinteraktioner
    eventGroup
      .on("mouseover", function () {
        if (state.clickedEvent) return;

        state.hoveredEvent = ev.id;
        updateCenterInfo(ev);

        gMarkers.selectAll(".event-group").classed("is-dimmed", true);
        d3.select(this).classed("is-dimmed", false).classed("is-active", true);

        const connector = gConnectors.select(`.connector-group[data-id="${ev.id}"]`);
        connector.select(".connector-halo")
          .attr("opacity", 0.8)
          .attr("stroke-width", (layout.connectorLineWidth * 1.5) + 2);
        connector.select(".connector-line")
          .attr("stroke-dasharray", "0")
          .attr("opacity", 1)
          .attr("stroke-width", layout.connectorLineWidth * 1.5);

        marker.transition().duration(200)
          .attr("transform", `translate(${ev.x}, ${ev.y}) scale(${layout.markerHoverScale})`);

        labelText.transition().duration(200)
          .style("font-size", `${layout.eventLabelHoverFontSize}px`);
      })
      .on("mouseout", function () {
        if (state.clickedEvent) return;

        state.hoveredEvent = null;
        updateCenterInfo(null);

        const connector = gConnectors.select(`.connector-group[data-id="${ev.id}"]`);
        connector.select(".connector-halo").attr("opacity", 0);
        connector.select(".connector-line")
          .attr("opacity", 0.6)
          .attr("stroke-width", layout.connectorLineWidth);

        marker.transition().duration(200)
          .attr("transform", `translate(${ev.x}, ${ev.y}) scale(1)`);

        labelText.transition().duration(200)
          .style("font-size", `${layout.eventLabelFontSize}px`);

        refreshHighlights();
      })
      .on("click", function (event) {
        event.stopPropagation();

        if (state.clickedEvent === ev.id) {
          hideCarouselView();
          refreshHighlights();
          return;
        }

        if (state.clickedEvent) {
          gMarkers.selectAll(".event-group").classed("is-clicked", false);
        }

        state.clickedEvent = ev.id;
        state.clickedEventPhase = 0;

        d3.select(this).classed("is-clicked", true);
        openCarousel(ev);

        gMarkers.selectAll(".event-group").classed("is-dimmed", true);
        d3.select(this).classed("is-dimmed", false).classed("is-active", true);
      });
  });

  return labelData;
}

/**
 * Skapar innehållsgeneratorer för centerinfo
 * @param {Object} layout - Layoutkonfiguration
 * @returns {Object} Innehållsgeneratorer
 */
export function createCenterInfoGenerators(layout) {
  function getMaxCharsForWidth(fontSize) {
    const avgCharWidth = fontSize * 0.55;
    return Math.floor(layout.hoverInfoWidth / avgCharWidth);
  }

  return {
    getInitialContent(ev) {
      const dateStr = ev.dateObj.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
      const weekNum = d3.timeFormat("%V")(ev.dateObj);
      const weekday = ev.dateObj.toLocaleDateString('sv-SE', { weekday: 'long' });
      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(ev.dateObj);
      targetDate.setHours(0, 0, 0, 0);

      let daysText = "";
      if (targetDate < today) {
        daysText = "Passerad";
      } else if (targetDate.getTime() === today.getTime()) {
        daysText = "Idag";
      } else {
        const workdays = getWorkdaysBetween(today, targetDate);
        daysText = `${workdays} arbetsdagar kvar`;
      }

      return [
        { text: dateStr.toUpperCase(), fontSize: `${layout.hoverInfoInitialDateFontSize}px`, fontWeight: "600", letterSpacing: "0.05em", fill: "#666" },
        { text: `Vecka ${weekNum} • ${capitalizedWeekday}`, fontSize: `${layout.hoverInfoInitialWeekFontSize}px`, fontWeight: "500", fill: "#555" },
        { text: daysText, fontSize: `${layout.hoverInfoInitialDaysFontSize}px`, fontWeight: "700", fill: "#555" }
      ];
    },

    getDescriptionContent(ev) {
      const desc = ev.description || ev.label || "";
      const maxChars = getMaxCharsForWidth(layout.hoverInfoDescriptionTextFontSize);
      const lines = wrapTextToLines(desc, maxChars);

      return [
        { text: "Styrningsunderlag", fontSize: `${layout.hoverInfoDescriptionTitleFontSize}px`, fontWeight: "600", fill: "#666" },
        ...lines.map(line => ({
          text: line,
          fontSize: `${layout.hoverInfoDescriptionTextFontSize}px`,
          fontWeight: "400",
          fill: "#444"
        }))
      ];
    },

    getResponsibleContent(ev) {
      const resp = ev.responsible || "";
      if (!resp) {
        return [{ text: "Ingen ansvarig angiven", fontSize: `${layout.hoverInfoResponsibleTextFontSize}px`, fontWeight: "400", fill: "#888" }];
      }

      const maxChars = getMaxCharsForWidth(layout.hoverInfoResponsibleTextFontSize);
      const lines = wrapTextToLines(resp, maxChars);

      return [
        { text: "Ansvar", fontSize: `${layout.hoverInfoResponsibleTitleFontSize}px`, fontWeight: "600", fill: "#666" },
        ...lines.map(line => ({
          text: line,
          fontSize: `${layout.hoverInfoResponsibleTextFontSize}px`,
          fontWeight: "400",
          fill: "#444"
        }))
      ];
    }
  };
}

/**
 * Visar innehåll i centerområdet
 * @param {d3.Selection} gCenter - Centergrupp
 * @param {Array} content - Innehållsrader
 * @param {Object} options - Visningsalternativ
 * @param {Object} layout - Layoutkonfiguration
 */
export function showCenterContent(gCenter, content, options, layout) {
  const { isScrollable = false, textAlign = 'center' } = options;

  // Ta bort befintlig info
  gCenter.selectAll(".center-info:not(.exiting)")
    .classed("exiting", true)
    .transition().duration(400)
    .style("opacity", 0)
    .remove();

  gCenter.selectAll(".center-info-foreign:not(.exiting)")
    .classed("exiting", true)
    .transition().duration(400)
    .style("opacity", 0)
    .remove();

  if (isScrollable) {
    const foreignObject = gCenter.append("foreignObject")
      .attr("class", "center-info-foreign")
      .attr("x", -layout.hoverInfoWidth / 2)
      .attr("y", -layout.hoverInfoMaxHeight / 2)
      .attr("width", layout.hoverInfoWidth)
      .attr("height", layout.hoverInfoMaxHeight)
      .style("opacity", 0);

    const div = foreignObject.append("xhtml:div")
      .attr("lang", "sv")
      .style("width", "100%")
      .style("height", "100%")
      .style("overflow-y", "auto")
      .style("overflow-x", "hidden")
      .style("font-family", "'Fira Sans', sans-serif")
      .style("direction", "rtl")
      .style("scrollbar-width", layout.hoverInfoScrollbarWidth)
      .style("scrollbar-color", `${layout.hoverInfoScrollbarColor} transparent`);

    const innerDiv = div.append("xhtml:div")
      .style("direction", "ltr")
      .style("text-align", textAlign)
      .style("hyphens", "auto")
      .style("-webkit-hyphens", "auto")
      .style("word-break", "break-word")
      .style("padding-left", `${layout.hoverInfoScrollbarPadding}px`);

    content.forEach((line, i) => {
      innerDiv.append("xhtml:div")
        .style("font-size", line.fontSize)
        .style("font-weight", line.fontWeight || "400")
        .style("color", line.fill || "#444")
        .style("line-height", layout.hoverInfoLineHeight)
        .style("margin-bottom", i < content.length - 1 ? "2px" : "0")
        .text(line.text);
    });

    foreignObject.transition().duration(500).style("opacity", 1);
  } else {
    const defaultLineHeight = 1.4;
    const totalLines = content.length;
    const blockHeight = (totalLines - 1) * defaultLineHeight;
    const startY = -blockHeight / 2;

    const infoGroup = gCenter.append("text")
      .attr("class", "center-info")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("y", 0)
      .style("opacity", 0);

    content.forEach((line, i) => {
      const yOffset = startY + (i * defaultLineHeight);
      infoGroup.append("tspan")
        .attr("x", 0)
        .attr("dy", i === 0 ? `${yOffset}em` : `${defaultLineHeight}em`)
        .style("font-size", line.fontSize || "14px")
        .style("font-weight", line.fontWeight || "500")
        .style("fill", line.fill || "#555")
        .style("letter-spacing", line.letterSpacing || "0")
        .text(line.text);
    });

    infoGroup.transition().duration(500).style("opacity", 1);
  }
}

/**
 * Skapar karusellnavigering
 * @param {d3.Selection} gCenter - Centergrupp
 * @param {Object} layout - Layoutkonfiguration
 * @param {Object} state - Applikationens tillstånd
 * @param {Array} allVisibleEvents - Alla synliga händelser
 * @param {Object} contentGenerators - Innehållsgeneratorer
 * @param {Function} setChevronClicked - Sättare för karusellpil-klickflagga
 * @returns {Object} Karusellens kontrollfunktioner
 */
export function createCarousel(gCenter, layout, state, allVisibleEvents, contentGenerators, setChevronClicked) {
  const carouselChevronOffset = layout.hoverInfoWidth / 2 + 20;

  function updateCarouselContent(ev, phase) {
    clearHoverCycle(state);

    let content;
    let options = { isScrollable: false };

    switch (phase) {
      case 0:
        content = contentGenerators.getInitialContent(ev);
        options = { isScrollable: false };
        break;
      case 1:
        content = contentGenerators.getDescriptionContent(ev);
        options = { isScrollable: true, textAlign: 'left' };
        break;
      case 2:
        content = contentGenerators.getResponsibleContent(ev);
        options = { isScrollable: true, textAlign: 'left' };
        break;
    }

    showCenterContent(gCenter, content, options, layout);
  }

  function showCarouselChevrons() {
    gCenter.selectAll(".carousel-chevron").remove();

    const chevronColor = "hsl(265, 56%, 50%)";
    const chevronHoverColor = "hsl(265, 56%, 25%)";

    // Vänsterpil
    const leftChevron = gCenter.append("g")
      .attr("class", "carousel-chevron carousel-chevron-left")
      .attr("transform", `translate(${-carouselChevronOffset}, 0)`)
      .style("cursor", "pointer")
      .style("opacity", 0);

    leftChevron.append("rect")
      .attr("x", -15).attr("y", -15)
      .attr("width", 30).attr("height", 30)
      .attr("fill", "transparent");

    leftChevron.append("path")
      .attr("d", `M5,-10 L-5,0 L5,10`)
      .attr("fill", "none")
      .attr("stroke", chevronColor)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    leftChevron
      .on("mouseover", function () {
        d3.select(this).select("path").attr("stroke", chevronHoverColor).attr("stroke-width", 4);
      })
      .on("mouseout", function () {
        d3.select(this).select("path").attr("stroke", chevronColor).attr("stroke-width", 3);
      })
      .on("click", function (event) {
        event.stopPropagation();
        setChevronClicked();
        navigateCarousel(-1);
      });

    // Högerpil
    const rightChevron = gCenter.append("g")
      .attr("class", "carousel-chevron carousel-chevron-right")
      .attr("transform", `translate(${carouselChevronOffset}, 0)`)
      .style("cursor", "pointer")
      .style("opacity", 0);

    rightChevron.append("rect")
      .attr("x", -15).attr("y", -15)
      .attr("width", 30).attr("height", 30)
      .attr("fill", "transparent");

    rightChevron.append("path")
      .attr("d", `M-5,-10 L5,0 L-5,10`)
      .attr("fill", "none")
      .attr("stroke", chevronColor)
      .attr("stroke-width", 3)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round");

    rightChevron
      .on("mouseover", function () {
        d3.select(this).select("path").attr("stroke", chevronHoverColor).attr("stroke-width", 4);
      })
      .on("mouseout", function () {
        d3.select(this).select("path").attr("stroke", chevronColor).attr("stroke-width", 3);
      })
      .on("click", function (event) {
        event.stopPropagation();
        setChevronClicked();
        navigateCarousel(1);
      });

    gCenter.selectAll(".carousel-chevron")
      .transition().duration(300)
      .style("opacity", 1);
  }

  function navigateCarousel(direction) {
    if (!state.clickedEvent) return;

    const ev = allVisibleEvents.find(e => e.id === state.clickedEvent);
    if (!ev) return;

    state.clickedEventPhase = (state.clickedEventPhase + direction + 3) % 3;
    updateCarouselContent(ev, state.clickedEventPhase);
  }

  function openCarousel(ev) {
    updateCarouselContent(ev, 0);
    showCarouselChevrons();
  }

  function hideCarouselView(updateCenterInfo) {
    state.clickedEvent = null;
    state.clickedEventPhase = 0;

    gCenter.selectAll(".carousel-chevron")
      .transition().duration(200)
      .style("opacity", 0)
      .remove();

    updateCenterInfo(null);
  }

  return {
    openCarousel,
    hideCarouselView,
    navigateCarousel,
    updateCarouselContent
  };
}

/**
 * Skapar hovringscykelanimation
 * @param {d3.Selection} gCenter - Centergrupp
 * @param {Object} layout - Layoutkonfiguration
 * @param {Object} state - Applikationens tillstånd
 * @param {Object} contentGenerators - Innehållsgeneratorer
 * @returns {Function} Startfunktion för hovringscykeln
 */
export function createHoverCycle(gCenter, layout, state, contentGenerators) {
  return function startHoverCycle(ev) {
    clearHoverCycle(state);

    showCenterContent(gCenter, contentGenerators.getInitialContent(ev), { isScrollable: false }, layout);
    state.currentHoverPhase = 0;

    const t1 = setTimeout(() => {
      if (state.hoveredEvent === ev.id) {
        showCenterContent(gCenter, contentGenerators.getDescriptionContent(ev), { isScrollable: true, textAlign: 'left' }, layout);
        state.currentHoverPhase = 1;
      }
    }, 2500);
    state.hoverCycleTimeouts.push(t1);

    const t2 = setTimeout(() => {
      if (state.hoveredEvent === ev.id) {
        showCenterContent(gCenter, contentGenerators.getResponsibleContent(ev), { isScrollable: true, textAlign: 'left' }, layout);
        state.currentHoverPhase = 2;
      }
    }, 6000);
    state.hoverCycleTimeouts.push(t2);

    const t3 = setTimeout(() => {
      if (state.hoveredEvent === ev.id) {
        startHoverCycle(ev);
      }
    }, 9000);
    state.hoverCycleTimeouts.push(t3);
  };
}
