import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { watchProgress, watchTextbooksByGrade, watchUsersByClass } from "@/lib/firestore";
import type { Grade, StudentProgressDoc, TextbookDoc, UserDoc } from "@/types";

function StudentRow({
  student,
  textbook,
  onMonitor,
}: {
  student: UserDoc;
  textbook: TextbookDoc | null;
  onMonitor: () => void;
}) {
  const [progress, setProgress] = useState<StudentProgressDoc | null>(null);

  useEffect(() => {
    if (!textbook) return;
    return watchProgress(student.uid, textbook.id, setProgress);
  }, [student.uid, textbook]);

  const percent =
    progress && progress.totalPages
      ? Math.round((Object.keys(progress.viewedPages).length / progress.totalPages) * 100)
      : 0;

  return (
    <tr className="border-b border-slate-100">
      <td className="px-3 py-2 text-sm">{student.studentNum}번</td>
      <td className="px-3 py-2 text-sm font-medium">{student.name}</td>
      <td className="px-3 py-2 text-sm text-slate-500">
        {textbook ? (
          progress ? (
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-brand-500" style={{ width: `${percent}%` }} />
              </div>
              <span>{percent}%</span>
            </div>
          ) : (
            "학습 기록 없음"
          )
        ) : (
          "-"
        )}
      </td>
      <td className="px-3 py-2 text-sm text-slate-400">
        {progress ? `${progress.lastPage}쪽` : "-"}
      </td>
      <td className="px-3 py-2 text-right">
        <button className="btn-secondary text-xs" onClick={onMonitor} disabled={!textbook}>
          학습 현황 보기
        </button>
      </td>
    </tr>
  );
}

export default function RosterTab({ classId, grade }: { classId: string; grade: Grade }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [textbooks, setTextbooks] = useState<TextbookDoc[]>([]);
  const [textbookId, setTextbookId] = useState<string>("");

  useEffect(() => watchUsersByClass(classId, setStudents), [classId]);
  useEffect(() => watchTextbooksByGrade(grade, setTextbooks), [grade]);
  useEffect(() => {
    if (!textbookId && textbooks.length > 0) setTextbookId(textbooks[0].id);
  }, [textbooks, textbookId]);

  const active = students
    .filter((s) => s.status === "active")
    .sort((a, b) => (a.studentNum ?? 0) - (b.studentNum ?? 0));
  const textbook = textbooks.find((t) => t.id === textbookId) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm text-slate-500">모니터링할 교과서</label>
        <select
          className="input w-auto"
          value={textbookId}
          onChange={(e) => setTextbookId(e.target.value)}
        >
          {textbooks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">번호</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">진도율</th>
              <th className="px-3 py-2">마지막 페이지</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {active.map((s) => (
              <StudentRow
                key={s.uid}
                student={s}
                textbook={textbook}
                onMonitor={() =>
                  navigate(`/textbook/${textbookId}?asUid=${s.uid}`, {
                    state: { studentName: s.name },
                  })
                }
              />
            ))}
            {active.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                  등록된 학생이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
