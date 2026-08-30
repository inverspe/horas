/* IndexedDB layer. Two stores: sessions (the log) and meta (settings).
   IndexedDB over localStorage: async, no size ceiling, survives iOS pressure better. */

const DB_NAME = 'horas';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const META = 'meta';

export const DEFAULT_SETTINGS = {
  dailyGoalMin: 60,
  // Dreaming Spanish roadmap levels. Editable in Settings — verify against the
  // source if the exact numbers matter to you.
  milestones: [50, 150, 300, 600, 1000, 1500],
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: 'id' }).createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const allSessions = () => tx(SESSIONS, 'readonly', (s) => s.getAll());
export const putSession = (rec) => tx(SESSIONS, 'readwrite', (s) => s.put(rec));
export const removeSession = (id) => tx(SESSIONS, 'readwrite', (s) => s.delete(id));
export const clearSessions = () => tx(SESSIONS, 'readwrite', (s) => s.clear());

export async function getSettings() {
  const row = await tx(META, 'readonly', (s) => s.get('settings'));
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}

export const saveSettings = (value) =>
  tx(META, 'readwrite', (s) => s.put({ key: 'settings', value }));

export function newId() {
  // randomUUID needs a secure context; fall back for plain-HTTP LAN testing.
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function exportJSON() {
  return JSON.stringify({
    app: 'horas',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    settings: await getSettings(),
    sessions: await allSessions(),
  }, null, 2);
}

export async function importJSON(text, { merge = false } = {}) {
  const data = JSON.parse(text);
  const incoming = data?.sessions ?? data?.items;
  if (!Array.isArray(incoming)) throw new Error('Not a Horas backup file');

  const existing = merge ? await allSessions() : [];
  const seen = new Set(existing.map((s) => s.id));
  if (!merge) await clearSessions();

  let added = 0;
  for (const raw of incoming) {
    if (!raw || typeof raw.date !== 'string' || !Number.isFinite(Number(raw.minutes))) continue;
    if (merge && seen.has(raw.id)) continue; // id collision = same session, skip
    await putSession({
      id: raw.id || newId(),
      date: raw.date,
      minutes: Number(raw.minutes),
      source: raw.source || '',
      kind: raw.kind || 'video',
      note: raw.note || '',
      createdAt: raw.createdAt || Date.now(),
    });
    added++;
  }
  if (data.settings && !merge) await saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  return added;
}

/* Asks iOS to exempt this origin from storage eviction. Safari grants it silently for
   installed home-screen apps and ignores it otherwise, so it's safe to always call. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { return null; }
}

export async function usage() {
  try { return await navigator.storage?.estimate?.() ?? null; } catch { return null; }
}
