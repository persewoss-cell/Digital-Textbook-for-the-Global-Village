import type { ReactNode } from "react";

/**
 * 사진/영상을 새 창 대신 화면 안에서 크게 보여주는 팝업. 오른쪽 위 X로 닫을 수 있고,
 * 어두운 배경을 눌러도 닫힌다.
 */
export function MediaPopup({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <button
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-slate-700 shadow-lg hover:bg-slate-100"
          onClick={onClose}
          aria-label="닫기"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
