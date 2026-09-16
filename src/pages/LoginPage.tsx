import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GRADES, type Grade, type Role } from "@/types";
import { FriendlyAuthError, loginWithProfile } from "@/lib/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Exclude<Role, "admin">>("student");
  const [grade, setGrade] = useState<Grade>(3);
  const [classNum, setClassNum] = useState(1);
  const [studentNum, setStudentNum] = useState(1);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const userDoc = await loginWithProfile({
        role,
        grade,
        classNum,
        studentNum: role === "student" ? studentNum : undefined,
        name,
        password,
      });
      navigate(userDoc.role === "teacher" ? "/teacher" : "/textbook", {
        replace: true,
      });
    } catch (err) {
      setError(
        err instanceof FriendlyAuthError
          ? err.message
          : "로그인 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">🌍</div>
          <h1 className="text-2xl font-extrabold text-brand-800">
            지구마을 디지털 교과서
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            3~6학년 지구마을 시리즈 디지털 교재
          </p>
        </div>

        <div className="card p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === "student"
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => setRole("student")}
            >
              학생 로그인
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === "teacher"
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => setRole("teacher")}
            >
              선생님 로그인
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">학년</label>
                <select
                  className="input"
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value) as Grade)}
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}학년
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">반</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input"
                  value={classNum}
                  onChange={(e) => setClassNum(Number(e.target.value))}
                />
              </div>
            </div>

            {role === "student" && (
              <div>
                <label className="label">번호</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  className="input"
                  value={studentNum}
                  onChange={(e) => setStudentNum(Number(e.target.value))}
                />
              </div>
            )}

            <div>
              <label className="label">이름</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                required
              />
            </div>

            <div>
              <label className="label">비밀번호 (알파벳 4자리)</label>
              <input
                className="input tracking-widest"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 4))}
                placeholder="abcd"
                maxLength={4}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/signup" className="text-sm font-semibold text-brand-600 hover:underline">
              처음이신가요? 가입하기
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/admin/login" className="text-xs text-slate-400 hover:text-slate-600">
            관리자 로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
