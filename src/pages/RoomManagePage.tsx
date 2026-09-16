import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { deleteRoomCascade, getRoom, participantKey, watchParticipants } from "@/lib/rooms";
import { watchProgress, watchTextbooksByGrade } from "@/lib/firestore";
import { loadPdf } from "@/lib/pdf";
import { isRoomUnlocked, markRoomUnlocked } from "@/lib/session";
import { PdfPageCanvas } from "@/pages/TextbookViewer/PdfPageCanvas";
import type { ParticipantDoc, RoomDoc, StudentProgressDoc, TextbookDoc } from "@/types";

const THUMB_WIDTH = 160;

function ParticipantThumbCard({
  roomId,
  participant,
  textbookId,
  pdf,
  onOpen,
}: {
  roomId: string;
  participant: ParticipantDoc;
  textbookId: string;
  pdf: PDFDocumentProxy | null;
  onOpen: () => void;
}) {
  const [progress, setProgress] = useState<StudentProgressDoc | null>(null);

  useEffect(
    () => watchProgress(participantKey(roomId, participant.studentNum), textbookId, setProgress),
    [roomId, participant.studentNum, textbookId],
  );

  const page = progress?.lastPage ?? 1;

  return (
    <button onClick={onOpen} className="card overflow-hidden text-left transition hover:shadow-md">
      <div className="flex items-center justify-center bg-slate-100 py-2">
        {pdf ? (
          <PdfPageCanvas pdf={pdf} pageNumber={Math.min(page, pdf.numPages)} width={THUMB_WIDTH} />
        ) : (
          <div style={{ width: THUMB_WIDTH, height: THUMB_WIDTH * 1.4 }} />
        )}
      </div>
      <div className="border-t border-slate-100 p-2 text-center text-xs font-semibold text-slate-600">
        {participant.studentNum}번 {participant.name}
      </div>
    </button>
  );
}

export default function RoomManagePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [room, setRoom] = useState<RoomDoc | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(() => (roomId ? isRoomUnlocked(roomId) : false));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [participants, setParticipants] = useState<ParticipantDoc[]>([]);
  const [textbooks, setTextbooks] = useState<TextbookDoc[]>([]);
  const [textbookId, setTextbookId] = useState("");
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId).then(setRoom);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !unlocked) return;
    return watchParticipants(roomId, setParticipants);
  }, [roomId, unlocked]);

  useEffect(() => {
    if (!room || !unlocked) return;
    return watchTextbooksByGrade(room.grade, setTextbooks);
  }, [room, unlocked]);

  useEffect(() => {
    if (!textbookId && textbooks.length > 0) setTextbookId(textbooks[0].id);
  }, [textbooks, textbookId]);

  useEffect(() => {
    const textbook = textbooks.find((t) => t.id === textbookId);
    if (!textbook) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    loadPdf(textbook.filePath).then((doc) => {
      if (!cancelled) setPdf(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [textbookId, textbooks]);

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (!room || !roomId) return;
    if (password !== room.password) {
      setError("비밀번호가 올바르지 않아요.");
      return;
    }
    markRoomUnlocked(roomId);
    setUnlocked(true);
  };

  const handleDelete = async () => {
    if (!roomId || !room) return;
    if (
      !confirm(
        `${room.grade}학년 ${room.classNum}반 방을 삭제할까요? 학생들의 필기/노트도 함께 사라지고 되돌릴 수 없어요.`,
      )
    ) {
      return;
    }
    await deleteRoomCascade(roomId);
    navigate("/", { replace: true });
  };

  if (room === undefined || !roomId) {
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

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
        <div className="w-full max-w-sm card p-6">
          <h1 className="mb-1 text-lg font-bold">
            {room.grade}학년 {room.classNum}반 관리
          </h1>
          <p className="mb-4 text-sm text-slate-500">방 비밀번호를 입력해 주세요.</p>
          <form className="space-y-3" onSubmit={handleUnlock}>
            <input
              className="input tracking-widest"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="1234"
              inputMode="numeric"
              maxLength={4}
              autoFocus
            />
            {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
            <button type="submit" className="btn-primary w-full">
              확인
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/" className="text-sm text-slate-500 hover:underline">
              ← 방 목록으로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell badge={`${room.grade}학년 ${room.classNum}반`}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {room.grade}학년 {room.classNum}반 관리
            </h1>
            <p className="text-sm text-slate-500">{room.teacherName} 선생님</p>
          </div>
          <button className="btn-secondary text-red-500" onClick={handleDelete}>
            방 삭제하기
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm text-slate-500">교과서</label>
          <select className="input w-auto" value={textbookId} onChange={(e) => setTextbookId(e.target.value)}>
            {textbooks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">학생들이 지금 보고 있는 쪽이 실시간으로 표시돼요.</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {participants.map((p) => (
            <ParticipantThumbCard
              key={p.id}
              roomId={roomId}
              participant={p}
              textbookId={textbookId}
              pdf={pdf}
              onOpen={() =>
                navigate(`/room/${roomId}/textbook/${textbookId}?asStudentNum=${p.studentNum}`, {
                  state: { studentName: p.name },
                })
              }
            />
          ))}
          {participants.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              아직 참여한 학생이 없어요.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
