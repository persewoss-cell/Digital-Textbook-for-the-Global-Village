import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "@/firebase";
import { AppShell } from "@/components/AppShell";
import {
  createTextbookDoc,
  deleteTextbookDoc,
  updateTextbookChapters,
  watchAllTextbooks,
} from "@/lib/firestore";
import { getPdfPageCountFromBuffer } from "@/lib/pdf";
import { watchRooms } from "@/lib/rooms";
import { isAdminUnlocked, markAdminUnlocked, clearAdminUnlock } from "@/lib/session";
import { GRADES, type ChapterMeta, type Grade, type RoomDoc, type TextbookDoc } from "@/types";

const MASTER_PASSWORD = import.meta.env.VITE_ADMIN_MASTER_PASSWORD || "7279";

function ChapterEditor({ textbook }: { textbook: TextbookDoc }) {
  const [chapters, setChapters] = useState<ChapterMeta[]>(textbook.chapters);
  const [saving, setSaving] = useState(false);

  useEffect(() => setChapters(textbook.chapters), [textbook.chapters]);

  const save = async () => {
    setSaving(true);
    try {
      await updateTextbookChapters(textbook.id, [...chapters].sort((a, b) => a.startPage - b.startPage));
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

function TextbooksSection() {
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
    if (!file || !title.trim()) {
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
    if (!confirm("이 교과서를 삭제할까요?")) return;
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
            <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
                <button className="btn-secondary text-xs" onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}>
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

function RoomsSection() {
  const [rooms, setRooms] = useState<RoomDoc[]>([]);
  useEffect(() => watchRooms(setRooms), []);

  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-400">
          <tr>
            <th className="px-3 py-2">학급</th>
            <th className="px-3 py-2">선생님</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="px-3 py-2 text-sm font-medium">
                {r.grade}학년 {r.classNum}반
              </td>
              <td className="px-3 py-2 text-sm text-slate-500">{r.teacherName}</td>
              <td className="px-3 py-2 text-right">
                <Link className="btn-secondary text-xs" to={`/room/${r.id}/manage`}>
                  관리 화면 열기
                </Link>
              </td>
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                만들어진 방이 없어요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminMasterPage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(isAdminUnlocked());
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"rooms" | "textbooks">("rooms");

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (password !== MASTER_PASSWORD) {
      setError("마스터 비밀번호가 올바르지 않아요.");
      return;
    }
    markAdminUnlocked();
    setUnlocked(true);
  };

  const handleExit = () => {
    clearAdminUnlock();
    navigate("/", { replace: true });
  };

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center text-white">
            <div className="mb-2 text-4xl">🛡️</div>
            <h1 className="text-xl font-bold">관리자</h1>
          </div>
          <div className="card p-6">
            <form className="space-y-4" onSubmit={handleUnlock}>
              <div>
                <label className="label">마스터 비밀번호</label>
                <input
                  className="input tracking-widest"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                />
              </div>
              {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
              <button type="submit" className="btn-primary w-full">
                입장
              </button>
            </form>
            <div className="mt-4 text-center">
              <Link to="/" className="text-sm text-slate-500 hover:underline">
                ← 방 목록으로
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell right={<button className="btn-ghost" onClick={handleExit}>관리자 나가기</button>}>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-xl font-bold">관리자 페이지</h1>
        <p className="mb-6 text-sm text-slate-500">모든 반 방과 교과서를 관리할 수 있어요.</p>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          {(["rooms", "textbooks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "rooms" ? "모든 방" : "교과서 관리"}
            </button>
          ))}
        </div>

        {tab === "rooms" ? <RoomsSection /> : <TextbooksSection />}
      </div>
    </AppShell>
  );
}
