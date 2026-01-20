/**
 * Ritning av månadsbågar för visualiseringen av verksamhetscykeln
 */

import { MONTHS_LIST } from './config.js';
import { toggleMonth } from './state.js';

/**
 * Ritar månadsbitar och etiketter
 * @param {d3.Selection} gMonths - Grupp för månader
 * @param {d3.Selection} gLabels - Grupp för etiketter
 * @param {Object} config - Konfigurationsobjekt
 * @param {Object} layout - Layoutkonfiguration
 * @param {d3.ScaleTime} angleScale - Vinkelskala
 * @param {Object} arcs - Båggeneratorer
 * @param {Object} state - Applikationens tillstånd
 * @param {Function} refreshHighlights - Återanrop för markeringar
 */
export function renderMonths(gMonths, gLabels, config, layout, angleScale, arcs, state, refreshHighlights) {
  const year = config.year;

  MONTHS_LIST.forEach((m, i) => {
    const d0 = new Date(year, i, 1);
    const d1 = new Date(year, i + 1, 1);
    const startA = angleScale(d0) + Math.PI / 2;
    const endA = angleScale(d1) + Math.PI / 2;

    // Månadsbåge
    gMonths.append("path")
      .attr("d", arcs.monthArc({ startAngle: startA, endAngle: endA }))
      .attr("class", "month-arc")
      .attr("fill", layout.monthRingColor)
      .attr("data-month", i)
      .append("title")
      .text(`${m} ${year}`);

    // Lägg till händelsehanterare
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
        toggleMonth(state, i);
        refreshHighlights();
      });

    // Månadsrubrik
    const labelAngle = angleScale(new Date(year, i, 15));
    const monthLabelR = (layout.monthBandR0 + layout.monthBandR1) / 2;
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
      .style("fill", layout.monthLabelColor)
      .style("font-size", `${layout.monthLabelFontSize}px`)
      .style("font-weight", "700")
      .style("text-transform", layout.monthLabelTextTransform)
      .text(m);
  });
}
