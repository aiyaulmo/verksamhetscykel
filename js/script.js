/**
 * Verksamhetscykel (Activity Cycle) Visualization
 * Built with D3.js v7
 *
 * This script handles the rendering of the interactive circular calendar (wheel).
 * It reads configuration and data from 'data/data.json' to ensure easy maintenance.
 *
 * Structure:
 * 1. Setup & Configuration: Reads JSON, sets up SVG and D3 scales.
 * 2. Layer Creation: Creates distinct SVG groups (g) for rings, grid, weeks, months, etc.
 * 3. Text & Labels: Renders the center text and prepares text wrapping logic.
 * 4. Rings & Grid: Draws the background concentric rings and the radial/circular grid.
 * 5. Weekly Ring: Calculates and draws 52 week segments with correct date mapping.
 * 6. Months: Draws the outer month arcs and month labels.
 * 7. Event & Markers:
 *    - Maps dates to angles.
 *    - Calculates precise positions (center of ring vs. on line).
 *    - Handles collision detection to prevent label overlaps.
 *    - Renders markers, connector lines, and labels.
 *    - Handling hover effects (dimming/highlighting).
 */

async function initWheel() {
  // --- 1. Load Data & Config ---
  const response = await fetch('data/data.json');
  const data = await response.json();
  const { config, typeStyle, events } = data;
  const year = config.year;

  // --- 2. SVG Setup ---
  const svg = d3.select("#wheel");
  const W = config.canvasWidth ?? 1800;
  const H = config.canvasHeight ?? 1800;
  const centerOffsetX = config.centerOffsetX ?? 0;
  const centerOffsetY = config.centerOffsetY ?? 0;
  const cx = W / 2 + centerOffsetX;
  const cy = H / 2 + centerOffsetY;
  svg.attr("viewBox", `0 0 ${W} ${H}`);

  // Config defaults (safe fallbacks)
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

  // Style config
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

  // Derived dimensions
  const ringGap = (ringOuter - ringInner) / ringCount;

  // --- 3. D3 Scales & Helpers ---
  const monthsList = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
  const startYear = new Date(year, 0, 1);
  const endYear = new Date(year + 1, 0, 1);

  // Time -> Angle Scale (starts at -PI/2 which is 12 o'clock)
  const angleScale = d3.scaleTime()
    .domain([startYear, endYear])
    .range([-Math.PI / 2, 3 * Math.PI / 2]);

  // Main container group
  const main = svg.append("g").attr("transform", `translate(${cx}, ${cy})`);

  // Layers (Order matters for z-index)
  // 1. Rings (Background)
  const gRingBands = main.append("g").attr("class", "ring-bands");
  // 2. Weeks
  const gWeeks = main.append("g").attr("class", "weeks");
  // 3. Months
  const gMonths = main.append("g").attr("class", "months");
  // 4. White Grid Lines (Overlay on top of backgrounds)
  const gGrid = main.append("g").attr("class", "grid");
  // 4b. Period Ring
  const gPeriodRing = main.append("g").attr("class", "period-ring");
  // 5. Content
  const gCenter = main.append("g").attr("class", "center-content");
  const gMarkers = main.append("g").attr("class", "markers");
  const gLabels = main.append("g").attr("class", "labels");

  // Interaction State
  const state = {
    clickedMonths: new Set(),
    hoveredMonth: null,
    clickedRings: new Set(),
    hoveredRing: null,
    clickedPeriods: new Set(),
    hoveredPeriod: null,
    hoveredEvent: null,
    selectionMode: null, // 'month', 'ring', or 'period' - for mutual exclusivity
    ringNames: ["langtidsplanering", "planering", "genomforande_och_uppfoljning", "uppfoljning_och_analys"]
  };

  // --- 4. Render Center Text ---
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
        .style("font-family", "'Fira Sans', sans-serif")
        .style("font-size", `${centerFontSize}px`)
        .style("font-weight", "700")
        .style("fill", centerTextColor)
        .text(i === 0 ? word + " &" : word);
    });

    // --- Reset Button (invisible circle in center) ---
    const resetText = gCenter.append("text")
      .attr("y", centerTextOffsetY)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("class", "reset-label")
      .style("font-family", "'Fira Sans', sans-serif")
      .style("font-size", `${centerFontSize}px`)
      .style("font-weight", "700")
      .style("fill", centerTextColor)
      .style("opacity", 0)
      .style("pointer-events", "none")
      .text("Återställ cykel");

    gCenter.append("circle")
      .attr("r", ringInner - 5)
      .attr("fill", "transparent")
      .attr("class", "reset-button")
      .style("cursor", "default")
      .on("mouseover", function () {
        // Only show reset if there are selections
        const hasSelections = state.clickedMonths.size > 0 ||
          state.clickedRings.size > 0 ||
          state.clickedPeriods.size > 0;
        if (hasSelections) {
          d3.select(this).style("cursor", "pointer");
          gCenter.selectAll(".center-label").style("opacity", 0);
          resetText.style("opacity", 1);
        }
      })
      .on("mouseout", function () {
        // Always restore normal state on mouseout
        d3.select(this).style("cursor", "default");
        gCenter.selectAll(".center-label").style("opacity", 1);
        resetText.style("opacity", 0);
      })
      .on("click", function () {
        // Only clear if there are selections
        const hasSelections = state.clickedMonths.size > 0 ||
          state.clickedRings.size > 0 ||
          state.clickedPeriods.size > 0;
        if (hasSelections) {
          state.clickedMonths.clear();
          state.clickedRings.clear();
          state.clickedPeriods.clear();
          state.selectionMode = null;
          refreshHighlights();
        }
      });
  }

  // --- 5. Render Rings (Backgrounds) ---
  const ringColors = config.ringColors ?? [
    "rgba(34, 18, 77, 0.9)",
    "rgba(62, 36, 118, 0.8)",
    "rgba(88, 62, 144, 0.6)",
    "rgba(128, 107, 184, 0.4)"
  ];
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

      // Add title for accessibility
      ringSegment.append("title")
        .text(`${state.ringNames[i].replace(/_/g, ' ')} - ${monthsList[mIdx]}`);

      // Add event handlers
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
          // Clear other selection types
          state.clickedMonths.clear();
          state.clickedPeriods.clear();
          state.selectionMode = 'ring';
          // Toggle this ring
          if (state.clickedRings.has(i)) state.clickedRings.delete(i);
          else state.clickedRings.add(i);
          // If no rings selected, clear mode
          if (state.clickedRings.size === 0) state.selectionMode = null;
          refreshHighlights();
        });
    });
  }

  // --- 6. Render Grid Lines ---
  for (let i = 0; i <= ringCount; i++) {
    const r = ringInner + i * ringGap;
    gGrid.append("circle")
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", gridLineWidth);
  }

  // --- 7. Render Week Ring ---
  const weekRingThickness = config.weekRingThickness ?? 16;
  const weekRingCenter = (ringOuter + monthBandR0) / 2;
  const weekBandR0 = weekRingCenter - weekRingThickness / 2;
  const weekBandR1 = weekRingCenter + weekRingThickness / 2;
  const weekArcGen = d3.arc().innerRadius(weekBandR0).outerRadius(weekBandR1);

  const nowVal = new Date();
  const currentWeekVal = d3.timeFormat("%V")(nowVal);
  const isCurrentYear = nowVal.getFullYear() === year;

  for (let w = 1; w <= 52; w++) {
    const startW = new Date(year, 0, (w - 1) * 7 + 1);
    const endW = new Date(year, 0, w * 7 + 1);
    const startA = angleScale(startW) + Math.PI / 2;
    const endA = angleScale(endW) + Math.PI / 2;

    const isCurrent = isCurrentYear && +currentWeekVal === w;

    // Week segment
    gWeeks.append("path")
      .attr("d", weekArcGen({ startAngle: startA, endAngle: endA }))
      .attr("class", `week-segment ${isCurrent ? 'is-current' : ''}`)
      .attr("fill", isCurrent ? currentWeekColor : weekRingColor)
      .attr("stroke", weekSeparatorColor)
      .attr("stroke-width", weekSeparatorWidth)
      .append("title")
      .text(`Vecka ${w}`);

    // Week number text
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

  // --- 7b. Render Period Ring Segments ---
  const periodDividerWeeks = config.periodDividerWeeks ?? [];
  const periodColors = config.periodColors ?? [];
  const periodRingR0 = config.periodRingR0 ?? 352;
  const periodRingR1 = config.periodRingR1 ?? 358;
  const periodArcGen = d3.arc().innerRadius(periodRingR0).outerRadius(periodRingR1);

  // Build period segments from divider weeks
  // Each segment goes from dividers[i] to dividers[i+1], wrapping around
  const numPeriods = periodDividerWeeks.length;

  for (let t = 0; t < numPeriods; t++) {
    const startWeek = periodDividerWeeks[t];
    const endWeek = periodDividerWeeks[(t + 1) % numPeriods];

    // Calculate angles
    const startDate = new Date(year, 0, startWeek * 7 + 1);
    const endDate = new Date(year, 0, endWeek * 7 + 1);
    let startAngle = angleScale(startDate) + Math.PI / 2;
    let endAngle = angleScale(endDate) + Math.PI / 2;

    // Handle wrap-around (when endWeek < startWeek, it spans year boundary)
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
        refreshPeriodHighlights();
      })
      .on("mouseout", function () {
        state.hoveredPeriod = null;
        refreshPeriodHighlights();
      })
      .on("click", function () {
        // Clear other selection types
        state.clickedMonths.clear();
        state.clickedRings.clear();
        state.selectionMode = 'period';
        // Toggle this period
        if (state.clickedPeriods.has(t)) state.clickedPeriods.delete(t);
        else state.clickedPeriods.add(t);
        // If no periods selected, clear mode
        if (state.clickedPeriods.size === 0) state.selectionMode = null;
        refreshHighlights();
      });
  }


  // --- 8. Render Months (Arcs + Labels) ---
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

    // Re-select to add event handlers
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
        // Clear other selection types
        state.clickedRings.clear();
        state.clickedPeriods.clear();
        state.selectionMode = 'month';
        // Toggle this month
        if (state.clickedMonths.has(i)) state.clickedMonths.delete(i);
        else state.clickedMonths.add(i);
        // If no months selected, clear mode
        if (state.clickedMonths.size === 0) state.selectionMode = null;
        refreshHighlights();
      });

    // Radial separator line
    const a = angleScale(d0);
    gGrid.append("line")
      .attr("x1", ringInner * Math.cos(a))
      .attr("y1", ringInner * Math.sin(a))
      .attr("x2", monthBandR1 * Math.cos(a))
      .attr("y2", monthBandR1 * Math.sin(a))
      .attr("stroke", "rgba(255,255,255,1.0)")
      .attr("stroke-width", gridLineWidth);

    // Month Label (inside the month band, like week numbers)
    const labelAngle = angleScale(new Date(year, i, 15));
    const monthLabelR = (monthBandR0 + monthBandR1) / 2; // Center of month band
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

  // --- 9. Events & Markers ---
  // Shape generators
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

  // --- NEW: Columnar Layout Logic ---
  const columnGapLeft = config.columnGapLeft ?? 750;
  const columnGapRight = config.columnGapRight ?? 550;
  const labelVerticalSpacingLeft = config.labelVerticalSpacingLeft ?? config.labelVerticalSpacing ?? 40;
  const labelVerticalSpacingRight = config.labelVerticalSpacingRight ?? config.labelVerticalSpacing ?? 40;

  // Calculate positions and sides
  const labelData = events.map(ev => {
    const d = new Date(ev.date);
    const a = angleScale(d);

    // Exact placement logic properties
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

    // Determine Side: Right [-PI/2, PI/2], Left [PI/2, 3PI/2]
    const isLeft = (a >= Math.PI / 2 || a <= -Math.PI / 2);

    // Initial label X position - use separate gaps for each side
    const lx = isLeft ? -columnGapLeft : columnGapRight;

    // Approx Y for sorting
    const approxY = labelR * Math.sin(a);

    // Store approxY as ly initially
    return { ...ev, a, r, x, y, lx, ly: approxY, isLeft, dateObj: d };
  });

  // Vertical Stacking Logic
  // Sort by date to maintain chronological order within each column
  const leftLabels = labelData.filter(d => d.isLeft).sort((a, b) => a.ly - b.ly);
  const rightLabels = labelData.filter(d => !d.isLeft).sort((a, b) => a.ly - b.ly);

  // Distribute labels evenly, centered around Y=0
  // This ignores angular positions and creates a compact, even column
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

  // Render Markers and Event Labels
  labelData.forEach((ev) => {
    const style = typeStyle[ev.type] || { fill: "white", shape: "circle" };

    const eventGroup = gMarkers.append("g")
      .attr("class", "event-group")
      .attr("data-id", ev.id)
      .attr("data-month", ev.dateObj.getMonth())
      .attr("role", "button")
      .attr("aria-label", `${ev.label} - ${ev.date}`);

    // Add title for native tooltip
    eventGroup.append("title")
      .text(`${ev.label}\n${ev.date}`);

    // 1. Text (Render first to measure width)
    const textX = ev.lx;
    const textY = ev.ly;
    const padding = 12;

    // 1. Label Text (render first to measure)
    const labelText = eventGroup.append("text")
      .attr("x", textX)
      .attr("y", textY)
      .attr("class", "event-label-ext")
      .attr("text-anchor", "start") // Always left-aligned
      .attr("dominant-baseline", "middle")
      .style("fill", eventLabelColor)
      .style("font-size", `${eventLabelFontSize}px`)
      .text(ev.label)
      .call(wrapText, labelWrapWidth);

    // Measure actual width
    const bbox = labelText.node().getBBox();
    const textWidth = bbox.width;

    // Add white background rect behind text
    const bgPad = 6;
    const textBBox = labelText.node().getBBox();
    eventGroup.insert("rect", ".event-label-ext")
      .attr("x", textBBox.x - bgPad)
      .attr("y", textBBox.y - bgPad)
      .attr("width", textBBox.width + bgPad * 2)
      .attr("height", textBBox.height + bgPad * 2)
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", "#fff")
      .attr("opacity", 1)
      .attr("class", "event-label-bg");

    // Calculate connector end point
    // Right side: Connect to Left Edge (lx - padding)
    // Left side: Connect to Right Edge (lx + textWidth + padding)
    const lineEndX = ev.isLeft ? (ev.lx + textWidth + padding) : (ev.lx - padding);
    const lineEndY = ev.ly;

    // Elbow point calculation with curveFactor interpolation
    // curveFactor: 0 = straight line, 1 = current curved behavior
    const connectorElbowRadius = config.connectorElbowRadius ?? 480;

    // Month-group-specific curve factors
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

    // Current behavior: elbow at marker's angle on the elbow radius
    const currentElbowAngle = ev.a;

    // Calculate where a straight line from marker to text intersects the elbow radius circle
    // Line from (ev.x, ev.y) to (lineEndX, lineEndY)
    // Circle: x² + y² = connectorElbowRadius²
    // Parametric line: P(t) = (1-t)*start + t*end
    const dx = lineEndX - ev.x;
    const dy = lineEndY - ev.y;
    const a_coef = dx * dx + dy * dy;
    const b_coef = 2 * (ev.x * dx + ev.y * dy);
    const c_coef = ev.x * ev.x + ev.y * ev.y - connectorElbowRadius * connectorElbowRadius;
    const discriminant = b_coef * b_coef - 4 * a_coef * c_coef;

    let straightLineAngle = currentElbowAngle; // Fallback
    if (discriminant >= 0 && a_coef !== 0) {
      // Find intersection points
      const sqrtDisc = Math.sqrt(discriminant);
      const t1 = (-b_coef - sqrtDisc) / (2 * a_coef);
      const t2 = (-b_coef + sqrtDisc) / (2 * a_coef);

      // Pick the t value that's between marker and text (0 < t < 1 ideally, or closest valid)
      // We want the intersection that's "between" the marker and text
      let bestT = null;
      for (const t of [t1, t2]) {
        if (t > 0 && t < 1) {
          bestT = t;
          break;
        }
      }
      // If no t in (0,1), pick the one closest to that range
      if (bestT === null) {
        bestT = (Math.abs(t1 - 0.5) < Math.abs(t2 - 0.5)) ? t1 : t2;
      }

      const intersectX = ev.x + bestT * dx;
      const intersectY = ev.y + bestT * dy;
      straightLineAngle = Math.atan2(intersectY, intersectX);
    }

    // Interpolate angle between straight line intersection and current radial position
    // Handle angle wrapping for smooth interpolation
    let angleDiff = currentElbowAngle - straightLineAngle;
    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    const interpolatedAngle = straightLineAngle + angleDiff * connectorCurveFactor;

    const elbowX = connectorElbowRadius * Math.cos(interpolatedAngle);
    const elbowY = connectorElbowRadius * Math.sin(interpolatedAngle);

    // Build polyline path: Marker -> Elbow -> Text
    const polylinePath = `M ${ev.x},${ev.y} L ${elbowX},${elbowY} L ${lineEndX},${lineEndY}`;

    // 2. Halo (White outline - inserted at beginning so it's behind everything)
    eventGroup.insert("path", ":first-child")
      .attr("d", polylinePath)
      .attr("class", "connector-halo")
      .attr("stroke", "#fff")
      .attr("stroke-width", connectorLineWidth + 4)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .attr("opacity", 0);

    // 3. Connector Line (inserted after halo but before text)
    eventGroup.insert("path", ".event-label-bg")
      .attr("d", polylinePath)
      .attr("class", "connector-line")
      .attr("stroke", style.fill)
      .attr("stroke-width", connectorLineWidth)
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("fill", "none")
      .attr("opacity", 0.6);

    // 4. Marker (Shape)
    const marker = eventGroup.append("g")
      .attr("class", "marker-wrap")
      .attr("transform", `translate(${ev.x}, ${ev.y})`);

    marker.append("path")
      .attr("d", shapeGenerator[style.shape || "circle"](markerBaseSize))
      .attr("fill", style.fill)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // 5. Hit Area
    eventGroup.append("rect")
      .attr("x", ev.lx - 10)
      .attr("y", bbox.y - 5)
      .attr("width", labelWrapWidth + 20).attr("height", bbox.height + 10)
      .attr("fill", "transparent")
      .attr("class", "label-hit-area");

    // Event Interactions
    eventGroup
      .on("mouseover", function () {
        // Store hovered event for potential use
        state.hoveredEvent = ev.id;

        // Dim all others, highlight this one
        gMarkers.selectAll(".event-group").classed("is-dimmed", true);
        d3.select(this).classed("is-dimmed", false).classed("is-active", true);

        // Highlight connector
        d3.select(this).select(".connector-halo")
          .attr("opacity", 0.8)
          .attr("stroke-width", (connectorLineWidth * 1.5) + 2);

        d3.select(this).select(".connector-line")
          .attr("stroke-dasharray", "0")
          .attr("opacity", 1)
          .attr("stroke-width", connectorLineWidth * 1.5);

        marker.transition().duration(200).attr("transform", `translate(${ev.x}, ${ev.y}) scale(${markerHoverScale})`);

        // Enlarge label text
        d3.select(this).select(".event-label-ext")
          .transition().duration(200)
          .style("font-size", `${eventLabelHoverFontSize}px`);
      })
      .on("mouseout", function () {
        state.hoveredEvent = null;

        // Reset connector
        d3.select(this).select(".connector-halo").attr("opacity", 0);
        d3.select(this).select(".connector-line")
          .attr("opacity", 0.6)
          .attr("stroke-width", connectorLineWidth);

        marker.transition().duration(200).attr("transform", `translate(${ev.x}, ${ev.y}) scale(1)`);

        // Reset label text
        d3.select(this).select(".event-label-ext")
          .transition().duration(200)
          .style("font-size", `${eventLabelFontSize}px`);

        // Restore proper selection state
        refreshHighlights();
      });
  });

  // --- 10. Unified Highlight Refresh Logic ---
  function refreshHighlights() {
    // Build active sets for each type (clicked + hovered)
    const activeMonths = new Set(state.clickedMonths);
    if (state.hoveredMonth !== null) activeMonths.add(state.hoveredMonth);

    const activeRings = new Set(state.clickedRings);
    if (state.hoveredRing !== null) activeRings.add(state.hoveredRing);

    const activePeriods = new Set(state.clickedPeriods);
    if (state.hoveredPeriod !== null) activePeriods.add(state.hoveredPeriod);

    // Check what's active
    const hasMonthActive = activeMonths.size > 0;
    const hasRingActive = activeRings.size > 0;
    const hasPeriodActive = activePeriods.size > 0;
    const hasAnyActive = hasMonthActive || hasRingActive || hasPeriodActive;

    // --- Update Month Arcs ---
    gMonths.selectAll(".month-arc").each(function () {
      const m = +d3.select(this).attr("data-month");
      const isActive = hasMonthActive && activeMonths.has(m);
      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasRingActive && !hasPeriodActive);
    });

    // --- Update Ring Segments ---
    gRingBands.selectAll(".ring-segment").each(function () {
      const m = +d3.select(this).attr("data-month");
      const r = +d3.select(this).attr("data-ring");

      let isActive = false;
      if (hasRingActive) {
        isActive = activeRings.has(r);
      } else if (hasMonthActive) {
        isActive = activeMonths.has(m);
      }
      // Periods don't directly highlight ring segments

      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive);
    });

    // --- Update Month Labels ---
    gLabels.selectAll(".label.month").each(function () {
      const m = +d3.select(this).attr("data-month");
      const isActive = hasMonthActive && activeMonths.has(m);
      d3.select(this)
        .classed("is-active", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasRingActive && !hasPeriodActive);
    });

    // --- Update Event Markers ---
    gMarkers.selectAll(".event-group").each(function () {
      const m = +d3.select(this).attr("data-month");
      const evId = d3.select(this).attr("data-id");
      const ev = events.find(e => e.id === evId);

      let isActive = false;
      if (hasRingActive) {
        // Active if event is in any of the active rings
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
        // Check if event's week falls within active periods
        const eventDate = new Date(ev.date);
        const weekNum = getWeekNumber(eventDate);
        const activeWeeks = getActiveWeeksFromPeriods(activePeriods);
        isActive = activeWeeks.has(weekNum);
      }

      d3.select(this)
        .classed("is-active-slice", isActive)
        .classed("is-dimmed", hasAnyActive && !isActive);
    });

    // --- Update Period Segments ---
    gPeriodRing.selectAll(".period-segment").each(function (d, i) {
      const isActive = activePeriods.has(i);
      const originalColor = d3.select(this).attr("data-color");
      d3.select(this)
        .attr("fill", originalColor)
        .attr("stroke-width", isActive ? 1.5 : 0.5)
        .classed("is-dimmed", hasAnyActive && !isActive && !hasMonthActive && !hasRingActive);
    });

    // --- Update Week Segments (for period highlighting) ---
    const activeWeeks = getActiveWeeksFromPeriods(activePeriods);
    gWeeks.selectAll(".week-segment").each(function () {
      const title = d3.select(this).select("title").text();
      const weekNum = parseInt(title.replace("Vecka ", ""));
      d3.select(this).classed("is-period-active", activeWeeks.has(weekNum));
    });

    // --- Update Week Labels ---
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

  // Helper: Get week number from date
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // Helper: Get active weeks from period indices
  function getActiveWeeksFromPeriods(activePeriodIndices) {
    const activeWeeks = new Set();
    gPeriodRing.selectAll(".period-segment").each(function (d, i) {
      if (activePeriodIndices.has(i)) {
        const sw = +d3.select(this).attr("data-start-week");
        const ew = +d3.select(this).attr("data-end-week");
        const wraps = d3.select(this).attr("data-wraps") === "true";

        for (let w = 1; w <= 52; w++) {
          let isIn;
          if (wraps) isIn = (w > sw || w <= ew);
          else isIn = (w > sw && w <= ew);
          if (isIn) activeWeeks.add(w);
        }
      }
    });
    return activeWeeks;
  }

  // Keep refreshPeriodHighlights as alias for backwards compatibility with hover
  function refreshPeriodHighlights() {
    refreshHighlights();
  }
}

/**
 * Utility: Wraps SVG text to a specific width
 */
function wrapText(textElements, width) {
  textElements.each(function () {
    const text = d3.select(this);
    const words = text.text().split(/\s+/).reverse();
    let word;
    let line = [];
    let lineNumber = 0;
    const lineHeight = 1.2; // ems
    const x = text.attr("x");
    const y = text.attr("y");
    const dy = 0; // parseFloat(text.attr("dy")); 

    // Reset content
    let tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", dy + "em");

    while (word = words.pop()) {
      line.push(word);
      tspan.text(line.join(" "));
      if (tspan.node().getComputedTextLength() > width && line.length > 1) {
        line.pop();
        tspan.text(line.join(" "));
        line = [word];
        tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
      }
    }

    // Vertical centering adjustment for multi-line text
    if (lineNumber > 0) {
      const offset = (lineNumber * lineHeight) / 2;
      text.selectAll("tspan").attr("y", y - (offset * 14));
    }
  });
}

document.addEventListener('DOMContentLoaded', initWheel);
