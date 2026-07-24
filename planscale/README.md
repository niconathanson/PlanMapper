# PlanScale

A dedicated tool for measuring, scaling, and tracing over PDF / image site & floor
plans — built to replace the off-label use of audio-sim software (Danley Direct) for
event planning layout work.

## What it does

- **Import** a PDF (any page) or image (JPG, PNG, WebP, …) — no file-size limit, no
  compression needed.
- **Position** the plan: drag to move, rotate, adjust opacity.
- **Scale by two known points**: click two points a known distance apart, type the real
  distance, and the whole plan is scaled to real-world size.
- **Set an origin (0,0)** anywhere; every coordinate is reported relative to it.
- **Units**: feet + inches (`33' 6"`), decimal feet (`33.500 ft`), or meters — switch
  any time; everything re-formats live.
- **Tools**
  - **Point** — drop a marker and read its coordinates.
  - **Line** — multi-point path for cable runs around corners; reports total run length
    and each segment.
  - **Polygon** — closed shape; reports per-vertex coordinates, perimeter, and area.
  - **Rectangle / Fan area** — audience-plane style areas (fan has independent near/far
    widths).
- **45° / 90° angle snap** and **snap-to-existing-point** while drawing.
- **Editable tables**: nudge any coordinate/dimension numerically.
- **Save / load** projects (`.planscale`, image embedded so the file is self-contained).
- **Export** all coordinates to CSV or copy to clipboard.

## Running it (development)

Requires Node.js (already installed).

```bash
npm install      # first time only
npm run dev      # then open the printed http://localhost:5173 in Chrome or Edge
```

Or double-click **`Start PlanScale.bat`** in the parent folder.

## Keyboard

- **Space** (hold) — pan · **mouse wheel** — zoom
- **Enter** — finish current line/polygon · **Esc** — cancel · **Backspace** — remove last point
- **Delete** — delete selected object · **Ctrl+Z / Ctrl+Y** — undo / redo

## Building a standalone app (later)

The app is browser-based today. To ship it as a double-click Windows `.exe`, it can be
wrapped with Electron (`npm run build` output + an Electron shell). Not set up yet — a
planned follow-up.

## Tech

Vite · React · TypeScript · Konva (canvas) · pdf.js (PDF rendering) · Zustand (state).
