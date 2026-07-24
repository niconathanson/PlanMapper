# PlanScale — Handoff Notes

Working notes for continuing development in a fresh session. Pairs with `README.md`
(user-facing) and the Claude memory files.

## What this is

A browser app to import PDF/JPG site & floor plans, scale them to real-world size,
set a 0,0 origin, and trace points / lines (cable runs) / polygons / audience areas
with coordinate + length + area readouts. Replaces off-label use of Danley Direct for
event layout. **No audio features.**

App lives in `planscale/`. Sample Direct screenshots in `../PDF-JPG samples/`.
Git repo is at the parent folder; I (assistant) manage all commits. User is
non-technical re: tooling — deliverables should stay double-click runnable.

## Run / build / test

- Dev server: `.claude/launch.json` config `planscale-dev` (Vite on :5173). Note npm
  isn't on the tool PATH — launch.json calls `node.exe` on `vite.js` with `planscale`
  as the positional root. In PowerShell, reload PATH first (see memory
  `node-path-windows`).
- `npx tsc -b` to type-check, `npm run build` to bundle.
- Dev-only: the Zustand store is exposed as `window.__store` (see end of `store.ts`)
  for automated smoke tests via the browser JS console.
- **Testing gotcha:** driving the app by dispatching synthetic DOM events works, but
  React re-binds Konva event closures on the *next* render — always `await` a short
  sleep after a store mutation (e.g. `setTool`) before dispatching the click/key that
  depends on it, or the handler runs with a stale closure. Simulate a Konva drag by
  setting a node's `position()` then `node.fire('dragmove'/'dragend', {target, currentTarget}, true)`.
- After many rapid edits, Vite HMR can corrupt module state (`X is not defined`
  errors + "Failed to reload"). Fix: `preview_stop` + `preview_start` (clean restart),
  then hard-reload the tab.

## Architecture

Vite + React 19 + TypeScript + Konva/react-konva (canvas) + pdf.js (PDF render) +
Zustand (state).

### Coordinate model (the crux — read `src/core/geometry.ts`)

Three spaces:
- **world** — meters, **Y-down** internally, canonical storage for all geometry.
- **stage** — Konva "logical" px = world × `PX_PER_M` (=100). Pan/zoom/**view-rotation**
  live on the Konva Stage transform, so object coords in stage space stay stable.
- **screen** — stage after the Stage transform. `screenToLogical`/`logicalToScreen`
  in `CanvasStage.tsx` invert/apply the Stage transform (scale + position + view rot).

**Display** (what the user reads): `toDisplay(world, frame)` subtracts the origin,
un-rotates by `frame.rotationDeg`, and **negates Y** so "up" is positive.
`frame = { origin, rotationDeg: originRotationDeg }`. NOTE: `originRotationDeg` is
currently always 0 (the axis-rotation UI was removed); plan rotation is the single
rotation. `fromDisplay` is the inverse (used by editable coordinate fields).

### Plan image (`src/canvas/PlanImageNode.tsx`)

Stored: `center` (world, the image centre in the **unrotated** frame), `rotationDeg`,
`mPerPx`, `opacity`, `visible`. **The image rotates about the ORIGIN**, not its own
centre: rendered centre = `origin + R(rot)·(center − origin)`. Two-point scaling
(`store.applyScale`) also pivots on the origin. This is central to the open bugs below.

### Store (`src/core/store.ts`)

Single Zustand store. Key fields: `units`, `image`, `origin`, `originRotationDeg`(=0),
`locked` (plan locked to origin), `objects`, `theme` (dark default, persisted),
`tool`, `toolBeforeOrigin`, `view {scale,x,y,rot}`, snapping config (`angleStep`,
`gridSnap`, `snapStep`, `snapVertices`, `nudgeFine`, `nudgeCoarse`), transient
`scaleDraft` / `draft` / drag state. Undo/redo via `past`/`future` snapshots;
arrow-nudge coalesces into one undo step (`withNudge` + `nudging` + `endNudge`).
`setUnits` resets snap/nudge to imperial (6"/1"/1') or metric (10cm/10cm/1m) defaults
when the family changes.

### Interaction (`src/canvas/CanvasStage.tsx`) — the big file

Pointer/keyboard handling, tool dispatch, view transform (pan/zoom-to-cursor and
`setViewRot` are all rotation-aware), snapping (`applySnaps` = vertex→angle→grid;
`gridSnap` for rects/drags; **Ctrl** bypasses both), modifier state (`spaceHeld`,
`shiftHeld`→temp pan, `ctrlHeld`→no snap; all reset on window blur). Layers order:
image → grid (on top of image) → origin axes → objects → drafts.

### Objects (`src/canvas/SceneObjects.tsx`)

Probe / polygon / path / area rendering + editing. Whole-object drag via a draggable
Group (`onGroupDragEnd` **ignores child-handle drag-end bubbling** via
`e.target !== e.currentTarget`). Areas have corner resize handles: rectangles do a
box resize anchoring the opposite corner; fans keep the symmetric trapezoid per edge.
Drags/handles snap through `ctx.snap`.

### Units (`src/core/units.ts`)

`ft-in` ("ft & in", 33' 6"), `ft.in` (Soundvision, 11.06 = 11'6", rounds to whole
inch), `ft-dec` (33.500 ft), `m`. Format + parse per system.

### Other

`src/core/loadFile.ts` (image + pdf.js page render/thumbs), `src/core/project.ts`
(save/load `.planscale`, CSV/clipboard export), `src/core/readout.ts` (formatting
helpers), `src/ui/*` (TopBar, Toolbar, Sidebar, SnappingMenu popover, PagePicker,
NumberField with `live` mode, icons).

## OPEN ITEMS TO ADDRESS (from user, 2026-07-24)

### 1. During import, let Shift move the IMAGE to position it under the origin
Currently on import the tool is `pan`; a plain drag on the image moves it (image is the
top-most draggable), a drag on the background pans. But **Shift is now a global
temp-pan** (`modifierPan`), and while held the image is NOT draggable
(`draggable = tool==='pan' && !modifierPan && !locked`). The user wants Shift (during
the unlocked positioning phase) to *move the image* so they can slide a plan feature
under where they'll click the origin — especially when the plan is at an angle.
**Design tension to resolve:** Shift = global pan vs Shift = move-image-during-import.
Options: (a) while unlocked + Pan tool, Shift-drag moves the image instead of panning;
(b) use a different modifier; (c) rely on plain image drag and skip Shift here. Confirm
with user. Closely tied to #3 — they mainly hit this trying to set the origin on an
angled plan.

### 2. Arrow-key nudge moves along the image's angled axes, should be world X/Y
When the plan image has a non-zero rotation, nudging an object/origin with arrows
*appears* to move along angled axes; it should move along the standard world X/Y (the
red/blue origin axes). Code check: `nudgeSelected`/`nudgeOrigin` add raw world
(dx,dy) — no rotation — so numerically it IS world-aligned. **Needs reproduction** to
find the real cause. Suspects: (a) view rotation was on (world axes rotate on screen —
but then they follow the origin axes, which may be acceptable); (b) interaction with the
#3 origin-jump corrupting perceived position; (c) something leaking image `rotationDeg`
into the display frame. Reproduce with an angled image, set origin, select an object,
press arrows, and watch both the on-screen motion and the coordinate readout.

### 3. (Diagnosed) Clicking to set the origin on a rotated image jumps the plan
**Root cause:** the image rotates *about the origin* (`rendered = origin + R(rot)·(center − origin)`).
`store.setOrigin(world)` only moves the origin, so when `rotationDeg ≠ 0` the rotation
pivot changes and the image visibly swings/jumps — the plan feature you clicked no
longer sits under the origin dot (the dot lands at the cursor, but the image moved).
**Fix:** when the origin moves from O→O′ and an image exists, also adjust `center` to
keep the image visually fixed. Derivation (keep `origin + R(rot)·(center−origin)`
invariant): with `d = O′ − O`,
`center′ = center + d − rotate(d, −rotationDeg)`.
At rot=0 this is a no-op (center unchanged), as expected. Apply this in `setOrigin`
**and** `nudgeOrigin` (both move the origin). After fixing, re-check #2 — it may be
related. Add a regression check: set image rot=30°, setOrigin at a known world point,
assert the image's rendered corner for a fixed plan point is unchanged.

## Also worth doing eventually
- Package as a Windows `.exe` (Electron) so the user drops the terminal entirely.
- The one flow never tested end-to-end here: importing a **real** plan PDF/JPG (the OS
  file dialog can't be driven from the headless preview pane). Highest-value manual test.
- Fan areas resize symmetrically per edge (model limitation); free corner resize would
  need a general-trapezoid model.
