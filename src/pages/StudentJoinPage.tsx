import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getRoom, joinRoom } from "@/lib/rooms";
import { saveParticipantSession } from "@/lib/session";
import type { RoomDoc } from "@/types";

export default function StudentJoinPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);

  const [studentNum, setStudentNum] = useState(1);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId).then(setRoom);
  }, [roomId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!roomId || !room) return;

    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    if (password !== room.password) {
      setError("방 비밀번호가 올바르지 않아요.");
      return;
    }

    setLoading(true);
    try {
      await joinRoom(roomId, studentNum, name);
      saveParticipantSession({ roomId, studentNum, name: name.trim() });
      navigate(`/room/${roomId}/textbook`, { replace: true });
    } catch {
      setError("입장 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (room === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        불러오는 중...
      </div>
    );
  }
  if (room === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
        <p>존재하지 않는 방이에요.</p>
        <Link to="/" className="btn-secondary">
          방 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-2 text-4xl">🙋</div>
          <h1 className="text-xl font-extrabold text-brand-800">
            {room.grade}학년 {room.classNum}반 참여하기
          </h1>
        </div>

        <div className="card p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label">번호</label>
              <input
                type="number"
                min={1}
                max={50}
                className="input"
                value={studentNum}
                onChange={(e) => setStudentNum(Number(e.target.value))}
                required
              />
            </div>
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
              <label className="label">방 비밀번호</label>
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

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "입장 중..." : "입장하기"}
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
