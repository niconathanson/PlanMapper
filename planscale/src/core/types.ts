// Core data model. All lengths/coordinates are stored in METERS.
// Internal world space is Y-DOWN (same orientation as the screen/image). The
// display layer negates Y so that "up" reads as positive to the user.

export interface Vec2 {
  x: number;
  y: number;
}

export type ToolId =
  | 'select'
  | 'pan'
  | 'scale'
  | 'origin'
  | 'probe'
  | 'polygon'
  | 'path'
  | 'area'; // rectangle / fan audience area (shape chosen on creation)

// The imported plan image placed in world space.
export interface PlanImage {
  id: string;
  name: string;
  src: string; // data URL (embedded so projects are portable)
  natW: number; // natural pixel width
  natH: number; // natural pixel height
  center: Vec2; // world position (meters) of the image center
  rotationDeg: number; // clockwise, about the center
  mPerPx: number; // meters per image-pixel (set by two-point scaling)
  opacity: number; // 0..1
  visible: boolean;
}

export interface ProbePoint {
  id: string;
  type: 'probe';
  p: Vec2;
  label: string;
  color: string;
}

export interface PolygonObj {
  id: string;
  type: 'polygon';
  pts: Vec2[]; // closed polygon (implicitly closed)
  label: string;
  color: string;
}

export interface PathObj {
  id: string;
  type: 'path';
  pts: Vec2[]; // open polyline (cable run)
  label: string;
  color: string;
}

// Rectangle or symmetric fan/trapezoid audience area.
// The area extends from `origin` outward along `rotationDeg` for `length`.
// wNear is the width at the origin edge, wFar at the far edge. A rectangle has
// wNear === wFar.
export interface AreaObj {
  id: string;
  type: 'area';
  shape: 'rect' | 'fan';
  origin: Vec2;
  rotationDeg: number;
  length: number;
  wNear: number;
  wFar: number;
  label: string;
  color: string;
}

export type SceneObject = ProbePoint | PolygonObj | PathObj | AreaObj;

export interface ProjectData {
  version: 1;
  units: import('./units').UnitSystem;
  image: PlanImage | null;
  origin: Vec2;
  originRotationDeg: number;
  locked?: boolean;
  objects: SceneObject[];
}
