// Project save/load (single portable .planmapper JSON file, image embedded) and
// coordinate export (CSV / clipboard).

import type { ProjectData, SceneObject } from './types';
import {
  toDisplay,
  areaOutline,
  pathLength,
  polygonArea,
  polygonPerimeter,
  extrasTotal,
} from './geometry';
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
  requestPermission?: (opts: { mode: string }) => Promise<'granted' | 'denied' | 'prompt'>;
  name: string;
}

// The file the current project is bound to — set when it's opened or saved
// through the file picker, so plain "Save" can write straight back to it and
// only "Save as…" asks where to put it. Handles aren't serialisable, so this
// lives here rather than in the store (which keeps the file *name* for display).
let currentFile: FileSystemFileHandleLike | null = null;

export function clearCurrentFile() {
  currentFile = null;
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

// Write text to a user-chosen file.
//
// The desktop build runs in a WebView with no download manager, so an <a
// download> click is silently dropped there — every "save" path must go through
// showSaveFilePicker (which WebView2 does support). The anchor stays only as a
// fallback for browsers without the File System Access API.
// Returns false only when the user cancels the picker.
async function saveTextFile(
  filename: string,
  content: string,
  mime: string,
  description: string,
): Promise<boolean> {
  const ext = filename.slice(filename.lastIndexOf('.'));
  const w = window as unknown as FilePickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { [mime]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return false;
      // fall through to download
    }
  }
  download(filename, content, mime);
  return true;
}

async function writeTo(handle: FileSystemFileHandleLike, json: string): Promise<void> {
  if (handle.requestPermission) {
    const p = await handle.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') throw new Error('write permission denied');
  }
  const writable = await handle.createWritable();
  await writable.write(json);
  await writable.close();
}

// Save the project. Without `saveAs` this writes straight back to the file the
// project came from (if there is one); otherwise it asks where to put it.
// Returns the file name written, or null if the user cancelled.
export async function saveProject(
  data: ProjectData,
  suggestedName = 'plan',
  saveAs = false,
): Promise<string | null> {
  const json = JSON.stringify(data);
  if (!saveAs && currentFile) {
    try {
      await writeTo(currentFile, json);
      return currentFile.name;
    } catch {
      // handle went stale (file moved/deleted, permission revoked) → ask again
      currentFile = null;
    }
  }
  const filename = suggestedName + EXT;
  const w = window as unknown as FilePickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'PlanMapper project', accept: { 'application/json': [EXT] } }],
      });
      await writeTo(handle, json);
      currentFile = handle;
      return handle.name;
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      // fall through to download
    }
  }
  download(filename, json, 'application/json');
  return filename;
}

export async function openProject(): Promise<{ data: ProjectData; name: string } | null> {
  const w = window as unknown as FilePickerWindow;
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: 'PlanMapper project', accept: { 'application/json': [EXT] } }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text) as ProjectData;
      currentFile = handle; // subsequent "Save" writes back here
      return { data, name: handle.name };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }
  // fallback: hidden input (no handle, so "Save" will have to ask where)
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = EXT + ',application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      currentFile = null;
      resolve({ data: JSON.parse(text) as ProjectData, name: file.name });
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
      if (o.type === 'path') {
        for (const e of o.extras ?? []) {
          rows.push(
            `${name},extra,${e.at ?? ''},,,${num(e.meters, units)},"${(e.label || 'extra length').replace(/"/g, "'")}"`,
          );
        }
      }
      const extras = o.type === 'path' ? extrasTotal(o.extras) : 0;
      const extra =
        o.type === 'polygon'
          ? `perimeter=${num(polygonPerimeter(pts), units)};area=${(polygonArea(pts) * (units === 'm' ? 1 : FT_PER_M * FT_PER_M)).toFixed(2)} ${unit}2`
          : extras > 0
            ? `on plan=${num(pathLength(pts), units)};extra=${num(extras, units)};total run=${num(pathLength(pts) + extras, units)}`
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
  void saveTextFile(name + '.csv', csv, 'text/csv', 'CSV spreadsheet');
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
    if (o.type === 'polygon')
      return `${name}:\n${lines.join('\n')}\n  perimeter ${formatLength(polygonPerimeter(o.pts), units)}`;
    const onPlan = pathLength(o.pts);
    const extras = extrasTotal(o.extras);
    for (const e of o.extras ?? [])
      lines.push(
        `  + ${e.label || 'extra length'}${e.at ? ` (at pt ${e.at})` : ''}: ${formatLength(e.meters, units)}`,
      );
    const foot =
      extras > 0
        ? `on plan ${formatLength(onPlan, units)}  ·  extra ${formatLength(extras, units)}  ·  total run ${formatLength(onPlan + extras, units)}`
        : `total run ${formatLength(onPlan, units)}`;
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
  void saveTextFile(name + '.txt', text, 'text/plain', 'Vectorworks / Soundvision vertices');
}
