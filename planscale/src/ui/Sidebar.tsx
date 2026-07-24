import { useStore } from '../core/store';
import { LengthField, NumField } from './NumberField';
import { toDisplay, fromDisplay, pathLength, polygonArea, polygonPerimeter, segmentLengths, areaOutline } from '../core/geometry';
import type { OriginFrame } from '../core/geometry';
import { fmtLen, fmtArea } from '../core/readout';
import {
  objectsToCsv,
  exportCsv,
  copyToClipboard,
  objectSummary,
  objectsToVectorworks,
  exportVectorworks,
} from '../core/project';
import type { AreaObj, PathObj, PolygonObj, ProbePoint, SceneObject, Vec2 } from '../core/types';

export function Sidebar({ onImport }: { onImport: () => void }) {
  const s = useStore();
  const frame: OriginFrame = { origin: s.origin, rotationDeg: s.originRotationDeg };
  const selected = s.objects.find((o) => o.id === s.selectedId) ?? null;

  return (
    <div className="sidebar">
      {s.scaleDraft ? <ScalePanel /> : null}
      {s.image ? <ImagePanel /> : <NoImagePanel onImport={onImport} />}
      <OriginPanel />
      {selected ? <SelectionPanel obj={selected} frame={frame} /> : null}
      <ObjectListPanel frame={frame} />
      {s.objects.length > 0 && <ExportPanel frame={frame} />}
    </div>
  );
}

function NoImagePanel({ onImport }: { onImport: () => void }) {
  return (
    <div className="section">
      <h3>Plan</h3>
      <p className="hint" style={{ marginBottom: 10 }}>
        Import a PDF or image (JPG, PNG…) of your site / floor plan to begin.
      </p>
      <button className="tbtn primary" onClick={onImport}>
        Import plan…
      </button>
    </div>
  );
}

function ImagePanel() {
  const s = useStore();
  const img = s.image!;
  const scaled = img.mPerPx > 0;
  const widthM = img.natW * img.mPerPx;
  return (
    <div className="section">
      <h3>
        Plan image
        <span className={`pill`}>{scaled ? 'scaled' : 'not scaled'}</span>
      </h3>
      <div className="field">
        <label>File</label>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
      </div>
      <div className="field">
        <label>Opacity</label>
        <input
          className="slider"
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={img.opacity}
          onChange={(e) => s.updateImage({ opacity: parseFloat(e.target.value) })}
        />
      </div>
      <div className="field">
        <label>Rotation</label>
        <NumField value={img.rotationDeg} step={0.5} live onCommit={(v) => s.updateImage({ rotationDeg: v })} suffix="°" />
      </div>
      <div className="field">
        <label>Plan width</label>
        <span className="suffix">{fmtLen(widthM, s.units)} across</span>
      </div>
      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className="tbtn primary" onClick={s.beginScale}>
          Scale by 2 points…
        </button>
        <button className="tbtn" onClick={() => s.updateImage({ visible: !img.visible })}>
          {img.visible ? 'Hide' : 'Show'}
        </button>
        <button className="tbtn" onClick={() => s.setImage(null)} title="Remove image">
          Remove
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {s.locked
          ? 'Plan is locked to the origin. Rotation and scale pivot on it. Unlock it under Origin to reposition.'
          : 'Drag the plan to position it (Pan tool). Set the origin on a known point, then press Enter to lock. Rotation and scale pivot on the origin.'}
      </p>
    </div>
  );
}

function ScalePanel() {
  const s = useStore();
  const d = s.scaleDraft!;
  const measured =
    d.a && d.b ? Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) : 0;
  const step = !d.a ? 1 : !d.b ? 2 : 3;
  return (
    <div className="section" style={{ background: 'var(--accent-soft)' }}>
      <h3>Scale by two points</h3>
      <ol className="hint" style={{ margin: '0 0 10px 16px', padding: 0, lineHeight: 1.6 }}>
        <li style={{ fontWeight: step === 1 ? 700 : 400 }}>Click the first point on the plan</li>
        <li style={{ fontWeight: step === 2 ? 700 : 400 }}>Click the second point</li>
        <li style={{ fontWeight: step === 3 ? 700 : 400 }}>Enter the real distance between them</li>
      </ol>
      {d.a && d.b && (
        <>
          <div className="field">
            <label>Measured</label>
            <span className="suffix">{fmtLen(measured, s.units)}</span>
          </div>
          <div className="field">
            <label>Real dist.</label>
            <LengthField
              meters={measured}
              units={s.units}
              onCommit={(m) => s.applyScale(m)}
            />
          </div>
          <p className="hint">Type the known distance and press Enter to apply.</p>
        </>
      )}
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button className="tbtn" onClick={s.cancelScale}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function OriginPanel() {
  const s = useStore();
  const active = s.tool === 'origin';
  return (
    <div className="section">
      <h3>
        Origin (0,0)
        {s.locked && <span className="pill">plan locked</span>}
      </h3>
      <div className="btn-row" style={{ marginBottom: 8 }}>
        <button className={`tbtn ${active ? 'primary' : ''}`} onClick={() => s.setTool('origin')}>
          Set origin (click plan)
        </button>
        {s.image &&
          (s.locked ? (
            <button className="tbtn" onClick={() => s.unlockPlan()} title="Unlock the plan image">
              Unlock
            </button>
          ) : (
            <button className="tbtn primary" onClick={() => s.lockPlan()} title="Lock the plan to the origin (Enter)">
              Lock (Enter)
            </button>
          ))}
      </div>
      <p className="hint">
        All coordinates are measured from this point (positive Y is up). Scaling and
        rotation pivot on it.
        {active ? ' Click the plan to place it, then nudge with the arrow keys.' : ''}
      </p>
    </div>
  );
}

// ---- Selection editing ----

function SelectionPanel({ obj, frame }: { obj: SceneObject; frame: OriginFrame }) {
  const s = useStore();
  return (
    <div className="section">
      <h3>
        Selected: {obj.type === 'area' ? obj.shape : obj.type}
        <button className="tbtn" style={{ padding: '2px 8px' }} onClick={() => s.deleteObject(obj.id)}>
          Delete
        </button>
      </h3>
      <div className="field">
        <label>Name</label>
        <input
          type="text"
          value={obj.label}
          placeholder="(optional)"
          onChange={(e) => s.updateObject(obj.id, { label: e.target.value } as Partial<SceneObject>)}
        />
      </div>
      {obj.type === 'probe' && <ProbeEditor obj={obj} frame={frame} />}
      {(obj.type === 'polygon' || obj.type === 'path') && <PolyEditor obj={obj} frame={frame} />}
      {obj.type === 'area' && <AreaEditor obj={obj} frame={frame} />}
    </div>
  );
}

function coordFields(
  p: Vec2,
  frame: OriginFrame,
  units: ReturnType<typeof useStore.getState>['units'],
  onChange: (world: Vec2) => void,
) {
  const d = toDisplay(p, frame);
  return (
    <div className="field row2">
      <label>X / Y</label>
      <LengthField meters={d.x} units={units} onCommit={(mx) => onChange(fromDisplay({ x: mx, y: d.y }, frame))} />
      <LengthField meters={d.y} units={units} onCommit={(my) => onChange(fromDisplay({ x: d.x, y: my }, frame))} />
    </div>
  );
}

function ProbeEditor({ obj, frame }: { obj: ProbePoint; frame: OriginFrame }) {
  const s = useStore();
  return <>{coordFields(obj.p, frame, s.units, (w) => s.updateObject(obj.id, { p: w } as Partial<SceneObject>))}</>;
}

function PolyEditor({ obj, frame }: { obj: PolygonObj | PathObj; frame: OriginFrame }) {
  const s = useStore();
  const segs = segmentLengths(obj.pts);
  const total = obj.type === 'polygon' ? polygonPerimeter(obj.pts) : pathLength(obj.pts);
  const updatePt = (i: number, world: Vec2) => {
    const next = obj.pts.slice();
    next[i] = world;
    s.updateObject(obj.id, { pts: next } as Partial<SceneObject>);
  };
  return (
    <>
      <table className="vtable">
        <thead>
          <tr>
            <th>#</th>
            <th>X</th>
            <th>Y</th>
            <th>seg</th>
          </tr>
        </thead>
        <tbody>
          {obj.pts.map((p, i) => {
            const d = toDisplay(p, frame);
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <LengthField meters={d.x} units={s.units} onCommit={(mx) => updatePt(i, fromDisplay({ x: mx, y: d.y }, frame))} />
                </td>
                <td>
                  <LengthField meters={d.y} units={s.units} onCommit={(my) => updatePt(i, fromDisplay({ x: d.x, y: my }, frame))} />
                </td>
                <td>{i > 0 ? fmtLen(segs[i - 1], s.units) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="readout" style={{ marginTop: 8 }}>
        {obj.type === 'polygon'
          ? `Perimeter: ${fmtLen(total, s.units)}\nArea: ${fmtArea(polygonArea(obj.pts), s.units)}`
          : `Total run: ${fmtLen(total, s.units)}`}
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button
          className="tbtn"
          onClick={() => copyToClipboard(objectSummary(obj, frame, s.units))}
          title="Copy coordinates to clipboard"
        >
          Copy coords
        </button>
      </div>
    </>
  );
}

function AreaEditor({ obj, frame }: { obj: AreaObj; frame: OriginFrame }) {
  const s = useStore();
  const isRect = obj.shape === 'rect';
  const patch = (p: Partial<AreaObj>) => s.updateObject(obj.id, p as Partial<SceneObject>);
  return (
    <>
      {coordFields(obj.origin, frame, s.units, (w) => patch({ origin: w }))}
      <div className="field">
        <label>Rotation</label>
        <NumField value={obj.rotationDeg} step={0.5} live onCommit={(v) => patch({ rotationDeg: v })} suffix="°" />
      </div>
      <div className="field">
        <label>Length</label>
        <LengthField meters={obj.length} units={s.units} onCommit={(m) => patch({ length: m })} />
      </div>
      {isRect ? (
        <div className="field">
          <label>Width</label>
          <LengthField meters={obj.wNear} units={s.units} onCommit={(m) => patch({ wNear: m, wFar: m })} />
        </div>
      ) : (
        <>
          <div className="field">
            <label>Width near</label>
            <LengthField meters={obj.wNear} units={s.units} onCommit={(m) => patch({ wNear: m })} />
          </div>
          <div className="field">
            <label>Width far</label>
            <LengthField meters={obj.wFar} units={s.units} onCommit={(m) => patch({ wFar: m })} />
          </div>
          <div className="field">
            <label>Round far</label>
            <NumField
              value={obj.arcSteps ?? 1}
              step={1}
              min={1}
              live
              onCommit={(v) => patch({ arcSteps: Math.max(1, Math.round(v)) })}
              suffix="seg"
            />
          </div>
          <div className="field">
            <label>Round near</label>
            <NumField
              value={obj.nearArcSteps ?? 1}
              step={1}
              min={1}
              live
              onCommit={(v) => patch({ nearArcSteps: Math.max(1, Math.round(v)) })}
              suffix="seg"
            />
          </div>
          <p className="hint">1 seg = straight edge. Rounding needs the far edge wider than the near.</p>
        </>
      )}
      <div className="readout" style={{ marginTop: 8 }}>
        {`Area: ${fmtArea(polygonArea(areaOutline(obj)), s.units)}`}
      </div>
    </>
  );
}

function ObjectListPanel({ frame }: { frame: OriginFrame }) {
  const s = useStore();
  const metric = (o: SceneObject): string => {
    if (o.type === 'probe') {
      const d = toDisplay(o.p, frame);
      return `${fmtLen(d.x, s.units)}, ${fmtLen(d.y, s.units)}`;
    }
    if (o.type === 'path') return fmtLen(pathLength(o.pts), s.units);
    if (o.type === 'polygon') return fmtArea(polygonArea(o.pts), s.units);
    return `${fmtLen(o.length, s.units)}×${fmtLen(o.wNear, s.units)}`;
  };
  const typeName = (o: SceneObject) =>
    o.type === 'area' ? (o.shape === 'rect' ? 'Rect' : 'Fan') : o.type === 'path' ? 'Line' : o.type[0].toUpperCase() + o.type.slice(1);
  return (
    <div className="section">
      <h3>Objects ({s.objects.length})</h3>
      {s.objects.length === 0 && <p className="hint">Use the tools on the left to add points, lines, polygons and areas.</p>}
      <div className="objlist">
        {s.objects.map((o) => (
          <div
            key={o.id}
            className={`objrow ${s.selectedId === o.id ? 'sel' : ''}`}
            onClick={() => {
              s.setTool('select');
              s.select(o.id);
            }}
          >
            <span className="swatch" style={{ background: o.color }} />
            <span className="name">{o.label || typeName(o)}</span>
            <span className="meta">{metric(o)}</span>
            <button
              className="del"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                s.deleteObject(o.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportPanel({ frame }: { frame: OriginFrame }) {
  const s = useStore();
  const base = s.image?.name?.replace(/\.[^.]+$/, '') || 'planscale';
  const csv = () => exportCsv(objectsToCsv(s.objects, frame, s.units), base);
  const vw = () => exportVectorworks(objectsToVectorworks(s.objects, frame), base);
  const copyAll = () =>
    copyToClipboard(s.objects.map((o) => objectSummary(o, frame, s.units)).join('\n\n'));
  return (
    <div className="section">
      <h3>Export</h3>
      <div className="btn-row">
        <button className="tbtn" onClick={csv}>
          Export CSV
        </button>
        <button className="tbtn" onClick={vw} title="Vertices as a Vectorworks / Soundvision .txt (meters)">
          Export .txt (SV)
        </button>
        <button className="tbtn" onClick={copyAll}>
          Copy all coords
        </button>
      </div>
    </div>
  );
}
