// First-run walkthrough. Shown automatically the first time the app opens on a
// machine (flag in localStorage), and re-openable any time from the "?" button at
// the bottom of the tool rail.
import { useEffect, useState, type ReactNode } from 'react';

const SEEN_KEY = 'planmapper.guideSeen';

export function guideWasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // storage blocked — don't nag on every launch
  }
}

export function markGuideSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* ignore */
  }
}

// ---- illustrations -------------------------------------------------------
// All art is inline SVG on a shared 320×180 stage, themed off CSS variables so
// it tracks light/dark. `Frame` draws the app chrome (rail · canvas · sidebar)
// so every step is recognisably "this part of the window".

const A = 'var(--accent)';
const M = 'var(--muted)';
const B = 'var(--border)';

function Art({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 320 180" className="guide-art" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function Frame({ hi }: { hi?: 'rail' | 'sidebar' | 'top' | 'canvas' }) {
  const on = (k: string) => (hi === k ? A : B);
  const soft = (k: string) => (hi === k ? 'var(--accent-soft)' : 'var(--panel-2)');
  return (
    <>
      <rect x="8" y="8" width="304" height="164" rx="8" fill="var(--panel)" stroke={B} />
      <rect x="8" y="8" width="304" height="20" rx="8" fill={soft('top')} stroke={on('top')} />
      <rect x="8" y="28" width="34" height="144" fill={soft('rail')} stroke={on('rail')} />
      <rect x="246" y="28" width="66" height="144" fill={soft('sidebar')} stroke={on('sidebar')} />
      <rect x="42" y="28" width="204" height="144" fill="var(--canvas-bg)" stroke={hi === 'canvas' ? A : B} />
    </>
  );
}

/** A stylised floor plan drawn inside the canvas area. */
function Plan({ o = 1 }: { o?: number }) {
  return (
    <g opacity={o} stroke={M} strokeWidth="1.2">
      <path d="M64 52h112v96H64z" />
      <path d="M64 96h48v52M112 122h64" />
      <path d="M148 52v30h28" />
    </g>
  );
}

const ART = {
  welcome: (
    <Art>
      <Frame />
      <Plan />
      <path d="M96 132l30-46 26 24 34-42" stroke={A} strokeWidth="2" />
      <circle cx="96" cy="132" r="3" fill={A} />
      <circle cx="186" cy="68" r="3" fill={A} />
      <path d="M128 148l12-34h24l14 34z" fill="var(--accent-soft)" stroke={A} strokeWidth="1.6" />
    </Art>
  ),
  import: (
    <Art>
      <Frame hi="canvas" />
      <rect x="86" y="58" width="116" height="84" rx="8" stroke={A} strokeWidth="1.8" strokeDasharray="6 5" />
      <path d="M128 122V80m0-18v0" stroke={A} strokeWidth="2" />
      <path d="M120 88l8-8 8 8" stroke={A} strokeWidth="2" />
      <text x="144" y="128" fill={M} fontSize="11">
        PDF / JPG
      </text>
      <rect x="150" y="62" width="30" height="38" rx="3" fill="var(--panel)" stroke={M} strokeWidth="1.2" />
      <path d="M156 72h18M156 80h18M156 88h12" stroke={M} strokeWidth="1.2" />
    </Art>
  ),
  origin: (
    <Art>
      <Frame hi="canvas" />
      <Plan o={0.5} />
      <path d="M64 100h116M122 44v112" stroke={A} strokeWidth="1.6" />
      <circle cx="122" cy="100" r="5" fill={A} />
      <text x="130" y="116" fill={A} fontSize="11" fontWeight="600">
        0,0
      </text>
      <g stroke={M} strokeWidth="1.3">
        <rect x="203" y="114" width="16" height="16" rx="3" />
        <rect x="185" y="132" width="16" height="16" rx="3" />
        <rect x="203" y="132" width="16" height="16" rx="3" />
        <rect x="221" y="132" width="16" height="16" rx="3" />
        <g stroke={A} strokeWidth="1.4">
          <path d="M211 126v-8M208 121l3-3 3 3" />
          <path d="M197 140h-8M194 137l-3 3 3 3" />
          <path d="M225 140h8M230 137l3 3-3 3" />
          <path d="M211 136v8M208 141l3 3 3-3" />
        </g>
      </g>
    </Art>
  ),
  scale: (
    <Art>
      <Frame hi="canvas" />
      <Plan o={0.5} />
      <circle cx="80" cy="120" r="4.5" fill={A} />
      <circle cx="196" cy="76" r="4.5" fill={A} />
      <path d="M80 120L196 76" stroke={A} strokeWidth="2" strokeDasharray="5 4" />
      <rect x="106" y="82" width="66" height="20" rx="5" fill="var(--panel)" stroke={A} />
      <text x="139" y="96" fill="var(--text)" fontSize="11" textAnchor="middle">
        12' 6"
      </text>
    </Art>
  ),
  view: (
    <Art>
      <Frame hi="canvas" />
      <Plan o={0.6} />
      <circle cx="150" cy="98" r="26" stroke={A} strokeWidth="2" />
      <path d="M150 88v20M140 98h20" stroke={A} strokeWidth="2" />
      <path d="M169 117l18 18" stroke={A} strokeWidth="2.4" />
      <path d="M70 60c8-6 16-6 24 0" stroke={M} strokeWidth="1.4" />
      <path d="M92 54l4 6-7 1" stroke={M} strokeWidth="1.4" />
    </Art>
  ),
  draw: (
    <Art>
      <Frame hi="rail" />
      <g stroke={A} strokeWidth="1.6">
        <rect x="17" y="40" width="16" height="16" rx="4" />
        <rect x="17" y="62" width="16" height="16" rx="4" />
        <rect x="17" y="84" width="16" height="16" rx="4" />
        <rect x="17" y="106" width="16" height="16" rx="4" />
      </g>
      <circle cx="86" cy="62" r="4" fill={A} />
      <text x="96" y="66" fill={M} fontSize="10">
        point
      </text>
      <path d="M78 94l20-14 18 16 22-22" stroke={A} strokeWidth="1.8" />
      <text x="146" y="82" fill={M} fontSize="10">
        line
      </text>
      <path d="M80 150l10-24h30l12 24z" fill="var(--accent-soft)" stroke={A} strokeWidth="1.6" />
      <text x="140" y="146" fill={M} fontSize="10">
        rect / fan
      </text>
      <path d="M176 108h56v28h-56z" fill="var(--accent-soft)" stroke={A} strokeWidth="1.4" />
    </Art>
  ),
  precise: (
    <Art>
      <Frame hi="sidebar" />
      <g stroke={B} strokeWidth="0.8">
        {[64, 88, 112, 136, 160, 184, 208, 232].map((x) => (
          <path key={x} d={`M${x} 32v136`} />
        ))}
        {[48, 72, 96, 120, 144, 168].map((y) => (
          <path key={y} d={`M46 ${y}h196`} />
        ))}
      </g>
      <path d="M88 144l56-48" stroke={A} strokeWidth="2" />
      <circle cx="88" cy="144" r="4" fill={A} />
      <circle cx="144" cy="96" r="6" fill="none" stroke={A} strokeWidth="2" />
      <g fill="var(--panel-2)" stroke={B}>
        <rect x="254" y="44" width="50" height="14" rx="3" />
        <rect x="254" y="64" width="50" height="14" rx="3" />
        <rect x="254" y="84" width="50" height="14" rx="3" />
      </g>
      <path d="M258 51h30M258 71h22M258 91h34" stroke={M} strokeWidth="1.4" />
    </Art>
  ),
  export: (
    <Art>
      <Frame hi="sidebar" />
      <Plan o={0.35} />
      <g fill="var(--panel)" stroke={A} strokeWidth="1.5">
        <rect x="98" y="52" width="44" height="56" rx="4" />
        <rect x="118" y="70" width="44" height="56" rx="4" />
        <rect x="138" y="88" width="44" height="56" rx="4" />
      </g>
      <text x="160" y="122" fill={A} fontSize="10" fontWeight="600">
        CSV
      </text>
      <path d="M254 52h50M254 66h50M254 80h34" stroke={M} strokeWidth="1.4" />
      <path d="M262 112l16 16 24-30" stroke={A} strokeWidth="2.2" />
    </Art>
  ),
} as const;

// ---- steps ---------------------------------------------------------------

interface Step {
  title: string;
  art: ReactNode;
  body: ReactNode;
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

const STEPS: Step[] = [
  {
    title: 'Welcome to PlanMapper',
    art: ART.welcome,
    body: (
      <>
        <p>
          PlanMapper turns a PDF or photo of a site / floor plan into a real-world measuring
          surface. Scale it once, then drop points, cable runs, polygons and coverage areas and
          read off exact coordinates, lengths and areas.
        </p>
        <p className="hint">
          This tour takes about a minute. You can reopen it any time from the <b>?</b> button in
          the bottom-left corner.
        </p>
      </>
    ),
  },
  {
    title: '1 · Import your plan',
    art: ART.import,
    body: (
      <>
        <p>
          Click <b>Import plan</b> in the top bar — or just drag a file onto the canvas. PDF, JPG,
          PNG all work; multi-page PDFs let you pick the page.
        </p>
        <p className="hint">The plan drops in at a rough size. You'll fix that in two steps.</p>
      </>
    ),
  },
  {
    title: '2 · Set the origin (0,0)',
    art: ART.origin,
    body: (
      <>
        <p>
          Every coordinate is measured from the origin, so place it first. After import you land
          in <b>Origin</b> mode (<K>O</K>): click the feature on the plan that should read 0,0.
        </p>
        <ul>
          <li>
            <b>Drag</b> the origin dot to move it · <b>arrow keys</b> to nudge precisely
          </li>
          <li>
            Hold <K>Shift</K> or <K>Space</K> to pan if the spot is off-screen
          </li>
          <li>
            Press <K>Enter</K> to lock the plan to the origin
          </li>
        </ul>
        <p className="hint">Rotation and scaling both pivot on the origin, so it stays put.</p>
      </>
    ),
  },
  {
    title: '3 · Scale by two points',
    art: ART.scale,
    body: (
      <>
        <p>
          Find a distance you know — a stage width, a dimension printed on the drawing, a door.
          Hit <b>Scale</b> (<K>C</K>), click the two ends, then type the real distance and press{' '}
          <K>Enter</K>.
        </p>
        <p className="hint">
          Re-scaling later is safe: anything you've already drawn scales with the plan. Set units
          (ft &amp; in, ft.in, decimal ft, m) in the top bar at any time.
        </p>
      </>
    ),
  },
  {
    title: '4 · Moving around',
    art: ART.view,
    body: (
      <>
        <ul>
          <li>
            <b>Scroll</b> to zoom toward the cursor
          </li>
          <li>
            Hold <K>Shift</K> or <K>Space</K> and drag to pan — from any tool
          </li>
          <li>
            The buttons bottom-right zoom, rotate the view, and reset rotation; the{' '}
            <b>fit</b> button up top frames everything
          </li>
        </ul>
        <p className="hint">
          Rotating the view is display-only — coordinates and labels stay upright and unchanged.
        </p>
      </>
    ),
  },
  {
    title: '5 · Draw and measure',
    art: ART.draw,
    body: (
      <>
        <p>Pick a tool from the left rail (single-letter hotkeys in brackets):</p>
        <ul>
          <li>
            <b>Point</b> (<K>D</K>) — a coordinate readout
          </li>
          <li>
            <b>Line</b> (<K>L</K>) — multi-point run with segment + total length (<K>Enter</K>{' '}
            finishes, <K>Esc</K> cancels)
          </li>
          <li>
            <b>Polygon</b> (<K>G</K>) — closed shape with perimeter + area
          </li>
          <li>
            <b>Rect</b> (<K>R</K>) / <b>Fan</b> (<K>F</K>) — drag out an audience area; drag the
            corners to resize, and a fan's edges can round into arcs
          </li>
        </ul>
        <p className="hint">
          <K>S</K> is Select: drag to move, drag handles to reshape, <K>Delete</K> to remove,{' '}
          <K>Ctrl</K>+<K>Z</K> to undo.
        </p>
      </>
    ),
  },
  {
    title: '6 · Getting it exact',
    art: ART.precise,
    body: (
      <>
        <ul>
          <li>
            Snapping (top bar) locks to existing vertices, angle steps and a grid — hold{' '}
            <K>Ctrl</K> to bypass it for one move
          </li>
          <li>
            <b>Arrow keys</b> nudge the selection a fine step; <K>Shift</K>+arrow uses the coarse
            step
          </li>
          <li>
            Every number in the right-hand panel is editable — type exact X/Y, lengths, widths or
            rotation
          </li>
        </ul>
        <p className="hint">The hotkey card at the top-right of the canvas collapses if it's in the way.</p>
      </>
    ),
  },
  {
    title: '7 · Save and export',
    art: ART.export,
    body: (
      <>
        <ul>
          <li>
            <b>Save</b> writes a <code>.planmapper</code> project — plan image included, so it
            reopens exactly as you left it
          </li>
          <li>
            <b>Export CSV</b> for a spreadsheet, or <b>Copy all coords</b> to paste anywhere.{' '}
            <b>Export .txt</b> is available in L'Acoustics Soundvision format
          </li>
        </ul>
        <p className="hint">
          That's the whole tour. Reopen it from the <b>?</b> button in the bottom-left corner
          whenever you need it.
        </p>
      </>
    ),
  },
];

// ---- component -----------------------------------------------------------

export function Guide({ onClose, onImport }: { onClose: () => void; onImport?: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;

  const close = () => {
    markGuideSeen();
    onClose();
  };

  // Own the keyboard while open. CanvasStage's window handler bails out whenever a
  // .modal-back is mounted, so these don't collide with the tool hotkeys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        setI((n) => (n === STEPS.length - 1 ? n : n + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setI((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const step = STEPS[i];
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal guide" role="dialog" aria-label="PlanMapper guide">
        <div className="guide-head">
          <h2>{step.title}</h2>
          <button className="guide-x" onClick={close} title="Close (Esc)">
            ✕
          </button>
        </div>

        {step.art}

        <div className="guide-body">{step.body}</div>

        <div className="guide-foot">
          <div className="guide-dots">
            {STEPS.map((s, n) => (
              <button
                key={s.title}
                className={`gdot ${n === i ? 'on' : ''}`}
                title={s.title}
                onClick={() => setI(n)}
              />
            ))}
          </div>
          <div className="btn-row">
            {last && onImport && (
              <button
                className="tbtn"
                onClick={() => {
                  close();
                  onImport();
                }}
              >
                Import a plan…
              </button>
            )}
            <button className="tbtn" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>
              Back
            </button>
            {last ? (
              <button className="tbtn primary" onClick={close}>
                Get started
              </button>
            ) : (
              <button className="tbtn primary" onClick={() => setI(i + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
