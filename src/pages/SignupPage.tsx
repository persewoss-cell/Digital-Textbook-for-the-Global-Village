import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GRADES, type Grade, type Role } from "@/types";
import { PASSWORD_PATTERN } from "@/lib/auth";
import { callSignup } from "@/lib/functionsApi";

export default function SignupPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Exclude<Role, "admin">>("student");
  const [grade, setGrade] = useState<Grade>(3);
  const [classNum, setClassNum] = useState(1);
  const [studentNum, setStudentNum] = useState(1);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    if (!PASSWORD_PATTERN.test(password)) {
      setError("비밀번호는 알파벳(A-Z, a-z) 4자리여야 해요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요.");
      return;
    }

    setLoading(true);
    try {
      await callSignup({
        role,
        name: name.trim(),
        grade,
        classNum,
        studentNum: role === "student" ? studentNum : undefined,
        password,
      });
      setDone(true);
    } catch (err: unknown) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : "가입 중 문제가 발생했어요.";
      setError(
        message.includes("already-exists")
          ? "이미 등록된 정보예요. 같은 학년/반/번호(또는 이름)로 가입된 계정이 있는지 확인해 주세요."
          : "가입 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mb-3 text-4xl">✅</div>
          <h2 className="mb-2 text-lg font-bold">가입 신청이 완료되었어요</h2>
          <p className="mb-6 text-sm text-slate-500">
            {role === "student"
              ? "담임 선생님이 승인하면 로그인할 수 있어요."
              : "관리자가 승인하면 로그인할 수 있어요."}
          </p>
          <button className="btn-primary w-full" onClick={() => navigate("/")}>
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🌍</div>
          <h1 className="text-xl font-extrabold text-brand-800">회원가입</h1>
        </div>

        <div className="card p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === "student" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
              }`}
              onClick={() => setRole("student")}
            >
              학생으로 가입
            </button>
            <button
              type="button"
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                role === "teacher" ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
              }`}
              onClick={() => setRole("teacher")}
            >
              선생님으로 가입
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
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
              <label className="label">비밀번호 (알파벳 4자리)</label>
              <input
                className="input tracking-widest"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 4))}
                placeholder="abcd"
                maxLength={4}
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className="label">비밀번호 확인</label>
              <input
                className="input tracking-widest"
                value={passwordConfirm}
                onChange={(e) =>
                  setPasswordConfirm(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 4))
                }
                placeholder="abcd"
                maxLength={4}
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "가입 처리 중..." : "가입 신청하기"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">
            {role === "student"
              ? "가입 후 담임 선생님의 승인이 필요해요."
              : "가입 후 관리자의 승인이 필요해요."}
          </p>

          <div className="mt-4 text-center">
            <Link to="/" className="text-sm font-semibold text-brand-600 hover:underline">
              이미 계정이 있어요, 로그인
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
