# Horas — Spanish comprehensible-input tracker

Logs hours of Spanish input (video, audio, reading, conversation) and tracks progress
toward hour milestones.

Built as a **Progressive Web App**, not a native app, because the constraints were:
iPhone target, built on Windows, no Mac, no paid Apple Developer account. A PWA is the
only option that satisfies all four — it installs to the Home Screen with its own icon,
runs full-screen with no Safari chrome, works offline, and costs nothing.

No build step, no npm, no bundler. Plain HTML/CSS/ES modules — edit a file, reload.

## Run it locally

```bash
python serve.py
```

Then open <http://localhost:8000>. Open `/tests.html` to run the logic tests (42 of them,
covering date math, streaks, milestones and projections).

Service workers require a *secure context*: HTTPS, or localhost. `localhost` counts, so
offline caching works during desktop dev. Over a LAN IP (`http://192.168.x.x:8000`) it
does **not** — the app still loads and installs, but without offline support. That's a
browser rule, not a bug.

## Put it on your iPhone

Needs an HTTPS URL. GitHub Pages is free and you already have git:

```bash
git init && git add -A && git commit -m "Horas: initial commit"
```

Create a repo on github.com, push, then Settings → Pages → Source: `main`, `/root`.
Your URL becomes `https://<user>.github.io/<repo>/`.

> Free GitHub Pages requires a **public** repo. Your *data* stays private either way —
> it never leaves the phone — but the code would be public. If that matters, Cloudflare
> Pages and Netlify both serve private repos for free.

Then on the iPhone, **in Safari** (Chrome/Firefox on iOS cannot install PWAs):

1. Open the URL
2. Share → **Add to Home Screen**
3. Launch from the new icon — not from Safari

Open ⚙ → Diagnostics to confirm `Installed: yes` and `Service worker: registered`.

## Using it

- **Log** — headline total, progress ring to the next milestone, today/streak/7-day-avg,
  six quick-add buttons, and a full form for backdating or adding a source and note.
- **History** — grouped by day with day totals, newest first. Tap ✕ to delete.
- **Stats** — 30-day bar chart against your daily goal, totals, streaks, a pace
  projection for your next milestone, and breakdowns by source and type.
- **⚙ Settings** — daily goal, milestone hours, sources, backup, diagnostics.

Sources are a **managed list**, not derived from your sessions. Add one in Settings, or
pick `+ Add new…` in the Source dropdown while logging. Removing a source only takes it
out of the picker: sessions logged with it keep their hours and still appear in History
and Stats. That's deliberate — it means fixing a typo never costs you logged time.

Milestones default to `50, 150, 300, 600, 1000, 1500` following the Dreaming Spanish
roadmap. They're editable in Settings — check the figures against the source if the
exact numbers matter to you.

The streak counts consecutive days with any input. Not having logged *today* doesn't
break it; missing a **full** day does.

## Back up your data

Everything lives in IndexedDB on the device. **Deleting the Home Screen icon deletes
your history with it**, and there is no cloud sync. Use ⚙ → Export periodically.

- **Import & merge** adds sessions from a backup, skipping ones already present (matched
  by id) — safe to run repeatedly, and the way to combine two devices.
- **Import & replace** wipes current sessions first. It asks for confirmation.

The app also calls `navigator.storage.persist()` on launch, which asks iOS to exempt it
from storage eviction. Safari grants this for installed apps. Export anyway.

## After you change anything

Bump `CACHE = 'horas-v1'` in `sw.js` to `-v2`, etc. Without that, installed phones keep
serving the old cached copy. Navigations are network-first so HTML updates land on the
next launch, but assets are cache-first and need the version bump.

## What this cannot do on iOS

- **No widgets, no Siri shortcuts, no Shortcuts automation, no App Store presence**
- **No background execution** — nothing runs while the app is closed
- Push notifications require an *installed* app, iOS 16.4+ (none are used here)
- No cloud sync between devices — move data with export/import

If any of these become essential, the PWA path stops being enough and the Mac question
has to be revisited.

## Files

| File | Role |
|---|---|
| `index.html` | Markup + the iOS meta tags that make install/full-screen work |
| `styles.css` | Theming (light/dark) and safe-area insets for notch/home indicator |
| `app.js` | Rendering, wiring, backup, diagnostics, SW registration |
| `stats.js` | **Pure** functions: dates, streaks, totals, milestones, projection |
| `charts.js` | Inline SVG progress ring, bar chart, breakdown bars |
| `store.js` | IndexedDB: `sessions` + `meta` stores, export/import |
| `sw.js` | Offline caching. Network-first HTML, cache-first assets |
| `tests.html` | Logic tests for `stats.js` — open it in a browser |
| `serve.py` | Threaded dev server, correct MIME types, no-cache headers |
| `tools/make_icons.py` | Regenerates the PNG icons, no dependencies |

`stats.js` is deliberately free of DOM and storage access, which is what makes the whole
tricky part — calendar-local dates, streak boundaries, milestone edges — directly
testable.

## Renaming it

`Horas` appears in `index.html` (title, `apple-mobile-web-app-title`),
`manifest.webmanifest`, `app.js` (the `showTab` title map), and `sw.js` (`CACHE`).
`DB_NAME` in `store.js` should be left alone — changing it orphans existing data.

Icons: edit `TOP`/`BOTTOM`/`draw_mark()` in `tools/make_icons.py`, then
`python tools/make_icons.py`.
