import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import { watchTextbooksByGrade } from "@/lib/firestore";
import { GRADES, type Grade, type TextbookDoc } from "@/types";

export default function TextbookHome() {
  const { userDoc } = useAuth();
  const navigate = useNavigate();
  const [grade, setGrade] = useState<Grade>((userDoc?.grade as Grade) || 3);
  const [books, setBooks] = useState<TextbookDoc[]>([]);

  const isTeacher = userDoc?.role === "teacher";

  useEffect(() => {
    if (userDoc?.grade && !isTeacher) setGrade(userDoc.grade as Grade);
  }, [userDoc, isTeacher]);

  useEffect(() => {
    return watchTextbooksByGrade(grade, setBooks);
  }, [grade]);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-xl font-bold">교과서 목록</h1>
        <p className="mb-6 text-sm text-slate-500">
          {isTeacher ? "학년을 선택해 교과서를 살펴보세요." : `${grade}학년 지구마을 디지털 교과서예요.`}
        </p>

        {isTeacher && (
          <div className="mb-5 flex gap-2">
            {GRADES.map((g) => (
              <button
                key={g}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                  grade === g ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
                onClick={() => setGrade(g)}
              >
                {g}학년
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {books.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/textbook/${b.id}`)}
              className="card flex items-center gap-4 p-5 text-left transition hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-brand-100 text-2xl">
                📘
              </div>
              <div>
                <p className="font-bold text-slate-800">{b.title}</p>
                <p className="text-xs text-slate-400">
                  {b.subject} · {b.pageCount ?? "?"}쪽
                </p>
              </div>
            </button>
          ))}
          {books.length === 0 && (
            <p className="col-span-2 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              아직 등록된 교과서가 없어요. 관리자가 교과서를 업로드하면 여기에 표시돼요.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
