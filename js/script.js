/**
 * Verksamhetscykel-visualisering
 * Byggd med D3.js v7
 *
 * Detta skript hanterar ritning av det interaktiva cirkulära kalenderhjulet.
 * Det läser konfiguration och data från 'web-data/2026/events.json' för enkel förvaltning.
 *
 * Struktur:
 * 1. Uppsättning & konfiguration: läser JSON, sätter upp SVG och D3-skalor.
 * 2. Skapar lager: skapar separata SVG-grupper (g) för ringar, rutnät, veckor, månader m.m.
 * 3. Text & etiketter: ritar centertext och förbereder logik för radbrytning.
 * 4. Ringar & rutnät: ritar bakgrundens koncentriska ringar och det radiella/cirkulära rutnätet.
 * 5. Veckoring: beräknar och ritar 52 veckosegment med korrekt datumkoppling.
 * 6. Månader: ritar de yttre månadsbågarna och månadsnamnen.
 * 7. Händelser & markörer:
 *    - mappar datum till vinklar
 *    - beräknar exakta positioner (center i ring eller på linje)
 *    - hanterar krockar för att undvika etikettöverlapp
 *    - ritar markörer, kopplingslinjer och etiketter
 *    - hanterar hovringseffekter (nedtoning/markering)
 */

const DATA_PATH = 'web-data/2026/events.json';

const DEFAULT_SEGMENT_BUTTONS_COLORS = {
  verksamhet: "rgba(100, 100, 100, 0.2)",
  ekonomi: "rgba(100, 100, 100, 0.2)",
  kvalitet: "rgba(100, 100, 100, 0.2)"
};

const DEFAULT_RING_COLORS = [
  "rgba(34, 18, 77, 0.9)",
  "rgba(62, 36, 118, 0.8)",
  "rgba(88, 62, 144, 0.6)",
  "rgba(128, 107, 184, 0.4)"
];

function normalizeConfig(rawConfig = {}) {
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

function applyCssVars(cssVars) {
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

async function initWheel() {
  // --- 1. Ladda data och konfiguration ---
  const response = await fetch(DATA_PATH);
  const data = await response.json();
  const config = normalizeConfig(data.config);
  const { typeStyle } = data;

  applyCssVars(config.ui.cssVars);

  // Filtrera så endast synliga händelser ingår
  const allVisibleEvents = data.events.filter(ev => ev.visible === true);

  // Filterläge - båda aktiva som standard
  // Interaktionsläge - initieras tidigt för att vara tillgängligt för filtrering
  const state = {
    segmentFilters: { verksamhet: true, ekonomi: true, kvalitet: true }, // Standardfilter
    clickedMonths: new Set(),
    hoveredMonth: null,
    clickedRings: new Set(),
    hoveredRing: null,
    clickedPeriods: new Set(),
    hoveredPeriod: null,
    hoveredEvent: null,
    clickedEvent: null,       // Nuvarande klickad händelse (för karusell)
    clickedEventPhase: 0,     // Aktuell fas i karusellen (0=initial, 1=beskrivning, 2=ansvarig)
    selectionMode: null       // 'month', 'ring', 'period' eller null
  };

  // Börja med alla händelser
  let events = getFilteredEvents();

  const year = config.year;

  // --- 2. SVG-uppsättning ---
  const svg = d3.select("#wheel");
  const W = config.canvasWidth ?? 1800;
  const H = config.canvasHeight ?? 1800;
  const centerOffsetX = config.centerOffsetX ?? 0;
  const centerOffsetY = config.centerOffsetY ?? 0;
  const cx = W / 2 + centerOffsetX;
  const cy = H / 2 + centerOffsetY;
  svg.attr("viewBox", `0 0 ${W} ${H}`);

  // Bakgrundsklick-hanterare (för att stänga karusellen vid klick utanför)
  // Använd en flagga för att spåra om en karusellpil just klickades
  let chevronJustClicked = false;

  svg.on("click", function (event) {
    // Om karusellpil just klickades, återställ flaggan och gör inget
    if (chevronJustClicked) {
      chevronJustClicked = false;
      return;
    }

    // Om karusellen är öppen, stäng den
    if (state.clickedEvent) {
      hideCarouselView();
      refreshHighlights();
    }
  });

  // Funktion för att sätta karusellpil-klickflagga (anropas från pilhanterare)
  function setChevronClicked() {
    chevronJustClicked = true;
  }

  // Standardvärden (säkra reservvärden)
  const ringInner = config.ringInner ?? 120;
  const ringOuter = config.ringOuter ?? 380;
  const ringCount = config.ringCount ?? 4;
  const monthBandR0 = config.monthBandR0 ?? 400;
  const monthBandR1 = config.monthBandR1 ?? 420;
  const outerLabelR = config.outerLabelR ?? 450;
  const labelR = config.labelR ?? 540;
  const markerBaseSize = config.markerBaseSize ?? 12;
  const markerHoverScale = config.markerHoverScale ?? 1.4;
  const eventLabelFontSize = config.eventLabelFontSize ?? 14;
  const eventLabelHoverFontSize = config.eventLabelHoverFontSize ?? 16;
  const labelWrapWidth = config.labelWrapWidth ?? 240;

  // Stilkonfiguration
  const gridLineWidth = config.gridLineWidth ?? 1;
  const connectorLineWidth = config.connectorLineWidth ?? 1;
  const currentWeekColor = config.currentWeekColor ?? "#4B2582";
  const monthRingColor = config.monthRingColor ?? "rgba(108, 92, 231, 0.05)";
  const weekRingColor = config.weekRingColor ?? "rgba(0,0,0,0.05)";
  const weekSeparatorWidth = config.weekSeparatorWidth ?? 0.5;
  const weekSeparatorColor = config.weekSeparatorColor ?? "#fff";
  const eventLabelColor = config.eventLabelColor ?? "#1a1a2e";
  const monthLabelColor = config.monthLabelColor ?? "#1a1a2e";
  const monthLabelTextTransform = config.monthLabelTextTransform ?? "uppercase";
  const centerTextColor = config.centerTextColor ?? "var(--ink)";

  // Härledda mått
  const ringGap = (ringOuter - ringInner) / ringCount;

  // --- 3. D3-skalor och hjälpfunktioner ---
  const monthsList = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
  const startYear = new Date(year, 0, 1);
  const endYear = new Date(year + 1, 0, 1);

  // Tid -> vinkel-skala (startar vid -PI/2 som är kl 12)
  const angleScale = d3.scaleTime()
    .domain([startYear, endYear])
    .range([-Math.PI / 2, 3 * Math.PI / 2]);

  // Huvudgrupp
  const main = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);

  // Lager (ordning påverkar z-index)
  // 1. Ringar (bakgrund)
  const gRingBands = main.append("g").attr("class", "ring-bands");
  // 2. Veckor
  const gWeeks = main.append("g").attr("class", "weeks");
  // 3. Månader
  const gMonths = main.append("g").attr("class", "months");
  // 4. Vita rutnätslinjer (ovanför bakgrunder)
  const gGrid = main.append("g").attr("class", "grid");
  // 4b. Periodring
  const gPeriodRing = main.append("g").attr("class", "period-ring");
  // 5. Innehåll
  const gConnectors = main.append("g").attr("class", "connectors");
  const gCenter = main.append("g").attr("class", "center-content");
  const gMarkers = main.append("g").attr("class", "markers");
  const gLabels = main.append("g").attr("class", "labels");

  // Interaktionsläge (flyttat upp)
  const ringNames = ["langtidsplanering", "planering", "genomforande_och_uppfoljning", "uppfoljning_och_analys"];
  state.ringNames = ringNames;

  // --- 4. Rita centertext ---
  if (config.centerText) {
    const centerFontSize = config.centerTextFontSize ?? 36;
    const centerLineHeight = config.centerTextLineHeight ?? 36;
    const centerTextOffsetY = config.centerTextOffsetY ?? 0;
    const words = config.centerText.split(" & ");
    const totalHeight = (words.length - 1) * centerLineHeight;
    const startY = (-totalHeight / 2) + centerTextOffsetY;

    words.forEach((word, i) => {
      gCenter.append("text")
        .attr("y", startY + i * centerLineHeight)
        .attr("text-anchor", "middle")
        .attr("class", "center-label")
        .style("font-size", `${centerFontSize}px`)
        .style("fill", centerTextColor)
        .text(i === 0 ? word + " &" : word);
    });


  }

  // --- 5. Rita ringar (bakgrund) ---
  const ringColors = config.ringColors;
  const ringArcGen = d3.arc();

  for (let i = 0; i < ringCount; i++) {
    const r0 = ringInner + i * ringGap;
    const r1 = ringInner + (i + 1) * ringGap;

    monthsList.forEach((_, mIdx) => {
      const d0 = new Date(year, mIdx, 1);
      const d1 = new Date(year, mIdx + 1, 1);
      const startA = angleScale(d0) + Math.PI / 2;
      const endA = angleScale(d1) + Math.PI / 2;

      const ringSegment = gRingBands.append("path")
        .attr("d", ringArcGen({
          innerRadius: r0 + 1,
          outerRadius: r1 - 1,
          startAngle: startA,
          endAngle: endA
        }))
        .attr("fill", ringColors[i] || "rgba(200,200,200,0.1)")
        .attr("class", "ring-segment")
        .attr("data-month", mIdx)
        .attr("data-ring", i);

      // Lägg till titel för tillgänglighet
      ringSegment.append("title")
        .text(`${state.ringNames[i].replace(/_/g, ' ')} - ${monthsList[mIdx]}`);

      // Lägg till händelsehanterare
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
          // Rensa andra valtyper
          state.clickedMonths.clear();
          state.clickedPeriods.clear();
          state.selectionMode = 'ring';
          // Växla denna ring
          if (state.clickedRings.has(i)) state.clickedRings.delete(i);
          else state.clickedRings.add(i);
          // Om inga ringar är valda, nollställ läge
          if (state.clickedRings.size === 0) state.selectionMode = null;
          refreshHighlights();
        });
    });
  }

  // --- 6. Rita rutnätslinjer ---
  for (let i = 0; i <= ringCount; i++) {
    const r = ringInner + i * ringGap;
    gGrid.append("circle")
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", gridLineWidth);
  }

  // --- 7. Rita veckoring ---
  const weekRingThickness = config.weekRingThickness ?? 16;
  const weekRingCenter = (ringOuter + monthBandR0) / 2;
  const weekBandR0 = weekRingCenter - weekRingThickness / 2;
  const weekBandR1 = weekRingCenter + weekRingThickness / 2;
  const weekArcGen = d3.arc().innerRadius(weekBandR0).outerRadius(weekBandR1);

  const nowVal = new Date();
  const currentWeekVal = d3.timeFormat("%V")(nowVal);
  const isCurrentYear = nowVal.getFullYear() === year;

  // Hjälp: hämta ISO-veckans datumintervall begränsat till året
  function getIsoWeekRange(year, week) {
    // 4 januari ligger alltid i vecka 1 enligt ISO-8601
    const d = new Date(year, 0, 4);
    const day = d.getDay() || 7; // Mån=1, Sön=7
    const week1Monday = new Date(d);
    week1Monday.setDate(d.getDate() - day + 1);

    const weekMonday = new Date(week1Monday);
    weekMonday.setDate(week1Monday.getDate() + (week - 1) * 7);

    // Beskär start till 1 jan
    const jan1 = new Date(year, 0, 1);
    const start = weekMonday < jan1 ? jan1 : weekMonday;

    // Slut är söndag
    const weekSunday = new Date(weekMonday);
    weekSunday.setDate(weekMonday.getDate() + 6);

    // Beskär slut till 31 dec
    const dec31 = new Date(year, 11, 31);
    const end = weekSunday > dec31 ? dec31 : weekSunday;

    return { start, end };
  }

  // 2026 har 53 veckor (startar på en torsdag)
  const totalWeeks = (year === 2026) ? 53 : 52;

  for (let w = 1; w <= totalWeeks; w++) {
    const { start: startW, end: endW } = getIsoWeekRange(year, w);

    // Hoppa över om veckan ligger helt utanför (ska inte hända med beskärning)
    if (startW > endW) continue;

    const startA = angleScale(startW) + Math.PI / 2;
    // För slutvinkeln vill vi ha dagens SLUT (23:59:59) eller i praktiken STARTEN på nästa dag
    // Den tidigare naiva logiken använde w*7+1 vilket i praktiken är start på nästa period.
    // Alltså bör vi använda endW + 1 dag för vinkelberäkningen för att stänga glappet.
    // AngleScale mappar normalt tidsstämplar.
    // Vi använder endW satt till 23:59:59 eller lägger till 1 dag på datumobjektet.
    const endWPlus1 = new Date(endW);
    endWPlus1.setDate(endW.getDate() + 1);
    endWPlus1.setHours(0, 0, 0, 0);

    // Specialfall: om endW är 31 dec blir endWPlus1 1 jan nästa år.
    // AngleScale kan hantera det om domänen är korrekt satt.
    // Skaldomänen är normalt [1 jan, 31 dec].
    // Om den går till 1 jan nästa år returnerar den 2PI (eller motsvarande).
    const endA = angleScale(endWPlus1) + Math.PI / 2;

    const isCurrent = isCurrentYear && +currentWeekVal === w;

    // Veckosegment
    gWeeks.append("path")
      .attr("d", weekArcGen({ startAngle: startA, endAngle: endA }))
      .attr("class", `week-segment ${isCurrent ? 'is-current' : ''}`)
      .attr("fill", isCurrent ? currentWeekColor : weekRingColor)
      .attr("stroke", weekSeparatorColor)
      .attr("stroke-width", weekSeparatorWidth)
      .append("title")
      .text(`Vecka ${w}`);

    // Placering av veckonummertext
    const midA = (startA + endA) / 2 - Math.PI / 2;
    const tx = ((weekBandR0 + weekBandR1) / 2) * Math.cos(midA);
    const ty = ((weekBandR0 + weekBandR1) / 2) * Math.sin(midA);
    const weekFontSize = config.weekLabelFontSize ?? 7;

    gLabels.append("text")
      .attr("x", tx)
      .attr("y", ty)
      .attr("class", `week-label week-label-${w}${isCurrent ? ' is-current' : ''}`)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", `${weekFontSize}px`)
      .style("fill", isCurrent ? "#fff" : "rgba(0,0,0,0.55)")
      .style("font-weight", "700")
      .style("pointer-events", "none")
      .text(w);
  }

  // --- 7b. Rita periodsegment i periodringen ---
  const periodDividerWeeks = config.periodDividerWeeks;
  const periodColors = config.periodColors;
  const periodRingR0 = config.periodRingR0 ?? 352;
  const periodRingR1 = config.periodRingR1 ?? 358;
  const periodArcGen = d3.arc().innerRadius(periodRingR0).outerRadius(periodRingR1);

  // Bygg periodsegment utifrån delningsveckor
  // Varje segment går från dividers[i] till dividers[i+1], med varvning
  const numPeriods = periodDividerWeeks.length;

  for (let t = 0; t < numPeriods; t++) {
    const startWeek = periodDividerWeeks[t];
    const endWeek = periodDividerWeeks[(t + 1) % numPeriods];

    // Beräkna vinklar med ISO-veckostarter
    const startDate = getIsoWeekRange(year, startWeek).start;
    const endDate = getIsoWeekRange(year, endWeek).start;

    // Om endWeek är 1 (eller litet), är endDate 1 jan.
    // Det gör att varvningslogiken (end < start) nedan fungerar korrekt.

    let startAngle = angleScale(startDate) + Math.PI / 2;
    let endAngle = angleScale(endDate) + Math.PI / 2;

    // Hantera varvning (när endWeek < startWeek korsas årsskiftet)
    if (endWeek <= startWeek) {
      endAngle += 2 * Math.PI;
    }

    const periodColor = periodColors[t] ?? monthRingColor;

    gPeriodRing.append("path")
      .attr("d", periodArcGen({ startAngle, endAngle }))
      .attr("class", "period-segment")
      .attr("fill", periodColor)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .attr("data-start-week", startWeek)
      .attr("data-end-week", endWeek)
      .attr("data-wraps", endWeek <= startWeek ? "true" : "false")
      .attr("data-color", periodColor)
      .style("cursor", "pointer")
      .on("mouseover", function (d, i) {
        state.hoveredPeriod = t;
        refreshHighlights();
      })
      .on("mouseout", function () {
        state.hoveredPeriod = null;
        refreshHighlights();
      })
      .on("click", function () {
        // Rensa andra valtyper
        state.clickedMonths.clear();
        state.clickedRings.clear();
        state.selectionMode = 'period';
        // Växla denna period
        if (state.clickedPeriods.has(t)) state.clickedPeriods.delete(t);
        else state.clickedPeriods.add(t);
        // Om inga perioder är valda, nollställ läge
        if (state.clickedPeriods.size === 0) state.selectionMode = null;
        refreshHighlights();
      });
  }



  // --- 7c. Rita segmentknappar i yttre ring (dec-jan-sektor) ---
  // Konfigurerbart via web-data/2026/events.json
  const btnInner = config.segmentButtonInnerRadius ?? 365;
  const btnOuter = config.segmentButtonOuterRadius ?? 395;
  const btnCornerRadius = config.segmentButtonCornerRadius ?? 3;
  const btnFontSize = config.segmentButtonFontSize ?? 9;
  const btnStrokeWidth = config.segmentButtonStrokeWidth ?? 1;
  const btnColors = config.segmentButtonsColors;
  const btnActiveColor = config.segmentButtonActiveColor ?? "#4B2582";
  const btnTextColor = config.segmentButtonTextColor ?? "#333";
  const btnActiveTextColor = config.segmentButtonActiveTextColor ?? "#fff";

  const btnArcGen = d3.arc()
    .innerRadius(btnInner)
    .outerRadius(btnOuter)
    .cornerRadius(btnCornerRadius);

  // Definiera knappar
  // Total spännvidd: -30 till +30 grader (-PI/6 till PI/6)
  // Dela upp i 3: -30..-10, -10..+10, +10..+30
  // Mellanrum: 2 grader (~0,035 rad)
  const gapRad = 2 * Math.PI / 180;
  const sectorSize = 20 * Math.PI / 180; // 20 grader per knapp

  // Hjälp för vinklar centrerade upptill (0)
  // Kontrollera tillgänglighet baserat på data
  const hasVerksamhet = allVisibleEvents.some(ev => ev.verksamhet === true);
  const hasEkonomi = allVisibleEvents.some(ev => ev.ekonomi === true);
  // Kontrollera om fältet 'kvalitet' finns och är true i någon händelse
  const hasKvalitet = allVisibleEvents.some(ev => ev.kvalitet === true);

  const segmentData = [
    {
      id: 'verksamhet',
      label: 'Verksamhet',
      startAngle: -1.5 * sectorSize + gapRad / 2, // -30 + 1
      endAngle: -0.5 * sectorSize - gapRad / 2,   // -10 - 1
      color: btnColors.verksamhet,
      activeColor: btnActiveColor,
      disabled: !hasVerksamhet
    },
    {
      id: 'ekonomi',
      label: 'Ekonomi',
      startAngle: -0.5 * sectorSize + gapRad / 2, // -10 + 1
      endAngle: 0.5 * sectorSize - gapRad / 2,    // +10 - 1
      color: btnColors.ekonomi,
      activeColor: btnActiveColor,
      disabled: !hasEkonomi
    },
    {
      id: 'kvalitet',
      label: 'Kvalitét',
      startAngle: 0.5 * sectorSize + gapRad / 2,  // +10 + 1
      endAngle: 1.5 * sectorSize - gapRad / 2,    // +30 - 1
      color: btnColors.kvalitet,
      activeColor: btnActiveColor,
      disabled: !hasKvalitet
    }
  ];

  // Grupp för knappar
  const gSegmentButtons = main.append("g").attr("class", "segment-buttons");

  if (!state.segmentFilters) {
    // Aktivera som standard endast om data finns
    state.segmentFilters = {
      verksamhet: hasVerksamhet,
      ekonomi: hasEkonomi,
      kvalitet: hasKvalitet
    };
  }

  segmentData.forEach(btn => {
    const isActive = state.segmentFilters[btn.id];

    const group = gSegmentButtons.append("g")
      .attr("class", "segment-btn-group")
      .attr("data-id", btn.id)
      .style("cursor", btn.disabled ? "not-allowed" : "pointer")
      .style("opacity", btn.disabled ? 0.3 : 1);

    // Knappbåge
    group.append("path")
      .attr("d", btnArcGen({ startAngle: btn.startAngle, endAngle: btn.endAngle }))
      .attr("class", "segment-btn-bg")
      .attr("fill", isActive ? btn.activeColor : btn.color)
      .attr("stroke", "#fff")
      .attr("stroke-width", btnStrokeWidth);

    // Etikett
    // Placera text i centroid eller med polära koordinater
    const midAngle = (btn.startAngle + btn.endAngle) / 2;
    // Ska texten vara upprätt eller tangent?
    // "följa formen" -> kurvad eller tangent.
    // Enkel tangentrotation:
    // Vinkel i grader för rotation: (midAngle * 180 / PI) - 90?
    // Vid 0 rad (uppe) ska texten vara horisontell (0°).
    // D3-båge: 0 är uppåt. Rotation?
    // Vi testar enkel transform-förflyttning.
    const rLabel = (btnInner + btnOuter) / 2;
    const tx = rLabel * Math.sin(midAngle);
    const ty = -rLabel * Math.cos(midAngle); // Uppåt är negativt Y

    // Rotationsberäkning
    // Uppe (0) ska rotation vara 0.
    // Till höger (PI/2) rotation 90.
    // Till vänster (-PI/2) rotation -90.
    const rotateDeg = midAngle * 180 / Math.PI;

    group.append("text")
      .attr("x", tx)
      .attr("y", ty)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("transform", `rotate(${rotateDeg}, ${tx}, ${ty})`)
      .style("font-size", `${btnFontSize}px`)
      .style("font-weight", "bold")
      .style("fill", isActive ? btnActiveTextColor : btnTextColor)
      .style("pointer-events", "none")
      .text(btn.label);

    // Klickhanterare läggs till senare eller här?
    // Klickhanterare
    group.on("click", function (event) {
      event.stopPropagation();
      if (btn.disabled) return;
      toggleSegmentFilter(btn.id);
    });
  });

  function toggleSegmentFilter(id) {
    state.segmentFilters[id] = !state.segmentFilters[id];

    // Anropa befintliga filterfunktioner
    if (typeof applyFilter === 'function') applyFilter();

    // Uppdatera visuellt tillstånd för segmentknappar
    updateSegmentButtonsVisuals();
  }

  function updateSegmentButtonsVisuals() {
    gSegmentButtons.selectAll(".segment-btn-group").each(function () {
      const grp = d3.select(this);
      const id = grp.attr("data-id");
      const isActive = state.segmentFilters[id];
      const btnDef = segmentData.find(b => b.id === id);

      grp.select("path")
        .transition().duration(200)
        .attr("fill", isActive ? btnDef.activeColor : btnDef.color);

      grp.select("text")
        .style("fill", isActive ? "#fff" : "#333");
    });
  }



  // --- 8. Rita månader (bågar + etiketter) ---
  const monthArcGen = d3.arc().innerRadius(monthBandR0).outerRadius(monthBandR1);

  monthsList.forEach((m, i) => {
    const d0 = new Date(year, i, 1);
    const d1 = new Date(year, i + 1, 1);
    const startA = angleScale(d0) + Math.PI / 2;
    const endA = angleScale(d1) + Math.PI / 2;

    gMonths.append("path")
      .attr("d", monthArcGen({ startAngle: startA, endAngle: endA }))
      .attr("class", "month-arc")
      .attr("fill", monthRingColor)
      .attr("data-month", i)
      .append("title")
      .text(`${m} ${year}`);

    // Välj om för att lägga till händelsehanterare
    gMonths.selectAll(".month-arc").filter(function () {
      return +d3.select(this).attr("data-month") === i;
    })
      .on("mouseover", () => {
        state.hoveredMonth = i;
        refreshHighlights();
      })
      .on("mouseout", () => {
        state.hoveredMonth = null;
        refreshHighlights();
      })
      .on("click", () => {
        // Rensa andra valtyper
        state.clickedRings.clear();
        state.clickedPeriods.clear();
        state.selectionMode = 'month';
        // Växla denna månad
        if (state.clickedMonths.has(i)) state.clickedMonths.delete(i);
        else state.clickedMonths.add(i);
        // Om inga månader är valda, nollställ läge
        if (state.clickedMonths.size === 0) state.selectionMode = null;
        refreshHighlights();
      });

    // Radiell skiljelinje
    const a = angleScale(d0);
    gGrid.append("line")
      .attr("x1", ringInner * Math.cos(a))
      .attr("y1", ringInner * Math.sin(a))
      .attr("x2", monthBandR1 * Math.cos(a))
      .attr("y2", monthBandR1 * Math.sin(a))
      .attr("stroke", "rgba(255,255,255,1.0)")
      .attr("stroke-width", gridLineWidth);

    // Månadsnamn (inne i månadsbandet, som veckonummer)
    const labelAngle = angleScale(new Date(year, i, 15));
    const monthLabelR = (monthBandR0 + monthBandR1) / 2; // Mitten av månadsbandet
    const lx = monthLabelR * Math.cos(labelAngle);
    const ly = monthLabelR * Math.sin(labelAngle);
    let rot = (labelAngle * 180 / Math.PI);
    if (rot > 90 || rot < -90) rot += 180;

    gLabels.append("text")
      .attr("x", lx)
      .attr("y", ly)
      .attr("transform", `rotate(${rot}, ${lx}, ${ly})`)
      .attr("class", "label month")
      .attr("data-month", i)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("fill", monthLabelColor)
      .style("font-size", `${config.monthLabelFontSize ?? 10}px`)
      .style("font-weight", "700")
      .style("text-transform", monthLabelTextTransform)
      .text(m);
  });

  // --- 9. Händelser och markörer ---
  // Formgeneratorer
  const shapeGenerator = {
    circle: (s) => `M 0,0 m -${s},0 a ${s},${s} 0 1,0 ${s * 2},0 a ${s},${s} 0 1,0 -${s * 2},0`,
    diamond: (s) => `M 0,-${s * 1.2} L ${s * 1.2},0 L 0,${s * 1.2} L -${s * 1.2},0 Z`,
    triangle: (s) => `M 0,-${s * 1.2} L ${s * 1.2},${s} L -${s * 1.2},${s} Z`,
    pentagon: (s) => {
      const pts = [];
      for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * (Math.PI / 180);
        pts.push(`${s * 1.2 * Math.cos(angle)},${s * 1.2 * Math.sin(angle)}`);
      }
      return "M " + pts.join(" L ") + " Z";
    },
    eye: (s) => `M -${s * 1.4},0 Q 0,-${s * 1.2} ${s * 1.4},0 Q 0,${s * 1.2} -${s * 1.4},0 M 0,0 m -${s / 2},0 a ${s / 2},${s / 2} 0 1,0 ${s},0 a ${s / 2},${s / 2} 0 1,0 -${s},0`
  };

  const ringMap = {
    "langtidsplanering": 0,
    "planering": 1,
    "genomforande_och_uppfoljning": 2,
    "uppfoljning_och_analys": 3,
    "manad": 4
  };

  function getRadius(ring) {
    if (ring === "manad") return (monthBandR0 + monthBandR1) / 2;
    const ringIdx = (typeof ring === 'string') ? (ringMap[ring] ?? 0) : ring;
    return ringInner + ringIdx * ringGap + ringGap / 2;
  }

  // --- NYTT: Kolumnlayoutlogik ---
  const columnGapLeft = config.columnGapLeft ?? 750;
  const columnGapRight = config.columnGapRight ?? 550;
  const labelVerticalSpacingLeft = config.labelVerticalSpacingLeft ?? config.labelVerticalSpacing ?? 40;
  const labelVerticalSpacingRight = config.labelVerticalSpacingRight ?? config.labelVerticalSpacing ?? 40;

  // Beräkna positioner och sidor
  const labelData = events.map(ev => {
    const d = new Date(ev.date);
    const a = angleScale(d);

    // Egenskaper för exakt placeringslogik
    const ringIdx = (typeof ev.ring === 'string') ? (ringMap[ev.ring] ?? 0) : ev.ring;
    let r;

    if (ev.placering === "linje") {
      const ringIdx2 = (typeof ev.ring_2 === 'string') ? (ringMap[ev.ring_2] ?? ringIdx) : (ev.ring_2 ?? ringIdx);
      const boundaryIdx = Math.max(ringIdx, ringIdx2);
      const finalLineIdx = (ringIdx === ringIdx2) ? (ringIdx + 1) : boundaryIdx;
      r = ringInner + finalLineIdx * ringGap;
    } else {
      r = getRadius(ev.ring);
    }

    const x = r * Math.cos(a);
    const y = r * Math.sin(a);

    // Bestäm sida: höger [-PI/2, PI/2], vänster [PI/2, 3PI/2]
    const isLeft = (a >= Math.PI / 2 || a <= -Math.PI / 2);

    // Initial X-position för etikett - använd separata avstånd per sida
    const lx = isLeft ? -columnGapLeft : columnGapRight;

    // Ungefärligt Y för sortering
    const approxY = labelR * Math.sin(a);

    // Spara approxY som ly initialt
    return { ...ev, a, r, x, y, lx, ly: approxY, isLeft, dateObj: d };
  });

  // Vertikal staplingslogik
  // Sortera efter datum för att behålla kronologisk ordning i varje kolumn
  const leftLabels = labelData.filter(d => d.isLeft).sort((a, b) => a.ly - b.ly);
  const rightLabels = labelData.filter(d => !d.isLeft).sort((a, b) => a.ly - b.ly);

  // Fördela etiketter jämnt, centrerade kring Y=0
  // Detta ignorerar vinkelpositioner och skapar en kompakt, jämn kolumn
  const distributeEvenly = (subset, spacing) => {
    if (subset.length === 0) return;
    const totalHeight = (subset.length - 1) * spacing;
    const startY = -totalHeight / 2;
    subset.forEach((item, i) => {
      item.ly = startY + i * spacing;
    });
  };

  distributeEvenly(leftLabels, labelVerticalSpacingLeft);
  distributeEvenly(rightLabels, labelVerticalSpacingRight);

  // Rita markörer och händelseetiketter
  labelData.forEach((ev) => {
    const style = typeStyle[ev.type] || { fill: "white", shape: "circle" };

    const eventGroup = gMarkers.append("g")
      .attr("class", "event-group")
      .attr("data-id", ev.id)
      .attr("data-month", ev.dateObj.getMonth())
      .attr("role", "button")
      .attr("aria-label", `${ev.label} - ${ev.date}`);

    // Lägg till titel för inbyggt verktygstips
    eventGroup.append("title")
      .text(`${ev.label}\n${ev.date}`);

    // 1. Text (rita först för att mäta bredd)
    const textX = ev.lx;
    const textY = ev.ly;
    const padding = 12;

    // 1. Etikettext (rita först för att mäta)
    const labelText = eventGroup.append("text")
      .attr("x", textX)
      .attr("y", textY)
      .attr("class", "event-label-ext")
      .attr("text-anchor", "start") // Alltid vänsterjusterad
      .attr("dominant-baseline", "middle")
      .style("fill", eventLabelColor)
      .style("font-size", `${eventLabelFontSize}px`)
      .text(ev.label)
      .call(wrapText, labelWrapWidth);

    // Mät faktisk bredd
    const bbox = labelText.node().getBBox();
    const textWidth = bbox.width;



    // Beräkna slutpunkt för kopplingslinje
    // Höger sida: anslut till vänsterkant (lx - padding)
    // Vänster sida: anslut till högerkant (lx + textWidth + padding)
    const lineEndX = ev.isLeft ? (ev.lx + textWidth + padding) : (ev.lx - padding);
    const lineEndY = ev.ly;

    // Beräkning av knäckpunkt med curveFactor-interpolering
    // curveFactor: 0 = rak linje, 1 = nuvarande kurvning
    const connectorElbowRadius = config.connectorElbowRadius ?? 480;

    // Kurvfaktorer per månadsgrupp
    // jd: januari(0), december(11)
    // maso: mars(2), april(3), september(8), oktober(9)
    // fman: februari(1), maj(4), augusti(7), november(10)
    // jj: juni(5), juli(6)
    const eventMonth = ev.dateObj.getMonth();
    let connectorCurveFactor;
    if ([0, 11].includes(eventMonth)) {
      connectorCurveFactor = config.jd_connectorCurveFactor ?? 1;
    } else if ([2, 3, 8, 9].includes(eventMonth)) {
      connectorCurveFactor = config.maso_connectorCurveFactor ?? 1;
    } else if ([1, 4, 7, 10].includes(eventMonth)) {
      connectorCurveFactor = config.fman_connectorCurveFactor ?? 1;
    } else {
      connectorCurveFactor = config.jj_connectorCurveFactor ?? 1;
    }

    // Nuvarande beteende: knäck vid markörens vinkel på knäckradien
    const currentElbowAngle = ev.a;

    // Beräkna var en rak linje från markör till text skär knäckradiecirkeln
    // Linje från (ev.x, ev.y) till (lineEndX, lineEndY)
    // Cirkel: x² + y² = connectorElbowRadius²
    // Parametrisk linje: P(t) = (1-t)*start + t*end
    const dx = lineEndX - ev.x;
    const dy = lineEndY - ev.y;
    const a_coef = dx * dx + dy * dy;
    const b_coef = 2 * (ev.x * dx + ev.y * dy);
    const c_coef = ev.x * ev.x + ev.y * ev.y - connectorElbowRadius * connectorElbowRadius;
    const discriminant = b_coef * b_coef - 4 * a_coef * c_coef;

    let straightLineAngle = currentElbowAngle; // Reserv
    if (discriminant >= 0 && a_coef !== 0) {
      // Hitta skärningspunkter
      const sqrtDisc = Math.sqrt(discriminant);
      const t1 = (-b_coef - sqrtDisc) / (2 * a_coef);
      const t2 = (-b_coef + sqrtDisc) / (2 * a_coef);

      // Välj t-värdet som ligger mellan markör och text (helst 0 < t < 1)
      // Vi vill ha skärningen som ligger "mellan" markör och text
      let bestT = null;
      for (const t of [t1, t2]) {
        if (t > 0 && t < 1) {
          bestT = t;
          break;
        }
      }
      // Om inget t i (0,1), välj det som ligger närmast intervallet
      if (bestT === null) {
        bestT = (Math.abs(t1 - 0.5) < Math.abs(t2 - 0.5)) ? t1 : t2;
      }

      const intersectX = ev.x + bestT * dx;
      const intersectY = ev.y + bestT * dy;
      straightLineAngle = Math.atan2(intersectY, intersectX);
    }

    // Interpolera vinkel mellan rak linje-skärning och aktuell radial position
    // Hantera vinkelvarvning för mjuk interpolering
    let angleDiff = currentElbowAngle - straightLineAngle;
    // Normalisera till [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const interpolatedAngle = straightLineAngle + angleDiff * connectorCurveFactor;

    const elbowX = connectorElbowRadius * Math.cos(interpolatedAngle);
    const elbowY = connectorElbowRadius * Math.sin(interpolatedAngle);

    // Bygg polyline-sökväg: markör -> knäck -> text
    const polylinePath = `M ${ev.x},${ev.y} L ${elbowX},${elbowY} L ${lineEndX},${lineEndY}`;

    // 2. Vit kontur (läggs först så den hamnar bakom allt)
    // 2. Vit kontur & 3. Kopplingslinje
    // Rita i separat gConnectors-lager så de ligger bakom etiketter
    const connectorGroup = gConnectors.append("g")
      .attr("class", "connector-group")
      .attr("data-id", ev.id);

    connectorGroup.append("path")
      .attr("d", polylinePath)
      .attr("class", "connector-halo")
      .attr("stroke", "#fff")
      .attr("stroke-width", connectorLineWidth + 4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .attr("opacity", 0);

    connectorGroup.append("path")
      .attr("d", polylinePath)
      .attr("class", "connector-line")
      .attr("data-stroke", style.fill)
      .attr("stroke", style.fill)
      .attr("stroke-width", connectorLineWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .attr("opacity", 0.6);

    // 4. Markör (form)
    const marker = eventGroup.append("g")
      .attr("class", "marker-wrap")
      .attr("transform", `translate(${ev.x}, ${ev.y})`);

    marker.append("path")
      .attr("d", shapeGenerator[style.shape || "circle"](markerBaseSize))
      .attr("fill", style.fill)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // 5. Träffyta
    eventGroup.append("rect")
      .attr("x", ev.lx - 10)
      .attr("y", bbox.y - 5)
      .attr("width", labelWrapWidth + 20).attr("height", bbox.height + 10)
      .attr("fill", "transparent")
      .attr("class", "label-hit-area");

    // Händelseinteraktioner
    eventGroup
      .on("mouseover", function () {
        // Hoppa över ALL hovring om NÅGON händelse är klickad (karuselläge)
        if (state.clickedEvent) return;

        // Spara hovringshändelse för ev. användning
        state.hoveredEvent = ev.id;

        // Uppdatera centerinfo med händelsedetaljer
        updateCenterInfo(ev);

        // Tona ned alla andra, markera denna
        gMarkers.selectAll(".event-group").classed("is-dimmed", true);
        d3.select(this).classed("is-dimmed", false).classed("is-active", true);

        // Markera kopplingslinje (i separat lager)
        const connector = gConnectors.select(`.connector-group[data-id="${ev.id}"]`);

        connector.select(".connector-halo")
          .attr("opacity", 0.8)
          .attr("stroke-width", (connectorLineWidth * 1.5) + 2);

        connector.select(".connector-line")
          .attr("stroke-dasharray", "0")
          .attr("opacity", 1)
          .attr("stroke-width", connectorLineWidth * 1.5);

        marker.transition().duration(200).attr("transform", `translate(${ev.x}, ${ev.y}) scale(${markerHoverScale})`);

        // Förstora etikettext
        const labelText = d3.select(this).select(".event-label-ext");

        labelText.transition().duration(200)
          .style("font-size", `${eventLabelHoverFontSize}px`);

      })
      .on("mouseout", function () {
        // Hoppa över ALLA musut-händelser om NÅGON händelse är klickad (karuselläge)
        if (state.clickedEvent) return;

        state.hoveredEvent = null;

        // Återställ standard centerinfo
        updateCenterInfo(null);

        // Återställ kopplingslinje
        const connector = gConnectors.select(`.connector-group[data-id="${ev.id}"]`);
        connector.select(".connector-halo").attr("opacity", 0);
        connector.select(".connector-line")
          .attr("opacity", 0.6)
          .attr("stroke-width", connectorLineWidth);

        marker.transition().duration(200).attr("transform", `translate(${ev.x}, ${ev.y}) scale(1)`);

        // Återställ etikettext
        const labelText = d3.select(this).select(".event-label-ext");

        labelText.transition().duration(200)
          .style("font-size", `${eventLabelFontSize}px`);

        // Återställ korrekt valtillstånd
        refreshHighlights();
      })
      .on("click", function (event) {
        event.stopPropagation();

        // Om samma händelse klickas, avmarkera (växla av)
        if (state.clickedEvent === ev.id) {
          hideCarouselView();
          refreshHighlights();
          return;
        }

        // Avmarkera tidigare klickad händelse om någon
        if (state.clickedEvent) {
          // Återställ tidigare händelses visuella tillstånd
          gMarkers.selectAll(".event-group").classed("is-clicked", false);
        }

        // Sätt ny klickad händelse
        state.clickedEvent = ev.id;
        state.clickedEventPhase = 0;

        // Markera denna händelse som klickad
        d3.select(this).classed("is-clicked", true);

        // Visa karusell med start i fas 0
        openCarousel(ev);

        // Behåll visuell markering
        gMarkers.selectAll(".event-group").classed("is-dimmed", true);
        d3.select(this).classed("is-dimmed", false).classed("is-active", true);
      });
  });

  // --- 10. Samlad uppdateringslogik för markering ---
  function refreshHighlights() {
    // Bygg aktiva mängder per typ (klickad + hovring)
    const activeMonths = new Set(state.clickedMonths);
    if (state.hoveredMonth !== null) activeMonths.add(state.hoveredMonth);

    const activeRings = new Set(state.clickedRings);
    if (state.hoveredRing !== null) activeRings.add(state.hoveredRing);

    const activePeriods = new Set(state.clickedPeriods);
    if (state.hoveredPeriod !== null) activePeriods.add(state.hoveredPeriod);

    // Kontrollera vad som är aktivt
    const hasMonthActive = activeMonths.size > 0;
    const hasRingActive = activeRings.size > 0;
    const hasPeriodActive = activePeriods.size > 0;
    const hasAnyActive = hasMonthActive || hasRingActive || hasPeriodActive;

    // --- Uppdatera månadsbågar ---
    gMonths.selectAll(".month-arc").each(function () {
      const m = +d3.select(this).attr("data-month");
      const isActive = hasMonthActive && activeMonths.has(m);
      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasRingActive && !hasPeriodActive);
    });

    // --- Uppdatera ringsegment ---
    gRingBands.selectAll(".ring-segment").each(function () {
      const m = +d3.select(this).attr("data-month");
      const r = +d3.select(this).attr("data-ring");

      let isActive = false;
      if (hasRingActive) {
        isActive = activeRings.has(r);
      } else if (hasMonthActive) {
        isActive = activeMonths.has(m);
      }
      // Perioder markerar inte ringsegment direkt

      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive);
    });

    // --- Uppdatera månadsrubriker ---
    gLabels.selectAll(".label.month").each(function () {
      const m = +d3.select(this).attr("data-month");
      const isActive = hasMonthActive && activeMonths.has(m);
      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasRingActive && !hasPeriodActive);
    });

    // --- Uppdatera händelsemarkörer ---
    gMarkers.selectAll(".event-group").each(function () {
      const m = +d3.select(this).attr("data-month");
      const evId = d3.select(this).attr("data-id");
      const ev = events.find(e => e.id === evId);

      let isActive = false;
      if (hasRingActive) {
        // Aktiv om händelsen finns i någon av de aktiva ringarna
        for (const ringIdx of activeRings) {
          const ringName = state.ringNames[ringIdx];
          if (ev.ring === ringName || ev.ring_2 === ringName) {
            isActive = true;
            break;
          }
        }
      } else if (hasMonthActive) {
        isActive = activeMonths.has(m);
      } else if (hasPeriodActive) {
        // Kontrollera om händelsens vecka ligger inom aktiva perioder
        const eventDate = new Date(ev.date);
        const weekNum = getWeekNumber(eventDate);
        const activeWeeks = getActiveWeeksFromPeriods(activePeriods);
        isActive = activeWeeks.has(weekNum);
      }

      const isDimmed = hasAnyActive && !isActive;

      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", isDimmed);

      // Synka kopplingslinjens tillstånd (separat lager)
      gConnectors.select(`.connector-group[data-id="${evId}"]`)
        .classed("is-active", isActive)
        .classed("is-dimmed", isDimmed);
    });

    // --- Uppdatera periodsegment ---
    gPeriodRing.selectAll(".period-segment").each(function (d, i) {
      const isActive = activePeriods.has(i);
      const originalColor = d3.select(this).attr("data-color");
      d3.select(this)
        .attr("fill", originalColor)
        .attr("stroke-width", isActive ? 1.5 : 0.5)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasMonthActive && !hasRingActive);
    });

    // --- Uppdatera veckosegment (för periodmarkering) ---
    const activeWeeks = getActiveWeeksFromPeriods(activePeriods);
    gWeeks.selectAll(".week-segment").each(function () {
      const title = d3.select(this).select("title").text();
      const weekNum = parseInt(title.replace("Vecka ", ""));
      d3.select(this).classed("is-period-active", activeWeeks.has(weekNum));
    });

    // --- Uppdatera veckonummer ---
    gLabels.selectAll(".week-label").each(function () {
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
  }

  // Hjälp: hämta veckonummer från datum
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // Hjälp: hämta aktiva veckor från periodindex
  function getActiveWeeksFromPeriods(activePeriodIndices) {
    const activeWeeks = new Set();
    const totalWeeks = (config.year === 2026) ? 53 : 52;
    const dividers = config.periodDividerWeeks;
    const numPeriods = dividers.length;

    activePeriodIndices.forEach(idx => {
      // Beräkna intervall för detta periodindex (idx)
      const sw = dividers[idx];
      const ew = dividers[(idx + 1) % numPeriods];

      // Avgör om det varvar (slut är mindre eller lika med start)
      const wraps = (ew <= sw);

      for (let w = 1; w <= totalWeeks; w++) {
        let isIn = false;
        // Logik: inkl. start, exkl. slut [sw, ew)
        if (wraps) {
          // t.ex. sw=45, ew=3 -> inkluderar 45, 46... totalWeeks, 1, 2
          if (w >= sw || w < ew) isIn = true;
        } else {
          // t.ex. sw=3, ew=13 -> inkluderar 3, 4... 12
          if (w >= sw && w < ew) isIn = true;
        }

        if (isIn) activeWeeks.add(w);
      }
    });

    return activeWeeks;
  }



  // --- Hjälp: beräkna arbetsdagar (mån-fre) ---
  function getWorkdaysBetween(startDate, endDate) {
    let count = 0;
    const curDate = new Date(startDate);
    while (curDate <= endDate) {
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
      curDate.setDate(curDate.getDate() + 1);
    }
    return count;
  }

  // --- Hjälp: uppdatera centerinfo ---
  // Tillstånd för cyklande animation
  let hoverCycleTimeouts = [];
  let currentHoverPhase = 0; // 0 = initial, 1 = beskrivning, 2 = ansvarig

  // Konfigvärden för hovringsinfo (med standardvärden)
  const hoverInfoWidth = config.hoverInfoWidth ?? 180;
  const hoverInfoMaxHeight = config.hoverInfoMaxHeight ?? 120;
  const hoverInfoInitialDateFontSize = config.hoverInfoInitialDateFontSize ?? 16;
  const hoverInfoInitialWeekFontSize = config.hoverInfoInitialWeekFontSize ?? 14;
  const hoverInfoInitialDaysFontSize = config.hoverInfoInitialDaysFontSize ?? 14;
  const hoverInfoDescriptionTitleFontSize = config.hoverInfoDescriptionTitleFontSize ?? 16;
  const hoverInfoDescriptionTextFontSize = config.hoverInfoDescriptionTextFontSize ?? 14;
  const hoverInfoResponsibleTitleFontSize = config.hoverInfoResponsibleTitleFontSize ?? 14;
  const hoverInfoResponsibleTextFontSize = config.hoverInfoResponsibleTextFontSize ?? 14;
  const hoverInfoLineHeight = config.hoverInfoLineHeight ?? 1.3;
  const hoverInfoScrollbarWidth = config.hoverInfoScrollbarWidth ?? "thin";
  const hoverInfoScrollbarColor = config.hoverInfoScrollbarColor ?? "hsl(265, 56%, 60%)";
  const hoverInfoScrollbarPadding = config.hoverInfoScrollbarPadding ?? 6;

  function clearHoverCycle() {
    hoverCycleTimeouts.forEach(id => clearTimeout(id));
    hoverCycleTimeouts = [];
    currentHoverPhase = 0;
  }

  function showCenterContent(content, options = {}) {
    const { isScrollable = false, textAlign = 'center' } = options;

    // Ta bort befintlig info med nedtoning
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
      // Använd foreignObject för HTML-innehåll med rullning
      const foreignObject = gCenter.append("foreignObject")
        .attr("class", "center-info-foreign")
        .attr("x", -hoverInfoWidth / 2)
        .attr("y", -hoverInfoMaxHeight / 2)
        .attr("width", hoverInfoWidth)
        .attr("height", hoverInfoMaxHeight)
        .style("opacity", 0);

      const div = foreignObject.append("xhtml:div")
        .attr("lang", "sv")
        .style("width", "100%")
        .style("height", "100%")
        .style("overflow-y", "auto")
        .style("overflow-x", "hidden")
        .style("font-family", "'Fira Sans', sans-serif")
        .style("direction", "rtl")  // Flyttar rullisten åt vänster
        .style("scrollbar-width", hoverInfoScrollbarWidth)
        .style("scrollbar-color", `${hoverInfoScrollbarColor} transparent`);

      // Inre behållare för att återställa textriktning
      const innerDiv = div.append("xhtml:div")
        .style("direction", "ltr")  // Återställ normal textriktning
        .style("text-align", textAlign)
        .style("hyphens", "auto")
        .style("-webkit-hyphens", "auto")
        .style("word-break", "break-word")
        .style("padding-left", `${hoverInfoScrollbarPadding}px`);

      // Lägg till innehållsrader som spans
      content.forEach((line, i) => {
        innerDiv.append("xhtml:div")
          .style("font-size", line.fontSize)
          .style("font-weight", line.fontWeight || "400")
          .style("color", line.fill || "#444")
          .style("line-height", hoverInfoLineHeight)
          .style("margin-bottom", i < content.length - 1 ? "2px" : "0")
          .text(line.text);
      });

      // Tona in
      foreignObject.transition().duration(500).style("opacity", 1);
    } else {
      // Använd SVG-text för enkel centrerad text (startinfo)
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

      // Tona in
      infoGroup.transition().duration(500).style("opacity", 1);
    }
  }

  function wrapTextToLines(text, maxChars) {
    // Dela först på befintliga radbrytningar
    const segments = text.split('\n');
    const allLines = [];

    segments.forEach(segment => {
      const words = segment.trim().split(' ');
      let currentLine = '';

      words.forEach(word => {
        // Tvinga radbrytning före \"mejla\" (okänsligt för versaler)
        if (word.toLowerCase().startsWith('mejla') && currentLine) {
          allLines.push(currentLine);
          currentLine = word;
        } else if ((currentLine + ' ' + word).trim().length <= maxChars) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) allLines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) allLines.push(currentLine);
    });

    return allLines;
  }

  function getInitialContent(ev) {
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
      { text: dateStr.toUpperCase(), fontSize: `${hoverInfoInitialDateFontSize}px`, fontWeight: "600", letterSpacing: "0.05em", fill: "#666" },
      { text: `Vecka ${weekNum} • ${capitalizedWeekday}`, fontSize: `${hoverInfoInitialWeekFontSize}px`, fontWeight: "500", fill: "#555" },
      { text: daysText, fontSize: `${hoverInfoInitialDaysFontSize}px`, fontWeight: "700", fill: "#555" }
    ];
  }

  // Beräkna max antal tecken för radbrytning baserat på behållarbredd och teckenstorlek
  function getMaxCharsForWidth(fontSize) {
    const avgCharWidth = fontSize * 0.55; // Ungefärligt
    return Math.floor(hoverInfoWidth / avgCharWidth);
  }

  function getDescriptionContent(ev) {
    const desc = ev.description || ev.label || "";
    const maxChars = getMaxCharsForWidth(hoverInfoDescriptionTextFontSize);
    const lines = wrapTextToLines(desc, maxChars);

    return [
      { text: "Styrningsunderlag", fontSize: `${hoverInfoDescriptionTitleFontSize}px`, fontWeight: "600", fill: "#666" },
      ...lines.map(line => ({
        text: line,
        fontSize: `${hoverInfoDescriptionTextFontSize}px`,
        fontWeight: "400",
        fill: "#444"
      }))
    ];
  }

  function getResponsibleContent(ev) {
    const resp = ev.responsible || "";
    if (!resp) return [{ text: "Ingen ansvarig angiven", fontSize: `${hoverInfoResponsibleTextFontSize}px`, fontWeight: "400", fill: "#888" }];

    const maxChars = getMaxCharsForWidth(hoverInfoResponsibleTextFontSize);
    const lines = wrapTextToLines(resp, maxChars);

    return [
      { text: "Ansvar", fontSize: `${hoverInfoResponsibleTitleFontSize}px`, fontWeight: "600", fill: "#666" },
      ...lines.map(line => ({
        text: line,
        fontSize: `${hoverInfoResponsibleTextFontSize}px`,
        fontWeight: "400",
        fill: "#444"
      }))
    ];
  }

  // --- Karusellvy för klickade händelser ---
  const carouselChevronSize = 24;
  const carouselChevronOffset = hoverInfoWidth / 2 + 20;

  function updateCarouselContent(ev, phase) {
    // Rensa eventuell hovringscykling
    clearHoverCycle();

    // Hämta innehåll baserat på fas
    let content;
    let options = { isScrollable: false };

    switch (phase) {
      case 0:
        content = getInitialContent(ev);
        options = { isScrollable: false };
        break;
      case 1:
        content = getDescriptionContent(ev);
        options = { isScrollable: true, textAlign: 'left' };
        break;
      case 2:
        content = getResponsibleContent(ev);
        options = { isScrollable: true, textAlign: 'left' };
        break;
    }

    // Visa innehåll
    showCenterContent(content, options);
  }

  function showCarouselChevrons() {
    // Ta bort befintliga karusellpilar först
    gCenter.selectAll(".carousel-chevron").remove();

    const chevronColor = "hsl(265, 56%, 50%)";
    const chevronHoverColor = "hsl(265, 56%, 25%)";

    // Vänsterpil (föregående)
    const leftChevron = gCenter.append("g")
      .attr("class", "carousel-chevron carousel-chevron-left")
      .attr("transform", `translate(${-carouselChevronOffset}, 0)`)
      .style("cursor", "pointer")
      .style("opacity", 0);

    // Transparent träffyta för enklare klick
    leftChevron.append("rect")
      .attr("x", -15)
      .attr("y", -15)
      .attr("width", 30)
      .attr("height", 30)
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

    // Högerpil (nästa)
    const rightChevron = gCenter.append("g")
      .attr("class", "carousel-chevron carousel-chevron-right")
      .attr("transform", `translate(${carouselChevronOffset}, 0)`)
      .style("cursor", "pointer")
      .style("opacity", 0);

    // Transparent träffyta för enklare klick
    rightChevron.append("rect")
      .attr("x", -15)
      .attr("y", -15)
      .attr("width", 30)
      .attr("height", 30)
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

    // Tona in karusellpilar
    gCenter.selectAll(".carousel-chevron")
      .transition().duration(300)
      .style("opacity", 1);
  }

  function openCarousel(ev) {
    // Visa innehåll för fas 0
    updateCarouselContent(ev, 0);
    // Skapa karusellpilar
    showCarouselChevrons();
  }

  function navigateCarousel(direction) {
    if (!state.clickedEvent) return;

    // Hitta händelse
    const ev = allVisibleEvents.find(e => e.id === state.clickedEvent);
    if (!ev) return;

    // Beräkna ny fas (loop: 0 -> 1 -> 2 -> 0)
    state.clickedEventPhase = (state.clickedEventPhase + direction + 3) % 3;

    // Uppdatera bara innehåll, behåll karusellpilar
    updateCarouselContent(ev, state.clickedEventPhase);
  }

  function hideCarouselView() {
    state.clickedEvent = null;
    state.clickedEventPhase = 0;

    // Ta bort karusellpilar
    gCenter.selectAll(".carousel-chevron")
      .transition().duration(200)
      .style("opacity", 0)
      .remove();

    // Återställ standardcenter
    updateCenterInfo(null);
  }

  function startHoverCycle(ev) {
    clearHoverCycle();

    // Fas 0: Initialt innehåll (visas direkt) - centrerat, utan rullning
    showCenterContent(getInitialContent(ev), { isScrollable: false });
    currentHoverPhase = 0;

    // Fas 1: Efter 2,5 sekunder, visa beskrivning - vänsterjusterad, rullningslist
    const t1 = setTimeout(() => {
      if (state.hoveredEvent === ev.id) {
        showCenterContent(getDescriptionContent(ev), { isScrollable: true, textAlign: 'left' });
        currentHoverPhase = 1;
      }
    }, 2500);
    hoverCycleTimeouts.push(t1);

    // Fas 2: Efter 2,5 s + 3,5 s = 6 s, visa ansvarig - vänsterjusterad, rullningslist
    const t2 = setTimeout(() => {
      if (state.hoveredEvent === ev.id) {
        showCenterContent(getResponsibleContent(ev), { isScrollable: true, textAlign: 'left' });
        currentHoverPhase = 2;
      }
    }, 6000);
    hoverCycleTimeouts.push(t2);

    // Fas 0 igen: Efter 2,5 s + 3,5 s + 3 s = 9 s, loopa tillbaka
    const t3 = setTimeout(() => {
      if (state.hoveredEvent === ev.id) {
        startHoverCycle(ev); // Rekursiv omstart
      }
    }, 9000);
    hoverCycleTimeouts.push(t3);
  }

  function updateCenterInfo(ev) {
    // Standardtitel: tona in/ut
    const centerLabels = gCenter.selectAll(".center-label");

    if (!ev) {
      // Rensa cykling och återställ standard
      clearHoverCycle();
      centerLabels.transition().duration(300).style("opacity", 1);

      gCenter.selectAll(".center-info:not(.exiting)")
        .classed("exiting", true)
        .transition().duration(200)
        .style("opacity", 0)
        .remove();
      return;
    }

    // Dölj standardtitel
    centerLabels.transition().duration(200).style("opacity", 0);

    // Starta den cyklande animationen
    startHoverCycle(ev);
  }

  // --- Hanterare för återställningsknapp ---
  const resetBtn = document.getElementById('reset-btn');


  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      state.clickedMonths.clear();
      state.clickedRings.clear();
      state.clickedPeriods.clear();
      state.selectionMode = null;

      // Återställ karusell-/händelseval
      state.clickedEvent = null;
      state.clickedEventPhase = 0;
      clearHoverCycle();

      // Återställ standardcentertext
      d3.selectAll(".center-label").transition().duration(300).style("opacity", 1);
      d3.selectAll(".center-info").remove();
      gCenter.selectAll(".carousel-chevron").remove();

      refreshHighlights();
    });
  }

  // --- Hanterare för filterknappar ---


  function getFilteredEvents() {
    const f = state.segmentFilters;
    // Unionlogik: visa om händelsen matchar NÅGOT aktivt filter
    return allVisibleEvents.filter(ev => {
      const matchVerksamhet = f.verksamhet && ev.verksamhet === true;
      const matchEkonomi = f.ekonomi && ev.ekonomi === true;
      const matchKvalitet = f.kvalitet && ev.kvalitet === true;

      return matchVerksamhet || matchEkonomi || matchKvalitet;
    });
  }

  function applyFilter() {
    state.hoveredEvent = null;
    const filteredEvents = getFilteredEvents();

    // Hjälp för att växla visning
    const setDisplay = function () {
      const evId = d3.select(this).attr("data-id");
      const isVisible = filteredEvents.some(e => e.id === evId);
      d3.select(this).style("display", isVisible ? null : "none");
    };

    gMarkers.selectAll(".event-group").each(setDisplay);
    gLabels.selectAll(".event-label-ext").each(setDisplay);
    gConnectors.selectAll(".connector-group").each(setDisplay);
  }

  // Koppla klickhanterare (äldre förinställningar)

}

/**
 * Hjälp: radbryter SVG-text till en viss bredd
 */
function wrapText(textElements, width) {
  textElements.each(function () {
    const text = d3.select(this);
    // Hämta innehåll och dela på radbrytning för att stödja manuella brytningar
    const content = text.text();
    const paragraphs = content.split(/\n/);

    // Rensa innehåll
    text.text(null);

    const x = text.attr("x");
    const y = text.attr("y");
    const dy = 0;
    const lineHeight = 1.2; // em
    let lineNumber = 0;

    paragraphs.forEach((paragraph) => {
      const words = paragraph.split(/\s+/).reverse();
      let word;
      let line = [];

      // Skapa initial tspan för detta stycke
      let tspan = text.append("tspan")
        .attr("x", x)
        .attr("y", y)
        .attr("dy", (lineNumber++ * lineHeight + dy) + "em");

      // Hantera tomma stycken (bevara radbrytningshöjd)
      if (words.length === 0 || (words.length === 1 && words[0] === "")) {
        tspan.text("\u00A0"); // Icke-brytande blanksteg för att reservera höjd
      }

      while (word = words.pop()) {
        line.push(word);
        tspan.text(line.join(" "));
        if (tspan.node().getComputedTextLength() > width && line.length > 1) {
          line.pop();
          tspan.text(line.join(" "));
          line = [word];
          tspan = text.append("tspan")
            .attr("x", x)
            .attr("y", y)
            .attr("dy", (lineNumber++ * lineHeight + dy) + "em")
            .text(word);
        }
      }
    });

    // Justering för vertikal centrering av flerradig text
    // Notera: lineNumber är nu antal rader. Ursprunglig logik använde lineNumber = extra rader.
    // Om 1 rad, är lineNumber 1. Ursprung: 0.
    // Därför subtraherar vi 1 från lineNumber för att matcha ursprungsbeteendet.
    const extraLines = lineNumber - 1;
    if (extraLines > 0) {
      const offset = (extraLines * lineHeight) / 2;
      // Notera: antar standardteckenstorlek 14px enligt originalkodens magiska tal
      text.selectAll("tspan").attr("y", y - (offset * 14));
    }
  });
}

document.addEventListener('DOMContentLoaded', initWheel);
