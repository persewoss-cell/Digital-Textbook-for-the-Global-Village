import { useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export function PdfPageCanvas({
  pdf,
  pageNumber,
  width,
  onSize,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  onSize?: (w: number, h: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssHeight = (width * base.height) / base.width;
      const scale = (width / base.width) * dpr;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${cssHeight}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) onSize?.(width, cssHeight);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, width]);

  return <canvas ref={canvasRef} className="block select-none" />;
}
