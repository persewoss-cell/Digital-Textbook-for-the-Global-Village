import { useEffect, useRef, useState } from "react";

interface PinchState {
  startDistance: number;
  startZoom: number;
  liveZoom: number; // 손가락을 움직이는 동안 계속 갱신되는, 아직 실제로 반영은 안 한 목표 배율
  fx: number; // 핀치 시작 시점 손가락 중간 지점이 콘텐츠 안에서 차지하는 위치(0-1)
  fy: number;
}

interface PanState {
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

/**
 * ref가 아직 어떤 DOM 요소에도 연결되지 않은 상태(예: 교재를 불러오는 동안 로딩
 * 화면만 떠 있어서 실제 회색 영역 div가 트리에 없는 상태)에서 effect가 한 번 실행되면
 * ref.current가 null인 채로 끝나 버리고, 의존성 배열이 바뀌지 않는 한 다시는 재시도하지
 * 않는 문제가 있었다(태블릿처럼 로딩이 오래 걸릴 때 핀치줌 이벤트 리스너 자체가 영영
 * 연결되지 않던 원인). 실제로 연결될 때까지 매 프레임 확인하다가, 연결되면 그 요소를
 * React state로 돌려줘서 effect가 자연스럽게 다시 실행되게 한다.
 */
function useAttachedElement<T extends HTMLElement>(ref: React.RefObject<T>): T | null {
  const [el, setEl] = useState<T | null>(ref.current);
  useEffect(() => {
    if (ref.current) {
      setEl(ref.current);
      return;
    }
    let raf = 0;
    const check = () => {
      if (ref.current) {
        setEl(ref.current);
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => cancelAnimationFrame(raf);
  }, [ref]);
  return el;
}

/**
 * 태블릿/휴대폰에서 두 손가락으로 꼬집듯이(pinch) 확대·축소하면, 화면 전체가 아니라
 * 교재를 보여주는 회색 영역 안에서만(scrollRef가 스크롤되는 그 영역) 확대/축소되도록
 * 한다 — 지도 앱처럼 그 상자 안에서만 확대·축소·드래그가 되고 나머지 화면은 그대로다.
 * zoom 값 자체를 바꾸는 것이라 PdfPageCanvas가 항상 그 배율에 맞는 해상도로 다시
 * 그려주므로 화질도 그대로 유지된다.
 *
 * `touch-action: pan-x pan-y`처럼 브라우저의 기본 스크롤은 남겨 두고 핀치줌만 막는
 * 방식은 iOS Safari에서 완전히 신뢰할 수 없었다(기기에 따라 화면 전체가 그대로
 * 확대돼 버림). 그래서 지도 위젯들이 쓰는 방식대로, 이 영역의 터치는
 * `touch-action: none`으로 브라우저 기본 동작을 통째로 끄고, 한 손가락 스크롤(팬)까지
 * 포함해 전부 우리 손으로 직접 구현한다.
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
  const scrollEl = useAttachedElement(scrollRef);
  const contentEl = useAttachedElement(contentRef);

  const pinchRef = useRef<PinchState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const midRef = useRef<{ x: number; y: number } | null>(null);
  // commitPinch가 setZoom을 부르고 나면(비동기로 리렌더된 뒤) 아래 스크롤 보정 effect가
  // 그 시점의 손가락 중간 지점을 알아야 하는데, pinchRef/midRef는 곧바로 null로
  // 지워지므로 따로 담아 둔다.
  const pendingCorrectionRef = useRef<{ fx: number; fy: number; mid: { x: number; y: number } } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // enabled가 꺼지는 순간(필기 도구 선택 등) 진행 중이던 팬/핀치를 확실히 정리한다.
  useEffect(() => {
    if (!enabled) {
      pinchRef.current = null;
      panRef.current = null;
      midRef.current = null;
    }
  }, [enabled]);

  // enabled일 때만 이 영역의 터치를 전부 우리가 직접 처리하도록 브라우저 기본 동작을
  // (스크롤 포함) 끈다. 도구가 선택돼 있을 땐(그림을 그릴 때) 이전처럼 브라우저의
  // 기본 스크롤은 허용하되 페이지 확대만 막아 둔다.
  useEffect(() => {
    if (!scrollEl) return;
    scrollEl.style.touchAction = enabled ? "none" : "pan-x pan-y";
    return () => {
      scrollEl.style.touchAction = "";
    };
  }, [scrollEl, enabled]);

  useEffect(() => {
    if (!scrollEl || !contentEl) return;
    const el = scrollEl;

    const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const midpoint = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

    const startPinch = (t0: Touch, t1: Touch) => {
      const rect = contentEl.getBoundingClientRect();
      const m = midpoint(t0, t1);
      pinchRef.current = {
        startDistance: distance(t0, t1),
        startZoom: zoomRef.current,
        liveZoom: zoomRef.current,
        fx: rect.width > 0 ? (m.x - rect.left) / rect.width : 0.5,
        fy: rect.height > 0 ? (m.y - rect.top) / rect.height : 0.5,
      };
      midRef.current = m;
    };

    // 핀치를 끝낼 때, 미리보기로만 쓰던 CSS transform을 지우고 실제 배율(liveZoom)을
    // 커밋해서 그 배율에 맞는 화질로 다시 그리게 한다.
    const commitPinch = () => {
      const pinch = pinchRef.current;
      if (!pinch) return;
      contentEl.style.transform = "";
      contentEl.style.transformOrigin = "";
      if (pinch.liveZoom !== zoomRef.current && midRef.current) {
        pendingCorrectionRef.current = { fx: pinch.fx, fy: pinch.fy, mid: midRef.current };
        setZoom(pinch.liveZoom);
      }
    };

    const startPan = (t: Touch) => {
      panRef.current = { x: t.clientX, y: t.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      if (e.touches.length === 1) {
        commitPinch();
        pinchRef.current = null;
        midRef.current = null;
        startPan(e.touches[0]);
      } else if (e.touches.length === 2) {
        panRef.current = null;
        startPinch(e.touches[0], e.touches[1]);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      if (e.touches.length === 1 && panRef.current) {
        e.preventDefault();
        const t = e.touches[0];
        el.scrollLeft = panRef.current.scrollLeft - (t.clientX - panRef.current.x);
        el.scrollTop = panRef.current.scrollTop - (t.clientY - panRef.current.y);
      } else if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault(); // 브라우저 자체의 페이지 확대(핀치줌)가 대신 발생하지 않도록 막는다
        const d = distance(e.touches[0], e.touches[1]);
        midRef.current = midpoint(e.touches[0], e.touches[1]);
        const ratio = d / pinchRef.current.startDistance;
        const next = Math.min(maxZoom, Math.max(minZoom, pinchRef.current.startZoom * ratio));
        pinchRef.current.liveZoom = next;
        // 손가락을 움직일 때마다 실제 캔버스를 다시 그리면(고화질 PDF 렌더링은
        // 비용이 커서) 뚝뚝 끊겨 보인다. 그 대신 지도 앱처럼 CSS transform으로
        // 지금 그려진 화면을 그 자리에서 즉시 확대/축소해 매끄럽게 보여주고,
        // 실제 다시 그리기(화질 유지)는 손을 뗄 때 한 번만 한다.
        const previewScale = next / pinchRef.current.startZoom;
        contentEl.style.transformOrigin = `${pinchRef.current.fx * 100}% ${pinchRef.current.fy * 100}%`;
        contentEl.style.transform = `scale(${previewScale})`;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        commitPinch();
        pinchRef.current = null;
        panRef.current = null;
        midRef.current = null;
      } else if (e.touches.length === 1) {
        // 두 손가락 중 하나를 뗀 경우: 지금까지의 확대 배율을 커밋하고, 남은
        // 손가락으로 자연스럽게 팬을 이어간다(튀는 현상 없이, 지금 위치를 새
        // 시작점으로 삼는다).
        commitPinch();
        pinchRef.current = null;
        midRef.current = null;
        startPan(e.touches[0]);
      }
    };

    // iOS Safari는 touch-action CSS만으로는 화면 전체를 확대하는 자체 핀치줌 제스처를
    // 완전히 막지 못하고, 대신 표준 터치 이벤트와는 별도로 독자적인 제스처 이벤트
    // (gesturestart/gesturechange)를 발생시킨다. 이 이벤트에서도 preventDefault를
    // 호출해야 브라우저 자체 확대가 끼어들지 않고 우리 핀치줌 로직만 동작한다.
    const onGestureStart = (e: Event) => {
      if (enabledRef.current) e.preventDefault();
    };
    const onGestureChange = (e: Event) => {
      if (enabledRef.current) e.preventDefault();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    el.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("gesturestart", onGestureStart as EventListener);
      el.removeEventListener("gesturechange", onGestureChange as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEl, contentEl, minZoom, maxZoom]);

  // 핀치를 커밋(setZoom)한 뒤 다시 그려진 직후, 손가락 사이 지점이 여전히 같은
  // 화면 위치에 있도록 스크롤 위치를 보정한다.
  useEffect(() => {
    const pending = pendingCorrectionRef.current;
    if (!pending || !scrollEl || !contentEl) return;
    pendingCorrectionRef.current = null;
    const rect = contentEl.getBoundingClientRect();
    const targetX = rect.left + pending.fx * rect.width;
    const targetY = rect.top + pending.fy * rect.height;
    scrollEl.scrollLeft += targetX - pending.mid.x;
    scrollEl.scrollTop += targetY - pending.mid.y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
}
