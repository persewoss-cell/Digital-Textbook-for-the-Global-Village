import { useEffect, useRef } from "react";
import { DEFAULT_NOTE_FONT_SIZE } from "./NotesOverlay";
import type { PlacedNote } from "@/types";

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 28;

/** 스크롤 대신 글자 수만큼 textarea 자체의 높이가 늘어나게 한다(NotesPanel과 동일). */
function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** 전체화면 모드의 오른쪽 회색 여백에 띄우는 작은 노트 버튼 + 목록. 폭이 좁은
 * 자리라 설명 문구는 다 빼고 아이콘 위주로만 구성한다(NotesPanel의 축소판). */
export function FullscreenNotesRail({
  items,
  activeId,
  readOnly,
  noteToolActive,
  open,
  onToggle,
  onSelect,
  onChangeText,
  onChangeFontSize,
  onDelete,
  onAddNote,
}: {
  items: PlacedNote[];
  activeId: string | null;
  readOnly: boolean;
  noteToolActive: boolean;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
  onChangeFontSize: (id: string, fontSize: number) => void;
  onDelete: (id: string) => void;
  onAddNote?: () => void;
}) {
  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  useEffect(() => {
    if (activeId) refs.current.get(activeId)?.focus();
  }, [activeId]);
  useEffect(() => {
    refs.current.forEach((el) => autoResize(el));
  }, [items]);

  return (
    <div className="absolute right-2 top-2 z-20 w-32">
      <button
        className={`relative w-full rounded-lg px-2 py-1.5 text-xs font-semibold shadow ${
          open ? "bg-brand-100 text-brand-700" : "bg-white/95 text-slate-600 hover:bg-white"
        }`}
        onClick={onToggle}
      >
        📝 노트
        {open && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white" />
        )}
      </button>

      {open && (
        <div className="mt-1 max-h-[70vh] overflow-y-auto rounded-lg bg-white/95 p-1.5 shadow-lg">
          {!readOnly && onAddNote && (
            <button
              className={`mb-1.5 w-full rounded-lg border px-2 py-1 text-xs font-semibold ${
                noteToolActive
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              onClick={onAddNote}
              title="메모 추가"
            >
              ＋
            </button>
          )}
          <div className="space-y-1.5">
            {items.map((note) => {
              const fontSize = note.fontSize ?? DEFAULT_NOTE_FONT_SIZE;
              return (
                <div
                  key={note.id}
                  className={`rounded-lg border p-1.5 ${
                    note.id === activeId ? "border-brand-400 bg-brand-50/50" : "border-slate-200"
                  }`}
                  onClick={() => onSelect(note.id)}
                >
                  <textarea
                    ref={(el) => {
                      if (el) {
                        refs.current.set(note.id, el);
                        autoResize(el);
                      } else refs.current.delete(note.id);
                    }}
                    className="w-full resize-none overflow-hidden border-0 bg-transparent text-xs outline-none disabled:text-slate-500"
                    rows={1}
                    value={note.text}
                    disabled={readOnly}
                    onChange={(e) => {
                      autoResize(e.target);
                      onChangeText(note.id, e.target.value);
                    }}
                  />
                  {!readOnly && (
                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <button
                          className="rounded border border-slate-200 px-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                          title="글씨 작게"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeFontSize(note.id, Math.max(MIN_FONT_SIZE, fontSize - 1));
                          }}
                        >
                          ▼
                        </button>
                        <button
                          className="rounded border border-slate-200 px-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                          title="글씨 크게"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeFontSize(note.id, Math.min(MAX_FONT_SIZE, fontSize + 1));
                          }}
                        >
                          ▲
                        </button>
                      </div>
                      <button
                        className="text-slate-400 hover:text-red-500"
                        title="삭제"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(note.id);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {items.length === 0 && (
              <p className="px-1 py-2 text-center text-[11px] text-slate-400">이 쪽에 메모가 없어요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
