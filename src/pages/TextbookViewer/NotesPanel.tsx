import { useEffect, useRef } from "react";
import type { PlacedNote } from "@/types";

export function NotesPanel({
  items,
  activeId,
  readOnly,
  noteToolActive,
  studentLabel,
  onSelect,
  onChangeText,
  onDelete,
}: {
  items: PlacedNote[];
  activeId: string | null;
  readOnly: boolean;
  noteToolActive: boolean;
  studentLabel?: string;
  onSelect: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
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
              ? "교재의 빈 곳을 클릭해서 메모를 추가하세요."
              : "툴바의 ✏️노트 버튼을 누르고 교재를 클릭하면 메모를 추가할 수 있어요."}
        </p>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {items.map((note) => (
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
              placeholder="메모를 입력하세요"
              value={note.text}
              disabled={readOnly}
              onChange={(e) => onChangeText(note.id, e.target.value)}
            />
            {!readOnly && (
              <button
                className="mt-1 text-[11px] text-slate-400 hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(note.id);
                }}
              >
                삭제
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-slate-400">이 쪽에 메모가 없어요.</p>
        )}
      </div>
    </div>
  );
}
