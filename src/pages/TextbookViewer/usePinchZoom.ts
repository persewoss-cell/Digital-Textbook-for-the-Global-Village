import { useEffect, useRef, useState } from "react";

interface PinchState {
  startDistance: number;
  startZoom: number;
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
 *
 * PdfPageCanvas가 화면에 보일 수 있는 가장 큰 크기(MAX_ZOOM 기준)로 이미 한 번
 * 그려 두고 CSS로만 줄여/키워 보여주는 방식이라(usePinchZoom과 짝을 이루는
 * PdfPageCanvas.tsx의 renderWidth/displayWidth 분리 참고), 여기서 zoom 값을 손가락을
 * 움직일 때마다 그대로 바꿔도 PDF를 다시 그리는 무거운 작업이 전혀 일어나지 않는다
 * — 그래서 매 프레임 실시간으로 반영해도 매끄럽다.
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
  wheelEnabled,
}: {
  scrollRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLElement>;
  zoom: number;
  setZoom: (z: number) => void;
  minZoom: number;
  maxZoom: number;
  /** 드래그 팬(손 모양 커서로 화면 이동)을 쓸 수 있는지. 필기 도구가 선택돼 있으면
   * 드래그가 그리기로 쓰여야 하므로 꺼진다. */
  enabled: boolean;
  /** 휠(및 트랙패드 핀치)로 확대/축소할 수 있는지. 필기 도구가 선택돼 있어도(커서가
   * 손 모양이 아니어도) 교재 위에 마우스가 있으면 휠로는 항상 확대/축소할 수 있어야
   * 하므로 enabled와 분리했다 - 없으면 enabled와 같게 동작한다. */
  wheelEnabled?: boolean;
}) {
  const scrollEl = useAttachedElement(scrollRef);
  const contentEl = useAttachedElement(contentRef);

  const pinchRef = useRef<PinchState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const midRef = useRef<{ x: number; y: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const wheelEnabledRef = useRef(wheelEnabled ?? enabled);
  wheelEnabledRef.current = wheelEnabled ?? enabled;
  // 핀치 중 setZoom 호출을 한 프레임에 한 번으로 묶기 위한 대기값/예약 핸들.
  const pendingZoomRef = useRef<number | null>(null);
  const zoomRafRef = useRef(0);

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
        fx: rect.width > 0 ? (m.x - rect.left) / rect.width : 0.5,
        fy: rect.height > 0 ? (m.y - rect.top) / rect.height : 0.5,
      };
      midRef.current = m;
    };

    const startPan = (t: Touch) => {
      panRef.current = { x: t.clientX, y: t.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    };

    // 메모(노트)를 손가락으로 드래그해서 옮길 때는 그 터치를 화면 팬(스크롤)으로
    // 취급하면 안 된다 — 터치 이벤트의 target은 손가락을 뗄 때까지 시작 지점(메모)에
    // 고정되므로, 여기서 한 번만 확인하면 된다(NotesOverlay가 각 메모에 표시해 둔
    // data-note-drag 속성으로 판단).
    const isNoteDrag = (t: Touch) => !!(t.target as HTMLElement | null)?.closest("[data-note-drag]");

    // 일부 터치스크린/브라우저는 두 손가락으로 계속 누르고 있는 중에도 아주 짧은
    // 순간 손가락 하나를 "놓친" 것처럼(touches 개수가 잠깐 1개나 0개로) 잘못
    // 보고하는 경우가 있다. 이걸 그대로 "손을 뗐다"고 받아들여 핀치를 바로
    // 끝내 버리면(팬으로 전환 등) 배율이 튀어 보인다. 그래서 손가락 수가 줄어드는
    // 순간 바로 확정하지 않고 아주 짧게(그 사이에 손가락이 다시 잡히면 취소되는)
    // 유예 시간을 준 뒤에만 실제로 핀치를 끝낸다.
    let pendingEndTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPendingEnd = () => {
      if (pendingEndTimer !== null) {
        clearTimeout(pendingEndTimer);
        pendingEndTimer = null;
      }
    };
    const schedulePinchEnd = (remaining: Touch | null) => {
      cancelPendingEnd();
      pendingEndTimer = setTimeout(() => {
        pendingEndTimer = null;
        pinchRef.current = null;
        midRef.current = null;
        if (remaining) startPan(remaining);
        else panRef.current = null;
      }, 120);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      if (e.touches.length === 2) {
        // 핀치 도중 손가락 수가 잠깐 줄었다가 다시 2개로 돌아온 경우(위 설명 참고)라면
        // 예약된 종료를 취소하고 기존 핀치를 그대로 이어간다 — 여기서 새로 시작하면
        // 배율 기준(startDistance)이 지금 손가락 위치로 다시 잡혀서 확대가 튀어 보인다.
        cancelPendingEnd();
        if (pinchRef.current) return;
        panRef.current = null;
        startPinch(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
        if (pinchRef.current) return; // 핀치 종료 유예 시간 중 — schedulePinchEnd가 처리
        if (isNoteDrag(e.touches[0])) return;
        cancelPendingEnd();
        midRef.current = null;
        startPan(e.touches[0]);
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
        // touchstart 없이 손가락 수가 바로 2로 다시 확인된 경우(예약된 종료를 아직
        // 취소할 기회가 없었던 경우)에도, 계속 핀치 중임이 확실하므로 예약을 취소한다.
        cancelPendingEnd();
        const d = distance(e.touches[0], e.touches[1]);
        midRef.current = midpoint(e.touches[0], e.touches[1]);
        const ratio = d / pinchRef.current.startDistance;
        const next = Math.min(maxZoom, Math.max(minZoom, pinchRef.current.startZoom * ratio));
        // touchmove는 화면 주사율보다도 훨씬 자주(때로는 프레임당 여러 번) 발생할 수
        // 있는데, setZoom을 부를 때마다 리액트 리렌더 + 레이아웃 재계산(필기 캔버스
        // 크기 재조정 등)이 뒤따르므로 그대로 다 반영하면 처리가 밀려 뚝뚝 끊긴다.
        // 화면이 그릴 수 있는 속도(요청 애니메이션 프레임)에 맞춰 최신 값만 한 번
        // 반영하도록 묶는다 - 중간 값은 버려도 최종적으로 손가락 위치와 배율은 항상
        // 맞아떨어진다.
        pendingZoomRef.current = next;
        if (zoomRafRef.current === 0) {
          zoomRafRef.current = requestAnimationFrame(() => {
            zoomRafRef.current = 0;
            if (pendingZoomRef.current !== null) {
              setZoom(pendingZoomRef.current);
              pendingZoomRef.current = null;
            }
          });
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchRef.current) {
        // 핀치 중이었다면 진짜로 손을 뗀 건지, 순간적으로 잘못 인식된 건지 잠깐
        // 기다렸다가 확정한다(schedulePinchEnd 위 설명 참고).
        schedulePinchEnd(e.touches[0] ?? null);
        return;
      }
      if (e.touches.length === 0) {
        panRef.current = null;
        midRef.current = null;
      } else if (e.touches.length === 1) {
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
      cancelPendingEnd();
      if (zoomRafRef.current) {
        cancelAnimationFrame(zoomRafRef.current);
        zoomRafRef.current = 0;
      }
      pendingZoomRef.current = null;
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("gesturestart", onGestureStart as EventListener);
      el.removeEventListener("gesturechange", onGestureChange as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollEl, contentEl, minZoom, maxZoom]);

  // 줌 값이 바뀌어 다시 그려진 직후, 핀치 중이었다면 손가락 사이 지점이 여전히 같은
  // 화면 위치에 있도록 스크롤 위치를 보정한다.
  useEffect(() => {
    const pinch = pinchRef.current;
    const mid = midRef.current;
    if (!pinch || !scrollEl || !contentEl || !mid) return;
    const rect = contentEl.getBoundingClientRect();
    const targetX = rect.left + pinch.fx * rect.width;
    const targetY = rect.top + pinch.fy * rect.height;
    scrollEl.scrollLeft += targetX - mid.x;
    scrollEl.scrollTop += targetY - mid.y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // 교재 위에서는 마우스 휠(컨트롤 키 없이) 자체가 곧 확대/축소다 - 화면
  // 이동(팬)은 아래 드래그로, 확대/축소는 휠로 역할을 나눴다. PC 트랙패드에서 두
  // 손가락으로 오므리고 벌리는 제스처도 브라우저에는 결국 wheel 이벤트로
  // 전달되며(이때 ctrlKey가 자동으로 true로 표시됨 - 실제 Ctrl 키를 누르지 않아도
  // 트랙패드가 그렇게 보고한다) 같은 핸들러로 자연스럽게 처리된다. 커서(또는 두
  // 손가락) 위치를 그대로 축소·확대 중심으로 삼아, 태블릿 핀치줌과 똑같이 그
  // 지점이 화면에서 안 움직이게 한다.
  useEffect(() => {
    if (!scrollEl || !contentEl) return;
    const el = scrollEl;
    const onWheel = (e: WheelEvent) => {
      if (!wheelEnabledRef.current) return;
      e.preventDefault();
      const rect = contentEl.getBoundingClientRect();
      const fx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5;
      const fy = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
      pinchRef.current = { startDistance: 0, startZoom: zoomRef.current, fx, fy };
      midRef.current = { x: e.clientX, y: e.clientY };
      // deltaY가 음수면(손가락을 벌리는 핀치아웃/휠을 위로) 확대, 양수면 축소 -
      // 트랙패드/브라우저의 공통 관례를 따른다. 마우스 휠은 한 번의 "딸깍"이
      // 트랙패드보다 훨씬 큰 deltaY(보통 100 안팎)를 한 번에 보내므로, 계수를 작게
      // 잡아야 한 번 굴렸을 때 단번에 최대 배율로 튀지 않고 계단식으로 자연스럽게
      // 커진다.
      const factor = Math.exp(-e.deltaY * 0.0025);
      const next = Math.min(maxZoom, Math.max(minZoom, zoomRef.current * factor));
      pendingZoomRef.current = next;
      if (zoomRafRef.current === 0) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = 0;
          if (pendingZoomRef.current !== null) {
            setZoom(pendingZoomRef.current);
            pendingZoomRef.current = null;
          }
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollEl, contentEl, minZoom, maxZoom, setZoom]);

  // PC(마우스)에서도 태블릿의 한 손가락 팬처럼, 손 모양 커서가 보일 때 교재 위
  // 빈 곳을 눌러서 그대로 드래그하면 상하좌우로 스크롤된다(확대/축소는 위 휠
  // 핸들러가 담당). 활동 확대 아이콘/번호나 메모처럼 그 자리에서 뭔가를 해야 하는
  // 요소들은 data-no-pan(또는 data-note-drag) 표시를 달아 두고 여기서
  // .closest()로 걸러서, 그런 요소를 누르면 이 드래그팬이 아예 시작되지 않게
  // 한다. (그런 요소들은 자기 pointerdown에서 React의 stopPropagation을 부르지만,
  // 이 리스너는 addEventListener로 직접 붙인 네이티브 리스너라 실제 DOM 버블
  // 단계에서 React가 stopPropagation을 처리하기 전에 이미 실행돼 버린다 - 그래서
  // 별도로 걸러야 한다.) 추가로, 어떤 이유로든 pointerup을 놓쳐 드래그 상태가
  // 남아 있더라도 마우스를 움직일 때마다 실제로 버튼이 눌려 있는지(e.buttons)
  // 확인해서, 눌려 있지 않으면 바로 정리한다 - 확대 아이콘을 눌러 이동한 뒤 버튼
  // 없이 마우스만 움직여도 화면이 따라 움직이던 문제의 안전장치.
  useEffect(() => {
    if (!scrollEl) return;
    const el = scrollEl;
    // 마우스를 올렸을 때 "여기를 잡고 움직일 수 있다"는 걸 보여주는 기본 커서.
    // 도구가 선택돼 있으면(그림을 그릴 때) grab 커서를 보이지 않는다.
    el.style.cursor = enabled ? "grab" : "";

    const DRAG_THRESHOLD = 4;
    let down: { x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;
    let dragging = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || !enabledRef.current) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-no-pan], [data-note-drag]")) return;
      down = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
      dragging = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!down) return;
      if (!(e.buttons & 1)) {
        down = null;
        dragging = false;
        el.style.cursor = enabledRef.current ? "grab" : "";
        return;
      }
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        el.style.cursor = "grabbing";
      }
      e.preventDefault();
      el.scrollLeft = down.scrollLeft - dx;
      el.scrollTop = down.scrollTop - dy;
    };
    const endDrag = () => {
      down = null;
      dragging = false;
      el.style.cursor = enabledRef.current ? "grab" : "";
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      el.style.cursor = "";
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [scrollEl, enabled]);
}
