import { useRef } from "react";

export interface MagnifierRect {
  fx: number;
  fy: number;
  fw: number;
  fh: number;
}

export function MagnifierOverlay({
  rect,
  boxWidth,
  boxHeight,
  onChange,
  onConfirm,
}: {
  rect: MagnifierRect;
  boxWidth: number;
  boxHeight: number;
  onChange: (rect: MagnifierRect) => void;
  onConfirm: (el: HTMLDivElement) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; fx: number; fy: number; moved: boolean } | null>(
    null,
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    drag.current = { startX: e.clientX, startY: e.clientY, fx: rect.fx, fy: rect.fy, moved: false };
    elRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    const fx = Math.min(1 - rect.fw, Math.max(0, drag.current.fx + dx / boxWidth));
    const fy = Math.min(1 - rect.fh, Math.max(0, drag.current.fy + dy / boxHeight));
    onChange({ ...rect, fx, fy });
  };

  const handlePointerUp = () => {
    if (drag.current && !drag.current.moved && elRef.current) {
      onConfirm(elRef.current);
    }
    drag.current = null;
  };

  return (
    <div
      ref={elRef}
      data-no-pan="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="absolute flex cursor-move items-center justify-center rounded-lg border-2 border-brand-500 bg-brand-400/20 text-center text-xs font-semibold text-brand-700 shadow-lg"
      style={{
        left: `${rect.fx * 100}%`,
        top: `${rect.fy * 100}%`,
        width: `${rect.fw * 100}%`,
        height: `${rect.fh * 100}%`,
        touchAction: "none",
      }}
    >
      🔍
      <br />
      눌러서 확대
    </div>
  );
}
