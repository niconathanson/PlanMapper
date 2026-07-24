import { create } from 'zustand';
import type {
  AreaObj,
  PlanImage,
  ProjectData,
  SceneObject,
  ToolId,
  Vec2,
} from './types';
import type { UnitSystem } from './units';
import { M_PER_FT } from './units';
import { rotate, sub, add, scale as scaleVec } from './geometry';

export interface ViewState {
  scale: number; // Konva stage zoom
  x: number; // Konva stage position (screen px)
  y: number;
  rot: number; // view rotation (degrees) — purely graphical, coordinates unchanged
}

// Transient state for the active two-point scaling workflow.
export interface ScaleDraft {
  a?: Vec2; // world meters
  b?: Vec2;
}

// Transient state for an in-progress multi-point drawing (polygon / path / area).
export interface DrawDraft {
  tool: ToolId;
  shape?: 'rect' | 'fan';
  pts: Vec2[]; // committed vertices (world meters)
  cursor?: Vec2; // live cursor position (world meters), for rubber-band preview
}

// When the origin moves O -> O' and a rotated image exists, the image is drawn
// pivoting about the origin (rendered = origin + R(rot)·(center − origin)), so
// moving the origin would swing the plan. Adjust `center` to keep the plan
// visually fixed: with d = O' − O, center' = center + d − rotate(d, −rot).
// At rot=0 this is an exact no-op. Returns the (possibly updated) image.
function recenterImageForOrigin(
  image: PlanImage | null,
  oldOrigin: Vec2,
  newOrigin: Vec2,
): PlanImage | null {
  if (!image) return image;
  const d = sub(newOrigin, oldOrigin);
  const newCenter = add(image.center, sub(d, rotate(d, -image.rotationDeg)));
  return { ...image, center: newCenter };
}

const PALETTE = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#009999',
  '#e6b800',
  '#800000',
  '#000075',
  '#808000',
];

interface HistorySnapshot {
  image: PlanImage | null;
  origin: Vec2;
  originRotationDeg: number;
  locked: boolean;
  objects: SceneObject[];
}

interface AppState {
  // --- persistent document state ---
  units: UnitSystem;
  image: PlanImage | null;
  origin: Vec2; // world meters that reads as (0,0)
  originRotationDeg: number;
  locked: boolean; // plan image is locked to the origin (Enter to lock)
  objects: SceneObject[];

  // --- appearance ---
  theme: 'dark' | 'light';

  // --- UI / transient state ---
  tool: ToolId;
  toolBeforeOrigin: ToolId; // tool to restore when leaving origin mode
  selectedId: string | null;
  view: ViewState;
  angleStep: number; // 0 = no angle snap; else snap segments to this degree step
  snapVertices: boolean;
  gridSnap: boolean; // snap drawn points/rects to snapStep intervals
  snapStep: number; // grid snap interval (meters)
  nudgeFine: number; // arrow-key nudge (meters)
  nudgeCoarse: number; // shift+arrow nudge (meters)
  gridVisible: boolean;
  scaleDraft: ScaleDraft | null;
  draft: DrawDraft | null;
  colorCursor: number;
  dirty: boolean; // unsaved changes
  nudging: boolean; // true while a run of arrow-key nudges is coalescing
  fitVersion: number; // bump to request the canvas re-fit the view

  // --- history ---
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // --- actions ---
  setUnits: (u: UnitSystem) => void;
  setTool: (t: ToolId) => void;
  setView: (v: ViewState) => void;
  requestFit: () => void;
  setAngleStep: (deg: number) => void;
  toggleSnapVertices: () => void;
  setGridSnap: (on: boolean) => void;
  setSnapStep: (meters: number) => void;
  setNudge: (fine: number, coarse: number) => void;
  toggleGrid: () => void;

  setImage: (img: PlanImage | null) => void;
  updateImage: (patch: Partial<PlanImage>) => void;

  setOrigin: (world: Vec2) => void;
  setOriginTo: (world: Vec2) => void; // absolute origin move (drag) — coalesced undo
  setOriginRotation: (deg: number) => void;
  lockPlan: () => void;
  unlockPlan: () => void;

  beginScale: () => void;
  setScalePoint: (which: 'a' | 'b', world: Vec2) => void;
  cancelScale: () => void;
  applyScale: (knownMeters: number) => void; // rescale image so a..b == knownMeters

  startDraft: (tool: ToolId, shape?: 'rect' | 'fan') => void;
  addDraftPoint: (world: Vec2) => void;
  setDraftCursor: (world: Vec2 | undefined) => void;
  popDraftPoint: () => void;
  commitDraft: () => void;
  cancelDraft: () => void;

  addObject: (obj: SceneObject) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  deleteObject: (id: string) => void;
  nudgeSelected: (dx: number, dy: number) => void; // arrow-key move (world meters)
  nudgeOrigin: (dx: number, dy: number) => void;
  endNudge: () => void;
  select: (id: string | null) => void;
  nextColor: () => string;

  toggleTheme: () => void;

  loadProject: (data: ProjectData) => void;
  toProject: () => ProjectData;
  newProject: () => void;
  markSaved: () => void;

  undo: () => void;
  redo: () => void;
}

const THEME_KEY = 'planscale.theme';
function initialTheme(): 'dark' | 'light' {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark'; // dark by default
}

const snapshot = (s: AppState): HistorySnapshot => ({
  image: s.image,
  origin: s.origin,
  originRotationDeg: s.originRotationDeg,
  locked: s.locked,
  objects: s.objects,
});

export const useStore = create<AppState>((set, get) => {
  // Wrap a mutation so it pushes an undo snapshot and marks the doc dirty.
  const withHistory = (mutate: (s: AppState) => Partial<AppState>) => {
    const s = get();
    const snap = snapshot(s);
    set({ ...mutate(s), past: [...s.past, snap], future: [], dirty: true, nudging: false });
  };

  // Coalesce a burst of arrow-key nudges into a single undo step: only the first
  // nudge of a run pushes a history snapshot.
  const withNudge = (mutate: (s: AppState) => Partial<AppState>) => {
    const s = get();
    const base = s.nudging ? {} : { past: [...s.past, snapshot(s)], future: [] };
    set({ ...mutate(s), ...base, nudging: true, dirty: true });
  };

  return {
    units: 'ft-in',
    image: null,
    origin: { x: 0, y: 0 },
    originRotationDeg: 0,
    locked: false,
    objects: [],
    theme: initialTheme(),

    tool: 'select',
    toolBeforeOrigin: 'pan',
    selectedId: null,
    view: { scale: 1, x: 0, y: 0, rot: 0 },
    angleStep: 45, // 45° snap on by default
    snapVertices: true,
    gridSnap: true, // snap to grid intervals by default
    snapStep: 6 * (M_PER_FT / 12), // 6 inches
    nudgeFine: M_PER_FT / 12, // 1 inch
    nudgeCoarse: M_PER_FT, // 1 foot
    gridVisible: false,
    scaleDraft: null,
    draft: null,
    colorCursor: 0,
    dirty: false,
    nudging: false,
    fitVersion: 0,
    past: [],
    future: [],

    // Switching between imperial and metric resets snap/nudge amounts to that
    // system's natural defaults (6"/1"/1' vs 10cm/10cm/1m).
    setUnits: (u) =>
      set((s) => {
        const wasMetric = s.units === 'm';
        const isMetric = u === 'm';
        if (wasMetric === isMetric) return { units: u };
        return isMetric
          ? { units: u, snapStep: 0.1, nudgeFine: 0.1, nudgeCoarse: 1 }
          : { units: u, snapStep: 6 * (M_PER_FT / 12), nudgeFine: M_PER_FT / 12, nudgeCoarse: M_PER_FT };
      }),
    setTool: (t) =>
      set((s) => ({
        tool: t,
        draft: null,
        scaleDraft: null,
        // remember what to return to when leaving origin mode
        toolBeforeOrigin: t === 'origin' && s.tool !== 'origin' ? s.tool : s.toolBeforeOrigin,
      })),
    setView: (v) => set({ view: v }),
    requestFit: () => set((s) => ({ fitVersion: s.fitVersion + 1 })),
    setAngleStep: (deg) => set({ angleStep: deg }),
    toggleSnapVertices: () => set((s) => ({ snapVertices: !s.snapVertices })),
    setGridSnap: (on) => set({ gridSnap: on }),
    setSnapStep: (meters) => set({ snapStep: Math.max(1e-4, meters) }),
    setNudge: (fine, coarse) => set({ nudgeFine: Math.max(1e-4, fine), nudgeCoarse: Math.max(1e-4, coarse) }),
    toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),

    setImage: (img) => withHistory(() => ({ image: img })),
    updateImage: (patch) =>
      withHistory((s) => ({ image: s.image ? { ...s.image, ...patch } : null })),

    // Placing the origin positions it but does not lock the plan; the user locks
    // with Enter (or the Lock button). Keep a rotated plan visually fixed as the
    // origin (its rotation pivot) moves.
    setOrigin: (world) =>
      withHistory((s) => ({ origin: world, image: recenterImageForOrigin(s.image, s.origin, world) })),
    // Absolute origin move used while dragging the origin dot: coalesce the burst
    // into a single undo step (like arrow-nudge) and keep the plan fixed.
    setOriginTo: (world) =>
      withNudge((s) => ({ origin: world, image: recenterImageForOrigin(s.image, s.origin, world) })),
    setOriginRotation: (deg) => withHistory(() => ({ originRotationDeg: deg })),
    lockPlan: () => withHistory(() => ({ locked: true })),
    unlockPlan: () => withHistory(() => ({ locked: false })),

    beginScale: () => set({ tool: 'scale', scaleDraft: {} }),
    setScalePoint: (which, world) =>
      set((s) => ({ scaleDraft: { ...(s.scaleDraft ?? {}), [which]: world } })),
    cancelScale: () => set({ scaleDraft: null, tool: 'select' }),
    applyScale: (knownMeters) => {
      const s = get();
      const img = s.image;
      const d = s.scaleDraft;
      if (!img || !d?.a || !d?.b || knownMeters <= 0) return;
      const curMeters = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
      if (curMeters < 1e-9) return;
      const factor = knownMeters / curMeters;
      // Rescale about the ORIGIN so the origin point stays fixed on the plan:
      // newCenter = origin + (center - origin) * factor
      const o = s.origin;
      const newCenter = add(o, scaleVec(sub(img.center, o), factor));
      withHistory(() => ({
        image: { ...img, mPerPx: img.mPerPx * factor, center: newCenter },
        scaleDraft: null,
        tool: 'select',
      }));
    },

    startDraft: (tool, shape) => set({ tool, draft: { tool, shape, pts: [] } }),
    addDraftPoint: (world) =>
      set((s) => (s.draft ? { draft: { ...s.draft, pts: [...s.draft.pts, world] } } : {})),
    setDraftCursor: (world) =>
      set((s) => (s.draft ? { draft: { ...s.draft, cursor: world } } : {})),
    popDraftPoint: () =>
      set((s) =>
        s.draft ? { draft: { ...s.draft, pts: s.draft.pts.slice(0, -1) } } : {},
      ),
    commitDraft: () => {
      const s = get();
      const d = s.draft;
      if (!d) return;
      const color = get().nextColor();
      const id = crypto.randomUUID();
      let obj: SceneObject | null = null;
      if (d.tool === 'polygon' && d.pts.length >= 3) {
        obj = { id, type: 'polygon', pts: d.pts, label: '', color };
      } else if (d.tool === 'path' && d.pts.length >= 2) {
        obj = { id, type: 'path', pts: d.pts, label: '', color };
      }
      if (obj) {
        withHistory((st) => ({ objects: [...st.objects, obj as SceneObject] }));
      }
      set({ draft: null, selectedId: obj ? id : null });
    },
    cancelDraft: () => set({ draft: null }),

    addObject: (obj) => {
      withHistory((s) => ({ objects: [...s.objects, obj] }));
      set({ selectedId: obj.id });
    },
    updateObject: (id, patch) =>
      withHistory((s) => ({
        objects: s.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as SceneObject) : o)),
      })),
    deleteObject: (id) =>
      withHistory((s) => ({
        objects: s.objects.filter((o) => o.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      })),
    nudgeSelected: (dx, dy) => {
      const id = get().selectedId;
      if (!id) return;
      withNudge((s) => ({
        objects: s.objects.map((o) => {
          if (o.id !== id) return o;
          if (o.type === 'probe') return { ...o, p: { x: o.p.x + dx, y: o.p.y + dy } };
          if (o.type === 'polygon' || o.type === 'path')
            return { ...o, pts: o.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
          return { ...o, origin: { x: o.origin.x + dx, y: o.origin.y + dy } };
        }),
      }));
    },
    nudgeOrigin: (dx, dy) =>
      withNudge((s) => {
        const origin = { x: s.origin.x + dx, y: s.origin.y + dy };
        return { origin, image: recenterImageForOrigin(s.image, s.origin, origin) };
      }),
    endNudge: () => set({ nudging: false }),
    select: (id) => set({ selectedId: id }),
    nextColor: () => {
      const c = PALETTE[get().colorCursor % PALETTE.length];
      set((s) => ({ colorCursor: s.colorCursor + 1 }));
      return c;
    },

    toggleTheme: () =>
      set((s) => {
        const theme = s.theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch {
          /* ignore */
        }
        return { theme };
      }),

    loadProject: (data) =>
      set({
        units: data.units,
        image: data.image,
        origin: data.origin,
        originRotationDeg: data.originRotationDeg ?? 0,
        locked: data.locked ?? true,
        objects: data.objects,
        selectedId: null,
        tool: 'select',
        draft: null,
        scaleDraft: null,
        past: [],
        future: [],
        dirty: false,
      }),
    toProject: () => {
      const s = get();
      return {
        version: 1,
        units: s.units,
        image: s.image,
        origin: s.origin,
        originRotationDeg: s.originRotationDeg,
        locked: s.locked,
        objects: s.objects,
      };
    },
    newProject: () =>
      set({
        image: null,
        origin: { x: 0, y: 0 },
        originRotationDeg: 0,
        locked: false,
        objects: [],
        selectedId: null,
        tool: 'select',
        draft: null,
        scaleDraft: null,
        past: [],
        future: [],
        dirty: false,
      }),
    markSaved: () => set({ dirty: false }),

    undo: () => {
      const s = get();
      if (s.past.length === 0) return;
      const prev = s.past[s.past.length - 1];
      set({
        ...prev,
        past: s.past.slice(0, -1),
        future: [snapshot(s), ...s.future],
        selectedId: null,
        dirty: true,
      });
    },
    redo: () => {
      const s = get();
      if (s.future.length === 0) return;
      const next = s.future[0];
      set({
        ...next,
        past: [...s.past, snapshot(s)],
        future: s.future.slice(1),
        selectedId: null,
        dirty: true,
      });
    },
  };
});

// Dev-only: expose the store for debugging/automated smoke tests.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}

// Build an area with sensible default dimensions derived from `base` (meters):
// a rectangle is base × base; a fan is a tidy trapezoid scaled from base.
export function makeArea(
  shape: 'rect' | 'fan',
  origin: Vec2,
  color: string,
  base: number,
): AreaObj {
  return {
    id: crypto.randomUUID(),
    type: 'area',
    shape,
    origin,
    rotationDeg: 0,
    length: shape === 'rect' ? base : base * 1.4,
    wNear: shape === 'rect' ? base : base * 0.5,
    wFar: shape === 'rect' ? base : base * 1.4,
    label: '',
    color,
  };
}

// A fully-specified rectangle area covering an axis-aligned world bounds box
// (used by drag-to-size). Origin sits at the middle of the near (min-x) edge.
export function makeRectFromBounds(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  color: string,
): AreaObj {
  return {
    id: crypto.randomUUID(),
    type: 'area',
    shape: 'rect',
    origin: { x: minX, y: (minY + maxY) / 2 },
    rotationDeg: 0,
    length: maxX - minX,
    wNear: maxY - minY,
    wFar: maxY - minY,
    label: '',
    color,
  };
}

// re-export for callers that rotate points relative to origin frame
export { rotate };
