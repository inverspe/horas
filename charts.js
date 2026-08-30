/* Inline SVG, built as strings. Values are numeric or escaped, so innerHTML is safe.
   currentColor + CSS vars keep everything theme-aware without redrawing. */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Progress ring. pct is 0..1. */
export function ring(pct, { size = 132, stroke = 11 } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  const mid = size / 2;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="ring" aria-hidden="true">
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
      transform="rotate(-90 ${mid} ${mid})"/>
  </svg>`;
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
