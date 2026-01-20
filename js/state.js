/**
 * Centraliserad tillståndshantering för visualiseringen av verksamhetscykeln
 */

import { RING_NAMES } from './config.js';

/**
 * Skapar initialt tillståndsobjekt
 * @param {Object} options - Inställningar för initialt tillstånd
 * @returns {Object} Tillståndsobjekt
 */
export function createState(options = {}) {
  return {
    // Tillstånd för segmentfilter (vilka kategorier som är aktiva)
    segmentFilters: {
      verksamhet: options.hasVerksamhet ?? true,
      ekonomi: options.hasEkonomi ?? true,
      kvalitet: options.hasKvalitet ?? true
    },

    // Valtillstånd
    clickedMonths: new Set(),
    hoveredMonth: null,
    clickedRings: new Set(),
    hoveredRing: null,
    clickedPeriods: new Set(),
    hoveredPeriod: null,
    hoveredEvent: null,
    clickedEvent: null,
    clickedEventPhase: 0,
    selectionMode: null,  // 'month', 'ring', 'period' eller null

    // Referensdata
    ringNames: RING_NAMES,

    // Tillstånd för hovringscykel
    hoverCycleTimeouts: [],
    currentHoverPhase: 0
  };
}

/**
 * Återställer allt valtillstånd
 * @param {Object} state - Tillståndsobjektet
 */
export function resetSelections(state) {
  state.clickedMonths.clear();
  state.clickedRings.clear();
  state.clickedPeriods.clear();
  state.selectionMode = null;
  state.clickedEvent = null;
  state.clickedEventPhase = 0;
  clearHoverCycle(state);
}

/**
 * Rensar tidsgränser för hovringscykel
 * @param {Object} state - Tillståndsobjektet
 */
export function clearHoverCycle(state) {
  state.hoverCycleTimeouts.forEach(id => clearTimeout(id));
  state.hoverCycleTimeouts = [];
  state.currentHoverPhase = 0;
}

/**
 * Växlar val av månad
 * @param {Object} state - Tillståndsobjektet
 * @param {number} monthIndex - Månadsindex (0-11)
 */
export function toggleMonth(state, monthIndex) {
  state.clickedRings.clear();
  state.clickedPeriods.clear();
  state.selectionMode = 'month';

  if (state.clickedMonths.has(monthIndex)) {
    state.clickedMonths.delete(monthIndex);
  } else {
    state.clickedMonths.add(monthIndex);
  }

  if (state.clickedMonths.size === 0) {
    state.selectionMode = null;
  }
}

/**
 * Växlar val av ring
 * @param {Object} state - Tillståndsobjektet
 * @param {number} ringIndex - Ringindex (0-3)
 */
export function toggleRing(state, ringIndex) {
  state.clickedMonths.clear();
  state.clickedPeriods.clear();
  state.selectionMode = 'ring';

  if (state.clickedRings.has(ringIndex)) {
    state.clickedRings.delete(ringIndex);
  } else {
    state.clickedRings.add(ringIndex);
  }

  if (state.clickedRings.size === 0) {
    state.selectionMode = null;
  }
}

/**
 * Växlar val av period
 * @param {Object} state - Tillståndsobjektet
 * @param {number} periodIndex - Periodindex
 */
export function togglePeriod(state, periodIndex) {
  state.clickedMonths.clear();
  state.clickedRings.clear();
  state.selectionMode = 'period';

  if (state.clickedPeriods.has(periodIndex)) {
    state.clickedPeriods.delete(periodIndex);
  } else {
    state.clickedPeriods.add(periodIndex);
  }

  if (state.clickedPeriods.size === 0) {
    state.selectionMode = null;
  }
}

/**
 * Växlar segmentfilter
 * @param {Object} state - Tillståndsobjektet
 * @param {string} filterId - Filter-ID ('verksamhet', 'ekonomi', 'kvalitet')
 */
export function toggleSegmentFilter(state, filterId) {
  state.segmentFilters[filterId] = !state.segmentFilters[filterId];
}

/**
 * Hämtar aktiva mängder för markering
 * @param {Object} state - Tillståndsobjektet
 * @returns {Object} Aktiva mängder för månader, ringar och perioder
 */
export function getActiveSets(state) {
  const activeMonths = new Set(state.clickedMonths);
  if (state.hoveredMonth !== null) activeMonths.add(state.hoveredMonth);

  const activeRings = new Set(state.clickedRings);
  if (state.hoveredRing !== null) activeRings.add(state.hoveredRing);

  const activePeriods = new Set(state.clickedPeriods);
  if (state.hoveredPeriod !== null) activePeriods.add(state.hoveredPeriod);

  return {
    activeMonths,
    activeRings,
    activePeriods,
    hasMonthActive: activeMonths.size > 0,
    hasRingActive: activeRings.size > 0,
    hasPeriodActive: activePeriods.size > 0,
    hasAnyActive: activeMonths.size > 0 || activeRings.size > 0 || activePeriods.size > 0
  };
}

/**
 * Filtrerar händelser baserat på aktuella segmentfilter
 * @param {Object} state - Tillståndsobjektet
 * @param {Array} allEvents - Alla synliga händelser
 * @returns {Array} Filtrerade händelser
 */
export function getFilteredEvents(state, allEvents) {
  const f = state.segmentFilters;
  return allEvents.filter(ev => {
    const matchVerksamhet = f.verksamhet && ev.verksamhet === true;
    const matchEkonomi = f.ekonomi && ev.ekonomi === true;
    const matchKvalitet = f.kvalitet && ev.kvalitet === true;
    return matchVerksamhet || matchEkonomi || matchKvalitet;
  });
}
