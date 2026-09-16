import type { ChapterMeta, StudentBookmarkDoc } from "@/types";

export function TocPanel({
  title,
  chapters,
  currentPage,
  onJump,
  bookmarks,
}: {
  title: string;
  chapters: ChapterMeta[];
  currentPage: number;
  onJump: (page: number) => void;
  bookmarks: StudentBookmarkDoc[];
}) {
  return (
    <div className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-bold text-slate-800">{title}</h2>
      </div>

      <div className="p-3">
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          목차
        </h3>
        <ul className="space-y-0.5">
          {chapters.map((c) => {
            const active =
              currentPage >= c.startPage &&
              (chapters.find((n) => n.startPage > c.startPage)?.startPage ?? Infinity) >
                currentPage;
            return (
              <li key={c.startPage}>
                <button
                  onClick={() => onJump(c.startPage)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    active
                      ? "bg-brand-50 font-semibold text-brand-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {c.title}
                  <span className="ml-1 text-xs text-slate-400">· {c.startPage}쪽</span>
                </button>
              </li>
            );
          })}
          {chapters.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">등록된 목차가 없어요.</p>
          )}
        </ul>
      </div>

      <div className="border-t border-slate-100 p-3">
        <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          내 책갈피
        </h3>
        <ul className="space-y-0.5">
          {bookmarks.map((b) => (
            <li key={b.page}>
              <button
                onClick={() => onJump(b.page)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                <span className="text-amber-400">★</span> {b.page}쪽
              </button>
            </li>
          ))}
          {bookmarks.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">책갈피한 쪽이 없어요.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
