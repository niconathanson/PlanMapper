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
import { rotate, sub, add, scale as scaleVec } from './geometry';

export interface ViewState {
  scale: number; // Konva stage zoom
  x: number; // Konva stage position (screen px)
  y: number;
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
  objects: SceneObject[];
}

interface AppState {
  // --- persistent document state ---
  units: UnitSystem;
  image: PlanImage | null;
  origin: Vec2; // world meters that reads as (0,0)
  originRotationDeg: number;
  objects: SceneObject[];

  // --- UI / transient state ---
  tool: ToolId;
  selectedId: string | null;
  view: ViewState;
  angleSnap: boolean;
  snapVertices: boolean;
  gridVisible: boolean;
  scaleDraft: ScaleDraft | null;
  draft: DrawDraft | null;
  colorCursor: number;
  dirty: boolean; // unsaved changes
  fitVersion: number; // bump to request the canvas re-fit the view

  // --- history ---
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // --- actions ---
  setUnits: (u: UnitSystem) => void;
  setTool: (t: ToolId) => void;
  setView: (v: ViewState) => void;
  requestFit: () => void;
  toggleAngleSnap: () => void;
  toggleSnapVertices: () => void;
  toggleGrid: () => void;

  setImage: (img: PlanImage | null) => void;
  updateImage: (patch: Partial<PlanImage>) => void;

  setOrigin: (world: Vec2) => void;
  setOriginRotation: (deg: number) => void;

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
  select: (id: string | null) => void;
  nextColor: () => string;

  loadProject: (data: ProjectData) => void;
  toProject: () => ProjectData;
  newProject: () => void;
  markSaved: () => void;

  undo: () => void;
  redo: () => void;
}

const snapshot = (s: AppState): HistorySnapshot => ({
  image: s.image,
  origin: s.origin,
  originRotationDeg: s.originRotationDeg,
  objects: s.objects,
});

export const useStore = create<AppState>((set, get) => {
  // Wrap a mutation so it pushes an undo snapshot and marks the doc dirty.
  const withHistory = (mutate: (s: AppState) => Partial<AppState>) => {
    const s = get();
    const snap = snapshot(s);
    set({ ...mutate(s), past: [...s.past, snap], future: [], dirty: true });
  };

  return {
    units: 'ft-in',
    image: null,
    origin: { x: 0, y: 0 },
    originRotationDeg: 0,
    objects: [],

    tool: 'select',
    selectedId: null,
    view: { scale: 1, x: 0, y: 0 },
    angleSnap: false,
    snapVertices: true,
    gridVisible: false,
    scaleDraft: null,
    draft: null,
    colorCursor: 0,
    dirty: false,
    fitVersion: 0,
    past: [],
    future: [],

    setUnits: (u) => set({ units: u }),
    setTool: (t) => set({ tool: t, draft: null, scaleDraft: null }),
    setView: (v) => set({ view: v }),
    requestFit: () => set((s) => ({ fitVersion: s.fitVersion + 1 })),
    toggleAngleSnap: () => set((s) => ({ angleSnap: !s.angleSnap })),
    toggleSnapVertices: () => set((s) => ({ snapVertices: !s.snapVertices })),
    toggleGrid: () => set((s) => ({ gridVisible: !s.gridVisible })),

    setImage: (img) => withHistory(() => ({ image: img })),
    updateImage: (patch) =>
      withHistory((s) => ({ image: s.image ? { ...s.image, ...patch } : null })),

    setOrigin: (world) => withHistory(() => ({ origin: world })),
    setOriginRotation: (deg) => withHistory(() => ({ originRotationDeg: deg })),

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
      // Rescale about point a so the plan doesn't jump under the cursor:
      // newCenter = a + (center - a) * factor
      const a = d.a;
      const newCenter = add(a, scaleVec(sub(img.center, a), factor));
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
    select: (id) => set({ selectedId: id }),
    nextColor: () => {
      const c = PALETTE[get().colorCursor % PALETTE.length];
      set((s) => ({ colorCursor: s.colorCursor + 1 }));
      return c;
    },

    loadProject: (data) =>
      set({
        units: data.units,
        image: data.image,
        origin: data.origin,
        originRotationDeg: data.originRotationDeg ?? 0,
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
        objects: s.objects,
      };
    },
    newProject: () =>
      set({
        image: null,
        origin: { x: 0, y: 0 },
        originRotationDeg: 0,
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

export function makeArea(
  shape: 'rect' | 'fan',
  origin: Vec2,
  color: string,
): AreaObj {
  return {
    id: crypto.randomUUID(),
    type: 'area',
    shape,
    origin,
    rotationDeg: 0,
    length: shape === 'rect' ? 6 : 8,
    wNear: shape === 'rect' ? 6 : 4,
    wFar: shape === 'rect' ? 6 : 10,
    label: '',
    color,
  };
}

// re-export for callers that rotate points relative to origin frame
export { rotate };
