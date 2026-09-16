import { useEffect, useState } from "react";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase";
import { getPdfPageCountFromBuffer } from "@/lib/pdf";
import { useAuth } from "@/context/AuthContext";
import {
  createTextbookDoc,
  deleteTextbookDoc,
  updateTextbookChapters,
  watchAllTextbooks,
} from "@/lib/firestore";
import { GRADES, type ChapterMeta, type Grade, type TextbookDoc } from "@/types";

function ChapterEditor({ textbook }: { textbook: TextbookDoc }) {
  const [chapters, setChapters] = useState<ChapterMeta[]>(textbook.chapters);
  const [saving, setSaving] = useState(false);

  useEffect(() => setChapters(textbook.chapters), [textbook.chapters]);

  const save = async () => {
    setSaving(true);
    try {
      await updateTextbookChapters(
        textbook.id,
        [...chapters].sort((a, b) => a.startPage - b.startPage),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <div className="space-y-2">
        {chapters.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="목차 제목 (예: 1단원. 세계의 여러 나라)"
              value={c.title}
              onChange={(e) => {
                const next = [...chapters];
                next[i] = { ...next[i], title: e.target.value };
                setChapters(next);
              }}
            />
            <input
              type="number"
              className="input w-24"
              placeholder="시작쪽"
              value={c.startPage}
              min={1}
              max={textbook.pageCount ?? undefined}
              onChange={(e) => {
                const next = [...chapters];
                next[i] = { ...next[i], startPage: Number(e.target.value) };
                setChapters(next);
              }}
            />
            <button
              className="btn-ghost px-2 text-red-500"
              onClick={() => setChapters(chapters.filter((_, idx) => idx !== i))}
            >
              삭제
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          className="btn-secondary text-xs"
          onClick={() => setChapters([...chapters, { title: "", startPage: 1 }])}
        >
          + 목차 추가
        </button>
        <button className="btn-primary text-xs" disabled={saving} onClick={save}>
          {saving ? "저장 중..." : "목차 저장"}
        </button>
      </div>
    </div>
  );
}

export default function TextbooksTab() {
  const { userDoc } = useAuth();
  const [textbooks, setTextbooks] = useState<TextbookDoc[]>([]);
  const [grade, setGrade] = useState<Grade>(3);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => watchAllTextbooks(setTextbooks), []);

  const handleUpload = async () => {
    if (!file || !title.trim() || !userDoc) {
      setUploadError("제목과 PDF 파일을 모두 입력해 주세요.");
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pageCount = await getPdfPageCountFromBuffer(arrayBuffer);

      const id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storagePath = `textbooks/${grade}/${id}.pdf`;
      await uploadBytes(ref(storage, storagePath), file, { contentType: "application/pdf" });

      await createTextbookDoc({
        id,
        grade,
        subject: subject.trim() || "지구마을",
        title: title.trim(),
        storagePath,
        pageCount,
        uploadedBy: userDoc.uid,
      });

      setTitle("");
      setSubject("");
      setFile(null);
    } catch {
      setUploadError("업로드 중 문제가 발생했어요. PDF 파일이 맞는지 확인해 주세요.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 교과서를 삭제할까요? 학생들의 학습 기록은 남아있지만 교재는 더 이상 열 수 없어요.")) return;
    await deleteTextbookDoc(id);
  };

  return (
    <div>
      <div className="card mb-6 p-4">
        <h3 className="mb-3 font-semibold">새 교과서 업로드</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">학년</label>
            <select className="input w-28" value={grade} onChange={(e) => setGrade(Number(e.target.value) as Grade)}>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">과목/시리즈</label>
            <input className="input w-40" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="지구마을" />
          </div>
          <div className="flex-1">
            <label className="label">교재 제목</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 지구마을 3학년 1학기" />
          </div>
          <div>
            <label className="label">PDF 파일</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button className="btn-primary" disabled={uploading} onClick={handleUpload}>
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </div>
        {uploadError && <p className="mt-2 text-sm text-red-500">{uploadError}</p>}
      </div>

      <div className="space-y-3">
        {textbooks.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.grade}학년 · {t.subject} · {t.pageCount ?? "?"}쪽 · 목차 {t.chapters.length}개
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary text-xs"
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  {expandedId === t.id ? "목차 닫기" : "목차 관리"}
                </button>
                <button className="btn-secondary text-xs text-red-500" onClick={() => remove(t.id)}>
                  삭제
                </button>
              </div>
            </div>
            {expandedId === t.id && <ChapterEditor textbook={t} />}
          </div>
        ))}
        {textbooks.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            아직 업로드된 교과서가 없어요.
          </p>
        )}
      </div>
    </div>
  );
}
