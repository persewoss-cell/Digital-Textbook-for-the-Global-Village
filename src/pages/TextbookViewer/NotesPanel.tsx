import { useEffect, useRef, useState } from "react";
import { saveNote, watchNote } from "@/lib/firestore";

export function NotesPanel({
  uid,
  textbookId,
  page,
  readOnly,
  studentLabel,
}: {
  uid: string;
  textbookId: string;
  page: number;
  readOnly: boolean;
  studentLabel?: string;
}) {
  const [text, setText] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = watchNote(uid, textbookId, page, (note) => {
      setText(note?.text ?? "");
      setSavedAt(note?.updatedAt ?? null);
    });
    return unsub;
  }, [uid, textbookId, page]);

  const handleChange = (value: string) => {
    setText(value);
    if (readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveNote(uid, textbookId, page, value);
      setSavedAt(Date.now());
    }, 700);
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h2 className="font-bold text-slate-800">
          {studentLabel ? `${studentLabel}의 노트` : "내 노트"}
        </h2>
        <p className="text-xs text-slate-400">{page}쪽에 대한 메모예요.</p>
      </div>
      <textarea
        className="flex-1 resize-none border-0 p-4 text-sm outline-none disabled:bg-slate-50"
        placeholder="이 쪽에 대한 생각, 답, 궁금한 점을 적어보세요."
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={readOnly}
      />
      <div className="border-t border-slate-100 p-2 text-right text-[11px] text-slate-400">
        {readOnly ? "읽기 전용" : savedAt ? "자동 저장됨" : ""}
      </div>
    </div>
  );
}
