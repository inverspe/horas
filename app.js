import * as store from './store.js';
import * as S from './stats.js';
import { ring, barChart, breakdown } from './charts.js';

const $ = (id) => document.getElementById(id);
const QUICK_ADDS = [10, 15, 20, 30, 45, 60];
const KIND_LABELS = {
  video: 'Video',
  audio: 'Audio / podcast',
  reading: 'Reading',
  conversation: 'Conversation',
};

let sessions = [];
let settings = store.DEFAULT_SETTINGS;
let currentTab = 'log';

/* ----------------------------- rendering ----------------------------- */

function renderHero() {
  const mins = S.totalMinutes(sessions);
  const hours = mins / 60;
  const prog = S.milestoneProgress(hours, settings.milestones);

  $('ring').innerHTML = ring(prog.pct);
  $('total-hours').textContent = hours >= 100 ? Math.round(hours) : hours.toFixed(1);

  $('milestone-line').textContent = prog.next === null
    ? `Past your final milestone of ${prog.prev}h — outstanding.`
    : `Level ${prog.level + 1} · ${prog.remaining.toFixed(1)}h to ${prog.next}h`;

  const today = S.localDate();
  const todayMin = S.byDay(sessions).get(today) || 0;
  $('stat-today').textContent = S.formatHM(todayMin);
  $('stat-today').classList.toggle('hit', settings.dailyGoalMin > 0 && todayMin >= settings.dailyGoalMin);
  $('stat-streak').textContent = String(S.streak(sessions, today));
  $('stat-avg').textContent = S.formatHM(S.totalMinutes(S.lastNDays(sessions, 7, today)) / 7);
}

function renderSourceOptions() {
  const list = $('source-list');
  list.replaceChildren();
  for (const row of S.bySource(sessions).slice(0, 20)) {
    if (row.source === 'Unlabelled') continue;
    const opt = document.createElement('option');
    opt.value = row.source;
    list.append(opt);
  }
}

function renderHistory() {
  const host = $('history');
  if (!sessions.length) {
    host.replaceChildren();
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No sessions yet. Log your first one on the Log tab.';
    host.append(p);
    return;
  }

  const groups = new Map();
  for (const s of sessions) {
    if (!groups.has(s.date)) groups.set(s.date, []);
    groups.get(s.date).push(s);
  }
  const dates = [...groups.keys()].sort().reverse();
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const today = S.localDate();

  host.replaceChildren();
  for (const date of dates) {
    const rows = groups.get(date).sort((a, b) => b.createdAt - a.createdAt);

    const section = document.createElement('section');
    section.className = 'card day';

    const head = document.createElement('div');
    head.className = 'day-head';
    const label = document.createElement('span');
    label.textContent = date === today ? 'Today'
      : date === S.addDays(today, -1) ? 'Yesterday'
      : fmt.format(S.parseLocalDate(date));
    const dayTotal = document.createElement('span');
    dayTotal.className = 'day-total';
    dayTotal.textContent = S.formatHM(S.totalMinutes(rows));
    head.append(label, dayTotal);
    section.append(head);

    for (const s of rows) {
      const row = document.createElement('div');
      row.className = 'entry';

      const main = document.createElement('div');
      main.className = 'entry-main';
      const source = (s.source || '').trim();
      const kindLabel = KIND_LABELS[s.kind] || s.kind;
      const title = document.createElement('span');
      title.className = 'entry-title';
      title.textContent = source || kindLabel || 'Session';
      const meta = document.createElement('span');
      meta.className = 'entry-meta';
      // Don't repeat the kind in the subtitle when it's already the title.
      meta.textContent = (source ? [kindLabel, s.note] : [s.note]).filter(Boolean).join(' · ');
      main.append(title, meta);

      const mins = document.createElement('span');
      mins.className = 'entry-min';
      mins.textContent = S.formatHM(s.minutes);

      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.setAttribute('aria-label', `Delete ${s.minutes} minute session on ${s.date}`);
      del.textContent = '✕';
      del.addEventListener('click', async () => {
        await store.removeSession(s.id);
        sessions = sessions.filter((x) => x.id !== s.id);
        refresh();
        toast('Session deleted');
      });

      row.append(main, mins, del);
      section.append(row);
    }
    host.append(section);
  }
}

function fillDefinitionList(el, rows) {
  el.replaceChildren();
  for (const [k, v] of Object.entries(rows)) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    el.append(dt, dd);
  }
}

function renderStats() {
  const today = S.localDate();
  const series = S.lastNDays(sessions, 30, today);
  $('chart-30').innerHTML = barChart(series, { goalMin: settings.dailyGoalMin });
  $('chart-legend').textContent = settings.dailyGoalMin > 0
    ? `Dashed line = your ${settings.dailyGoalMin} min daily goal. Solid bars met it.`
    : 'Set a daily goal in Settings to show a target line.';

  const total = S.totalMinutes(sessions);
  const weekFrom = S.weekStart(today);
  const monthFrom = today.slice(0, 8) + '01';
  const activeDays = [...S.byDay(sessions).values()].filter((m) => m > 0).length;

  fillDefinitionList($('totals'), {
    'All time': `${(total / 60).toFixed(1)} h`,
    'This week': S.formatHM(S.minutesInRange(sessions, weekFrom, today)),
    'This month': S.formatHM(S.minutesInRange(sessions, monthFrom, today)),
    'Last 30 days': S.formatHM(S.totalMinutes(series)),
    'Days logged': String(activeDays),
    'Avg per active day': activeDays ? S.formatHM(total / activeDays) : '—',
    'Current streak': `${S.streak(sessions, today)} days`,
    'Longest streak': `${S.longestStreak(sessions)} days`,
    'Sessions': String(sessions.length),
  });

  const prog = S.milestoneProgress(total / 60, settings.milestones);
  if (prog.next === null) {
    $('pace').textContent = 'You have passed every milestone on your list.';
  } else {
    const p = S.projection(sessions, prog.next, today);
    if (p.days === null) {
      $('pace').textContent = 'No input logged in the last 30 days, so there is no pace to project from.';
    } else {
      const when = new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
        .format(S.parseLocalDate(p.date));
      $('pace').textContent = `Averaging ${S.formatHM(p.perDay)} a day over the last 30 days. `
        + `At that rate you reach ${prog.next}h in ${p.days} days — around ${when}.`;
    }
  }

  $('by-source').innerHTML = breakdown(
    S.bySource(sessions).slice(0, 8).map((r) => ({ label: r.source, value: r.minutes })),
    (v) => `${(v / 60).toFixed(1)}h`);
  $('by-kind').innerHTML = breakdown(
    S.byKind(sessions).map((r) => ({ label: KIND_LABELS[r.kind] || r.kind, value: r.minutes })),
    (v) => `${(v / 60).toFixed(1)}h`);
}

function refresh() {
  renderHero();
  renderSourceOptions();
  if (currentTab === 'history') renderHistory();
  if (currentTab === 'stats') renderStats();
}

/* ------------------------------ actions ------------------------------ */

async function addSession({ minutes, date, kind = 'video', source = '', note = '' }) {
  const rec = {
    id: store.newId(),
    date,
    minutes: Number(minutes),
    kind,
    source: source.trim(),
    note: note.trim(),
    createdAt: Date.now(),
  };
  await store.putSession(rec);
  sessions.push(rec);
  refresh();
  return rec;
}

function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2400);
}

function showTab(tab) {
  currentTab = tab;
  for (const name of ['log', 'history', 'stats', 'settings']) {
    $(`view-${name}`).hidden = name !== tab;
  }
  for (const btn of document.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  $('title').textContent = { log: 'Horas', history: 'History', stats: 'Stats', settings: 'Settings' }[tab];
  if (tab === 'history') renderHistory();
  if (tab === 'stats') renderStats();
  if (tab === 'settings') { fillSettings(); diagnostics(); }
  window.scrollTo(0, 0);
}

function fillSettings() {
  $('s-goal').value = settings.dailyGoalMin;
  $('s-milestones').value = settings.milestones.join(', ');
}

async function diagnostics() {
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  const est = await store.usage();
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* unsupported */ }
  let swState = 'unsupported';
  if ('serviceWorker' in navigator) {
    swState = (await navigator.serviceWorker.getRegistration()) ? 'registered' : 'not registered';
  }

  fillDefinitionList($('diag'), {
    'Installed': standalone ? 'yes (home screen)' : 'no (running in browser)',
    'Secure context': window.isSecureContext ? 'yes' : 'no — service worker disabled',
    'Service worker': swState,
    'Storage persisted': persisted ? 'yes' : 'no / unknown',
    'Storage used': est?.usage != null ? `${(est.usage / 1024).toFixed(1)} KB` : 'unknown',
    'Sessions stored': String(sessions.length),
  });
}

/* ------------------------------- wiring ------------------------------ */

$('quick').replaceChildren(...QUICK_ADDS.map((m) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = `+${m}m`;
  b.addEventListener('click', async () => {
    await addSession({ minutes: m, date: S.localDate() });
    toast(`Logged ${m} minutes`);
  });
  return b;
}));

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const minutes = Number($('f-minutes').value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    toast('Enter a positive number of minutes');
    return;
  }
  await addSession({
    minutes,
    date: $('f-date').value || S.localDate(),
    kind: $('f-kind').value,
    source: $('f-source').value,
    note: $('f-note').value,
  });
  $('f-minutes').value = '';
  $('f-note').value = '';
  $('f-date').value = S.localDate();
  toast(`Logged ${S.formatHM(minutes)}`);
});

for (const btn of document.querySelectorAll('.tab')) {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
}
$('settings-btn').addEventListener('click', () => showTab(currentTab === 'settings' ? 'log' : 'settings'));

$('save-settings').addEventListener('click', async () => {
  const goal = Math.max(0, Math.min(1440, Number($('s-goal').value) || 0));
  const milestones = $('s-milestones').value
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (!milestones.length) {
    toast('Add at least one milestone');
    return;
  }
  settings = { ...settings, dailyGoalMin: goal, milestones };
  await store.saveSettings(settings);
  fillSettings();
  refresh();
  toast('Settings saved');
});

$('export-btn').addEventListener('click', async () => {
  const blob = new Blob([await store.exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `horas-backup-${S.localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

let importMode = 'merge';
$('merge-btn').addEventListener('click', () => {
  importMode = 'merge';
  $('import-file').click();
});
$('replace-btn').addEventListener('click', () => {
  if (sessions.length && !confirm('Replace ALL current sessions with the backup file?')) return;
  importMode = 'replace';
  $('import-file').click();
});

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const n = await store.importJSON(await file.text(), { merge: importMode === 'merge' });
    sessions = await store.allSessions();
    settings = await store.getSettings();
    fillSettings();
    refresh();
    diagnostics();
    toast(`${importMode === 'merge' ? 'Merged' : 'Imported'} ${n} session${n === 1 ? '' : 's'}`);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

$('wipe-btn').addEventListener('click', async () => {
  if (!confirm('Delete every logged session? This cannot be undone. Export a backup first.')) return;
  await store.clearSessions();
  sessions = [];
  refresh();
  diagnostics();
  toast('All sessions deleted');
});

async function boot() {
  [sessions, settings] = await Promise.all([store.allSessions(), store.getSettings()]);
  $('f-date').value = S.localDate();
  $('f-date').max = S.localDate();
  refresh();
  store.requestPersistence();

  // Service workers require a secure context: HTTPS, or localhost. Over plain http://
  // on a LAN IP registration throws, which is expected during dev.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Update ready — reopen the app');
          }
        });
      });
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  }
}

// Exposed so the test page can drive the real app rather than reimplementing it.
window.__horas = {
  addSession,
  refresh,
  showTab,
  store,
  S,
  get sessions() { return sessions; },
  get settings() { return settings; },
};

boot();
