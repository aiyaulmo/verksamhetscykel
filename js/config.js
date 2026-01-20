/**
 * Konfigurationshantering för visualiseringen av verksamhetscykeln
 */

export const DATA_PATH = 'web-data/2026/events.json';

export const DEFAULT_SEGMENT_BUTTONS_COLORS = {
  verksamhet: "rgba(100, 100, 100, 0.2)",
  ekonomi: "rgba(100, 100, 100, 0.2)",
  kvalitet: "rgba(100, 100, 100, 0.2)"
};

export const DEFAULT_RING_COLORS = [
  "rgba(34, 18, 77, 0.9)",
  "rgba(62, 36, 118, 0.8)",
  "rgba(88, 62, 144, 0.6)",
  "rgba(128, 107, 184, 0.4)"
];

/**
 * Ringnamnsmappning (index till namn)
 */
export const RING_NAMES = [
  "langtidsplanering",
  "planering",
  "genomforande_och_uppfoljning",
  "uppfoljning_och_analys"
];

/**
 * Visningsnamn för ringar i mitten (med radbrytningar)
 */
export const RING_DISPLAY_NAMES = [
  "Långtids-\nplanering",
  "Planering",
  "Genomförande &\nuppföljning",
  "Uppföljning &\nanalys"
];

/**
 * Ringnamn till index
 */
export const RING_MAP = {
  "langtidsplanering": 0,
  "planering": 1,
  "genomforande_och_uppfoljning": 2,
  "uppfoljning_och_analys": 3,
  "manad": 4
};

/**
 * Svenska månadsnamn
 */
export const MONTHS_LIST = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

/**
 * Normaliserar konfiguration genom att slå ihop med standardvärden
 * @param {Object} rawConfig - Rå konfiguration från JSON
 * @returns {Object} Normaliserad konfiguration
 */
export function normalizeConfig(rawConfig = {}) {
  const config = { ...rawConfig };

  config.segmentButtonsColors = {
    ...DEFAULT_SEGMENT_BUTTONS_COLORS,
    ...(rawConfig.segmentButtonsColors ?? {})
  };

  config.ringColors = rawConfig.ringColors ?? DEFAULT_RING_COLORS;
  config.periodDividerWeeks = rawConfig.periodDividerWeeks ?? [];
  config.periodColors = rawConfig.periodColors ?? [];
  config.ui = rawConfig.ui ?? {};
  config.ui.cssVars = rawConfig.ui?.cssVars ?? {};

  return config;
}

/**
 * Applicerar CSS-variabler från konfigurationen till dokumentets rot
 * @param {Object} cssVars - Objekt med CSS-variabler
 */
export function applyCssVars(cssVars) {
  if (!cssVars || typeof cssVars !== 'object') {
    return;
  }

  const root = document.documentElement;
  Object.entries(cssVars).forEach(([key, value]) => {
    if (!key || !key.startsWith('--') || value == null) {
      return;
    }
    root.style.setProperty(key, String(value));
  });
}

/**
 * Läser in och normaliserar data från JSON-fil
 * @returns {Promise<{config: Object, events: Array, typeStyle: Object, allVisibleEvents: Array}>}
 * @throws {Error} Om data inte kan laddas
 */
export async function loadData() {
  try {
    const response = await fetch(DATA_PATH);

    if (!response.ok) {
      throw new Error(`HTTP-fel! status: ${response.status}`);
    }

    const data = await response.json();
    const config = normalizeConfig(data.config);
    const allVisibleEvents = data.events.filter(ev => ev.visible === true);

    applyCssVars(config.ui.cssVars);

    return {
      config,
      events: data.events,
      typeStyle: data.typeStyle,
      allVisibleEvents
    };
  } catch (error) {
    console.error('Misslyckades att ladda visualiseringsdata:', error);

    // Visa användarvänligt fel
    const container = document.querySelector('.wheel-container') || document.body;
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #721c24; background: #f8d7da; border-radius: 8px; margin: 2rem;">
        <h2>Kunde inte ladda data</h2>
        <p>Kontrollera att filen <code>${DATA_PATH}</code> finns och är korrekt formaterad.</p>
        <p style="font-size: 0.875rem; color: #666;">${error.message}</p>
      </div>
    `;

    throw error;
  }
}

/**
 * Hämtar layoutkonfiguration med standardvärden
 * @param {Object} config - Konfigurationsobjektet
 * @returns {Object} Layoutvärden
 */
export function getLayoutConfig(config) {
  return {
    // Rityta
    canvasWidth: config.canvasWidth ?? 1800,
    canvasHeight: config.canvasHeight ?? 1800,
    centerOffsetX: config.centerOffsetX ?? 0,
    centerOffsetY: config.centerOffsetY ?? 0,

    // Ringar
    ringInner: config.ringInner ?? 120,
    ringOuter: config.ringOuter ?? 380,
    ringCount: config.ringCount ?? 4,

    // Månadsband
    monthBandR0: config.monthBandR0 ?? 400,
    monthBandR1: config.monthBandR1 ?? 420,

    // Etiketter
    outerLabelR: config.outerLabelR ?? 450,
    labelR: config.labelR ?? 540,
    labelWrapWidth: config.labelWrapWidth ?? 240,

    // Markörer
    markerBaseSize: config.markerBaseSize ?? 12,
    markerHoverScale: config.markerHoverScale ?? 1.4,

    // Teckenstorlekar
    eventLabelFontSize: config.eventLabelFontSize ?? 14,
    eventLabelHoverFontSize: config.eventLabelHoverFontSize ?? 16,
    weekLabelFontSize: config.weekLabelFontSize ?? 7,
    monthLabelFontSize: config.monthLabelFontSize ?? 10,
    centerTextFontSize: config.centerTextFontSize ?? 36,

    // Stilar
    gridLineWidth: config.gridLineWidth ?? 1,
    connectorLineWidth: config.connectorLineWidth ?? 1,
    currentWeekColor: config.currentWeekColor ?? "#4B2582",
    monthRingColor: config.monthRingColor ?? "rgba(108, 92, 231, 0.05)",
    weekRingColor: config.weekRingColor ?? "rgba(0,0,0,0.05)",
    weekSeparatorWidth: config.weekSeparatorWidth ?? 0.5,
    weekSeparatorColor: config.weekSeparatorColor ?? "#fff",
    eventLabelColor: config.eventLabelColor ?? "#1a1a2e",
    monthLabelColor: config.monthLabelColor ?? "#1a1a2e",
    monthLabelTextTransform: config.monthLabelTextTransform ?? "uppercase",
    centerTextColor: config.centerTextColor ?? "var(--ink)",

    // Veckoring
    weekRingThickness: config.weekRingThickness ?? 16,

    // Periodring
    periodRingR0: config.periodRingR0 ?? 352,
    periodRingR1: config.periodRingR1 ?? 358,

    // Segmentknappar
    segmentButtonInnerRadius: config.segmentButtonInnerRadius ?? 365,
    segmentButtonOuterRadius: config.segmentButtonOuterRadius ?? 395,
    segmentButtonCornerRadius: config.segmentButtonCornerRadius ?? 3,
    segmentButtonFontSize: config.segmentButtonFontSize ?? 9,
    segmentButtonStrokeWidth: config.segmentButtonStrokeWidth ?? 1,
    segmentButtonActiveColor: config.segmentButtonActiveColor ?? "#4B2582",
    segmentButtonTextColor: config.segmentButtonTextColor ?? "#333",
    segmentButtonActiveTextColor: config.segmentButtonActiveTextColor ?? "#fff",

    // Kopplingslinjer
    connectorElbowRadius: config.connectorElbowRadius ?? 480,

    // Kolumnlayout
    columnGapLeft: config.columnGapLeft ?? 750,
    columnGapRight: config.columnGapRight ?? 550,
    labelVerticalSpacingLeft: config.labelVerticalSpacingLeft ?? config.labelVerticalSpacing ?? 40,
    labelVerticalSpacingRight: config.labelVerticalSpacingRight ?? config.labelVerticalSpacing ?? 40,

    // Hovringsinformation
    hoverInfoWidth: config.hoverInfoWidth ?? 180,
    hoverInfoMaxHeight: config.hoverInfoMaxHeight ?? 120,
    hoverInfoInitialDateFontSize: config.hoverInfoInitialDateFontSize ?? 16,
    hoverInfoInitialWeekFontSize: config.hoverInfoInitialWeekFontSize ?? 14,
    hoverInfoInitialDaysFontSize: config.hoverInfoInitialDaysFontSize ?? 14,
    hoverInfoDescriptionTitleFontSize: config.hoverInfoDescriptionTitleFontSize ?? 16,
    hoverInfoDescriptionTextFontSize: config.hoverInfoDescriptionTextFontSize ?? 14,
    hoverInfoResponsibleTitleFontSize: config.hoverInfoResponsibleTitleFontSize ?? 14,
    hoverInfoResponsibleTextFontSize: config.hoverInfoResponsibleTextFontSize ?? 14,
    hoverInfoLineHeight: config.hoverInfoLineHeight ?? 1.3,
    hoverInfoScrollbarWidth: config.hoverInfoScrollbarWidth ?? "thin",
    hoverInfoScrollbarColor: config.hoverInfoScrollbarColor ?? "hsl(265, 56%, 60%)",
    hoverInfoScrollbarPadding: config.hoverInfoScrollbarPadding ?? 6,

    // Centertext
    centerTextLineHeight: config.centerTextLineHeight ?? 36,
    centerTextOffsetY: config.centerTextOffsetY ?? 0,

    // Kurvfaktorer för kopplingslinjer
    jd_connectorCurveFactor: config.jd_connectorCurveFactor ?? 1,
    maso_connectorCurveFactor: config.maso_connectorCurveFactor ?? 1,
    fman_connectorCurveFactor: config.fman_connectorCurveFactor ?? 1,
    jj_connectorCurveFactor: config.jj_connectorCurveFactor ?? 1
  };
}
