// Loading plan images from disk: raster images (JPG/PNG/etc.) load directly;
// PDFs are rendered to a raster via pdf.js at high resolution (no size limit,
// no compression needed).

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Cap the longest rendered edge so very large plans stay responsive while
// remaining sharp enough to trace/scale accurately.
const MAX_EDGE = 4000;

export interface LoadedRaster {
  name: string;
  src: string; // data URL
  natW: number;
  natH: number;
}

export interface LoadedFile {
  kind: 'image' | 'pdf';
  name: string;
  // image: single raster ready to use
  raster?: LoadedRaster;
  // pdf: keep the document to render a chosen page
  pdf?: pdfjsLib.PDFDocumentProxy;
  pageCount?: number;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

export async function loadFile(file: File): Promise<LoadedFile> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const buf = await readAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    return { kind: 'pdf', name: file.name, pdf, pageCount: pdf.numPages };
  }

  const src = await readAsDataURL(file);
  const { w, h } = await imageSize(src);
  return {
    kind: 'image',
    name: file.name,
    raster: { name: file.name, src, natW: w, natH: h },
  };
}

// Render a single PDF page to a raster data URL.
export async function renderPdfPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  baseName: string,
): Promise<LoadedRaster> {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const longest = Math.max(unscaled.width, unscaled.height);
  const scale = Math.min(MAX_EDGE / longest, 4); // don't upscale absurdly
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  // white background (PDFs are often transparent)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  const src = canvas.toDataURL('image/png');
  const label = pdf.numPages > 1 ? `${baseName} (p.${pageNumber})` : baseName;
  return { name: label, src, natW: canvas.width, natH: canvas.height };
}

// Generate a small thumbnail data URL for a PDF page (for the page picker).
export async function renderPdfThumb(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  maxEdge = 160,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const longest = Math.max(unscaled.width, unscaled.height);
  const viewport = page.getViewport({ scale: maxEdge / longest });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL('image/png');
}
