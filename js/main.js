/**
 * Huvudingång för visualiseringen av verksamhetscykeln
 * Orkestrerar alla moduler och initierar hjulet
 */

import { loadData, getLayoutConfig, RING_MAP, RING_NAMES, RING_DISPLAY_NAMES } from './config.js';
import { createState, getFilteredEvents, resetSelections, clearHoverCycle, getActiveSets } from './state.js';
import {
  setupSvg,
  createLayers,
  createAngleScale,
  createArcGenerators,
  updateCenterText,
  renderGridCircles,
  renderRadialSeparators
} from './svg-setup.js';
import { renderRings, renderWeekRing, renderPeriodRing, renderSegmentButtons } from './rings.js';
import { renderMonths } from './months.js';
import {
  calculateLabelPositions,
  renderEvents,
  createCenterInfoGenerators,
  showCenterContent,
  createCarousel,
  createHoverCycle
} from './events.js';
import { getWeekNumber } from './utils.js';

/**
 * Huvudfunktion för initiering
 */
async function initWheel() {
  // Läs in data och konfiguration
  const { config, typeStyle, allVisibleEvents } = await loadData();
  const layout = getLayoutConfig(config);
  const year = config.year;

  // Skapa tillstånd
  const hasVerksamhet = allVisibleEvents.some(ev => ev.verksamhet === true);
  const hasEkonomi = allVisibleEvents.some(ev => ev.ekonomi === true);
  const hasKvalitet = allVisibleEvents.some(ev => ev.kvalitet === true);
  const state = createState({ hasVerksamhet, hasEkonomi, hasKvalitet });

  // Hämta filtrerade händelser
  let events = getFilteredEvents(state, allVisibleEvents);

  // Initiera SVG
  const { svg, main } = setupSvg(layout);
  const layers = createLayers(main);
  const angleScale = createAngleScale(year);
  const arcs = createArcGenerators(layout);

  // Spårning av karusellpil-klick
  let chevronJustClicked = false;
  function setChevronClicked() {
    chevronJustClicked = true;
  }

  // Hanterare för bakgrundsklick
  svg.on("click", function () {
    if (chevronJustClicked) {
      chevronJustClicked = false;
      return;
    }
    if (state.clickedEvent) {
      carousel.hideCarouselView(updateCenterInfo);
      refreshHighlights();
    }
  });

  // Rita statiska element
  renderGridCircles(layers.gGrid, layout);
  renderRadialSeparators(layers.gGrid, layout, angleScale, year);
  // Initial center text
  updateCenterText(layers.gCenter, config.centerText, layout);

  // Rita ringar
  renderRings(layers.gRingBands, config, layout, angleScale, arcs, state, refreshHighlights);
  renderWeekRing(layers.gWeeks, layers.gLabels, config, layout, angleScale, arcs);
  renderPeriodRing(layers.gPeriodRing, config, layout, angleScale, arcs, state, refreshHighlights);

  // Rita månader
  renderMonths(layers.gMonths, layers.gLabels, config, layout, angleScale, arcs, state, refreshHighlights);

  // Rita segmentknappar
  const { gSegmentButtons, segmentData } = renderSegmentButtons(
    main, config, layout, arcs, state, allVisibleEvents, applyFilter
  );

  // Beräkna händelsepositioner
  const labelR = layout.labelR;
  const labelData = calculateLabelPositions(events, layout, angleScale, labelR);

  // Skapa centerinfo och karusell
  const contentGenerators = createCenterInfoGenerators(layout);
  const startHoverCycle = createHoverCycle(layers.gCenter, layout, state, contentGenerators);

  function updateCenterInfo(ev) {
    const centerLabels = layers.gCenter.selectAll(".center-label");

    if (!ev) {
      clearHoverCycle(state);
      centerLabels.transition().duration(300).style("opacity", 1);
      layers.gCenter.selectAll(".center-info:not(.exiting)")
        .classed("exiting", true)
        .transition().duration(200)
        .style("opacity", 0)
        .remove();
      return;
    }

    centerLabels.transition().duration(200).style("opacity", 0);
    startHoverCycle(ev);
  }

  const carousel = createCarousel(
    layers.gCenter, layout, state, allVisibleEvents, contentGenerators, setChevronClicked
  );

  // Rita händelser
  renderEvents(layers, labelData, typeStyle, config, layout, state, {
    refreshHighlights,
    updateCenterInfo,
    openCarousel: carousel.openCarousel,
    hideCarouselView: () => carousel.hideCarouselView(updateCenterInfo)
  });

  // Uppdateringslogik för markering
  function refreshHighlights() {
    const {
      activeMonths, activeRings, activePeriods,
      hasMonthActive, hasRingActive, hasPeriodActive, hasAnyActive
    } = getActiveSets(state);

    // Uppdatera månadsbågar
    layers.gMonths.selectAll(".month-arc").each(function () {
      const m = +d3.select(this).attr("data-month");
      const isActive = hasMonthActive && activeMonths.has(m);
      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasRingActive && !hasPeriodActive);
    });

    // Uppdatera ringsegment
    layers.gRingBands.selectAll(".ring-segment").each(function () {
      const m = +d3.select(this).attr("data-month");
      const r = +d3.select(this).attr("data-ring");

      let isActive = false;
      if (hasRingActive) {
        isActive = activeRings.has(r);
      } else if (hasMonthActive) {
        isActive = activeMonths.has(m);
      }

      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive);
    });

    // Uppdatera månadsrubriker
    layers.gLabels.selectAll(".label.month").each(function () {
      const m = +d3.select(this).attr("data-month");
      const isActive = hasMonthActive && activeMonths.has(m);
      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasRingActive && !hasPeriodActive);
    });

    // Uppdatera händelsemarkörer
    const activeWeeks = getActiveWeeksFromPeriods(activePeriods, config);
    layers.gMarkers.selectAll(".event-group").each(function () {
      const m = +d3.select(this).attr("data-month");
      const evId = d3.select(this).attr("data-id");
      const ev = events.find(e => e.id === evId);

      let isActive = false;
      if (hasRingActive) {
        for (const ringIdx of activeRings) {
          const ringName = RING_NAMES[ringIdx];
          if (ev && (ev.ring === ringName || ev.ring_2 === ringName)) {
            isActive = true;
            break;
          }
        }
      } else if (hasMonthActive) {
        isActive = activeMonths.has(m);
      } else if (hasPeriodActive && ev) {
        const eventDate = new Date(ev.date);
        const weekNum = getWeekNumber(eventDate);
        isActive = activeWeeks.has(weekNum);
      }

      const isDimmed = hasAnyActive && !isActive;

      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", isDimmed);

      layers.gConnectors.select(`.connector-group[data-id="${evId}"]`)
        .classed("is-active", isActive)
        .classed("is-dimmed", isDimmed);
    });

    // Uppdatera periodsegment
    layers.gPeriodRing.selectAll(".period-segment").each(function (d, i) {
      const isActive = activePeriods.has(i);
      const originalColor = d3.select(this).attr("data-color");
      d3.select(this)
        .attr("fill", originalColor)
        .attr("stroke-width", isActive ? 1.5 : 0.5)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasMonthActive && !hasRingActive);
    });

    // Uppdatera veckosegment
    layers.gWeeks.selectAll(".week-segment").each(function () {
      const title = d3.select(this).select("title").text();
      const weekNum = parseInt(title.replace("Vecka ", ""));
      d3.select(this).classed("is-period-active", activeWeeks.has(weekNum));
    });

    // Uppdatera veckonummer
    layers.gLabels.selectAll(".week-label").each(function () {
      const classAttr = d3.select(this).attr("class") || "";
      const match = classAttr.match(/week-label-(\d+)/);
      if (match) {
        const w = parseInt(match[1]);
        const isCurrent = d3.select(this).classed("is-current");

        if (activeWeeks.has(w)) {
          d3.select(this).style("fill", "hsl(265, 56%, 100%, 1)");
        } else {
          const isWcagMode = document.body.classList.contains('wcag-mode');
          d3.select(this).style("fill", isCurrent ? "#fff" : (isWcagMode ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.55)"));
        }
      }
    });

    // Uppdatera centertext baserat på ringhovring (om inget event är aktivt)
    if (!state.clickedEvent && !state.hoveredEvent) {
      if (state.hoveredRing !== null) {
        const ringName = RING_DISPLAY_NAMES[state.hoveredRing];
        // Använd något mindre storlek (85%) för ringnamnen
        const ringFontSize = layout.centerTextFontSize * 0.85;
        updateCenterText(layers.gCenter, ringName, layout, ringFontSize);
      } else {
        // Återställ standardtext
        updateCenterText(layers.gCenter, config.centerText, layout);
      }
    }
  }

  // Hjälp: hämta aktiva veckor från periodindex
  function getActiveWeeksFromPeriods(activePeriodIndices, config) {
    const activeWeeks = new Set();
    const totalWeeks = (config.year === 2026) ? 53 : 52;
    const dividers = config.periodDividerWeeks;
    const numPeriods = dividers.length;

    activePeriodIndices.forEach(idx => {
      const sw = dividers[idx];
      const ew = dividers[(idx + 1) % numPeriods];
      const wraps = (ew <= sw);

      for (let w = 1; w <= totalWeeks; w++) {
        let isIn = false;
        if (wraps) {
          if (w >= sw || w < ew) isIn = true;
        } else {
          if (w >= sw && w < ew) isIn = true;
        }
        if (isIn) activeWeeks.add(w);
      }
    });

    return activeWeeks;
  }

  // Tillämpa filter
  function applyFilter() {
    state.hoveredEvent = null;
    const filteredEvents = getFilteredEvents(state, allVisibleEvents);

    const setDisplay = function () {
      const evId = d3.select(this).attr("data-id");
      const isVisible = filteredEvents.some(e => e.id === evId);
      d3.select(this).style("display", isVisible ? null : "none");
    };

    layers.gMarkers.selectAll(".event-group").each(setDisplay);
    layers.gLabels.selectAll(".event-label-ext").each(setDisplay);
    layers.gConnectors.selectAll(".connector-group").each(setDisplay);

    // Uppdatera händelsereferens för markeringslogik
    events = filteredEvents;
  }

  // Hanterare för återställningsknappen
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      resetSelections(state);

      // Ta bort allt centerinnehåll direkt (ingen övergångsfördröjning)
      layers.gCenter.selectAll(".center-info").interrupt().remove();
      layers.gCenter.selectAll(".center-info-foreign").interrupt().remove();
      layers.gCenter.selectAll(".carousel-chevron").interrupt().remove();

      // Återställ centeretiketter
      layers.gCenter.selectAll(".center-label").transition().duration(300).style("opacity", 1);

      // Återställ visuellt tillstånd för klickad händelse
      layers.gMarkers.selectAll(".event-group")
        .classed("is-clicked", false)
        .classed("is-active", false)
        .classed("is-dimmed", false);

      refreshHighlights();
    });
  }
}

// Initiera när DOM är redo
document.addEventListener('DOMContentLoaded', initWheel);
