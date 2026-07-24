# PlanMapper — Handoff Notes

> Product name is **PlanMapper**; the app's working directory is still `planscale/`
> internally (not renamed to avoid churn in dev tooling — invisible to users).

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

## Packaging (Tauri desktop app)

`src-tauri/` wraps the built web app in a native WebView2 window (Tauri v2). No app
code is Tauri-specific — the frontend is the same web app (file I/O uses the browser
File System Access API with download/`<input>` fallbacks, which work in the webview).

- **Build:** `npm run app:build` (= `tauri build`; runs `npm run build` first via
  `beforeBuildCommand`). Output: `src-tauri/target/release/planmapper.exe` (~8.7 MB,
  **portable single exe**, needs the WebView2 runtime that ships with Win10/11) and an
  NSIS installer at `.../release/bundle/nsis/PlanMapper_0.1.0_x64-setup.exe`.
- **Requires Rust ≥ 1.85** (a transitive dep needs edition 2024). Plus MSVC C++ build
  tools (VS2022) — both already on the dev machine.
- Key config in `src-tauri/tauri.conf.json`: `dragDropEnabled: false` (so the webview's
  native HTML drag-drop plan import still fires instead of Tauri's OS file-drop),
  `csp: null` (permissive — needed for data-URL images + the pdf.js worker), identifier
  `com.planmapper.desktop`. Cargo package is named `planmapper` so the exe is
  `planmapper.exe`. `vite.config.ts` uses relative `base: './'` for `build` only.
- Icons in `src-tauri/icons/` are the default Tauri logos — rebrand later with
  `npx tauri icon <png>`. Unsigned → Windows SmartScreen "More info → Run anyway".
- **macOS:** same code; must build **on a Mac** (Rust + Xcode CLT), `tauri build` →
  `.app`/`.dmg`. M-series build is arm64-only; use `--target universal-apple-darwin`
  for Intel-Mac colleagues. Unsigned → Gatekeeper right-click-Open.

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

### Import & origin workflow (settled 2026-07-24 — see `git log`)

The intended setup flow, and the interaction model behind it:
1. **Import → lands in Origin mode** (`App.tsx placeRaster` sets `tool='origin'`).
2. **Click** the plan feature that should read 0,0 → origin drops there.
3. **Drag the origin dot** to reposition (coarse) · **arrows** to fine-tune ·
   **Shift/Space-drag** to pan if the feature is off-screen.
4. **Enter** → locks the plan, returns to the previous tool.
5. **Rotate then Scale** afterward — both already pivot on the origin, so the
   feature stays glued to 0,0.

Interaction principles the user cares about (keep these invariants):
- **Click+drag = "reposition an object"** (rectangle, line, or the origin dot).
- **Arrow keys = "nudge position, fine"** — never move the background.
- **Shift = momentary app-wide pan, full stop** (CAD convention). It is *not*
  overloaded to move the image. You never drag the image during setup: because
  all coords are origin-relative, you place/nudge the *origin* onto the feature.
- **Post-import, click no longer re-places the origin** by itself only in the
  sense that origin changes should go through Origin mode (drag/arrows); the raw
  click-to-place still lives in the `origin` tool, which is the guarded entry point.

### Tool hotkeys (bare letters — `CanvasStage.tsx` `TOOL_KEYS`/`HOTKEYS`)

Bare single letters switch tools; **Ctrl/Cmd+letter is reserved for document
commands** (undo/redo/save), so letters never collide. Ignored while typing in a
field. Map: **S** Select · **P** Pan · **O** Origin · **C** Scale · **D** Point ·
**L** Line · **G** Polygon · **R** Rect · **F** Fan. A collapsible semi-transparent
cheat sheet (`.keycard`, always-dark in both themes) sits top-right of the canvas,
laid out as two columns (`HOTKEYS_VIEW` = view/setup tools · `HOTKEYS_DRAW` = drawable
items); keep `TOOL_KEYS`, both `HOTKEYS_*` arrays, and the Toolbar tooltips in sync.

### Interaction (`src/canvas/CanvasStage.tsx`) — the big file

Pointer/keyboard handling, tool dispatch, view transform (pan/zoom-to-cursor and
`setViewRot` are all rotation-aware), snapping (`applySnaps` = vertex→angle→grid;
`gridSnap` for rects/drags; **Ctrl** bypasses both), modifier state (`spaceHeld`,
`shiftHeld`→temp pan, `ctrlHeld`→no snap; all reset on window blur). Layers order:
image → grid (on top of image) → origin axes → objects → drafts.

### Objects (`src/canvas/SceneObjects.tsx`)

Probe / polygon / path / area rendering + editing. Whole-object drag via a draggable
Group (`onGroupDragEnd` **ignores child-handle drag-end bubbling** via
`e.target !== e.currentTarget`). Drags/handles snap through `ctx.snap`. Labels
counter-rotate by `-ctx.viewRot` (via `ScreenLabel`) so text stays upright when the
view is rotated.

**Area/fan model.** Both rect and fan are **drag-to-create** (`makeRectFromBounds` /
`makeFanFromBounds`, axis-aligned, opening along world +x). Corner handles
(`resizeCorner`): rect = box resize anchoring the opposite corner; fan = symmetric
trapezoid where **either edge can lengthen** (near-corner drag moves the near edge with
the far edge fixed, and vice-versa) and dragging a corner **past the opposite edge
flips** the fan 180° about that edge. Fans can round each edge into an apex-centred arc
(`arcSteps` far, `nearArcSteps` near → annular sector); the drawn shape and area come
from `areaOutline` in `geometry.ts`, while handles stay on the 4 trapezoid
`areaCorners`.

### Units (`src/core/units.ts`)

`ft-in` ("ft & in", 33' 6"), `ft.in` (Soundvision, 11.06 = 11'6", rounds to whole
inch), `ft-dec` (33.500 ft), `m`. Format + parse per system.

### Other

`src/core/loadFile.ts` (image + pdf.js page render/thumbs), `src/core/project.ts`
(save/load `.planmapper`, CSV/clipboard export, **`objectsToVectorworks`** — a
Vectorworks/Soundvision `.txt` vertex export in meters/Y-up; header line reads
`"; PLANMAPPER"`), `src/core/readout.ts` (formatting helpers), `src/ui/*` (TopBar,
Toolbar, Sidebar, SnappingMenu popover, PagePicker, NumberField with `live` mode, icons).

### Scaling (`store.applyScale`)

Two-point scale multiplies `image.mPerPx` by `factor` **and**: recenters the image about
the origin, **scales every object about the origin** by the same factor (so placed
geometry stays glued to plan features on a re-scale), and **compensates `view.scale` by
1/factor** (pinning the origin on screen) so the plan doesn't appear to grow/shrink —
only the coordinate readouts change. (`view` isn't in the undo snapshot, so undoing a
scale reverts geometry but not the zoom — minor.)

## OPEN ITEMS

### 1. Import/origin workflow — ✅ DONE (2026-07-24)
Resolved by the "Import & origin workflow" section above. Decision: **Shift stays a
pure momentary pan**; the image is never dragged during setup. Instead import lands in
Origin mode, the **origin dot is draggable** (`OriginAxes` in `Overlays.tsx`, wired in
`CanvasStage`), and arrows fine-tune. Drag uses `store.setOriginTo` (coalesced into one
undo step via `withNudge`); commit on `dragEnd` via `endNudge`.

### 2. Arrow-nudge "along angled axes" — ✅ LIKELY RESOLVED by #3; confirm on a real plan
`nudgeSelected`/`nudgeOrigin` always added raw world (dx,dy), so the numbers were
already world-aligned. The *perceived* angled motion was almost certainly the #3
origin-jump swinging the plan under the dot. With #3 fixed (origin moves now keep the
plan visually fixed), nudging on a 30°-rotated plan was verified to move the origin by
exactly (dx,dy) with zero plan drift. **Remaining:** eyeball it once with a real angled
plan import to be fully sure (the headless preview can't drive the OS file dialog).

### 3. Origin-set on a rotated plan jumps the plan — ✅ DONE (2026-07-24)
Fixed as diagnosed. `recenterImageForOrigin(image, O, O′)` in `store.ts` keeps
`origin + R(rot)·(center−origin)` invariant via `center′ = center + d − rotate(d, −rot)`
(`d = O′−O`; exact no-op at rot=0). Applied in `setOrigin`, `setOriginTo`, and
`nudgeOrigin`. Regression-tested in-browser: 30° image, origin moved by click/drag/arrows
→ rendered plan position drifts < 1e-15 m.

### 4. Fan redesign, safe re-scaling, export, UI polish — ✅ DONE (2026-07-24)
Fan is now drag-to-create with robust resize + flip + far/near arc rounding (see
Area/fan model above). Two-point scaling keeps the plan's on-screen size and scales
objects about the origin (see Scaling above). Added the Vectorworks/Soundvision `.txt`
exporter; CSV/copy/txt all emit the full fan `areaOutline` incl. arc points. Canvas
measurement/label boxes stay upright under view rotation and the live draw label is
anchored just above the cursor (fixed screen offset) so it never blocks short segments.
Zoombar rotation-reset button is always rendered (disabled at 0°) so the rotate buttons
don't shift under the cursor.

## Also worth doing eventually
- Package as a Windows `.exe` (Electron) so the user drops the terminal entirely.
- The one flow never tested end-to-end here: importing a **real** plan PDF/JPG (the OS
  file dialog can't be driven from the headless preview pane). Highest-value manual test.
- **Round-trip test the `.txt` export** in the real design software (Soundvision/VW) — the
  format matches the sample but hasn't been verified by an actual import.
- Optional: make a drag-created fan open **along the drag direction** instead of world +x
  (user flagged the fixed +x orientation as minor; deferred).
- Fan rounding assumes far edge wider than near (needs an apex); a general free-corner
  trapezoid model would be a larger change.
