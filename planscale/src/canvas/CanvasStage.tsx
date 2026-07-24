import { useEffect, useRef, useState, useCallback } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import { useStore, makeArea } from '../core/store';
import { PX_PER_M, snapAngle, dist } from '../core/geometry';
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
  const [dragOver, setDragOver] = useState(false);

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
      s.setView({ scale: 1, x: size.w / 2, y: size.h / 2 });
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
    s.setView({ scale, x: size.w / 2 - cx * scale, y: size.h / 2 - cy * scale });
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

  // Apply vertex snap then angle snap to a raw world point during drawing.
  const applySnaps = useCallback(
    (raw: Vec2): Vec2 => {
      // vertex snap (screen-space threshold)
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
      // angle snap relative to last committed point
      if (s.angleSnap && s.draft && s.draft.pts.length > 0) {
        return snapAngle(s.draft.pts[s.draft.pts.length - 1], raw, 45);
      }
      return raw;
    },
    [s.snapVertices, s.angleSnap, s.draft, snapTargets, view.scale],
  );

  // ---- wheel zoom (to cursor) ----
  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = view.scale;
    const worldPoint = {
      x: (pointer.x - view.x) / oldScale,
      y: (pointer.y - view.y) / oldScale,
    };
    const dir = e.evt.deltaY > 0 ? 1 : -1;
    const factor = 1.12;
    let newScale = dir > 0 ? oldScale / factor : oldScale * factor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    s.setView({
      scale: newScale,
      x: pointer.x - worldPoint.x * newScale,
      y: pointer.y - worldPoint.y * newScale,
    });
  };

  const panning = spaceHeld || s.tool === 'pan';
  const stageDraggable = panning || s.tool === 'select';

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
        s.setOrigin(raw);
        s.setTool('select');
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
      case 'area': {
        const shape = s.draft?.shape ?? 'rect';
        const color = s.nextColor();
        const area = makeArea(shape, raw, color);
        s.addObject(area);
        s.setTool('select');
        break;
      }
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
    if (s.draft) s.setDraftCursor(applySnaps(raw));
  };

  const onStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (e.target !== e.target.getStage()) return;
    const stage = e.target as Konva.Stage;
    s.setView({ scale: view.scale, x: stage.x(), y: stage.y() });
  };

  // ---- keyboard ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.code === 'Space' && !typing) {
        setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      if (typing) return;
      if (e.key === 'Enter' && s.draft) {
        s.commitDraft();
      } else if (e.key === 'Escape') {
        if (s.draft) s.cancelDraft();
        else if (s.scaleDraft) s.cancelScale();
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
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [s]);

  const zoomAtCenter = (factor: number) => {
    const oldScale = view.scale;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const wp = { x: (cx - view.x) / oldScale, y: (cy - view.y) / oldScale };
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
    s.setView({ scale: newScale, x: cx - wp.x * newScale, y: cy - wp.y * newScale });
  };

  const TOOL_HINT: Partial<Record<string, string>> = {
    origin: 'Click on the plan to set the 0,0 origin',
    scale: 'Click two points a known distance apart',
    probe: 'Click to drop coordinate points',
    polygon: 'Click to add vertices · click the first point or double-click to close',
    path: 'Click to add points · double-click or Enter to finish',
    area: 'Click to place the area, then edit its size on the right',
  };
  const hint = TOOL_HINT[s.tool];

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
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable={stageDraggable}
        onWheel={onWheel}
        onClick={onStageClick}
        onTap={onStageClick}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onMouseMove={onMouseMove}
        onDragEnd={onStageDragEnd}
      >
        <Layer listening={false}>
          {s.gridVisible && <Grid view={view} width={size.w} height={size.h} />}
        </Layer>
        <Layer>
          {s.image && (
            <PlanImageNode
              image={s.image}
              draggable={s.tool === 'select' && !panning}
              onDragEnd={(c) => s.updateImage({ center: c })}
            />
          )}
        </Layer>
        <Layer listening={false}>
          <OriginAxes
            origin={s.origin}
            rotationDeg={s.originRotationDeg}
            view={view}
            width={size.w}
            height={size.h}
          />
        </Layer>
        <Layer>
          <SceneObjects
            objects={s.objects}
            ctx={{
              units: s.units,
              frame: { origin: s.origin, rotationDeg: s.originRotationDeg },
              viewScale: view.scale,
              selectedId: s.selectedId,
              editable: s.tool === 'select' && !panning,
              onSelect: (id: string) => s.select(id),
              onUpdate: (id: string, patch: Partial<SceneObject>) => s.updateObject(id, patch),
            }}
          />
        </Layer>
        <Layer listening={false}>
          {s.draft && <DraftOverlay draft={s.draft} units={s.units} viewScale={view.scale} />}
          {s.scaleDraft && <ScaleOverlay scaleDraft={s.scaleDraft} units={s.units} viewScale={view.scale} />}
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

      <div className="hud">
        {hint ? <b>{hint}</b> : <>cursor:&nbsp;<span ref={hudRef}>—</span></>}
        {'  ·  '}
        {Math.round(view.scale * 100)}%
      </div>

      <div className="zoombar">
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
