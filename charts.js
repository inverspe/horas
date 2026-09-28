/* Inline SVG, built as strings. Values are numeric or escaped, so innerHTML is safe.
   currentColor + CSS vars keep everything theme-aware without redrawing. */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Clock dial: 60 minute-ticks, lit clockwise from 12 in proportion to `fraction`.
 * Every fifth tick is longer, like the hour marks on a watch face. With the default
 * 60-minute goal each tick is literally one minute. Sized by CSS (viewBox only).
 */
export function dial(fraction, { ticks = 60, size = 120 } = {}) {
  const f = Math.max(0, Math.min(1, fraction));
  const lit = Math.round(ticks * f);
  const c = size / 2;
  const outer = c - 3;
  let marks = '';
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * 2 * Math.PI - Math.PI / 2;
    const major = i % 5 === 0;
    const inner = outer - (major ? 11 : 6);
    const x1 = c + inner * Math.cos(a), y1 = c + inner * Math.sin(a);
    const x2 = c + outer * Math.cos(a), y2 = c + outer * Math.sin(a);
    marks += `<line class="tick${i < lit ? ' on' : ''}${major ? ' major' : ''}" `
      + `x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" class="dial-svg${f >= 1 ? ' full' : ''}" aria-hidden="true">${marks}</svg>`;
}

/**
 * Daily bar chart. data = [{date, minutes}] oldest-first.
 * Bars carry <title> so a long-press/hover shows the exact value.
 */
export function barChart(data, { goalMin = 0, height = 132 } = {}) {
  if (!data.length) return '<p class="muted">No data yet.</p>';
  const w = 320, pad = { t: 6, r: 4, b: 16, l: 4 };
  const plotH = height - pad.t - pad.b;
  const peak = Math.max(goalMin, ...data.map((d) => d.minutes), 1);
  const slot = (w - pad.l - pad.r) / data.length;
  const barW = Math.max(2, slot * 0.68);

  const bars = data.map((d, i) => {
    const h = d.minutes > 0 ? Math.max(2, (d.minutes / peak) * plotH) : 0;
    const x = pad.l + i * slot + (slot - barW) / 2;
    const y = pad.t + plotH - h;
    const cls = d.minutes >= goalMin && goalMin > 0 ? 'bar met' : 'bar';
    if (h === 0) {
      return `<rect class="bar empty" x="${x.toFixed(1)}" y="${pad.t + plotH - 2}" width="${barW.toFixed(1)}" height="2" rx="1"><title>${esc(d.date)}: none</title></rect>`;
    }
    return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(d.date)}: ${d.minutes} min</title></rect>`;
  }).join('');

  const goalY = pad.t + plotH - (goalMin / peak) * plotH;
  const goalLine = goalMin > 0
    ? `<line class="goal" x1="${pad.l}" y1="${goalY.toFixed(1)}" x2="${w - pad.r}" y2="${goalY.toFixed(1)}" stroke-dasharray="3 3"/>` : '';

  const first = data[0].date.slice(5).replace('-', '/');
  const last = data[data.length - 1].date.slice(5).replace('-', '/');
  const labels = `<text class="axis" x="${pad.l}" y="${height - 4}">${first}</text>
    <text class="axis" x="${w - pad.r}" y="${height - 4}" text-anchor="end">${last}</text>`;

  return `<svg viewBox="0 0 ${w} ${height}" class="chart" preserveAspectRatio="none" role="img"
    aria-label="Daily minutes, ${data.length} days">${goalLine}${bars}${labels}</svg>`;
}

/** Horizontal breakdown bars, e.g. hours per source. */
export function breakdown(rows, formatValue) {
  if (!rows.length) return '<p class="muted">Nothing logged yet.</p>';
  const peak = Math.max(...rows.map((r) => r.value), 1);
  return `<div class="breakdown">` + rows.map((r) => `
    <div class="brow">
      <span class="blabel">${esc(r.label)}</span>
      <span class="btrack"><span class="bfill" style="width:${((r.value / peak) * 100).toFixed(1)}%"></span></span>
      <span class="bval">${esc(formatValue(r.value))}</span>
    </div>`).join('') + `</div>`;
}
