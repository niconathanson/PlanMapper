import { useEffect, useRef, useState } from 'react';
import { useStore } from '../core/store';
import { LengthField } from './NumberField';

// A single popover holding every snapping-related setting: angle-snap step,
// grid snap + interval, point snap, and the arrow-key nudge amounts.
export function SnappingMenu() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="snap-wrap" ref={ref}>
      <button
        className={`tbtn ${open ? 'primary' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Snapping settings"
      >
        Snapping{s.angleStep > 0 ? ` · ${s.angleStep}°` : ''} ▾
      </button>
      {open && (
        <div className="popover">
          <div className="pop-row">
            <label>Angle snap</label>
            <select value={s.angleStep} onChange={(e) => s.setAngleStep(Number(e.target.value))}>
              <option value={0}>Off</option>
              {[5, 10, 30, 45, 90].map((d) => (
                <option key={d} value={d}>
                  {d}°
                </option>
              ))}
            </select>
          </div>

          <label className="pop-check">
            <input type="checkbox" checked={s.gridSnap} onChange={(e) => s.setGridSnap(e.target.checked)} />
            Snap to grid interval
          </label>
          <div className="pop-row">
            <label>Interval</label>
            <LengthField meters={s.snapStep} units={s.units} onCommit={s.setSnapStep} disabled={!s.gridSnap} />
          </div>

          <label className="pop-check">
            <input type="checkbox" checked={s.snapVertices} onChange={() => s.toggleSnapVertices()} />
            Snap to existing points
          </label>

          <div className="pop-sep" />
          <div className="pop-row">
            <label>Arrow nudge</label>
            <LengthField meters={s.nudgeFine} units={s.units} onCommit={(m) => s.setNudge(m, s.nudgeCoarse)} />
          </div>
          <div className="pop-row">
            <label>Shift + arrow</label>
            <LengthField meters={s.nudgeCoarse} units={s.units} onCommit={(m) => s.setNudge(s.nudgeFine, m)} />
          </div>
        </div>
      )}
    </div>
  );
}
