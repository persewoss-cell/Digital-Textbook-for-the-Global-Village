import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GRADES, ROOM_PASSWORD_PATTERN, type Grade } from "@/types";
import { createRoom } from "@/lib/rooms";
import { markRoomUnlocked } from "@/lib/session";

export default function CreateRoomPage() {
  const navigate = useNavigate();
  const [grade, setGrade] = useState<Grade>(3);
  const [classNum, setClassNum] = useState(1);
  const [teacherName, setTeacherName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!teacherName.trim()) {
      setError("선생님 이름을 입력해 주세요.");
      return;
    }
    if (!ROOM_PASSWORD_PATTERN.test(password)) {
      setError("방 비밀번호는 숫자 4자리여야 해요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요.");
      return;
    }

    setLoading(true);
    try {
      const roomId = await createRoom(grade, classNum, password, teacherName);
      markRoomUnlocked(roomId);
      navigate(`/room/${roomId}/manage`, { replace: true });
    } catch {
      setError("방을 만드는 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🏫</div>
          <h1 className="text-xl font-extrabold text-brand-800">반 방 만들기</h1>
          <p className="mt-1 text-sm text-slate-500">
            학년/반을 정하고 비밀번호를 만들면, 학생들이 그 비밀번호로 들어올 수 있어요.
          </p>
        </div>

        <div className="card p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label">선생님 이름</label>
              <input
                className="input"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
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

            <div>
              <label className="label">방 비밀번호 (숫자 4자리)</label>
              <input
                className="input tracking-widest"
                value={password}
                onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                required
              />
            </div>
            <div>
              <label className="label">비밀번호 확인</label>
              <input
                className="input tracking-widest"
                value={passwordConfirm}
                onChange={(e) =>
                  setPasswordConfirm(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
                }
                placeholder="1234"
                inputMode="numeric"
                maxLength={4}
                required
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "만드는 중..." : "방 만들기"}
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
