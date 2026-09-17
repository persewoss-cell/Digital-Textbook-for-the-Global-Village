import type { ChapterMeta } from "@/types";

export function TocPanel({
  title,
  chapters,
  currentPage,
  onJump,
  onClose,
}: {
  title: string;
  chapters: ChapterMeta[];
  currentPage: number;
  onJump: (page: number) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
        <h2 className="font-bold text-slate-800">{title}</h2>
        {onClose && (
          <button
            className="shrink-0 rounded-lg px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="목차 닫기"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>

      <div className="p-3">
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">목차</h3>
        <ul className="space-y-0.5">
          {chapters.map((c) => {
            const active =
              currentPage >= c.startPage &&
              (chapters.find((n) => n.startPage > c.startPage)?.startPage ?? Infinity) > currentPage;
            return (
              <li key={c.startPage}>
                <button
                  onClick={() => onJump(c.startPage)}
                  title={c.title}
                  className={`flex w-full items-center gap-1 rounded-lg px-3 py-1.5 text-left text-xs transition ${
                    active ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{c.printedPage ?? c.startPage}쪽</span>
                </button>
              </li>
            );
          })}
          {chapters.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">등록된 목차가 없어요.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
