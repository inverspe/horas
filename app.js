import * as store from './store.js';
import * as S from './stats.js';
import { dial, barChart, breakdown } from './charts.js';

const $ = (id) => document.getElementById(id);
const QUICK_ADDS = [10, 15, 20, 30, 45, 60];
const KIND_LABELS = {
  video: 'Video',
  audio: 'Audio / podcast',
  reading: 'Reading',
  conversation: 'Conversation',
};
// Lower-case forms for running text, e.g. "Dreaming Spanish, video".
const KIND_WORDS = { video: 'video', audio: 'audio', reading: 'reading', conversation: 'conversation' };

// Sentences say "43 min" / "1 h 15 min"; the compact "43m" stays in data columns.
const spoken = (m) => {
  const t = Math.round(m), h = Math.floor(t / 60), mm = t % 60;
  return h ? (mm ? `${h} h ${mm} min` : `${h} h`) : `${t} min`;
};

let sessions = [];
let settings = store.DEFAULT_SETTINGS;
let currentTab = 'log';

/* ----------------------------- rendering ----------------------------- */

/**
 * Hour meter. Four whole-hour drums plus a saffron tenths drum, like a Hobbs meter.
 * Each drum is a strip of 0–9 translated by --d, so a CSS transition makes it roll;
 * only drums whose digit changed move, which is what makes logging feel physical.
 */
let meterPrimed = false;
let meterState = { digits: [0, 0, 0, 0, 0], leading: 3 };
function renderMeter(hours) {
  const meter = $('meter');
  if (!meter.childElementCount) {
    const strip = Array.from({ length: 10 }, (_, n) => `<span>${n}</span>`).join('');
    const drum = (cls) => `<span class="drum${cls}" style="--d:0"><span class="strip">${strip}</span></span>`;
    meter.innerHTML = drum('') + drum('') + drum('') + drum('')
      + '<span class="point" aria-hidden="true"></span>' + drum(' tenths');
  }

  // Round to the tenth so the meter agrees with Stats ("111.4 h") to the digit.
  const tenths = Math.round(Math.min(9999.9, Math.max(0, hours)) * 10);
  const digits = String(Math.floor(tenths / 10)).padStart(4, '0').split('').map(Number);
  digits.push(tenths % 10);
  const firstSignificant = digits.slice(0, 3).findIndex((d) => d !== 0);
  const leading = firstSignificant === -1 ? 3 : firstSignificant;

  // apply() reads the LATEST state, not values captured when it was scheduled: the
  // first roll is deferred two frames, and a render landing inside that window must
  // not be overwritten by the stale deferred one.
  meterState = { digits, leading };
  const drums = meter.querySelectorAll('.drum');
  const apply = () => drums.forEach((el, i) => {
    el.style.setProperty('--d', meterState.digits[i]);
    el.classList.toggle('lead', i < meterState.leading);   // dim leading zeros, as a meter does
  });
  // First render rolls up from zero — the app's one orchestrated moment on open.
  // Two frames so the zeroed state paints before the transition target is set.
  if (meterPrimed) apply();
  else { meterPrimed = true; requestAnimationFrame(() => requestAnimationFrame(apply)); }
  meter.setAttribute('aria-label', `${(tenths / 10).toFixed(1)} hours`);
}

function renderHero() {
  const hours = S.totalMinutes(sessions) / 60;
  renderMeter(hours);

  const prog = S.milestoneProgress(hours, settings.milestones);
  $('level-name').textContent = `Level ${prog.level + 1}`;
  $('track-fill').style.width = `${(prog.pct * 100).toFixed(1)}%`;
  if (prog.next === null) {
    $('level-next').textContent = `${prog.prev} h`;
    $('level-sub').textContent = `Past your final milestone of ${prog.prev} hours.`;
  } else {
    $('level-next').textContent = `${prog.next} h`;
    $('level-sub').textContent = `${prog.remaining.toFixed(1)} hours to Level ${prog.level + 2}`;
  }

  const today = S.localDate();
  const todayMin = Math.round(S.byDay(sessions).get(today) || 0);
  const goal = settings.dailyGoalMin;
  const streak = S.streak(sessions, today);
  const avg = S.totalMinutes(S.lastNDays(sessions, 7, today)) / 7;

  // Today's dial. A goal of 0 means "no goal": the dial hides, the facts remain.
  const wrap = $('goal-wrap');
  wrap.hidden = goal <= 0;
  if (goal > 0) {
    const left = Math.max(0, goal - todayMin);
    const met = left === 0;
    $('goal-ring').innerHTML = dial(todayMin / goal);
    $('goal-left').textContent = met ? 'Done' : String(left);
    $('goal-left').classList.toggle('met', met);
    $('goal-label').textContent = met
      ? (todayMin > goal ? `+${todayMin - goal} min` : 'goal met')
      : 'min to go';
  }

  $('stat-today').textContent = goal <= 0 ? `${spoken(todayMin)} today`
    : todayMin >= goal ? `${todayMin} min today, goal met`
    : `${todayMin} of ${goal} min today`;
  $('stat-streak').textContent = streak === 0 ? 'Log anything to start a streak'
    : streak === 1 ? '1 day in a row' : `${streak} days in a row`;
  $('stat-avg').textContent = `${spoken(avg)} a day, last 7 days`;
}

const sortedSources = () =>
  [...(settings.sources || [])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

/** Add to the managed list, case-insensitively deduped. Returns the stored spelling. */
async function addSource(rawName) {
  const name = rawName.trim().slice(0, 60);
  if (!name) return null;
  const existing = (settings.sources || [])
    .find((s) => s.toLowerCase() === name.toLowerCase());
  if (existing) return existing;             // keep the original spelling
  settings = { ...settings, sources: [...(settings.sources || []), name], sourcesSeeded: true };
  await store.saveSettings(settings);
  renderSourcePicker();
  renderSourceManager();
  return name;
}

/** Removes from the picker only — sessions using this source are left untouched. */
async function removeSource(name) {
  settings = {
    ...settings,
    sources: (settings.sources || []).filter((s) => s !== name),
    sourcesSeeded: true,
  };
  await store.saveSettings(settings);
  renderSourcePicker();
  renderSourceManager();
}

function renderSourcePicker() {
  const list = $('source-list');
  list.replaceChildren();
  for (const name of sortedSources()) {
    const opt = document.createElement('option');
    opt.value = name;
    list.append(opt);
  }
  // iOS Safari draws a chevron for any input carrying `list`, even an empty one,
  // which then does nothing when tapped. Only attach it once there's something to show.
  if (list.children.length) $('f-source').setAttribute('list', 'source-list');
  else $('f-source').removeAttribute('list');
}

function renderSourceManager() {
  const host = $('source-manager');
  const names = sortedSources();
  host.replaceChildren();

  if (!names.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No sources yet. Add one below, or type a new one when logging a session.';
    host.append(p);
    return;
  }

  // Just names — this list is a shortcut for the Source field, not a stats view.
  // Per-source hours live on the Stats tab.
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'src-row';

    const label = document.createElement('span');
    label.className = 'src-name';
    label.textContent = name;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.setAttribute('aria-label', `Remove ${name} from the picker`);
    del.textContent = '✕';
    del.addEventListener('click', async () => {
      await removeSource(name);
      toast(`Removed "${name}"`);
    });

    row.append(label, del);
    host.append(row);
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
    section.className = 'plate day';

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
      // Headline is the most specific thing given: title, else source, else the type.
      // Whatever gets promoted is then left out of the subtitle so it isn't repeated.
      const entryTitle = (s.title || '').trim();
      const source = (s.source || '').trim();
      const kindLabel = KIND_LABELS[s.kind] || s.kind;
      const primary = entryTitle || source || kindLabel || 'Session';

      const title = document.createElement('span');
      title.className = 'entry-title';
      title.textContent = primary;

      // Second line reads as a phrase ("Dreaming Spanish, video"); the note gets its own
      // line so it isn't lost in a run of separators.
      const kindWord = KIND_WORDS[s.kind] || s.kind;
      const metaText = [
        source && source !== primary ? source : null,
        kindLabel !== primary ? kindWord : null,
      ].filter(Boolean).join(', ');
      main.append(title);
      if (metaText) {
        const meta = document.createElement('span');
        meta.className = 'entry-meta';
        meta.textContent = metaText.charAt(0).toUpperCase() + metaText.slice(1);
        main.append(meta);
      }
      if (s.note) {
        const note = document.createElement('span');
        note.className = 'entry-note';
        note.textContent = s.note;
        main.append(note);
      }

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
    ? `Bright bars met your ${settings.dailyGoalMin} min goal, shown dashed.`
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
      $('pace').textContent = `Averaging ${spoken(p.perDay)} a day over the last 30 days. `
        + `At that rate you reach ${prog.next} hours in ${p.days} days, around ${when}.`;
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
  renderSourcePicker();
  if (currentTab === 'history') renderHistory();
  if (currentTab === 'stats') renderStats();
}

/* ------------------------------ actions ------------------------------ */

async function addSession({ minutes, date, kind = 'video', source = '', title = '', note = '' }) {
  const rec = {
    id: store.newId(),
    date,
    minutes: Number(minutes),
    kind,
    source: source.trim(),
    title: title.trim(),
    note: note.trim(),
    createdAt: Date.now(),
  };
  await store.putSession(rec);
  sessions.push(rec);
  refresh();
  return rec;
}

/**
 * Best-effort haptic tick. Web haptics are badly supported:
 *  - navigator.vibrate covers Android; iOS Safari does not implement it at all.
 *  - Toggling an <input type="checkbox" switch> (iOS 17.4+) is the only reported
 *    route to a haptic on iPhone. It does nothing on iOS 16.x.
 * Both paths fail silently, so this is safe to call unconditionally.
 */
let hapticSwitch = null;
function haptic() {
  try { navigator.vibrate?.(10); } catch { /* unsupported */ }
  try {
    if (!hapticSwitch) {
      hapticSwitch = document.createElement('input');
      hapticSwitch.type = 'checkbox';
      hapticSwitch.setAttribute('switch', '');   // ignored by browsers that lack it
      hapticSwitch.setAttribute('aria-hidden', 'true');
      hapticSwitch.tabIndex = -1;
      // padding/border reset too: the global `input` rule would otherwise give this
      // a real size, leaving an invisible element sitting over the top-left corner.
      hapticSwitch.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;'
        + 'padding:0;border:0;margin:0;opacity:0;pointer-events:none;appearance:none';
      document.body.append(hapticSwitch);        // outside any <form> on purpose
    }
    hapticSwitch.click();
  } catch { /* unsupported */ }
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
  $(`view-${tab}`).scrollTop = 0; // .view is the scroller now, not the window
}

function fillSettings() {
  $('s-goal').value = settings.dailyGoalMin;
  $('s-milestones').value = settings.milestones.join(', ');
  renderSourceManager();
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
  b.textContent = `+${m} min`;
  b.addEventListener('click', async () => {
    await addSession({ minutes: m, date: S.localDate() });
    haptic();  // same action as Log session, so same feedback
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
  // A typed source is saved to the dropdown here — but only when it's genuinely new.
  // addSource dedupes case-insensitively and hands back the stored spelling, so
  // typing "netflix" logs against the existing "Netflix" instead of splitting it.
  const typed = $('f-source').value.trim();
  const known = typed
    ? (settings.sources || []).some((s) => s.toLowerCase() === typed.toLowerCase())
    : true;
  const source = typed ? (await addSource(typed)) || '' : '';

  await addSession({
    minutes,
    date: $('f-date').value || S.localDate(),
    kind: $('f-kind').value,
    source,
    title: $('f-title').value,
    note: $('f-note').value,
  });
  // Reset the form for the next entry. Date deliberately goes back to today rather
  // than clearing, since that's the value wanted almost every time.
  $('f-minutes').value = '';
  $('f-title').value = '';
  $('f-note').value = '';
  $('f-source').value = '';
  $('f-kind').value = 'video';
  $('f-date').value = S.localDate();
  haptic();
  toast(known ? `Logged ${S.formatHM(minutes)}` : `Logged ${S.formatHM(minutes)}. Added "${source}" to sources.`);
});

$('add-source-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('s-new-source');
  const name = input.value.trim();
  if (!name) return;
  const before = (settings.sources || []).length;
  const stored = await addSource(name);
  input.value = '';
  toast((settings.sources || []).length > before ? `Added "${stored}"` : `"${stored}" already exists`);
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

  // One-time migration: sources used to be derived from sessions. Seed the managed
  // list from history so nothing is lost. The flag means clearing the list stays
  // cleared — without it, every reload would resurrect removed sources.
  if (!settings.sourcesSeeded) {
    const derived = S.bySource(sessions)
      .map((r) => r.source)
      .filter((s) => s !== 'Unlabelled');
    settings = { ...settings, sources: [...new Set([...(settings.sources || []), ...derived])], sourcesSeeded: true };
    await store.saveSettings(settings);
  }

  $('f-date').value = S.localDate();
  $('f-date').max = S.localDate();
  refresh();
  store.requestPersistence();
}

// iOS Safari only honours :active styles while a touch listener exists on the document.
// Without this no-op, every button feels dead on iPhone — and since we suppress the
// default grey tap flash, :active is the only press feedback there is.
document.addEventListener('touchstart', () => {}, { passive: true });

// Service-worker registration and update reloads live in boot-guard.js, a classic
// script: if these modules ever fail to link, nothing in this file runs at all.

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
