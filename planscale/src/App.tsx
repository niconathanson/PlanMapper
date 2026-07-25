import { useRef, useState, useEffect } from 'react';
import './App.css';
import type * as pdfjs from 'pdfjs-dist';
import { useStore } from './core/store';
import { loadFile, renderPdfPage, type LoadedRaster } from './core/loadFile';
import { TopBar } from './ui/TopBar';
import { Toolbar } from './ui/Toolbar';
import { Sidebar } from './ui/Sidebar';
import { PagePicker } from './ui/PagePicker';
import { Guide, guideWasSeen } from './ui/Guide';
import { CanvasStage } from './canvas/CanvasStage';
import { useProjectIO } from './ui/useProjectIO';
import type { PlanImage } from './core/types';

// True when running inside the Tauri desktop shell rather than a plain browser.
const isTauri = () => '__TAURI_INTERNALS__' in window;

export default function App() {
  const setImage = useStore((s) => s.setImage);
  const requestFit = useStore((s) => s.requestFit);
  const setTool = useStore((s) => s.setTool);
  const theme = useStore((s) => s.theme);
  const { doSave } = useProjectIO();
  const [quitPrompt, setQuitPrompt] = useState(false);

  // Ctrl/Cmd+S saves, Ctrl/Cmd+Shift+S saves as. Registered here (not in the
  // canvas) so it works no matter what has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void doSave(e.shiftKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSave]);

  // Don't let unsaved work disappear when the window is closed. In a browser
  // that's the native beforeunload prompt; in the desktop app the close has to
  // be intercepted through Tauri and answered with our own dialog.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!useStore.getState().dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) =>
          getCurrentWindow().onCloseRequested((e) => {
            if (!useStore.getState().dirty) return;
            e.preventDefault();
            setQuitPrompt(true);
          }),
        )
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {
          /* not running under Tauri after all — beforeunload covers us */
        });
    }
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unlisten?.();
    };
  }, []);

  const closeWindow = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().destroy();
    } else {
      window.close();
    }
  };

  // Reflect the theme onto the document root so CSS variables switch.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfPick, setPdfPick] = useState<{ pdf: pdfjs.PDFDocumentProxy; name: string } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  // First run on this machine → open the walkthrough automatically.
  const [guideOpen, setGuideOpen] = useState(() => !guideWasSeen());

  const placeRaster = (r: LoadedRaster) => {
    // Default placement: image centered on the origin, sized so it's ~20 m wide
    // until the user scales it precisely with two points.
    const mPerPx = 20 / r.natW;
    const img: PlanImage = {
      id: crypto.randomUUID(),
      name: r.name,
      src: r.src,
      natW: r.natW,
      natH: r.natH,
      center: { x: 0, y: 0 },
      rotationDeg: 0,
      mPerPx,
      opacity: 1,
      visible: true,
    };
    setImage(img);
    // Drop straight into Origin mode: the user clicks the plan feature that should
    // read as 0,0 (drag the dot or arrow-nudge to fine-tune), then presses Enter to
    // lock. Rotation and scale afterward both pivot on that fixed origin.
    setTool('origin');
    setTimeout(() => requestFit(), 30);
  };

  const handleFiles = async (files: FileList) => {
    const file = files[0];
    if (!file) return;
    setLoadingMsg('Loading…');
    try {
      const loaded = await loadFile(file);
      if (loaded.kind === 'image' && loaded.raster) {
        placeRaster(loaded.raster);
      } else if (loaded.kind === 'pdf' && loaded.pdf) {
        if ((loaded.pageCount ?? 1) === 1) {
          const r = await renderPdfPage(loaded.pdf, 1, loaded.name);
          placeRaster(r);
        } else {
          setPdfPick({ pdf: loaded.pdf, name: loaded.name });
        }
      }
    } catch (err) {
      alert('Could not load that file: ' + (err as Error).message);
    } finally {
      setLoadingMsg(null);
    }
  };

  const triggerImport = () => fileInputRef.current?.click();

  return (
    <div className="app">
      <TopBar onImport={triggerImport} />
      <div className="body">
        <Toolbar onHelp={() => setGuideOpen(true)} />
        <CanvasStage onImport={triggerImport} onFiles={handleFiles} />
        <Sidebar onImport={triggerImport} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {pdfPick && (
        <PagePicker
          pdf={pdfPick.pdf}
          name={pdfPick.name}
          onPick={(r) => {
            placeRaster(r);
            setPdfPick(null);
          }}
          onCancel={() => setPdfPick(null)}
        />
      )}

      {guideOpen && <Guide onClose={() => setGuideOpen(false)} onImport={triggerImport} />}

      {quitPrompt && (
        <div className="modal-back">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Save before closing?</h3>
            <p style={{ marginBottom: 16 }}>
              This project has changes that haven't been saved yet.
            </p>
            <div className="btn-row">
              <button
                className="tbtn primary"
                onClick={async () => {
                  if (await doSave()) await closeWindow();
                }}
              >
                Save and close
              </button>
              <button className="tbtn" onClick={() => void closeWindow()}>
                Close without saving
              </button>
              <button className="tbtn" onClick={() => setQuitPrompt(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loadingMsg && (
        <div className="modal-back">
          <div className="modal">{loadingMsg}</div>
        </div>
      )}
    </div>
  );
}
