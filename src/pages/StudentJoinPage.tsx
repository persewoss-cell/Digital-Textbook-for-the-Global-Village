import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getFirstTextbookForGrade } from "@/lib/firestore";
import { getRoom, joinRoom } from "@/lib/rooms";
import {
  clearRememberedParticipant,
  loadRememberedParticipant,
  saveParticipantSession,
  saveRememberedParticipant,
} from "@/lib/session";
import type { RoomDoc } from "@/types";

type Step = "number" | "name";

export default function StudentJoinPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);

  const [step, setStep] = useState<Step>("number");
  const [studentNum, setStudentNum] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const numberInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId).then(setRoom);
  }, [roomId]);

  // 이전에 "번호랑 이름 기억하기"를 체크했다면 이 방에서는 자동으로 채워 넣는다.
  useEffect(() => {
    if (!roomId) return;
    const remembered = loadRememberedParticipant(roomId);
    if (remembered) {
      setStudentNum(String(remembered.studentNum));
      setName(remembered.name);
      setRemember(true);
    }
  }, [roomId]);

  useEffect(() => {
    if (step === "number") numberInputRef.current?.focus();
    else nameInputRef.current?.focus();
  }, [step]);

  const handleNumberSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number(studentNum);
    if (!studentNum || !Number.isInteger(n) || n < 1) {
      setError("번호를 입력해 주세요.");
      return;
    }
    setStep("name");
  };

  const handleNameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!roomId || !room) return;

    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }

    const n = Number(studentNum);
    setLoading(true);
    try {
      await joinRoom(roomId, n, name);
      saveParticipantSession({ roomId, studentNum: n, name: name.trim() });

      if (remember) {
        saveRememberedParticipant(roomId, { studentNum: n, name: name.trim() });
      } else {
        clearRememberedParticipant(roomId);
      }

      const textbook = await getFirstTextbookForGrade(room.grade);
      if (!textbook) {
        setError("아직 이 학년에 등록된 교과서가 없어요. 선생님/관리자에게 문의하세요.");
        setLoading(false);
        return;
      }
      navigate(`/room/${roomId}/textbook/${textbook.id}`, { replace: true });
    } catch {
      setError("입장 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
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
          {step === "number" ? (
            <form className="space-y-4" onSubmit={handleNumberSubmit}>
              <div>
                <label className="label">번호</label>
                <input
                  ref={numberInputRef}
                  type="text"
                  inputMode="numeric"
                  className="input text-center text-lg tracking-widest"
                  value={studentNum}
                  onChange={(e) => setStudentNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  placeholder="번호를 입력하세요"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              )}

              <button type="submit" className="btn-primary w-full">
                다음
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleNameSubmit}>
              <div>
                <label className="label">이름</label>
                <input
                  ref={nameInputRef}
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                번호랑 이름 기억하기
              </label>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              )}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? "입장 중..." : "다음"}
              </button>
              <button
                type="button"
                className="w-full text-center text-sm text-slate-500 hover:underline"
                onClick={() => setStep("number")}
              >
                ← 번호 다시 입력
              </button>
            </form>
          )}

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
