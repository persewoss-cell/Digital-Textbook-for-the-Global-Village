import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** 브라우저 확대(Ctrl+휠 등)로 devicePixelRatio가 바뀌면 최신 값을 돌려준다. */
function useDevicePixelRatio() {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const mq = matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [dpr]);
  return dpr;
}

// iOS Safari 등 여러 브라우저는 캔버스 한 변이나 (가로*세로) 넓이가 일정 크기를
// 넘으면 그리기를 조용히 실패시키거나(하얗게 비거나 내용이 깨짐) 캔버스를 아예
// 지워버린다. 확대를 많이 했을 때(예: 370%대) 교재가 사라지거나 이상하게 보이던
// 원인이 이것이었다 — 확대 배율 * devicePixelRatio가 곱해지면서 실제 캔버스 해상도가
// 이 한계를 넘어섰던 것. 항상 안전한 한도 안으로 낮춰서 그린다.
const MAX_CANVAS_DIMENSION = 4096;

export const PdfPageCanvas = forwardRef<
  HTMLCanvasElement,
  {
    pdf: PDFDocumentProxy;
    pageNumber: number;
    width: number;
    onSize?: (w: number, h: number) => void;
  }
>(function PdfPageCanvas({ pdf, pageNumber, width, onSize }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => canvasRef.current!, []);
  const dpr = Math.min(useDevicePixelRatio(), 4);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const cssHeight = (width * base.height) / base.width;
      let scale = (width / base.width) * dpr;
      let viewport = page.getViewport({ scale });
      const largestSide = Math.max(viewport.width, viewport.height);
      if (largestSide > MAX_CANVAS_DIMENSION) {
        scale *= MAX_CANVAS_DIMENSION / largestSide;
        viewport = page.getViewport({ scale });
      }
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
  }, [pdf, pageNumber, width, dpr]);

  return <canvas ref={canvasRef} className="block select-none" />;
});
