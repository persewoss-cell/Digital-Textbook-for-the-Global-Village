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
  onCreate,
  onSelect,
  onMove,
}: {
  items: PlacedNote[];
  activeId: string | null;
  active: boolean;
  readOnly: boolean;
  /** 이 쪽이 화면에 지금 표시되는 실제 너비(px). note.fontSize는 STROKE_WIDTH_REFERENCE
   * 기준으로 고른 값이라, 확대/축소로 쪽 크기가 달라질 때 그 비율만큼 환산해야
   * 메모 글씨가 쪽 크기에 비례해서 커지고 작아진다. */
  pageWidth: number;
  onCreate: (x: number, y: number) => void;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const widthScale = pageWidth / STROKE_WIDTH_REFERENCE;
  const clickable = active && !readOnly;
  const drag = useRef<{ id: string; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(
    null,
  );

  const handleNotePointerDown = (e: React.PointerEvent<HTMLDivElement>, note: PlacedNote) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: note.id, startX: e.clientX, startY: e.clientY, x: note.x, y: note.y, moved: false };
  };

  const handleNotePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    if (!drag.current.moved) return;
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    const x = Math.min(0.98, Math.max(0.02, drag.current.x + dx / rect.width));
    const y = Math.min(0.98, Math.max(0.02, drag.current.y + dy / rect.height));
    onMove(drag.current.id, x, y);
  };

  const handleNotePointerUp = () => {
    if (drag.current && !drag.current.moved) {
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
          onPointerMove={handleNotePointerMove}
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
          }}
        >
          {note.text || (note.id === activeId ? "" : "✎")}
        </div>
      ))}
    </div>
  );
}
