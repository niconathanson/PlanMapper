import { useStore } from '../core/store';
import { Icon } from './icons';
import type { ToolId } from '../core/types';

interface ToolDef {
  id: ToolId;
  shape?: 'rect' | 'fan';
  icon: keyof typeof Icon;
  label: string;
  title: string;
}

const TOOLS: (ToolDef | 'sep')[] = [
  { id: 'select', icon: 'select', label: 'Select', title: 'Select / move (S)' },
  { id: 'pan', icon: 'pan', label: 'Pan', title: 'Pan view (P) — or hold Space / Shift' },
  'sep',
  { id: 'origin', icon: 'origin', label: 'Origin', title: 'Set the 0,0 origin (O)' },
  { id: 'scale', icon: 'scale', label: 'Scale', title: 'Scale by two known points (C)' },
  'sep',
  { id: 'probe', icon: 'probe', label: 'Point', title: 'Drop a coordinate point (D)' },
  { id: 'path', icon: 'path', label: 'Line', title: 'Multi-point line / cable run (L)' },
  { id: 'polygon', icon: 'polygon', label: 'Polygon', title: 'Trace a closed polygon (G)' },
  'sep',
  { id: 'area', shape: 'rect', icon: 'rect', label: 'Rect', title: 'Rectangle area (R)' },
  { id: 'area', shape: 'fan', icon: 'fan', label: 'Fan', title: 'Fan / revolution area (F)' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const draftShape = useStore((s) => s.draft?.shape);
  const setTool = useStore((s) => s.setTool);
  const beginScale = useStore((s) => s.beginScale);
  const startDraft = useStore((s) => s.startDraft);

  const activate = (t: ToolDef) => {
    if (t.id === 'scale') beginScale();
    else if (t.id === 'area') startDraft('area', t.shape);
    else if (t.id === 'polygon' || t.id === 'path') startDraft(t.id);
    else setTool(t.id);
  };

  const isActive = (t: ToolDef) =>
    t.id === 'area' ? tool === 'area' && draftShape === t.shape : tool === t.id;

  return (
    <div className="toolrail">
      {TOOLS.map((t, i) =>
        t === 'sep' ? (
          <div className="rail-sep" key={`sep${i}`} />
        ) : (
          <button
            key={`${t.id}-${t.shape ?? ''}`}
            className={`toolbtn ${isActive(t) ? 'on' : ''}`}
            title={t.title}
            onClick={() => activate(t)}
          >
            {Icon[t.icon]()}
            <span>{t.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
