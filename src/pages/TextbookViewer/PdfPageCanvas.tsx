import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

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
    /** 실제로 캔버스에 그려 넣을 해상도 기준 너비. 확대(zoom)와 무관하게 "이 쪽이
     * 화면에 가장 커질 수 있는 크기"로 한 번만 잡아 두면, 그보다 작게 보여줄 때는
     * (아래 displayWidth) 이미 그려진 내용을 CSS로 줄여서 보여주기만 하면 되므로
     * 손가락으로 확대·축소할 때마다 PDF를 다시 그릴 필요가 없다. */
    renderWidth: number;
    /** 지금 화면에 실제로 보여줄 CSS 너비(줌에 따라 계속 바뀐다). 이 값이 바뀌어도
     * 캔버스를 다시 그리지 않고 CSS 크기만 바뀌므로 즉각적이고 매끄럽다. */
    displayWidth: number;
    onSize?: (w: number, h: number) => void;
  }
>(function PdfPageCanvas({ pdf, pageNumber, renderWidth, displayWidth, onSize }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useImperativeHandle(ref, () => canvasRef.current!, []);
  const dpr = Math.min(useDevicePixelRatio(), 4);
  // 쪽의 가로세로 비율(높이/너비). 쪽 번호가 같으면 안 바뀌므로, displayWidth가
  // 바뀔 때마다(줌) 다시 계산할 필요 없이 한 번만 구해서 재사용한다.
  const [aspect, setAspect] = useState(1.41);
  // onSize 호출 시점(실제로 다시 그려졌을 때)의 최신 displayWidth를 읽기 위한 ref.
  // 의존성 배열에 displayWidth를 넣으면 줌이 바뀔 때마다 이 effect가 다시 실행돼
  // 버리므로(그러면 또 렌더링을 하게 됨), ref로 우회한다.
  const displayWidthRef = useRef(displayWidth);
  displayWidthRef.current = displayWidth;

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      if (!cancelled) setAspect(base.height / base.width);
      let scale = (renderWidth / base.width) * dpr;
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
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // 렌더링 도중(예: 레이아웃이 다시 계산돼 renderWidth가 또 바뀌는 경우) 이
      // effect가 다시 실행되면, 이전 렌더링이 끝나기 전에 같은 캔버스에 새 렌더링을
      // 또 시작하게 되어 pdf.js가 "Cannot use the same canvas during multiple
      // render() operations" 오류를 내며 캔버스가 반쯤 그려진(뒤집혀 보이는 등
      // 이상한) 상태로 남는 문제가 있었다. 진행 중인 렌더링을 렌더 태스크로 잡아
      // 두었다가, 새로 시작하기 전이나 이 effect가 정리될 때 확실히 취소한다.
      try {
        const task = page.render({ canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
      } catch (err) {
        if (cancelled) return; // 우리가 취소해서 난 에러는 무시
        throw err;
      }
      // onSize는 QR코드/링크 감지처럼 "실제로 다시 그려진 캔버스 픽셀"을 다시 읽어야
      // 하는 무거운 작업의 트리거로 쓰인다. displayWidth(줌)가 바뀔 때마다 부르면
      // 손가락으로 확대·축소할 때마다 그 무거운 작업이 또 실행돼 버벅이므로, 실제로
      // 새로 그려졌을 때(이 effect가 실행됐을 때)만 한 번 부른다.
      if (!cancelled) onSize?.(displayWidthRef.current, displayWidthRef.current * (base.height / base.width));
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, renderWidth, dpr]);

  const displayHeight = displayWidth * aspect;

  return (
    <canvas
      ref={canvasRef}
      className="block select-none"
      style={{ width: displayWidth, height: displayHeight }}
    />
  );
});
