import type { ChapterMeta } from "@/types";

/** 전체화면 모드에서는 목차 패널 전체를 넣을 자리가 없어서 평소엔 목차 버튼
 * 자체를 숨기는데, 그 대신 책이 다 못 채우는 화면 양옆의 회색 여백을 활용해
 * 여기에 작은 목차 버튼 + 목록을 띄워 둔다. */
export function FullscreenTocRail({
  chapters,
  currentPage,
  open,
  onToggle,
  onJump,
}: {
  chapters: ChapterMeta[];
  currentPage: number;
  open: boolean;
  onToggle: () => void;
  onJump: (page: number) => void;
}) {
  return (
    <div className="absolute left-2 top-2 z-20 w-32">
      <button
        className={`relative w-full rounded-lg px-2 py-1.5 text-xs font-semibold shadow ${
          open ? "bg-brand-100 text-brand-700" : "bg-white/95 text-slate-600 hover:bg-white"
        }`}
        onClick={onToggle}
      >
        📚 목차
        {open && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white" />
        )}
      </button>
      {open && (
        <div className="mt-1 max-h-[70vh] overflow-y-auto rounded-lg bg-white/95 p-1 shadow-lg">
          {chapters.map((c) => {
            const active =
              currentPage >= c.startPage &&
              (chapters.find((n) => n.startPage > c.startPage)?.startPage ?? Infinity) > currentPage;
            return (
              <button
                key={c.startPage}
                onClick={() => onJump(c.startPage)}
                title={c.title}
                className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] ${
                  active ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.title}
              </button>
            );
          })}
          {chapters.length === 0 && (
            <p className="px-2 py-1 text-[11px] text-slate-400">등록된 목차가 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
