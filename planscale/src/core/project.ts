// Project save/load (single portable .planmapper JSON file, image embedded) and
// coordinate export (CSV / clipboard).

import type { ProjectData, SceneObject } from './types';
import { toDisplay, areaOutline, pathLength, polygonArea, polygonPerimeter } from './geometry';
import { formatLength, type UnitSystem, FT_PER_M } from './units';

const EXT = '.planmapper';

// Minimal typings for the File System Access API (not in older TS DOM libs).
interface FilePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandleLike>;
  showOpenFilePicker?: (opts: unknown) => Promise<FileSystemFileHandleLike[]>;
}
interface FileSystemFileHandleLike {
  createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
  getFile: () => Promise<File>;
  name: string;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveProject(data: ProjectData, suggestedName = 'plan'): Promise<boolean> {
  const json = JSON.stringify(data);
  const w = window as unknown as FilePickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: suggestedName + EXT,
        types: [{ description: 'PlanMapper project', accept: { 'application/json': [EXT] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return false;
      // fall through to download
    }
  }
  download(suggestedName + EXT, json, 'application/json');
  return true;
}

export async function openProject(): Promise<ProjectData | null> {
  const w = window as unknown as FilePickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'PlanMapper project', accept: { 'application/json': [EXT] } }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      return JSON.parse(text) as ProjectData;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }
  // fallback: hidden input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = EXT + ',application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve(JSON.parse(text) as ProjectData);
    };
    input.click();
  });
}

// ---- coordinate export ----

const num = (m: number, units: UnitSystem): string => {
  if (units === 'm') return m.toFixed(4);
  return (m * FT_PER_M).toFixed(4); // feet for both ft systems
};

export function objectsToCsv(
  objects: SceneObject[],
  frame: { origin: { x: number; y: number }; rotationDeg: number },
  units: UnitSystem,
): string {
  const unit = units === 'm' ? 'm' : 'ft';
  const rows: string[] = [];
  rows.push(`Object,Type,Vertex,X (${unit}),Y (${unit}),Segment len (${unit}),Extra`);
  for (const o of objects) {
    const name = o.label || o.id.slice(0, 6);
    if (o.type === 'probe') {
      const d = toDisplay(o.p, frame);
      rows.push(`${name},probe,1,${num(d.x, units)},${num(d.y, units)},,`);
    } else if (o.type === 'polygon' || o.type === 'path') {
      const pts = o.pts;
      for (let i = 0; i < pts.length; i++) {
        const d = toDisplay(pts[i], frame);
        const seg = i > 0 ? Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : 0;
        rows.push(
          `${name},${o.type},${i + 1},${num(d.x, units)},${num(d.y, units)},${i > 0 ? num(seg, units) : ''},`,
        );
      }
      const extra =
        o.type === 'polygon'
          ? `perimeter=${num(polygonPerimeter(pts), units)};area=${(polygonArea(pts) * (units === 'm' ? 1 : FT_PER_M * FT_PER_M)).toFixed(2)} ${unit}2`
          : `total run=${num(pathLength(pts), units)}`;
      rows.push(`${name},${o.type},,,,,"${extra}"`);
    } else if (o.type === 'area') {
      const outline = areaOutline(o);
      outline.forEach((c, i) => {
        const d = toDisplay(c, frame);
        rows.push(`${name},area-${o.shape},${i + 1},${num(d.x, units)},${num(d.y, units)},,`);
      });
      rows.push(
        `${name},area-${o.shape},,,,,"length=${num(o.length, units)};wNear=${num(o.wNear, units)};wFar=${num(o.wFar, units)}"`,
      );
    }
  }
  return rows.join('\n');
}

export function exportCsv(csv: string, name = 'coordinates') {
  download(name + '.csv', csv, 'text/csv');
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

// A human-readable coordinate summary for a single object (for the side panel /
// clipboard copy button).
export function objectSummary(
  o: SceneObject,
  frame: { origin: { x: number; y: number }; rotationDeg: number },
  units: UnitSystem,
): string {
  const name = o.label || o.type;
  const c = (p: { x: number; y: number }) => {
    const d = toDisplay(p, frame);
    return `(${formatLength(d.x, units)}, ${formatLength(d.y, units)})`;
  };
  if (o.type === 'probe') return `${name}: ${c(o.p)}`;
  if (o.type === 'polygon' || o.type === 'path') {
    const lines = o.pts.map((p, i) => `  ${i + 1}. ${c(p)}`);
    const foot =
      o.type === 'polygon'
        ? `perimeter ${formatLength(polygonPerimeter(o.pts), units)}`
        : `total run ${formatLength(pathLength(o.pts), units)}`;
    return `${name}:\n${lines.join('\n')}\n  ${foot}`;
  }
  const outline = areaOutline(o);
  return `${name} (${o.shape}):\n${outline.map((p, i) => `  ${i + 1}. ${c(p)}`).join('\n')}`;
}

// ---- Vectorworks / Soundvision vertex export (.txt) ----
// Emits the "; VECTORWORKS" header block followed by one entry per object:
//   "Label","<name>"
//   x,y,z          (meters, Y-up, relative to the origin; z always 0)
//   ";"
// Fans export their full outline including near/far arc points.
export function objectsToVectorworks(
  objects: SceneObject[],
  frame: { origin: { x: number; y: number }; rotationDeg: number },
): string {
  const vtx = (p: { x: number; y: number }): string => {
    const d = toDisplay(p, frame); // meters, Y-up
    return `${d.x.toFixed(6)},${d.y.toFixed(6)},0.000000`;
  };
  const verts = (o: SceneObject): { x: number; y: number }[] => {
    if (o.type === 'probe') return [o.p];
    if (o.type === 'polygon' || o.type === 'path') return o.pts;
    return areaOutline(o);
  };
  const lines: string[] = [
    '"; PLANMAPPER"',
    '";"',
    '";   using Outside is front (white)"',
    '";   using Name By Layer"',
    '";   using Visible Entities"',
    '";"',
    '";"',
    '";"',
    '"; LengthUnit","m"',
    '";"',
  ];
  for (const o of objects) {
    const pts = verts(o);
    if (!pts.length) continue;
    lines.push(`"Label","${(o.label || 'None face').replace(/"/g, "'")}"`);
    for (const p of pts) lines.push(vtx(p));
    lines.push('";"');
  }
  return lines.join('\r\n') + '\r\n';
}

export function exportVectorworks(text: string, name = 'export') {
  download(name + '.txt', text, 'text/plain');
}
