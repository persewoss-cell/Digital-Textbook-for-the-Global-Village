import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { ChangeRoomPasswordModal } from "@/components/ChangeRoomPasswordModal";
import { StudentRosterModal } from "@/components/StudentRosterModal";
import { deleteRoomCascade, getRoom, participantKey, watchParticipants } from "@/lib/rooms";
import { getFirstTextbookForGrade, watchAnnotation, watchNote, watchProgress } from "@/lib/firestore";
import { loadPdf } from "@/lib/pdf";
import { isRoomUnlocked, markRoomUnlocked } from "@/lib/session";
import { PdfPageCanvas } from "@/pages/TextbookViewer/PdfPageCanvas";
import { drawStroke, STROKE_WIDTH_REFERENCE } from "@/pages/TextbookViewer/AnnotationLayer";
import { DEFAULT_NOTE_FONT_SIZE } from "@/pages/TextbookViewer/NotesOverlay";
import type { ParticipantDoc, PlacedNote, RoomDoc, StudentProgressDoc, TextbookDoc } from "@/types";

// 화면 너비에 맞춰 한 줄에 들어갈 카드 수를 정하고, 그 안에서 최대한 크게 보이도록
// 썸네일 너비를 계산한다 (좁은 화면에서는 칸 수를 줄여서라도 이 크기 밑으로는 안 내려가게 함).
const THUMB_MIN_WIDTH = 200;
const THUMB_MAX_WIDTH = 280;
const GRID_GAP = 12;
const MAX_COLUMNS = 4;

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
        const widthScale = width / STROKE_WIDTH_REFERENCE;
        (a?.strokes ?? []).forEach((s) => drawStroke(ctx, s, width, height, widthScale));
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
  width,
}: {
  roomId: string;
  studentNum: number;
  textbookId: string;
  page: number;
  width: number;
}) {
  const [items, setItems] = useState<PlacedNote[]>([]);

  useEffect(
    () =>
      watchNote(participantKey(roomId, studentNum), textbookId, page, (note) => {
        setItems(note?.items ?? []);
      }),
    [roomId, studentNum, textbookId, page],
  );

  const scale = width / STROKE_WIDTH_REFERENCE;

  return (
    <div className="absolute inset-0">
      {items
        .filter((note) => note.text.trim())
        .map((note) => (
        <div
          key={note.id}
          // 본문에서와 마찬가지로 줄바꿈(Enter)은 그대로 살리고, 한 줄로 잘라 "..."으로 표시하지 않는다.
          className="absolute max-w-[60%] -translate-y-1/2 whitespace-pre rounded-sm bg-white/70 px-px font-normal leading-tight text-slate-800"
          style={{
            left: `${note.x * 100}%`,
            top: `${note.y * 100}%`,
            fontSize: Math.max(4, (note.fontSize ?? DEFAULT_NOTE_FONT_SIZE) * scale),
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
  thumbWidth,
  onOpen,
}: {
  roomId: string;
  participant: ParticipantDoc;
  textbookId: string;
  pdf: PDFDocumentProxy | null;
  aspect: number;
  thumbWidth: number;
  onOpen: () => void;
}) {
  const [progress, setProgress] = useState<StudentProgressDoc | null>(null);

  useEffect(
    () => watchProgress(participantKey(roomId, participant.studentNum), textbookId, setProgress),
    [roomId, participant.studentNum, textbookId],
  );

  const page = Math.min(progress?.lastPage ?? 1, pdf?.numPages ?? 1);
  // 실제 쪽 비율과 다르면 필기/노트 위치가 쪽 이미지와 어긋나 보이므로 실제 비율을 그대로 쓴다.
  const thumbHeight = thumbWidth * aspect;

  return (
    <button onClick={onOpen} className="card overflow-hidden text-left transition hover:shadow-md">
      <div className="relative flex items-center justify-center bg-slate-100 py-2">
        {pdf ? (
          <div className="relative">
            <PdfPageCanvas pdf={pdf} pageNumber={page} renderWidth={thumbWidth} displayWidth={thumbWidth} />
            <ThumbStrokes
              roomId={roomId}
              studentNum={participant.studentNum}
              textbookId={textbookId}
              page={page}
              width={thumbWidth}
              height={thumbHeight}
            />
            <ThumbNotes
              roomId={roomId}
              studentNum={participant.studentNum}
              textbookId={textbookId}
              page={page}
              width={thumbWidth}
            />
          </div>
        ) : (
          <div style={{ width: thumbWidth, height: thumbHeight }} />
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
  const [rememberPassword, setRememberPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [participants, setParticipants] = useState<ParticipantDoc[]>([]);
  const [textbook, setTextbook] = useState<TextbookDoc | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [aspect, setAspect] = useState(1.41);
  const [showRoster, setShowRoster] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(900);
  // room/unlocked이 아직 준비되지 않은 동안은 로딩 화면만 그려져서 gridRef가 아직
  // DOM에 붙지 않은 상태다. 의존성 배열이 비어 있으면 그 순간(el이 null)에 딱 한 번만
  // 실행되고 다시는 재실행되지 않아, 그리드가 뜬 뒤에도 실제 크기를 영영 측정하지
  // 못해 항상 기본값(900)으로 열 개수/썸네일 크기를 계산하는 문제가 있었다. 로딩이
  // 끝나는 시점에 맞춰 effect가 재실행되도록 의존성에 넣어 이 경쟁 상태를 없앤다.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setGridWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [room, unlocked]);
  const columns = Math.max(
    1,
    Math.min(MAX_COLUMNS, Math.floor((gridWidth + GRID_GAP) / (THUMB_MIN_WIDTH + GRID_GAP))),
  );
  const thumbWidth = Math.min(
    THUMB_MAX_WIDTH,
    Math.floor((gridWidth - GRID_GAP * (columns - 1)) / columns),
  );

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
    markRoomUnlocked(roomId, rememberPassword);
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
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={rememberPassword}
                onChange={(e) => setRememberPassword(e.target.checked)}
              />
              이 기기에서 비밀번호 기억하기
            </label>
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
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {room.grade}학년 {room.classNum}반 관리
            </h1>
            <p className="text-sm text-slate-500">
              {room.teacherName} 선생님 · {textbook?.title ?? "교재 없음"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setShowRoster(true)}>
              학생 등록하기
            </button>
            <button className="btn-secondary" onClick={() => setShowChangePassword(true)}>
              비밀번호 변경하기
            </button>
            <button className="btn-secondary text-red-500" onClick={handleDelete}>
              방 삭제하기
            </button>
          </div>
        </div>

        <p className="mb-3 text-xs text-slate-400">
          학생들이 지금 보고 있는 쪽과 필기가 실시간으로 표시돼요. 카드를 누르면 전체 화면으로 볼 수 있어요.
        </p>

        <div
          ref={gridRef}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {textbook &&
            participants.map((p) => (
              <ParticipantThumbCard
                key={p.id}
                roomId={roomId}
                participant={p}
                textbookId={textbook.id}
                pdf={pdf}
                aspect={aspect}
                thumbWidth={thumbWidth}
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
              이 학년에 등록된 교재가 없어요.
            </p>
          )}
        </div>
      </div>

      {showRoster && (
        <StudentRosterModal
          roomId={roomId}
          participants={participants}
          onClose={() => setShowRoster(false)}
        />
      )}
      {showChangePassword && (
        <ChangeRoomPasswordModal
          roomId={roomId}
          currentPassword={room.password}
          onClose={() => setShowChangePassword(false)}
          onChanged={(newPassword) => setRoom({ ...room, password: newPassword })}
        />
      )}
    </AppShell>
  );
}
