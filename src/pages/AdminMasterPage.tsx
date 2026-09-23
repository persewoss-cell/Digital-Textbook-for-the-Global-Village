import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import {
  createTextbookDoc,
  deleteTextbookDoc,
  updateTextbookChapters,
  watchAllTextbooks,
} from "@/lib/firestore";
import { extractRealChapters, getPdfPageCountFromBuffer, loadPdf, suggestChapters } from "@/lib/pdf";
import { approveRoom, watchRooms } from "@/lib/rooms";
import { isAdminUnlocked, markAdminUnlocked, clearAdminUnlock } from "@/lib/session";
import {
  dateStrDaysAgo,
  getRecentVisitSummaries,
  getVisitSummaryForDate,
  todayDateStr,
  type DailyVisitSummary,
  type VisitSummary,
} from "@/lib/visits";
import { GRADES, type ChapterMeta, type Grade, type RoomDoc, type TextbookDoc } from "@/types";

const VISIT_DATE_OPTIONS_DAYS = 30;
const VISIT_WEEKLY_DAYS = 7;

/** "YYYY-MM-DD"를 "9월 23일 (화)" 형태로. 날짜 문자열에 이미 한국 시간 기준
 * 달력 날짜가 담겨 있으므로, 요일 계산도 Asia/Seoul로 고정해 브라우저의
 * 시간대와 무관하게 항상 같은 요일이 나오게 한다. */
function formatVisitDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(d);
}

const MASTER_PASSWORD = import.meta.env.VITE_ADMIN_MASTER_PASSWORD || "7279";

function ChapterEditor({ textbook }: { textbook: TextbookDoc }) {
  const [chapters, setChapters] = useState<ChapterMeta[]>(textbook.chapters);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => setChapters(textbook.chapters), [textbook.chapters]);

  const save = async () => {
    setSaving(true);
    try {
      await updateTextbookChapters(textbook.id, [...chapters].sort((a, b) => a.startPage - b.startPage));
    } finally {
      setSaving(false);
    }
  };

  const autoSuggest = async () => {
    setSuggesting(true);
    try {
      const pdf = await loadPdf(textbook.filePath);
      const real = await extractRealChapters(pdf);
      const suggestions = real.length > 0 ? real : await suggestChapters(pdf);
      const existingPages = new Set(chapters.map((c) => c.startPage));
      const merged = [...chapters, ...suggestions.filter((s) => !existingPages.has(s.startPage))];
      setChapters(merged.sort((a, b) => a.startPage - b.startPage));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">
        자동 추출은 완벽하지 않을 수 있어요. 후보를 넣어드리면 확인하고 제목을 다듬은 뒤 저장해
        주세요.
      </p>
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
        <button className="btn-secondary text-xs" disabled={suggesting} onClick={autoSuggest}>
          {suggesting ? "분석 중..." : "🪄 자동으로 후보 찾기"}
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
  const [fileName, setFileName] = useState("");
  const [pageCount, setPageCount] = useState<number | "">("");
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => watchAllTextbooks(setTextbooks), []);

  const handlePickFile = async (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    setDetecting(true);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const count = await getPdfPageCountFromBuffer(arrayBuffer);
      setPageCount(count);
    } catch {
      setPageCount("");
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !fileName.trim()) {
      setFormError("제목과 파일 이름을 모두 입력해 주세요.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await createTextbookDoc({
        id,
        grade,
        subject: subject.trim() || "지구마을",
        title: title.trim(),
        filePath: `/textbooks/${grade}/${fileName.trim()}`,
        pageCount: pageCount === "" ? 0 : pageCount,
      });
      setTitle("");
      setSubject("");
      setFileName("");
      setPageCount("");
    } catch {
      setFormError("저장 중 문제가 발생했어요.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 교재 정보를 삭제할까요? (실제 PDF 파일은 남아있어요)")) return;
    await deleteTextbookDoc(id);
  };

  return (
    <div>
      <div className="card mb-6 p-4">
        <h3 className="mb-1 font-semibold">새 교재 등록</h3>
        <p className="mb-3 text-xs text-slate-500">
          무료 요금제는 파일 저장 서비스(Storage)를 쓸 수 없어서, PDF 파일 자체는 이 화면에서 바로
          업로드할 수 없어요. 대신 <b>PDF 파일을 채팅으로 Claude에게 보내주시면</b> 프로젝트에 추가해
          드려요. 아래에서 PDF를 선택하면 쪽수를 자동으로 읽어오고, 파일 이름을 알려드릴게요 — 그
          파일을 저한테 보내실 때 같은 이름으로 보내주시면 돼요.
        </p>
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
            <label className="label">PDF 파일 선택 (쪽수 자동 확인용)</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="label">파일 이름</label>
            <input
              className="input w-64"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="예: earth-village-3-1.pdf"
            />
          </div>
          <div>
            <label className="label">쪽수</label>
            <input
              className="input w-24"
              value={detecting ? "확인 중..." : pageCount}
              onChange={(e) => setPageCount(e.target.value === "" ? "" : Number(e.target.value))}
              disabled={detecting}
            />
          </div>
          <button className="btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "저장 중..." : "등록하기"}
          </button>
        </div>
        {fileName && (
          <p className="mt-2 text-xs text-brand-700">
            📎 이 이름으로 PDF 파일을 채팅에 보내주세요: <b>{fileName}</b> ({grade}학년용)
          </p>
        )}
        {formError && <p className="mt-2 text-sm text-red-500">{formError}</p>}
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
            아직 업로드된 교재가 없어요.
          </p>
        )}
      </div>
    </div>
  );
}

function VisitStatusModal({ onClose }: { onClose: () => void }) {
  const today = todayDateStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [summary, setSummary] = useState<VisitSummary | null>(null);
  const [dayError, setDayError] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);

  const [weekly, setWeekly] = useState<DailyVisitSummary[] | null>(null);
  const [weekError, setWeekError] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);

  const dateOptions = useMemo(
    () => Array.from({ length: VISIT_DATE_OPTIONS_DAYS }, (_, i) => dateStrDaysAgo(i)),
    [],
  );

  const loadDay = (date: string) => {
    setLoadingDay(true);
    setDayError(false);
    getVisitSummaryForDate(date)
      .then(setSummary)
      .catch(() => setDayError(true))
      .finally(() => setLoadingDay(false));
  };

  const loadWeek = () => {
    setLoadingWeek(true);
    setWeekError(false);
    getRecentVisitSummaries(VISIT_WEEKLY_DAYS)
      .then(setWeekly)
      .catch(() => setWeekError(true))
      .finally(() => setLoadingWeek(false));
  };

  useEffect(() => {
    loadDay(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);
  useEffect(loadWeek, []);

  return (
    <Modal title="📊 접속 현황" onClose={onClose} widthClassName="max-w-xl">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">날짜 선택</label>
          <button className="btn-ghost px-2 text-xs" disabled={loadingDay} onClick={() => loadDay(selectedDate)}>
            {loadingDay ? "새로고침 중..." : "🔄 새로고침"}
          </button>
        </div>
        <select className="input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
          {dateOptions.map((date) => (
            <option key={date} value={date}>
              {formatVisitDateLabel(date)}
              {date === today ? " (오늘)" : ""}
            </option>
          ))}
        </select>

        <div className="mt-3 rounded-lg bg-slate-50 p-4">
          {summary ? (
            <p className="text-2xl font-extrabold text-slate-800">
              {summary.total}명{" "}
              <span className="text-sm font-medium text-slate-400">
                (교실 {summary.room}명 · 체험 {summary.preview}명)
              </span>
            </p>
          ) : dayError ? (
            <p className="text-sm text-red-500">불러오지 못했어요.</p>
          ) : (
            <p className="text-sm text-slate-400">불러오는 중...</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">최근 {VISIT_WEEKLY_DAYS}일</label>
          <button className="btn-ghost px-2 text-xs" disabled={loadingWeek} onClick={loadWeek}>
            {loadingWeek ? "새로고침 중..." : "🔄 새로고침"}
          </button>
        </div>
        {weekError ? (
          <p className="text-sm text-red-500">불러오지 못했어요.</p>
        ) : weekly ? (
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">날짜</th>
                <th className="px-3 py-2 text-right">교실</th>
                <th className="px-3 py-2 text-right">체험</th>
                <th className="px-3 py-2 text-right">합계</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((d) => (
                <tr key={d.date} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">
                    {formatVisitDateLabel(d.date)}
                    {d.date === today ? " (오늘)" : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{d.room}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{d.preview}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        )}
      </div>
    </Modal>
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
            <th className="px-3 py-2">승인</th>
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
              <td className="px-3 py-2">
                {r.approved ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                    승인됨
                  </span>
                ) : (
                  <button
                    className="btn-primary px-2 py-1 text-xs"
                    onClick={() => approveRoom(r.id)}
                  >
                    승인하기
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <Link className="btn-secondary text-xs" to={`/room/${r.id}/manage`}>
                  관리 화면 열기
                </Link>
              </td>
            </tr>
          ))}
          {rooms.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
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
  const [showVisitStatus, setShowVisitStatus] = useState(false);

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
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <h1 className="mb-1 text-xl font-bold">관리자 페이지</h1>
            <p className="text-sm text-slate-500">모든 반 방과 교재를 관리할 수 있어요.</p>
          </div>
          <button className="btn-secondary shrink-0 text-sm" onClick={() => setShowVisitStatus(true)}>
            📊 접속 현황
          </button>
        </div>

        {showVisitStatus && <VisitStatusModal onClose={() => setShowVisitStatus(false)} />}

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          {(["rooms", "textbooks"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
                tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "rooms" ? "모든 방" : "교재 관리"}
            </button>
          ))}
        </div>

        {tab === "rooms" ? <RoomsSection /> : <TextbooksSection />}
      </div>
    </AppShell>
  );
}
