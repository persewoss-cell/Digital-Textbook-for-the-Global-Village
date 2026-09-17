import { useEffect, useRef } from "react";
import { DEFAULT_NOTE_FONT_SIZE } from "./NotesOverlay";
import type { PlacedNote } from "@/types";

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 28;

/** 스크롤 대신 글자 수만큼 textarea 자체의 높이(세로 사각박스 크기)가 늘어나게 한다. */
function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

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
  onClose,
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
  onClose?: () => void;
}) {
  const refs = useRef<Map<string, HTMLTextAreaElement>>(new Map());

  useEffect(() => {
    if (activeId) refs.current.get(activeId)?.focus();
  }, [activeId]);

  // 내가 직접 입력할 때뿐 아니라, 다른 사람(예: 실시간으로 지켜보는 선생님 화면)이 보는
  // 텍스트 값이 바뀔 때도 사각박스 높이가 항상 내용에 맞게 늘어나 있도록 한다.
  useEffect(() => {
    refs.current.forEach((el) => autoResize(el));
  }, [items]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold text-slate-800">{studentLabel ? `${studentLabel}의 노트` : "내 노트"}</h2>
          {onClose && (
            <button
              className="shrink-0 rounded-lg px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="노트 닫기"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
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
                  if (el) {
                    refs.current.set(note.id, el);
                    autoResize(el);
                  } else refs.current.delete(note.id);
                }}
                className="w-full resize-none overflow-hidden border-0 bg-transparent text-sm outline-none disabled:text-slate-500"
                rows={1}
                placeholder="메모를 입력하세요 (Enter로 줄바꿈)"
                value={note.text}
                disabled={readOnly}
                onChange={(e) => {
                  autoResize(e.target);
                  onChangeText(note.id, e.target.value);
                }}
              />
              {!readOnly && (
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">글씨 크기 조정</span>
                    <button
                      className="rounded border border-slate-200 px-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeFontSize(note.id, Math.max(MIN_FONT_SIZE, fontSize - 1));
                      }}
                    >
                      ▼
                    </button>
                    <span className="w-7 text-center text-[11px] text-slate-400">{fontSize}</span>
                    <button
                      className="rounded border border-slate-200 px-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeFontSize(note.id, Math.min(MAX_FONT_SIZE, fontSize + 1));
                      }}
                    >
                      ▲
                    </button>
                  </div>
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
