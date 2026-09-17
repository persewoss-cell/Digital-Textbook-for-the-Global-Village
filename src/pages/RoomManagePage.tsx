import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { deleteRoomCascade, getRoom, participantKey, watchParticipants } from "@/lib/rooms";
import { getFirstTextbookForGrade, watchAnnotation, watchNote, watchProgress } from "@/lib/firestore";
import { loadPdf } from "@/lib/pdf";
import { isRoomUnlocked, markRoomUnlocked } from "@/lib/session";
import { PdfPageCanvas } from "@/pages/TextbookViewer/PdfPageCanvas";
import { drawStroke, STROKE_WIDTH_REFERENCE } from "@/pages/TextbookViewer/AnnotationLayer";
import { DEFAULT_NOTE_FONT_SIZE } from "@/pages/TextbookViewer/NotesOverlay";
import type { ParticipantDoc, PlacedNote, RoomDoc, StudentProgressDoc, TextbookDoc } from "@/types";

const THUMB_WIDTH = 160;
// 실제 쪽에서 쓰는 필기 두께/글씨 크기를 이 작은 썸네일 크기에 맞게 비례해서 줄인다.
const THUMB_SCALE = THUMB_WIDTH / STROKE_WIDTH_REFERENCE;

function ThumbStrokes({
  roomId,
  studentNum,
  textbookId,
  page,
  width,
  height,
}: {
  roomId: string;
  studentNum: number;
  textbookId: string;
  page: number;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(
    () =>
      watchAnnotation(participantKey(roomId, studentNum), textbookId, page, (a) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        (a?.strokes ?? []).forEach((s) => drawStroke(ctx, s, width, height, THUMB_SCALE));
      }),
    [roomId, studentNum, textbookId, page, width, height],
  );

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

/** 썸네일 카드에도 학생이 남긴 노트 텍스트가 실시간으로 보이도록 작게 축소해서 표시한다. */
function ThumbNotes({
  roomId,
  studentNum,
  textbookId,
  page,
}: {
  roomId: string;
  studentNum: number;
  textbookId: string;
  page: number;
}) {
  const [items, setItems] = useState<PlacedNote[]>([]);

  useEffect(
    () =>
      watchNote(participantKey(roomId, studentNum), textbookId, page, (note) => {
        setItems(note?.items ?? []);
      }),
    [roomId, studentNum, textbookId, page],
  );

  return (
    <div className="absolute inset-0">
      {items
        .filter((note) => note.text.trim())
        .map((note) => (
        <div
          key={note.id}
          className="absolute max-w-[60%] -translate-y-1/2 truncate rounded-sm bg-white/70 px-px font-normal leading-none text-slate-800"
          style={{
            left: `${note.x * 100}%`,
            top: `${note.y * 100}%`,
            fontSize: Math.max(3, (note.fontSize ?? DEFAULT_NOTE_FONT_SIZE) * THUMB_SCALE),
          }}
        >
          {note.text}
        </div>
      ))}
    </div>
  );
}

function ParticipantThumbCard({
  roomId,
  participant,
  textbookId,
  pdf,
  aspect,
  onOpen,
}: {
  roomId: string;
  participant: ParticipantDoc;
  textbookId: string;
  pdf: PDFDocumentProxy | null;
  aspect: number;
  onOpen: () => void;
}) {
  const [progress, setProgress] = useState<StudentProgressDoc | null>(null);

  useEffect(
    () => watchProgress(participantKey(roomId, participant.studentNum), textbookId, setProgress),
    [roomId, participant.studentNum, textbookId],
  );

  const page = Math.min(progress?.lastPage ?? 1, pdf?.numPages ?? 1);
  // 실제 쪽 비율과 다르면 필기/노트 위치가 쪽 이미지와 어긋나 보이므로 실제 비율을 그대로 쓴다.
  const thumbHeight = THUMB_WIDTH * aspect;

  return (
    <button onClick={onOpen} className="card overflow-hidden text-left transition hover:shadow-md">
      <div className="relative flex items-center justify-center bg-slate-100 py-2">
        {pdf ? (
          <div className="relative">
            <PdfPageCanvas pdf={pdf} pageNumber={page} width={THUMB_WIDTH} />
            <ThumbStrokes
              roomId={roomId}
              studentNum={participant.studentNum}
              textbookId={textbookId}
              page={page}
              width={THUMB_WIDTH}
              height={thumbHeight}
            />
            <ThumbNotes
              roomId={roomId}
              studentNum={participant.studentNum}
              textbookId={textbookId}
              page={page}
            />
          </div>
        ) : (
          <div style={{ width: THUMB_WIDTH, height: thumbHeight }} />
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
  const [textbook, setTextbook] = useState<TextbookDoc | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.41);

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
    getFirstTextbookForGrade(room.grade).then(setTextbook);
  }, [room, unlocked]);

  useEffect(() => {
    if (!textbook) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    loadPdf(textbook.filePath).then(async (doc) => {
      if (cancelled) return;
      setPdf(doc);
      const firstPage = await doc.getPage(1);
      if (cancelled) return;
      const vp = firstPage.getViewport({ scale: 1 });
      setAspect(vp.height / vp.width);
    });
    return () => {
      cancelled = true;
    };
  }, [textbook]);

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
    <AppShell
      badge={`${room.grade}학년 ${room.classNum}반`}
      right={
        <button className="btn-ghost" onClick={() => navigate("/")}>
          나가기
        </button>
      }
    >
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {room.grade}학년 {room.classNum}반 관리
            </h1>
            <p className="text-sm text-slate-500">
              {room.teacherName} 선생님 · {textbook?.title ?? "교과서 없음"}
            </p>
          </div>
          <button className="btn-secondary text-red-500" onClick={handleDelete}>
            방 삭제하기
          </button>
        </div>

        <p className="mb-3 text-xs text-slate-400">
          학생들이 지금 보고 있는 쪽과 필기가 실시간으로 표시돼요. 카드를 누르면 전체 화면으로 볼 수 있어요.
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {textbook &&
            participants.map((p) => (
              <ParticipantThumbCard
                key={p.id}
                roomId={roomId}
                participant={p}
                textbookId={textbook.id}
                pdf={pdf}
                aspect={aspect}
                onOpen={() =>
                  navigate(`/room/${roomId}/textbook/${textbook.id}?asStudentNum=${p.studentNum}`, {
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
          {participants.length > 0 && !textbook && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              이 학년에 등록된 교과서가 없어요.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
