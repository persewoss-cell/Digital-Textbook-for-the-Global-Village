import { useEffect, useRef } from "react";

interface PinchState {
  startDistance: number;
  startZoom: number;
  fx: number; // 핀치 시작 시점 손가락 중간 지점이 콘텐츠 안에서 차지하는 위치(0-1)
  fy: number;
}

/**
 * 태블릿/휴대폰에서 두 손가락으로 꼬집듯이(pinch) 확대·축소하면, 화면 전체가 아니라
 * 교재를 보여주는 회색 영역 안에서만(scrollRef가 스크롤되는 그 영역) 확대/축소되도록
 * 한다 — 휴대폰 사진 앱처럼 손가락 사이 지점이 그대로 화면에 고정된 채로 확대된다.
 * zoom 값 자체를 바꾸는 것이라 PdfPageCanvas가 항상 그 배율에 맞는 해상도로 다시
 * 그려주므로 화질도 그대로 유지된다.
 */
export function usePinchZoom({
  scrollRef,
  contentRef,
  zoom,
  setZoom,
  minZoom,
  maxZoom,
  enabled,
}: {
  scrollRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLElement>;
  zoom: number;
  setZoom: (z: number) => void;
  minZoom: number;
  maxZoom: number;
  enabled: boolean;
}) {
  const pinchRef = useRef<PinchState | null>(null);
  const midRef = useRef<{ x: number; y: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midpoint = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || e.touches.length !== 2) return;
      const content = contentRef.current;
      if (!content) return;
      const rect = content.getBoundingClientRect();
      const m = midpoint(e.touches[0], e.touches[1]);
      pinchRef.current = {
        startDistance: distance(e.touches[0], e.touches[1]),
        startZoom: zoomRef.current,
        fx: rect.width > 0 ? (m.x - rect.left) / rect.width : 0.5,
        fy: rect.height > 0 ? (m.y - rect.top) / rect.height : 0.5,
      };
      midRef.current = m;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchRef.current || e.touches.length !== 2) return;
      e.preventDefault(); // 브라우저 자체의 페이지 확대(핀치줌)가 대신 발생하지 않도록 막는다
      const d = distance(e.touches[0], e.touches[1]);
      midRef.current = midpoint(e.touches[0], e.touches[1]);
      const ratio = d / pinchRef.current.startDistance;
      const next = Math.min(maxZoom, Math.max(minZoom, pinchRef.current.startZoom * ratio));
      setZoom(next);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchRef.current = null;
        midRef.current = null;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef, contentRef, minZoom, maxZoom]);

  // 줌 값이 바뀌어 다시 그려진 직후, 핀치 중이었다면 손가락 사이 지점이 여전히 같은
  // 화면 위치에 있도록 스크롤 위치를 보정한다.
  useEffect(() => {
    const pinch = pinchRef.current;
    const scrollEl = scrollRef.current;
    const content = contentRef.current;
    const mid = midRef.current;
    if (!pinch || !scrollEl || !content || !mid) return;
    const rect = content.getBoundingClientRect();
    const targetX = rect.left + pinch.fx * rect.width;
    const targetY = rect.top + pinch.fy * rect.height;
    scrollEl.scrollLeft += targetX - mid.x;
    scrollEl.scrollTop += targetY - mid.y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
}
