import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import type Konva from 'konva';
import { useStore, makeArea, makeRectFromBounds, makeFanFromBounds } from '../core/store';
import type { ViewState } from '../core/store';
import { PX_PER_M, snapAngle, snapToGrid, dist, rotate } from '../core/geometry';
import { M_PER_FT } from '../core/units';
import type { Vec2, SceneObject } from '../core/types';
import { PlanImageNode } from './PlanImageNode';
import { Grid, OriginAxes } from './Overlays';
import { SceneObjects } from './SceneObjects';
import { DraftOverlay, ScaleOverlay } from './Drafts';
import { fmtCoord } from '../core/readout';
import { Icon } from '../ui/icons';

const MIN_SCALE = 0.02;
const MAX_SCALE = 40;
const SNAP_PX = 12; // vertex-snap screen threshold

// Bare-letter tool switches. Document commands stay on Ctrl/Cmd, so a plain
// letter never collides with them. Keep in sync with the toolbar tooltips and
// the on-canvas cheat sheet (HOTKEYS below).
type Store = ReturnType<typeof useStore.getState>;
const TOOL_KEYS: Record<string, (st: Store) => void> = {
  s: (st) => st.setTool('select'),
  p: (st) => st.setTool('pan'),
  o: (st) => st.setTool('origin'),
  c: (st) => st.beginScale(),
  d: (st) => st.setTool('probe'),
  l: (st) => st.startDraft('path'),
  g: (st) => st.startDraft('polygon'),
  r: (st) => st.startDraft('area', 'rect'),
  f: (st) => st.startDraft('area', 'fan'),
};
// Cheat-sheet columns: view/setup tools on the left, drawable items on the right.
const HOTKEYS_VIEW: [string, string][] = [
  ['S', 'Select'],
  ['P', 'Pan'],
  ['O', 'Origin'],
  ['C', 'Scale'],
];
const HOTKEYS_DRAW: [string, string][] = [
  ['D', 'Point'],
  ['L', 'Line'],
  ['G', 'Polygon'],
  ['R', 'Rect'],
  ['F', 'Fan'],
];

// Screen <-> stage-logical conversion accounting for the view rotation.
// Stage transform is: screen = view.pos + R(rot) · (scale · logical).
function screenToLogical(p: Vec2, view: ViewState): Vec2 {
  const t = rotate({ x: p.x - view.x, y: p.y - view.y }, -view.rot);
  return { x: t.x / view.scale, y: t.y / view.scale };
}
function logicalToScreen(l: Vec2, view: ViewState): Vec2 {
  const r = rotate({ x: l.x * view.scale, y: l.y * view.scale }, view.rot);
  return { x: r.x + view.x, y: r.y + view.y };
}

export function CanvasStage({
  onImport,
  onFiles,
}: {
  onImport: () => void;
  onFiles: (files: FileList) => void;
}) {
  const s = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const hudRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false); // temporary pan
  const [ctrlHeld, setCtrlHeld] = useState(false); // temporarily disable snapping
  const [dragOver, setDragOver] = useState(false);
  const [showKeys, setShowKeys] = useState(true);
  // Drag-to-size state for the area tools (rect + fan), world meters.
  const [areaDrag, setAreaDrag] = useState<{ start: Vec2; cur: Vec2; shape: 'rect' | 'fan' } | null>(
    null,
  );

  const defaultAreaBase = () => (s.units === 'm' ? 3 : 10 * M_PER_FT); // 3 m or 10 ft

  // Fit the stage to its container. We combine a ResizeObserver with window
  // resize + a few timed re-measures, because RO delivery is tied to paint and
  // the very first measurement can land before layout has resolved (giving 0).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    measure();
    const timers = [50, 150, 400, 1000].map((t) => setTimeout(measure, t));
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      timers.forEach(clearTimeout);
    };
  }, []);

  const view = s.view;

  // Fit the view to the image (or objects) when a fit is requested.
  useEffect(() => {
    if (s.fitVersion === 0) return;
    // world bounds in meters
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const include = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    if (s.image) {
      const hw = (s.image.natW * s.image.mPerPx) / 2;
      const hh = (s.image.natH * s.image.mPerPx) / 2;
      const r = Math.hypot(hw, hh); // rotation-safe radius
      include(s.image.center.x - r, s.image.center.y - r);
      include(s.image.center.x + r, s.image.center.y + r);
    }
    for (const o of s.objects) {
      if (o.type === 'probe') include(o.p.x, o.p.y);
      else if (o.type === 'polygon' || o.type === 'path') o.pts.forEach((p) => include(p.x, p.y));
      else if (o.type === 'area') {
        include(o.origin.x, o.origin.y);
      }
    }
    if (!isFinite(minX)) {
      // nothing to fit: center on origin at 1:1-ish
      s.setView({ scale: 1, x: size.w / 2, y: size.h / 2, rot: 0 });
      return;
    }
    const wStage = (maxX - minX) * PX_PER_M || 1;
    const hStage = (maxY - minY) * PX_PER_M || 1;
    const pad = 0.9;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, Math.min(size.w / wStage, size.h / hStage) * pad),
    );
    const cx = ((minX + maxX) / 2) * PX_PER_M;
    const cy = ((minY + maxY) / 2) * PX_PER_M;
    // Fit also resets the view rotation to upright.
    s.setView({ scale, x: size.w / 2 - cx * scale, y: size.h / 2 - cy * scale, rot: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fitVersion]);

  // world point under the current pointer
  const pointerWorld = useCallback((): Vec2 | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const p = stage.getRelativePointerPosition();
    if (!p) return null;
    return { x: p.x / PX_PER_M, y: p.y / PX_PER_M };
  }, []);

  // Collect snap targets (existing vertices) in world space.
  const snapTargets = useCallback((): Vec2[] => {
    const t: Vec2[] = [];
    for (const o of s.objects) {
      if (o.type === 'probe') t.push(o.p);
      else if (o.type === 'polygon' || o.type === 'path') t.push(...o.pts);
    }
    if (s.draft) t.push(...s.draft.pts);
    return t;
  }, [s.objects, s.draft]);

  // Snap a raw world point during drawing: existing vertex (highest priority),
  // then angle snap (direction), then grid snap (interval).
  const applySnaps = useCallback(
    (raw: Vec2): Vec2 => {
      if (ctrlHeld) return raw; // Ctrl temporarily disables all snapping
      // vertex snap (screen-space threshold) — exact, wins over the others
      if (s.snapVertices) {
        const thr = SNAP_PX / (PX_PER_M * view.scale);
        let best: Vec2 | null = null;
        let bestD = thr;
        for (const t of snapTargets()) {
          const d = dist(t, raw);
          if (d < bestD) {
            bestD = d;
            best = t;
          }
        }
        if (best) return best;
      }
      let p = raw;
      // angle snap relative to last committed point
      if (s.angleStep > 0 && s.draft && s.draft.pts.length > 0) {
        p = snapAngle(s.draft.pts[s.draft.pts.length - 1], p, s.angleStep);
      }
      // grid snap to the configured interval
      if (s.gridSnap) p = snapToGrid(p, s.origin, s.snapStep);
      return p;
    },
    [s.snapVertices, s.angleStep, s.gridSnap, s.snapStep, s.origin, s.draft, snapTargets, view.scale, ctrlHeld],
  );

  // Grid-snap a point only (for rectangle drag corners / object dragging).
  const gridSnap = useCallback(
    (raw: Vec2): Vec2 => (s.gridSnap && !ctrlHeld ? snapToGrid(raw, s.origin, s.snapStep) : raw),
    [s.gridSnap, s.origin, s.snapStep, ctrlHeld],
  );

  // ---- wheel zoom (to cursor) ----
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const logical = screenToLogical(pointer, view); // fixed point under cursor
    const dir = e.evt.deltaY > 0 ? 1 : -1;
    const factor = 1.12;
    let newScale = dir > 0 ? view.scale / factor : view.scale * factor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    const nv = { ...view, scale: newScale };
    const back = logicalToScreen(logical, nv);
    s.setView({ ...nv, x: view.x + (pointer.x - back.x), y: view.y + (pointer.y - back.y) });
  };

  // Rotate the whole view about the viewport centre (graphical only — all
  // coordinates are unchanged).
  const setViewRot = (rotDeg: number) => {
    const center = { x: size.w / 2, y: size.h / 2 };
    const logical = screenToLogical(center, view);
    const nv = { ...view, rot: rotDeg };
    const back = logicalToScreen(logical, nv);
    s.setView({ ...nv, x: view.x + (center.x - back.x), y: view.y + (center.y - back.y) });
  };

  // Holding Space or Shift temporarily pans the view from any tool, without
  // placing points or moving anything.
  const modifierPan = spaceHeld || shiftHeld;
  const panning = modifierPan || s.tool === 'pan';
  const stageDraggable = panning;

  // Theme-aware canvas colors.
  const dark = s.theme === 'dark';
  const cc = {
    grid: dark ? '#2f333c' : '#dfe3ea',
    originDot: dark ? '#e6e8ec' : '#111111',
    labelBg: dark ? 'rgba(28,31,38,0.92)' : 'rgba(255,255,255,0.85)',
    labelStroke: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)',
  };

  // ---- click: tool-dependent placement ----
  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (panning) return;
    const raw = pointerWorld();
    if (!raw) return;
    const clickedEmpty = e.target === e.target.getStage();

    switch (s.tool) {
      case 'select':
        if (clickedEmpty) s.select(null);
        break;
      case 'origin':
        // Stay in the origin tool so it can be fine-tuned with the arrow keys.
        s.setOrigin(raw);
        break;
      case 'probe': {
        const color = s.nextColor();
        s.addObject({ id: crypto.randomUUID(), type: 'probe', p: raw, label: '', color });
        break;
      }
      case 'scale': {
        if (!s.scaleDraft?.a) s.setScalePoint('a', raw);
        else if (!s.scaleDraft?.b) s.setScalePoint('b', raw);
        break;
      }
      case 'area':
        // Both rect and fan are drag-to-size, handled by mousedown/up (or a
        // click for a default-sized one). Nothing to do on a plain click here.
        break;
      case 'polygon':
      case 'path': {
        const p = applySnaps(raw);
        // close polygon by clicking near the first vertex
        if (s.tool === 'polygon' && s.draft && s.draft.pts.length >= 3) {
          const thr = SNAP_PX / (PX_PER_M * view.scale);
          if (dist(s.draft.pts[0], raw) < thr) {
            s.commitDraft();
            break;
          }
        }
        if (!s.draft || s.draft.tool !== s.tool) s.startDraft(s.tool);
        s.addDraftPoint(p);
        break;
      }
    }
  };

  const onDblClick = () => {
    if (!s.draft || (s.draft.tool !== 'polygon' && s.draft.tool !== 'path')) return;
    const pts = s.draft.pts;
    // Konva fires dblclick whenever two clicks land within its time window, even
    // at different positions. Only treat it as "finish" when the last two points
    // are essentially the same spot — i.e. the user really did double-click one
    // location. Two distinct fast vertex clicks are left intact.
    if (pts.length >= 2) {
      const thr = SNAP_PX / (PX_PER_M * view.scale);
      const a = pts[pts.length - 1];
      const b = pts[pts.length - 2];
      if (dist(a, b) < thr) {
        s.popDraftPoint(); // drop the duplicate final point
        s.commitDraft();
      }
    }
  };

  // Area drag-to-size (rect + fan): press starts a drag box, release finalizes it.
  const areaShape: 'rect' | 'fan' | null = s.tool === 'area' ? s.draft?.shape ?? 'rect' : null;

  const onMouseDown = () => {
    if (panning || !areaShape) return;
    const raw = pointerWorld();
    if (!raw) return;
    const p = gridSnap(raw);
    setAreaDrag({ start: p, cur: p, shape: areaShape });
  };

  const onMouseUp = () => {
    if (!areaDrag) return;
    const { start, cur, shape } = areaDrag;
    setAreaDrag(null);
    const color = s.nextColor();
    const draggedPx = Math.hypot(cur.x - start.x, cur.y - start.y) * PX_PER_M * view.scale;
    if (draggedPx > 6) {
      // real drag → area covering the box (fan starts straight-sided, then the
      // user pulls its far/near widths into a trapezoid)
      const [minX, minY, maxX, maxY] = [
        Math.min(start.x, cur.x),
        Math.min(start.y, cur.y),
        Math.max(start.x, cur.x),
        Math.max(start.y, cur.y),
      ];
      const area =
        shape === 'fan'
          ? makeFanFromBounds(minX, minY, maxX, maxY, color)
          : makeRectFromBounds(minX, minY, maxX, maxY, color);
      s.addObject(area);
    } else {
      // just a click → default-sized area at the point
      s.addObject(makeArea(shape, start, color, defaultAreaBase()));
    }
    s.setTool('select');
  };

  // Right-click finishes the current line/polygon (and suppresses the browser menu).
  const onContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    if (s.draft && (s.draft.tool === 'polygon' || s.draft.tool === 'path')) {
      s.commitDraft();
    }
  };

  const onMouseMove = () => {
    const raw = pointerWorld();
    if (!raw) return;
    // Update the coordinate HUD directly (no React re-render).
    if (hudRef.current) {
      hudRef.current.textContent = fmtCoord(
        raw,
        { origin: s.origin, rotationDeg: s.originRotationDeg },
        s.units,
      );
    }
    if (areaDrag) {
      const p = gridSnap(raw);
      setAreaDrag((d) => (d ? { ...d, cur: p } : d));
    }
    if (s.draft) s.setDraftCursor(applySnaps(raw));
  };

  const onStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return;
    const stage = e.target as Konva.Stage;
    s.setView({ ...view, x: stage.x(), y: stage.y() });
  };

  // ---- keyboard ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Shift' && !typing) setShiftHeld(true);
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true);
      if (e.code === 'Space' && !typing) {
        setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (typing) return;
      // Bare-letter tool switches (no modifier — Ctrl/Cmd are document commands).
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tk = TOOL_KEYS[e.key.toLowerCase()];
        if (tk) {
          e.preventDefault();
          tk(s);
          return;
        }
      }
      // Arrow keys: nudge the selected object, or the origin while placing it.
      const ARROWS: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      if (ARROWS[e.key] && (s.selectedId || s.tool === 'origin')) {
        e.preventDefault();
        const [ux, uy] = ARROWS[e.key];
        const step = e.shiftKey ? s.nudgeCoarse : s.nudgeFine;
        // In origin mode the origin moves and objects are locked; otherwise the
        // selected object moves. (Arrow nudges are never grid-snapped.)
        if (s.tool === 'origin') s.nudgeOrigin(ux * step, uy * step);
        else s.nudgeSelected(ux * step, uy * step);
        return;
      }
      if (e.key === 'Enter' && s.draft) {
        s.commitDraft();
      } else if (e.key === 'Enter' && s.tool === 'origin') {
        // Lock the plan and return to the tool used before entering origin mode.
        if (s.image && !s.locked) s.lockPlan();
        s.setTool(s.toolBeforeOrigin || 'pan');
      } else if (e.key === 'Enter' && s.image && !s.locked) {
        s.lockPlan(); // lock the plan to the origin
      } else if (e.key === 'Escape') {
        if (s.draft) s.cancelDraft();
        else if (s.scaleDraft) s.cancelScale();
        else if (s.tool === 'origin') s.setTool('select');
        else s.select(null);
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && s.draft) {
        e.preventDefault();
        s.popDraftPoint();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        s.deleteObject(s.selectedId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        s.redo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
      if (e.key === 'Shift') setShiftHeld(false);
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false);
      if (e.key.startsWith('Arrow')) s.endNudge(); // close the coalesced undo step
    };
    // If focus leaves the window, drop all held modifiers so we don't get stuck.
    const onBlur = () => {
      setSpaceHeld(false);
      setShiftHeld(false);
      setCtrlHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [s]);

  // Force the canvas to repaint whenever the draft/scale overlay changes, so an
  // aborted polygon can't leave a stale cursor/vertex circle painted.
  useEffect(() => {
    stageRef.current?.batchDraw();
  }, [s.draft, s.scaleDraft]);

  const zoomAtCenter = (factor: number) => {
    const center = { x: size.w / 2, y: size.h / 2 };
    const logical = screenToLogical(center, view);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
    const nv = { ...view, scale: newScale };
    const back = logicalToScreen(logical, nv);
    s.setView({ ...nv, x: view.x + (center.x - back.x), y: view.y + (center.y - back.y) });
  };

  const TOOL_HINT: Partial<Record<string, string>> = {
    origin: 'Click on the plan to set the 0,0 origin',
    scale: 'Click two points a known distance apart',
    probe: 'Click to drop coordinate points',
    polygon: 'Click to add vertices · click the first point or double-click to close',
    path: 'Click to add points · double-click or Enter to finish',
    area: 'Drag to size the area · then adjust widths on the right',
  };
  const polyDrawHint =
    (s.tool === 'polygon' || s.tool === 'path') && ctrlHeld ? ' · snapping off (Ctrl)' : '';
  const hint = modifierPan
    ? `✋ Pan mode — release ${spaceHeld ? 'Space' : 'Shift'} to resume`
    : TOOL_HINT[s.tool] && `${TOOL_HINT[s.tool]}${polyDrawHint}`;

  const cursor = panning ? 'grab' : s.tool === 'select' ? 'default' : 'crosshair';

  return (
    <div
      ref={containerRef}
      className="canvas-host"
      style={{ cursor, outline: dragOver ? '3px dashed var(--accent)' : 'none', outlineOffset: -3 }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={view.scale}
        scaleY={view.scale}
        rotation={view.rot}
        x={view.x}
        y={view.y}
        draggable={stageDraggable}
        onWheel={onWheel}
        onClick={onStageClick}
        onTap={onStageClick}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onContextMenu={onContextMenu}
        onDragEnd={onStageDragEnd}
      >
        <Layer>
          {s.image && (
            <PlanImageNode
              image={s.image}
              origin={s.origin}
              draggable={s.tool === 'pan' && !modifierPan && !s.locked}
              onDragEnd={(c) => s.updateImage({ center: c })}
            />
          )}
        </Layer>
        {/* Grid sits above the image so it reads on top of the plan. */}
        <Layer listening={false}>
          {s.gridVisible && <Grid view={view} width={size.w} height={size.h} stroke={cc.grid} />}
        </Layer>
        <Layer listening={s.tool === 'origin' && !modifierPan}>
          <OriginAxes
            origin={s.origin}
            rotationDeg={s.originRotationDeg}
            view={view}
            width={size.w}
            height={size.h}
            dotColor={cc.originDot}
            draggable={s.tool === 'origin' && !modifierPan}
            onDragMove={(w) => s.setOriginTo(w)}
            onDragEnd={() => s.endNudge()}
          />
        </Layer>
        <Layer>
          <SceneObjects
            objects={s.objects}
            ctx={{
              units: s.units,
              frame: { origin: s.origin, rotationDeg: s.originRotationDeg },
              viewScale: view.scale,
              viewRot: view.rot,
              selectedId: s.selectedId,
              editable: s.tool === 'select' && !panning,
              labelBg: cc.labelBg,
              labelStroke: cc.labelStroke,
              snap: gridSnap,
              onSelect: (id: string) => s.select(id),
              onUpdate: (id: string, patch: Partial<SceneObject>) => s.updateObject(id, patch),
            }}
          />
        </Layer>
        <Layer listening={false}>
          {s.draft && <DraftOverlay draft={s.draft} units={s.units} viewScale={view.scale} viewRot={view.rot} />}
          {s.scaleDraft && (
            <ScaleOverlay scaleDraft={s.scaleDraft} units={s.units} viewScale={view.scale} viewRot={view.rot} />
          )}
          {areaDrag && (
            <Rect
              x={Math.min(areaDrag.start.x, areaDrag.cur.x) * PX_PER_M}
              y={Math.min(areaDrag.start.y, areaDrag.cur.y) * PX_PER_M}
              width={Math.abs(areaDrag.cur.x - areaDrag.start.x) * PX_PER_M}
              height={Math.abs(areaDrag.cur.y - areaDrag.start.y) * PX_PER_M}
              stroke="#2563eb"
              strokeWidth={1.5 / view.scale}
              dash={[6 / view.scale, 4 / view.scale]}
              fill="#2563eb22"
            />
          )}
        </Layer>
      </Stage>

      {!s.image && (
        <div className="canvas-empty">
          <div className="drop">
            <div className="big">Import a plan to get started</div>
            <p style={{ margin: '8px 0 14px' }}>Drag a PDF or image here, or</p>
            <button className="tbtn primary" onClick={onImport}>
              {Icon.open()} Import plan…
            </button>
          </div>
        </div>
      )}

      <div className={`keycard ${showKeys ? '' : 'collapsed'}`}>
        <button
          className="keycard-head"
          onClick={() => setShowKeys((v) => !v)}
          title={showKeys ? 'Hide shortcuts' : 'Show shortcuts'}
        >
          <span>⌨ Shortcuts</span>
          <span className="chev">{showKeys ? '▾' : '▸'}</span>
        </button>
        {showKeys && (
          <div className="keycard-body">
            <div className="keycard-cols">
              <div className="keycol">
                {HOTKEYS_VIEW.map(([k, label]) => (
                  <div className="keyrow" key={k}>
                    <kbd>{k}</kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="keycol">
                {HOTKEYS_DRAW.map(([k, label]) => (
                  <div className="keyrow" key={k}>
                    <kbd>{k}</kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="keycard-foot">Space / Shift — pan · Ctrl — no snap</div>
          </div>
        )}
      </div>

      <div className="hud">
        {hint ? <b>{hint}</b> : <>cursor:&nbsp;<span ref={hudRef}>—</span></>}
        {'  ·  '}
        {Math.round(view.scale * 100)}%
      </div>

      <div className="zoombar">
        <button onClick={() => setViewRot(view.rot - 15)} title="Rotate view left 15°">
          ⟲
        </button>
        <button onClick={() => setViewRot(view.rot + 15)} title="Rotate view right 15°">
          ⟳
        </button>
        {/* Always rendered (fixed width) so the rotate buttons never shift under
            the cursor; disabled at 0° since there's nothing to reset. */}
        <button
          onClick={() => setViewRot(0)}
          disabled={view.rot === 0}
          title="Reset view rotation to upright"
          style={{ width: 'auto', minWidth: 46, padding: '0 8px' }}
        >
          {Math.round(((view.rot % 360) + 360) % 360)}°
        </button>
        <button onClick={() => zoomAtCenter(1 / 1.2)} title="Zoom out">
          −
        </button>
        <button onClick={() => zoomAtCenter(1.2)} title="Zoom in">
          +
        </button>
        <button onClick={s.requestFit} title="Fit to view">
          ⤢
        </button>
      </div>
    </div>
  );
}
