import { useEffect, useState } from 'react';
import type * as pdfjs from 'pdfjs-dist';
import { renderPdfThumb, renderPdfPage, type LoadedRaster } from '../core/loadFile';

export function PagePicker({
  pdf,
  name,
  onPick,
  onCancel,
}: {
  pdf: pdfjs.PDFDocumentProxy;
  name: string;
  onPick: (raster: LoadedRaster) => void;
  onCancel: () => void;
}) {
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const arr: (string | null)[] = new Array(pdf.numPages).fill(null);
      setThumbs(arr.slice());
      for (let i = 1; i <= pdf.numPages; i++) {
        const t = await renderPdfThumb(pdf, i);
        if (cancelled) return;
        arr[i - 1] = t;
        setThumbs(arr.slice());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  const pick = async (pageNumber: number) => {
    setBusy(true);
    const raster = await renderPdfPage(pdf, pageNumber, name);
    onPick(raster);
  };

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Choose a page — {name}</h2>
        <div className="thumbgrid">
          {Array.from({ length: pdf.numPages }, (_, i) => (
            <div className="thumb" key={i} onClick={() => !busy && pick(i + 1)}>
              {thumbs[i] ? <img src={thumbs[i]!} alt={`Page ${i + 1}`} /> : <div style={{ height: 120 }} />}
              <div className="cap">Page {i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
