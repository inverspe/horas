/* Pure functions only — no DOM, no storage. Everything here is covered by tests.html.
   All dates are LOCAL 'YYYY-MM-DD' strings. Never use toISOString() for a calendar
   day: it converts to UTC, so an 8pm session in UTC-5 would be filed under tomorrow. */

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight, no UTC shift
}

export function addDays(s, n) {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n); // handles month/year/DST rollover
  return localDate(d);
}

export function daysBetween(a, b) {
  return Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
}

export const totalMinutes = (sessions) => sessions.reduce((n, s) => n + (s.minutes || 0), 0);

/** Map of 'YYYY-MM-DD' -> minutes. */
export function byDay(sessions) {
  const m = new Map();
  for (const s of sessions) m.set(s.date, (m.get(s.date) || 0) + (s.minutes || 0));
  return m;
}

/** Consecutive days with any input. Today not yet logged doesn't break the streak —
    it only breaks once a full day has been missed. */
export function streak(sessions, today = localDate()) {
  const days = byDay(sessions);
  const has = (d) => (days.get(d) || 0) > 0;
  let cursor = today;
  if (!has(cursor)) {
    cursor = addDays(today, -1);
    if (!has(cursor)) return 0;
  }
  let n = 0;
  while (has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function longestStreak(sessions) {
  const dates = [...byDay(sessions)].filter(([, m]) => m > 0).map(([d]) => d).sort();
  let best = 0, run = 0, prev = null;
  for (const d of dates) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    prev = d;
    if (run > best) best = run;
  }
  return best;
}

/** Oldest-first series of the last n days, zero-filled for gaps. */
export function lastNDays(sessions, n, today = localDate()) {
  const days = byDay(sessions);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    out.push({ date, minutes: days.get(date) || 0 });
  }
  return out;
}

export function minutesInRange(sessions, from, to) {
  return totalMinutes(sessions.filter((s) => s.date >= from && s.date <= to));
}

/** Monday-based start of the week containing `date`. */
export function weekStart(date) {
  const d = parseLocalDate(date);
  const shift = (d.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  return addDays(date, -shift);
}

export function bySource(sessions) {
  const m = new Map();
  for (const s of sessions) {
    const key = (s.source || '').trim() || 'Unlabelled';
    m.set(key, (m.get(key) || 0) + (s.minutes || 0));
  }
  return [...m].map(([source, minutes]) => ({ source, minutes })).sort((a, b) => b.minutes - a.minutes);
}

export function byKind(sessions) {
  const m = new Map();
  for (const s of sessions) m.set(s.kind || 'video', (m.get(s.kind || 'video') || 0) + (s.minutes || 0));
  return [...m].map(([kind, minutes]) => ({ kind, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** Where `hours` sits on the milestone ladder. level is 0-based (0 = below first). */
export function milestoneProgress(hours, milestones) {
  const ms = [...milestones].filter((n) => n > 0).sort((a, b) => a - b);
  let level = 0;
  while (level < ms.length && hours >= ms[level]) level++;
  const prev = level > 0 ? ms[level - 1] : 0;
  const next = level < ms.length ? ms[level] : null;
  const span = next === null ? 0 : next - prev;
  return {
    level,
    prev,
    next,
    remaining: next === null ? 0 : Math.max(0, next - hours),
    pct: next === null ? 1 : Math.max(0, Math.min(1, span ? (hours - prev) / span : 1)),
  };
}

/** Projected date of hitting `targetHours` at the recent daily rate. */
export function projection(sessions, targetHours, today = localDate(), window = 30) {
  const recent = lastNDays(sessions, window, today);
  const perDay = totalMinutes(recent) / window;
  const done = totalMinutes(sessions) / 60;
  if (done >= targetHours) return { done: true, perDay, days: 0, date: today };
  if (perDay <= 0) return { done: false, perDay: 0, days: null, date: null };
  const days = Math.ceil(((targetHours - done) * 60) / perDay);
  return { done: false, perDay, days, date: addDays(today, days) };
}

export function formatHM(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
