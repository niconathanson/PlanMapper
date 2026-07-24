import { useStore } from '../core/store';
import { Icon } from './icons';
import { saveProject, openProject } from '../core/project';
import { SnappingMenu } from './SnappingMenu';
import type { UnitSystem } from '../core/units';

const UNIT_OPTS: { id: UnitSystem; label: string }[] = [
  { id: 'ft-in', label: `ft & in` },
  { id: 'ft.in', label: `ft.in` },
  { id: 'ft-dec', label: `ft` },
  { id: 'm', label: `m` },
];

export function TopBar({ onImport }: { onImport: () => void }) {
  const s = useStore();

  const doSave = async () => {
    const name = s.image?.name?.replace(/\.[^.]+$/, '') || 'plan';
    const ok = await saveProject(s.toProject(), name);
    if (ok) s.markSaved();
  };
  const doOpen = async () => {
    if (s.dirty && !confirm('Discard unsaved changes and open a project?')) return;
    const data = await openProject();
    if (data) {
      s.loadProject(data);
      setTimeout(() => s.requestFit(), 50);
    }
  };
  const doNew = () => {
    if (s.dirty && !confirm('Discard unsaved changes and start a new project?')) return;
    s.newProject();
  };

  return (
    <div className="topbar">
      <div className="brand">
        <span className="dot" />
        PlanScale
      </div>

      <button className="tbtn primary" onClick={onImport} title="Import a PDF or image plan">
        {Icon.open()} Import plan
      </button>
      <button className="tbtn" onClick={doOpen} title="Open a saved .planscale project">
        {Icon.open()} Open
      </button>
      <button className="tbtn" onClick={doSave} title="Save project">
        {Icon.save()} Save
      </button>
      <button className="tbtn" onClick={doNew} title="New project">
        New
      </button>

      <div className="spacer" />

      {s.dirty && <span className="dirty-dot" title="Unsaved changes">●</span>}

      <button className="tbtn" onClick={s.undo} disabled={s.past.length === 0} title="Undo (Ctrl+Z)">
        {Icon.undo()}
      </button>
      <button className="tbtn" onClick={s.redo} disabled={s.future.length === 0} title="Redo (Ctrl+Y)">
        {Icon.redo()}
      </button>

      <div className="seg" title="Units">
        {UNIT_OPTS.map((u) => (
          <button key={u.id} className={s.units === u.id ? 'on' : ''} onClick={() => s.setUnits(u.id)}>
            {u.label}
          </button>
        ))}
      </div>

      <SnappingMenu />
      <button className={`tbtn ${s.gridVisible ? 'primary' : ''}`} onClick={s.toggleGrid} title="Toggle grid">
        #
      </button>
      <button className="tbtn" onClick={s.requestFit} title="Fit to view">
        {Icon.fit()}
      </button>
      <button
        className="tbtn"
        onClick={s.toggleTheme}
        title={s.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {s.theme === 'dark' ? Icon.sun() : Icon.moon()}
      </button>
    </div>
  );
}
