/**
 * Hjälpfunktioner för visualiseringen av verksamhetscykeln
 */

/**
 * Radbryter SVG-text till en viss bredd
 * @param {d3.Selection} textElements - D3-urval av textelement
 * @param {number} width - Maxbredd i pixlar
 */
export function wrapText(textElements, width) {
  textElements.each(function () {
    const text = d3.select(this);
    const content = text.text();
    const paragraphs = content.split(/\n/);

    text.text(null);

    const x = text.attr("x");
    const y = text.attr("y");
    const dy = 0;
    const lineHeight = 1.2;
    let lineNumber = 0;

    paragraphs.forEach((paragraph) => {
      const words = paragraph.split(/\s+/).reverse();
      let word;
      let line = [];

      let tspan = text.append("tspan")
        .attr("x", x)
        .attr("y", y)
        .attr("dy", (lineNumber++ * lineHeight + dy) + "em");

      if (words.length === 0 || (words.length === 1 && words[0] === "")) {
        tspan.text("\u00A0");
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

    const extraLines = lineNumber - 1;
    if (extraLines > 0) {
      const offset = (extraLines * lineHeight) / 2;
      text.selectAll("tspan").attr("y", y - (offset * 14));
    }
  });
}

/**
 * Radbryter text baserat på max antal tecken per rad
 * @param {string} text - Text att radbryta
 * @param {number} maxChars - Max antal tecken per rad
 * @returns {string[]} Array med rader
 */
export function wrapTextToLines(text, maxChars) {
  const segments = text.split('\n');
  const allLines = [];

  segments.forEach(segment => {
    const words = segment.trim().split(' ');
    let currentLine = '';

    words.forEach(word => {
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

/**
 * Beräknar arbetsdagar (mån-fre) mellan två datum
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {number} Antal arbetsdagar
 */
export function getWorkdaysBetween(startDate, endDate) {
  let count = 0;
  const curDate = new Date(startDate);
  while (curDate <= endDate) {
    const dayOfWeek = curDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
}

/**
 * Hämtar ISO-veckonummer från datum
 * @param {Date} date
 * @returns {number} Veckonummer (1-53)
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Hämtar ISO-veckans datumintervall begränsat till årets gränser
 * @param {number} year
 * @param {number} week
 * @returns {{start: Date, end: Date}}
 */
export function getIsoWeekRange(year, week) {
  const d = new Date(year, 0, 4);
  const day = d.getDay() || 7;
  const week1Monday = new Date(d);
  week1Monday.setDate(d.getDate() - day + 1);

  const weekMonday = new Date(week1Monday);
  weekMonday.setDate(week1Monday.getDate() + (week - 1) * 7);

  const jan1 = new Date(year, 0, 1);
  const start = weekMonday < jan1 ? jan1 : weekMonday;

  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);

  const dec31 = new Date(year, 11, 31);
  const end = weekSunday > dec31 ? dec31 : weekSunday;

  return { start, end };
}

/**
 * Sökvägsgeneratorer för markörformer
 */
export const shapeGenerators = {
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
