import { fitFontSize } from "@/lib/textFit";
import type { PlacedNote } from "@/types";

const NOTE_BOX_WIDTH_RATIO = 0.32;

export function NotesOverlay({
  items,
  activeId,
  active,
  readOnly,
  boxWidth,
  onCreate,
  onSelect,
}: {
  items: PlacedNote[];
  activeId: string | null;
  active: boolean;
  readOnly: boolean;
  boxWidth: number;
  onCreate: (x: number, y: number) => void;
  onSelect: (id: string) => void;
}) {
  const clickable = active && !readOnly;
  const noteBoxWidth = boxWidth * NOTE_BOX_WIDTH_RATIO;

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
      {items.map((note) => {
        const fontSize = fitFontSize(note.text || "메모", noteBoxWidth);
        return (
          <div
            key={note.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(note.id);
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap break-words rounded px-1 text-center leading-tight ${
              note.id === activeId
                ? "border border-dashed border-brand-500 bg-brand-50/70"
                : note.text
                  ? "bg-white/70"
                  : "border border-dashed border-slate-300 bg-white/40 text-slate-300"
            }`}
            style={{
              left: `${note.x * 100}%`,
              top: `${note.y * 100}%`,
              width: noteBoxWidth,
              fontSize,
              pointerEvents: readOnly ? "none" : "auto",
              color: note.text ? "#0f172a" : undefined,
            }}
          >
            {note.text || (note.id === activeId ? "" : "✎")}
          </div>
        );
      })}
    </div>
  );
}
