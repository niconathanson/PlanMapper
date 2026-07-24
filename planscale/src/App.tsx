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
import type { PlanImage } from './core/types';

export default function App() {
  const setImage = useStore((s) => s.setImage);
  const requestFit = useStore((s) => s.requestFit);
  const setTool = useStore((s) => s.setTool);
  const theme = useStore((s) => s.theme);

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

      {loadingMsg && (
        <div className="modal-back">
          <div className="modal">{loadingMsg}</div>
        </div>
      )}
    </div>
  );
}
