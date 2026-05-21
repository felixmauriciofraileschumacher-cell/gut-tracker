# Ventri Nota

A personal PWA for tracking stool and urine activity. Scope: **2026 only**
(Jan 1 – Dec 31, 2026). Data lives in the phone's browser `localStorage` —
nothing is sent to a server.

## Run locally

The service worker needs `http(s)://`, not `file://`. Easiest path:

```bash
cd gut-tracker
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploy to GitHub Pages

1. Push this folder's contents to a GitHub repo (e.g. `gut-tracker`).
2. Repo **Settings → Pages → Source: Deploy from a branch**, branch `main`,
   folder `/ (root)`.
3. After ~1 minute the app is live at
   `https://<your-username>.github.io/gut-tracker/`.
4. On Android Chrome, open that URL → menu (⋮) → **Add to Home Screen** /
   **Install app**.

**Heads-up:** Free GitHub accounts only get Pages on public repos. The code
is harmless to share publicly; your logged data never leaves the phone.

## Project structure

- `index.html` — App shell, font links, manifest link.
- `styles.css` — Design tokens + screens.
- `app.js` — Routing, screens, storage, rendering.
- `manifest.webmanifest` — PWA metadata.
- `service-worker.js` — Caches the app shell + Google Fonts for offline use.
- `icons/` — PWA icons (192, 512).

## Screens

- ✅ Day Time Grid — calendar-style day view, scrollable 24-hour grid with
  activity blocks dropped onto their quarter-hour slot. Floating "Add" button.
- ✅ Activity Log — Stool / Urine form with Bristol scale or Amount picker,
  discomfort level, native date / time inputs, optional remarks.
- ✅ Activity Details — tap any pill on the Day Time Grid to open. Edit
  swaps the same sheet to the Log form pre-filled; Delete prompts for
  confirmation and removes the entry.
- ✅ Month View — tap the calendar icon top-left of the Day grid to open.
  Each day shows 0-3 dots reflecting activity count (3+ caps at 3).
  Tap "Today" to jump back; tap any day to open the Day view for that
  date. Prev/Next chevrons clamp at the 2026 boundary.
- ⬜ Filtering / export — later.

## Dev URL params

- `?month=1` — Boot directly into the Month View.
- `?log=1` — Boot directly into the Log screen.
- `?log=1&type=urine` — Boot into Log with Urine selected.
- `?log=1&bristol=4` — Boot into Log with Bristol type 4 pre-selected.
- `?details=first` / `?details=last` / `?details=<id>` — Boot into Activity
  Details on a specific entry.
