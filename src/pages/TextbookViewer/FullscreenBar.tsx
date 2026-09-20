import { useRef, useState } from "react";

/** 전체화면 모드에서 상단 툴바 대부분이 사라진 대신, 오른쪽 위에 작게 한 줄로
 * 떠 있는 축소판 툴바. 화면 기준(컨테이너 기준) 절대 위치라서 교재를 확대/축소해도
 * (boxWidth가 커지고 작아질 뿐 이 레이어의 부모를 옮기거나 늘이지 않으므로) 자리가
 * 흔들리지 않는다. 왼쪽 끝의 손잡이(⠿)를 눌러서만 끌 수 있게 해서, 버튼을 누르다가
 * 실수로 위치가 옮겨지는 일이 없게 한다. */
export function FullscreenBar({
  boundsRef,
  zoom,
  onZoomChange,
  onZoomReset,
  currentPage,
  numPages,
  onExitFullscreen,
}: {
  boundsRef: React.RefObject<HTMLElement>;
  zoom: number;
  onZoomChange: (delta: number) => void;
  onZoomReset: () => void;
  currentPage: number;
  numPages: number;
  onExitFullscreen: () => void;
}) {
  // 컨테이너(전체화면을 차지하는 영역) 기준 오른쪽 위 모서리로부터의 거리(px).
  const [pos, setPos] = useState({ top: 10, right: 10 });
  const dragRef = useRef<{ startX: number; startY: number; startTop: number; startRight: number } | null>(
    null,
  );

  const handleGripPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTop: pos.top, startRight: pos.right };
  };
  const handleGripPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = boundsRef.current?.getBoundingClientRect();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    let top = drag.startTop + dy;
    let right = drag.startRight - dx;
    if (bounds) {
      top = Math.min(Math.max(0, top), Math.max(0, bounds.height - 36));
      right = Math.min(Math.max(0, right), Math.max(0, bounds.width - 60));
    }
    setPos({ top, right });
  };
  const handleGripPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div
      className="absolute z-40 flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-1 text-xs shadow-lg"
      style={{ top: pos.top, right: pos.right, touchAction: "none" }}
    >
      <div
        className="mr-0.5 flex h-6 w-4 shrink-0 cursor-move items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="눌러서 이동"
        onPointerDown={handleGripPointerDown}
        onPointerMove={handleGripPointerMove}
        onPointerUp={handleGripPointerUp}
        onPointerCancel={handleGripPointerUp}
      >
        ⠿
      </div>
      <span className="px-1 text-slate-500">
        {currentPage}/{numPages}쪽
      </span>
      <button className="btn-ghost !px-1" title="축소" onClick={() => onZoomChange(-0.2)}>
        －
      </button>
      <span className="w-9 text-center text-slate-500">{Math.round(zoom * 100)}%</span>
      <button className="btn-ghost !px-1" title="확대" onClick={() => onZoomChange(0.2)}>
        ＋
      </button>
      {zoom !== 1 && (
        <button className="btn-ghost !px-1" title="원래 크기로" onClick={onZoomReset}>
          ↺
        </button>
      )}
      <button
        className="btn-ghost !px-1 font-semibold text-brand-700"
        title="전체화면 나가기"
        onClick={onExitFullscreen}
      >
        🗗 축소
      </button>
    </div>
  );
}
