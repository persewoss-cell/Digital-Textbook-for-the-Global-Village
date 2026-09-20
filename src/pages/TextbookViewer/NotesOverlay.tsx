import { useRef } from "react";
import { STROKE_WIDTH_REFERENCE } from "./AnnotationLayer";
import type { PlacedNote } from "@/types";

export const DEFAULT_NOTE_FONT_SIZE = 12;

export function NotesOverlay({
  items,
  activeId,
  active,
  readOnly,
  pageWidth,
  activeDragNoteId,
  onCreate,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  items: PlacedNote[];
  activeId: string | null;
  active: boolean;
  readOnly: boolean;
  /** 이 쪽이 화면에 지금 표시되는 실제 너비(px). note.fontSize는 STROKE_WIDTH_REFERENCE
   * 기준으로 고른 값이라, 확대/축소로 쪽 크기가 달라질 때 그 비율만큼 환산해야
   * 메모 글씨가 쪽 크기에 비례해서 커지고 작아진다. */
  pageWidth: number;
  /** 지금 두 쪽에 걸쳐 드래그 중인 메모의 id. 이 쪽의 메모라도 이 값과 같으면
   * 이 자리에는 그리지 않는다 - 대신 부모가 두 쪽을 가로지르는 별도 레이어에
   * 그 메모를 그려서, 중앙을 넘어가도 잘리지 않고 계속 보이게 한다. */
  activeDragNoteId?: string | null;
  onCreate: (x: number, y: number) => void;
  onSelect: (id: string) => void;
  /** 메모를 눌러서 실제로 끌기 시작한 순간(살짝 움직여 "그냥 누른 것"과
   * 구별된 순간) 한 번 불린다. 화면 좌표(clientX/Y)를 그대로 넘겨서, 부모가 두
   * 쪽을 가로지르는 좌표계로 옮겨 그릴 수 있게 한다. */
  onDragStart: (note: PlacedNote, clientX: number, clientY: number) => void;
  /** 끄는 동안 매 pointermove마다 불린다. */
  onDragMove: (clientX: number, clientY: number) => void;
  /** 손을 뗀 순간 불린다 - 부모가 마지막 화면 좌표로 최종적으로 어느 쪽의 어디에
   * 놓일지 계산해서 커밋한다. */
  onDragEnd: (clientX: number, clientY: number) => void;
}) {
  const widthScale = pageWidth / STROKE_WIDTH_REFERENCE;
  const clickable = active && !readOnly;
  const drag = useRef<{ id: string; moved: boolean } | null>(null);

  const handleNotePointerDown = (e: React.PointerEvent<HTMLDivElement>, note: PlacedNote) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: note.id, moved: false };
  };

  const handleNotePointerMove = (e: React.PointerEvent<HTMLDivElement>, note: PlacedNote) => {
    if (!drag.current || drag.current.id !== note.id) return;
    if (!drag.current.moved) {
      onDragStart(note, e.clientX, e.clientY);
      drag.current.moved = true;
      return;
    }
    onDragMove(e.clientX, e.clientY);
  };

  const handleNotePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.moved) {
      onDragEnd(e.clientX, e.clientY);
    } else if (drag.current) {
      onSelect(drag.current.id);
    }
    drag.current = null;
  };

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: clickable ? "auto" : "none", cursor: clickable ? "text" : "default" }}
      onClick={(e) => {
        if (!clickable) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        onCreate(x, y);
      }}
    >
      {items.map((note) => (
        <div
          key={note.id}
          data-note-drag={readOnly ? undefined : "true"}
          onPointerDown={(e) => handleNotePointerDown(e, note)}
          onPointerMove={(e) => handleNotePointerMove(e, note)}
          onPointerUp={handleNotePointerUp}
          className={`absolute max-w-[60%] -translate-y-1/2 whitespace-pre rounded px-1 leading-tight ${
            readOnly ? "" : "cursor-move"
          } ${
            note.id === activeId
              ? "border border-dashed border-brand-500 bg-brand-50/70"
              : note.text
                ? "bg-white/70"
                : "border border-dashed border-slate-300 bg-white/40 text-slate-300"
          }`}
          style={{
            left: `${note.x * 100}%`,
            top: `${note.y * 100}%`,
            fontSize: (note.fontSize ?? DEFAULT_NOTE_FONT_SIZE) * widthScale,
            pointerEvents: readOnly ? "none" : "auto",
            color: note.text ? "#0f172a" : undefined,
            touchAction: "none",
            // 이 메모가 지금 두 쪽에 걸쳐 드래그되는 중이면(activeDragNoteId), 이
            // 자리에는 안 보이게만 하고 완전히 지우지는 않는다 - 이 div가 pointer
            // capture를 잡고 있어서, DOM에서 없애 버리면(예: 필터링) 드래그 도중
            // 이후 pointermove/up을 못 받아 드래그가 끊긴다. 대신 화면에는 부모가
            // 그리는, 쪽 경계에 잘리지 않는 별도 레이어의 "유령" 메모가 보인다.
            opacity: note.id === activeDragNoteId ? 0 : 1,
          }}
        >
          {note.text || (note.id === activeId ? "" : "✎")}
        </div>
      ))}
    </div>
  );
}
