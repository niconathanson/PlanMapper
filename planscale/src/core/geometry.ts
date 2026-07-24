// Geometry helpers and the coordinate-space model.
//
// Three spaces:
//   world  — meters, Y-down, canonical storage for all geometry
//   stage  — Konva "logical" pixels = world * PX_PER_M (Y-down). Pan/zoom is
//            applied on top via the Konva stage's own scale/position, so object
//            coordinates in stage space stay stable.
//   screen — actual on-screen pixels (stage after pan/zoom); we rarely touch it
//            directly because Konva maps pointer events into stage space for us.
//
// display — what the user reads: coordinates relative to the user-set origin,
//           with Y negated so "up" is positive, optionally rotated by the origin
//           axis angle.

import type { Vec2 } from './types';

// 1 meter == this many stage units. Keeps object coordinates in a comfortable
// numeric range regardless of the real-world size of the plan.
export const PX_PER_M = 100;

export const worldToStage = (p: Vec2): Vec2 => ({ x: p.x * PX_PER_M, y: p.y * PX_PER_M });
export const stageToWorld = (p: Vec2): Vec2 => ({ x: p.x / PX_PER_M, y: p.y / PX_PER_M });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const deg2rad = (d: number): number => (d * Math.PI) / 180;
export const rad2deg = (r: number): number => (r * 180) / Math.PI;

// Rotate a vector by `deg` (clockwise in this Y-down space).
export function rotate(v: Vec2, deg: number): Vec2 {
  const a = deg2rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function rotateAround(p: Vec2, center: Vec2, deg: number): Vec2 {
  return add(center, rotate(sub(p, center), deg));
}

// ---- Display (origin-relative) conversion ----

export interface OriginFrame {
  origin: Vec2; // world meters
  rotationDeg: number; // axis rotation
}

// World point -> display coordinates (meters, Y-up), relative to origin frame.
export function toDisplay(world: Vec2, frame: OriginFrame): Vec2 {
  const rel = rotate(sub(world, frame.origin), -frame.rotationDeg);
  return { x: rel.x, y: -rel.y }; // flip Y so up is positive
}

// Display coordinates (meters, Y-up) -> world point.
export function fromDisplay(display: Vec2, frame: OriginFrame): Vec2 {
  const rel = { x: display.x, y: -display.y };
  return add(frame.origin, rotate(rel, frame.rotationDeg));
}

// ---- Angle snapping for polyline/polygon drawing ----

// Snap `p` so the segment from `prev` to `p` lies on a multiple of `stepDeg`
// (measured from prev), preserving the segment's length.
export function snapAngle(prev: Vec2, p: Vec2, stepDeg = 45): Vec2 {
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return p;
  const ang = Math.atan2(dy, dx);
  const step = deg2rad(stepDeg);
  const snapped = Math.round(ang / step) * step;
  return { x: prev.x + Math.cos(snapped) * len, y: prev.y + Math.sin(snapped) * len };
}

// Snap a point to a grid of `step` meters, aligned to the origin so snapped
// coordinates land on clean multiples of the interval relative to (0,0).
export function snapToGrid(p: Vec2, origin: Vec2, step: number): Vec2 {
  if (step <= 0) return p;
  return {
    x: origin.x + Math.round((p.x - origin.x) / step) * step,
    y: origin.y + Math.round((p.y - origin.y) / step) * step,
  };
}

// ---- Measurements ----

export function pathLength(pts: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

export function segmentLengths(pts: Vec2[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) out.push(dist(pts[i - 1], pts[i]));
  return out;
}

// Shoelace area of a closed polygon (absolute value).
export function polygonArea(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

export function polygonPerimeter(pts: Vec2[]): number {
  if (pts.length < 2) return 0;
  return pathLength(pts) + dist(pts[pts.length - 1], pts[0]);
}

// The four corner points (world meters) of an area object's trapezoid/rectangle.
export function areaCorners(area: {
  origin: Vec2;
  rotationDeg: number;
  length: number;
  wNear: number;
  wFar: number;
}): [Vec2, Vec2, Vec2, Vec2] {
  const half = (w: number): Vec2 => ({ x: 0, y: w / 2 });
  // local space: origin at (0,0), extends along +x for `length`
  const nl = { x: 0, y: -area.wNear / 2 };
  const nr = { x: 0, y: area.wNear / 2 };
  const fr = { x: area.length, y: area.wFar / 2 };
  const fl = { x: area.length, y: -area.wFar / 2 };
  void half;
  return [nl, nr, fr, fl].map((p) => add(area.origin, rotate(p, area.rotationDeg))) as [
    Vec2,
    Vec2,
    Vec2,
    Vec2,
  ];
}

export function areaCenter(area: {
  origin: Vec2;
  rotationDeg: number;
  length: number;
}): Vec2 {
  return add(area.origin, rotate({ x: area.length / 2, y: 0 }, area.rotationDeg));
}
