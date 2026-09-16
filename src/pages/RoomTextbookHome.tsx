import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { getRoom } from "@/lib/rooms";
import { watchTextbooksByGrade } from "@/lib/firestore";
import { isRoomUnlocked, loadParticipantSession } from "@/lib/session";
import type { RoomDoc, TextbookDoc } from "@/types";

export default function RoomTextbookHome() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const asStudentNum = searchParams.get("asStudentNum");
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);
  const [books, setBooks] = useState<TextbookDoc[]>([]);

  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId).then(setRoom);
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    return watchTextbooksByGrade(room.grade, setBooks);
  }, [room]);

  useEffect(() => {
    if (!roomId) return;
    const monitoring = Boolean(asStudentNum) && isRoomUnlocked(roomId);
    const joined = loadParticipantSession(roomId);
    if (!monitoring && !joined) {
      navigate(`/room/${roomId}/join`, { replace: true });
    }
  }, [roomId, asStudentNum, navigate]);

  if (!roomId || room === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">불러오는 중...</div>;
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

  const suffix = asStudentNum ? `?asStudentNum=${asStudentNum}` : "";

  return (
    <AppShell badge={`${room.grade}학년 ${room.classNum}반`}>
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-xl font-bold">교과서 목록</h1>
        <p className="mb-6 text-sm text-slate-500">{room.grade}학년 지구마을 디지털 교과서예요.</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {books.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/room/${roomId}/textbook/${b.id}${suffix}`)}
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
