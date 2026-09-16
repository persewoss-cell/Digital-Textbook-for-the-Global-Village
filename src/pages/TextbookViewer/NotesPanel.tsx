import { useEffect, useRef } from "react";
import { DEFAULT_NOTE_FONT_SIZE } from "./NotesOverlay";
import type { PlacedNote } from "@/types";

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 28;

export function NotesPanel({
  items,
  activeId,
  readOnly,
  noteToolActive,
  studentLabel,
  onSelect,
  onChangeText,
  onChangeFontSize,
  onDelete,
}: {
  items: PlacedNote[];
  activeId: string | null;
  readOnly: boolean;
  noteToolActive: boolean;
  studentLabel?: string;
  onSelect: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
  onChangeFontSize: (id: string, fontSize: number) => void;
  onDelete: (id: string) => void;
}) {
  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  useEffect(() => {
    if (activeId) refs.current.get(activeId)?.focus();
  }, [activeId]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-bold text-slate-800">{studentLabel ? `${studentLabel}의 노트` : "내 노트"}</h2>
        <p className="text-xs text-slate-400">
          {readOnly
            ? "읽기 전용이에요."
            : noteToolActive
              ? "교재의 빈 곳을 한 번 클릭해서 메모를 추가하세요."
              : "툴바의 ✏️노트 버튼을 누르고 교재를 한 번 클릭하면 메모가 추가돼요."}
        </p>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {items.map((note) => {
          const fontSize = note.fontSize ?? DEFAULT_NOTE_FONT_SIZE;
          return (
            <div
              key={note.id}
              className={`rounded-lg border p-2 ${
                note.id === activeId ? "border-brand-400 bg-brand-50/50" : "border-slate-200"
              }`}
              onClick={() => onSelect(note.id)}
            >
              <textarea
                ref={(el) => {
                  if (el) refs.current.set(note.id, el);
                  else refs.current.delete(note.id);
                }}
                className="w-full resize-none border-0 bg-transparent text-sm outline-none disabled:text-slate-500"
                rows={2}
                placeholder="메모를 입력하세요 (Enter로 줄바꿈, ↑↓로 글씨 크기)"
                value={note.text}
                disabled={readOnly}
                onChange={(e) => onChangeText(note.id, e.target.value)}
                onKeyDown={(e) => {
                  if (readOnly) return;
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    onChangeFontSize(note.id, Math.min(MAX_FONT_SIZE, fontSize + 1));
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    onChangeFontSize(note.id, Math.max(MIN_FONT_SIZE, fontSize - 1));
                  }
                }}
              />
              {!readOnly && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">글씨 {fontSize}px</span>
                  <button
                    className="text-[11px] text-slate-400 hover:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(note.id);
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-slate-400">이 쪽에 메모가 없어요.</p>
        )}
      </div>
    </div>
  );
}
