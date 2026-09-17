import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import {
  getProgress,
  getTextbook,
  saveNoteItems,
  updateProgress,
  updateTextbookChapters,
  watchNote,
  watchProgress,
} from "@/lib/firestore";
import { extractPageText, extractRealChapters, loadPdf } from "@/lib/pdf";
import { getRoom, participantKey } from "@/lib/rooms";
import { isRoomUnlocked, loadParticipantSession, type ParticipantSession } from "@/lib/session";
import {
  DEFAULT_PEN_STYLE,
  PEN_STYLES,
  type AnnotationTool,
  type PenStyleId,
  type PlacedNote,
  type RoomDoc,
  type Stroke,
  type TextbookDoc,
} from "@/types";
import { BookPage, type BookPageHandle } from "./BookPage";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";
import { Toolbar, type SearchResult } from "./Toolbar";
import { TocPanel } from "./TocPanel";
import { NotesPanel } from "./NotesPanel";
import { MagnifierOverlay, type MagnifierRect } from "./MagnifierOverlay";

const ZOOM_STEP = 0.2;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const PAGE_GAP = 10;
const CONTAINER_PADDING = 16;
const BOTTOM_BAR_SPACE = 64;
const FIT_SAFETY_MARGIN = 12;

// 표지(1쪽)는 혼자 오른쪽에 보이고, 2쪽부터 (2,3) (4,5) (6,7)... 순서로 짝을 이룬다.
const spreadStart = (n: number) => (n <= 1 ? 1 : n % 2 === 0 ? n : n - 1);

export default function TextbookViewerPage() {
  const { roomId, textbookId } = useParams<{ roomId: string; textbookId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation() as { state?: { studentName?: string } };
  const navigate = useNavigate();

  const asStudentNum = searchParams.get("asStudentNum");
  const canMonitor = Boolean(roomId && isRoomUnlocked(roomId));
  const readOnly = Boolean(asStudentNum) && canMonitor;

  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [session, setSession] = useState<ParticipantSession | null>(null);

  useEffect(() => {
    if (!roomId) return;
    getRoom(roomId).then(setRoom);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || readOnly) return;
    const s = loadParticipantSession(roomId);
    if (!s) {
      navigate(`/room/${roomId}/join`, { replace: true });
      return;
    }
    setSession(s);
  }, [roomId, readOnly, navigate]);

  const effectiveUid = !roomId
    ? ""
    : readOnly
      ? participantKey(roomId, Number(asStudentNum))
      : session
        ? participantKey(roomId, session.studentNum)
        : "";

  const [textbook, setTextbook] = useState<TextbookDoc | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(1.41);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageOpacity, setPageOpacity] = useState(1);
  const [viewMode, setViewMode] = useState<"single" | "spread">("spread");
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<AnnotationTool>("none");
  const [color, setColor] = useState("#ef4444");
  const [penStyleId, setPenStyleId] = useState<PenStyleId>(DEFAULT_PEN_STYLE);
  const activePenStyle = PEN_STYLES.find((p) => p.id === penStyleId) ?? PEN_STYLES[0];
  const [eraserSize, setEraserSize] = useState(10);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [notesByPage, setNotesByPage] = useState<Map<number, PlacedNote[]>>(new Map());
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNotePage, setActiveNotePage] = useState(1);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [magnifierMode, setMagnifierMode] = useState(false);
  const [magnifierRect, setMagnifierRect] = useState<MagnifierRect>({ fx: 0.3, fy: 0.3, fw: 0.4, fh: 0.4 });

  // 화이트보드는 특정 쪽과 무관한 빈 캔버스라서(저장 안 함) 별도의 실행취소 기록/ref를 쓴다.
  const [whiteboardMode, setWhiteboardMode] = useState(false);
  const whiteboardRef = useRef<AnnotationLayerHandle>(null);
  const whiteboardHistoryMap = useRef<Map<number, Stroke[][]>>(new Map());
  const whiteboardFutureMap = useRef<Map<number, Stroke[][]>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 900, h: 600 });
  const pageRefs = useRef<Map<number, BookPageHandle>>(new Map());
  const textCache = useRef<Map<number, string>>(new Map());
  const progressAppliedRef = useRef<string | null>(null);
  // 쪽을 넘겼다가 되돌아와도 실행취소 기록이 살아있도록 쪽 번호별로 별도 보관한다.
  const historyMapRef = useRef<Map<number, Stroke[][]>>(new Map());
  const futureMapRef = useRef<Map<number, Stroke[][]>>(new Map());

  // 필기(그리기) 실행취소와 노트 실행취소는 서로 다른 곳에서 관리되기 때문에(그리기는
  // AnnotationLayer 내부, 노트는 여기), 실행취소 버튼 하나가 "둘 중 더 최근에 한 일"을
  // 올바르게 되돌리도록 전역 일련번호로 순서를 비교한다.
  const actionSeqRef = useRef(0);
  const nextActionSeq = () => ++actionSeqRef.current;
  const lastDrawAction = useRef<{ seq: number; page: number } | null>(null);
  const lastNoteAction = useRef<{ seq: number; page: number } | null>(null);
  const lastUndoneType = useRef<"note" | "draw" | null>(null);
  const lastUndonePage = useRef<number | null>(null);
  const notesHistoryMapRef = useRef<Map<number, { seq: number; prev: PlacedNote[] }[]>>(new Map());
  const notesFutureMapRef = useRef<Map<number, { seq: number; next: PlacedNote[] }[]>>(new Map());
  // 타이핑/드래그처럼 연속으로 여러 번 호출되는 노트 편집은, 잠시 멈출 때까지 기다렸다가
  // "그 burst 이전 상태"를 통째로 하나의 실행취소 단계로 기록한다(한 글자마다 기록하면 안 됨).
  const noteEditSession = useRef<{
    page: number;
    preState: PlacedNote[];
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    if (!textbookId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await getTextbook(textbookId);
        if (!doc) {
          setError("교재를 찾을 수 없어요.");
          return;
        }
        if (cancelled) return;
        setTextbook(doc);
        const pdfDoc = await loadPdf(doc.filePath);
        if (cancelled) return;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        const firstPage = await pdfDoc.getPage(1);
        const vp = firstPage.getViewport({ scale: 1 });
        setAspect(vp.height / vp.width);

        if (doc.chapters.length === 0) {
          // PDF에 포함된 실제 차례를 분석해서 목차를 자동으로 만들어 저장한다.
          extractRealChapters(pdfDoc)
            .then((chapters) => {
              if (cancelled || chapters.length === 0) return;
              setTextbook((prev) => (prev && prev.id === doc.id ? { ...prev, chapters } : prev));
              void updateTextbookChapters(doc.id, chapters);
            })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setError("교재를 불러오는 중 문제가 발생했어요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [textbookId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 학생이 다시 들어오면 마지막으로 공부하던 쪽부터 이어서 볼 수 있도록 진도를 한 번만 불러온다.
  useEffect(() => {
    if (readOnly || !effectiveUid || !textbookId) return;
    const key = `${effectiveUid}_${textbookId}`;
    if (progressAppliedRef.current === key) return;
    progressAppliedRef.current = key;
    getProgress(effectiveUid, textbookId).then((p) => {
      if (p && p.lastPage > 1) {
        setCurrentPage(viewMode === "spread" ? spreadStart(p.lastPage) : p.lastPage);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, effectiveUid, textbookId]);

  // 선생님/관리자가 열람 중일 때는 학생이 지금 보고 있는 쪽을 실시간으로 따라간다.
  useEffect(() => {
    if (!readOnly || !effectiveUid || !textbookId) return;
    return watchProgress(effectiveUid, textbookId, (p) => {
      if (!p) return;
      setCurrentPage((cur) => {
        const target = viewMode === "spread" ? spreadStart(p.lastPage) : p.lastPage;
        return target === cur ? cur : target;
      });
    });
  }, [readOnly, effectiveUid, textbookId, viewMode]);

  const pagesToShow = useMemo(() => {
    if (viewMode === "single") return [currentPage];
    const start = spreadStart(currentPage);
    if (start === 1) return [1];
    const arr = [start];
    if (start + 1 <= numPages) arr.push(start + 1);
    return arr;
  }, [viewMode, currentPage, numPages]);
  const pagesKey = pagesToShow.join(",");

  // 표지 혼자일 때도 다음 스프레드와 같은 크기를 유지하기 위해 항상 2쪽 기준으로 계산한다.
  const layoutPageCount = viewMode === "spread" ? 2 : 1;

  const primaryPage = pagesToShow[0] ?? currentPage;

  useEffect(() => {
    commitNoteEditSession();
    setActiveNoteId(null);
    setActiveNotePage(primaryPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryPage]);

  useEffect(() => {
    if (!effectiveUid || !textbookId) return;
    const unsubs = pagesToShow.map((p) =>
      watchNote(effectiveUid, textbookId, p, (note) => {
        setNotesByPage((prev) => {
          const next = new Map(prev);
          next.set(p, note?.items ?? []);
          return next;
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUid, textbookId, pagesKey]);

  const persistNotesForPage = (page: number, items: PlacedNote[], immediate = false) => {
    if (!effectiveUid || !textbookId) return;
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    const save = () => saveNoteItems(effectiveUid, textbookId, page, items);
    if (immediate) save();
    else noteSaveTimer.current = setTimeout(save, 150);
  };

  const pushNoteHistory = (page: number, prevItems: PlacedNote[]) => {
    const stack = notesHistoryMapRef.current.get(page) ?? [];
    const seq = nextActionSeq();
    stack.push({ seq, prev: prevItems });
    if (stack.length > 50) stack.shift();
    notesHistoryMapRef.current.set(page, stack);
    notesFutureMapRef.current.set(page, []);
    lastNoteAction.current = { seq, page };
  };

  // 진행 중인 타이핑/드래그 burst를 하나의 실행취소 단계로 확정해서 기록한다.
  const commitNoteEditSession = () => {
    const session = noteEditSession.current;
    if (!session) return;
    clearTimeout(session.timer);
    noteEditSession.current = null;
    pushNoteHistory(session.page, session.preState);
  };

  // 같은 쪽에서 계속 타이핑/드래그하는 동안은 타이머만 미루고, 잠시 멈추면 그때 기록한다.
  const touchNoteEditSession = (page: number) => {
    const existing = noteEditSession.current;
    if (existing && existing.page === page) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(commitNoteEditSession, 800);
      return;
    }
    if (existing) commitNoteEditSession();
    const preState = notesByPage.get(page) ?? [];
    const timer = setTimeout(commitNoteEditSession, 800);
    noteEditSession.current = { page, preState, timer };
  };

  const boxWidth = useMemo(() => {
    const pageCount = layoutPageCount;
    // 태블릿 등에서 소수점/스크롤바 폭 오차로 실제 크기가 회색 영역보다 살짝 커져
    // 스크롤바가 생기는 일이 없도록 여유를 조금 더 뺀다.
    const availW = Math.max(
      100,
      containerSize.w - CONTAINER_PADDING * 2 - PAGE_GAP * (pageCount - 1) - FIT_SAFETY_MARGIN,
    );
    const availH = Math.max(100, containerSize.h - CONTAINER_PADDING * 2 - BOTTOM_BAR_SPACE - FIT_SAFETY_MARGIN);
    const perPageMaxW = availW / pageCount;
    const widthFromHeight = availH / aspect;
    const fit = Math.min(perPageMaxW, widthFromHeight);
    return Math.max(120, fit * zoom);
  }, [containerSize, aspect, layoutPageCount, zoom]);
  const boxHeight = boxWidth * aspect;
  const spreadWidth = boxWidth * layoutPageCount + PAGE_GAP * (layoutPageCount - 1);

  const animateTo = (page: number) => {
    setPageOpacity(0);
    setTimeout(() => {
      setCurrentPage(page);
      setPageOpacity(1);
      if (!readOnly && effectiveUid && textbookId) {
        void updateProgress(effectiveUid, textbookId, page, numPages);
      }
    }, 120);
  };

  const jumpTo = (n: number) => {
    const clamped = Math.max(1, Math.min(numPages, n));
    animateTo(viewMode === "spread" ? spreadStart(clamped) : clamped);
  };
  const goNext = () => {
    if (viewMode === "single") {
      animateTo(Math.min(numPages, currentPage + 1));
      return;
    }
    const cur = spreadStart(currentPage);
    const next = cur === 1 ? 2 : cur + 2;
    animateTo(Math.min(spreadStart(numPages), next));
  };
  const goPrev = () => {
    if (viewMode === "single") {
      animateTo(Math.max(1, currentPage - 1));
      return;
    }
    const cur = spreadStart(currentPage);
    const prev = cur <= 2 ? 1 : cur - 2;
    animateTo(Math.max(1, prev));
  };

  const handleViewModeChange = (m: "single" | "spread") => {
    setViewMode(m);
    if (m === "spread") setCurrentPage((p) => spreadStart(p));
  };

  const handleZoomChange = (delta: number) => {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
  };

  const handleSearch = async (q: string) => {
    if (!pdf) return;
    const query = q.trim().toLowerCase();
    if (!query) {
      setSearchResults([]);
      return;
    }
    for (let p = 1; p <= numPages; p++) {
      if (!textCache.current.has(p)) {
        textCache.current.set(p, await extractPageText(pdf, p));
      }
    }
    const results: SearchResult[] = [];
    textCache.current.forEach((text, page) => {
      const lower = text.toLowerCase();
      const idx = lower.indexOf(query);
      if (idx >= 0) {
        const start = Math.max(0, idx - 15);
        const snippet = `${start > 0 ? "…" : ""}${text.slice(start, idx + query.length + 25)}`;
        results.push({ page, snippet });
      }
    });
    results.sort((a, b) => a.page - b.page);
    setSearchResults(results.slice(0, 30));
  };

  // 마지막으로 그린 쪽이 화면에서 넘어가 사라진 상태라면(이미 언마운트됨) 실행취소가
  // 조용히 아무 효과도 없는 것처럼 보이므로, 그럴 땐 현재 보이는 쪽을 대상으로 한다.
  const undoRedoTarget = () => {
    const target = lastDrawAction.current?.page;
    return target !== undefined && pageRefs.current.has(target) ? target : primaryPage;
  };

  // 필기(연필/색펜/도형/지우개)와 노트, 둘 중 더 최근에 한 일을 실행취소한다.
  const handleUndo = () => {
    if (whiteboardMode) {
      whiteboardRef.current?.undo();
      return;
    }
    commitNoteEditSession();
    const noteAction = lastNoteAction.current;
    const drawAction = lastDrawAction.current;
    const noteIsNewer = noteAction !== null && (drawAction === null || noteAction.seq > drawAction.seq);

    if (noteIsNewer) {
      const stack = notesHistoryMapRef.current.get(noteAction.page);
      if (!stack || stack.length === 0) return;
      const entry = stack.pop()!;
      const currentItems = notesByPage.get(noteAction.page) ?? [];
      const futureStack = notesFutureMapRef.current.get(noteAction.page) ?? [];
      futureStack.push({ seq: entry.seq, next: currentItems });
      notesFutureMapRef.current.set(noteAction.page, futureStack);
      setNotesByPage((prev) => new Map(prev).set(noteAction.page, entry.prev));
      persistNotesForPage(noteAction.page, entry.prev, true);
      const newTop = stack[stack.length - 1];
      lastNoteAction.current = newTop ? { seq: newTop.seq, page: noteAction.page } : null;
      lastUndoneType.current = "note";
      lastUndonePage.current = noteAction.page;
      return;
    }

    if (drawAction) {
      pageRefs.current.get(undoRedoTarget())?.undo();
      lastUndoneType.current = "draw";
      lastUndonePage.current = undoRedoTarget();
    }
  };

  const handleRedo = () => {
    if (whiteboardMode) {
      whiteboardRef.current?.redo();
      return;
    }
    if (lastUndoneType.current === "note" && lastUndonePage.current !== null) {
      const page = lastUndonePage.current;
      const futureStack = notesFutureMapRef.current.get(page);
      if (!futureStack || futureStack.length === 0) return;
      const entry = futureStack.pop()!;
      const currentItems = notesByPage.get(page) ?? [];
      const histStack = notesHistoryMapRef.current.get(page) ?? [];
      histStack.push({ seq: entry.seq, prev: currentItems });
      notesHistoryMapRef.current.set(page, histStack);
      lastNoteAction.current = { seq: entry.seq, page };
      setNotesByPage((prev) => new Map(prev).set(page, entry.next));
      persistNotesForPage(page, entry.next, true);
      lastUndoneType.current = null;
      return;
    }
    pageRefs.current.get(undoRedoTarget())?.redo();
    lastUndoneType.current = null;
  };

  const handleMagnifierConfirm = (el: HTMLDivElement) => {
    // 선택한 네모박스가 화면에 꽉 차도록 하는 배율은 현재 줌과 무관하게
    // "1 / 선택 영역의 비율"이어야 한다 (현재 줌을 또 곱하면 과도하게 확대됨).
    const targetZoom = Math.min(MAX_ZOOM, 1 / Math.max(magnifierRect.fw, magnifierRect.fh));
    setZoom(targetZoom);
    // 확대로 인해 레이아웃 크기가 바뀐 뒤(2프레임 대기) 정확한 위치로 스크롤한다.
    // behavior:"smooth"로 스크롤을 시작한 채 바로 오버레이를 없애면 애니메이션이
    // 중간에 끊겨 위치가 살짝 어긋나 보이므로, 즉시 이동(auto)으로 스크롤을 끝낸
    // 뒤에만 오버레이를 닫는다.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
        setMagnifierMode(false);
      });
    });
  };

  const handleCapture = () => {
    const urls = pagesToShow
      .map((n) => pageRefs.current.get(n)?.captureDataUrl())
      .filter((u): u is string => Boolean(u));
    if (urls.length === 0) return;

    const images = urls.map((u) => {
      const img = new Image();
      img.src = u;
      return img;
    });

    const finish = () => {
      const totalW = images.reduce((sum, img) => sum + img.width, 0);
      const maxH = Math.max(...images.map((img) => img.height));
      const canvas = document.createElement("canvas");
      canvas.width = totalW;
      canvas.height = maxH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, totalW, maxH);
      let x = 0;
      for (const img of images) {
        ctx.drawImage(img, x, 0);
        x += img.width;
      }
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${textbook?.title ?? "textbook"}-${primaryPage}.png`;
      a.click();
    };

    let loaded = 0;
    images.forEach((img) => {
      if (img.complete) {
        loaded += 1;
        if (loaded === images.length) finish();
      } else {
        img.onload = () => {
          loaded += 1;
          if (loaded === images.length) finish();
        };
      }
    });
  };

  const handleCreateNote = (page: number, x: number, y: number) => {
    if (readOnly) return;
    commitNoteEditSession();
    const id = `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const current = notesByPage.get(page) ?? [];
    pushNoteHistory(page, current);
    const next = [...current, { id, x, y, text: "" }];
    setNotesByPage((prev) => new Map(prev).set(page, next));
    setActiveNotePage(page);
    setActiveNoteId(id);
    persistNotesForPage(page, next, true);
    setTool("none"); // 한 번 찍으면 자동으로 노트 도구가 꺼짐 (계속 새 메모가 생기는 것 방지)
  };
  const handleSelectNote = (page: number, id: string) => {
    setActiveNotePage(page);
    setActiveNoteId(id);
  };
  const handleUpdateNoteText = (id: string, text: string) => {
    touchNoteEditSession(activeNotePage);
    const current = notesByPage.get(activeNotePage) ?? [];
    const next = current.map((n) => (n.id === id ? { ...n, text } : n));
    setNotesByPage((prev) => new Map(prev).set(activeNotePage, next));
    persistNotesForPage(activeNotePage, next);
  };
  const handleChangeNoteFontSize = (id: string, fontSize: number) => {
    commitNoteEditSession();
    const current = notesByPage.get(activeNotePage) ?? [];
    pushNoteHistory(activeNotePage, current);
    const next = current.map((n) => (n.id === id ? { ...n, fontSize } : n));
    setNotesByPage((prev) => new Map(prev).set(activeNotePage, next));
    persistNotesForPage(activeNotePage, next);
  };
  const handleMoveNote = (page: number, id: string, x: number, y: number) => {
    touchNoteEditSession(page);
    const current = notesByPage.get(page) ?? [];
    const next = current.map((n) => (n.id === id ? { ...n, x, y } : n));
    setNotesByPage((prev) => new Map(prev).set(page, next));
    persistNotesForPage(page, next);
  };
  const handleDeleteNote = (id: string) => {
    commitNoteEditSession();
    const current = notesByPage.get(activeNotePage) ?? [];
    pushNoteHistory(activeNotePage, current);
    const next = current.filter((n) => n.id !== id);
    setNotesByPage((prev) => new Map(prev).set(activeNotePage, next));
    if (activeNoteId === id) setActiveNoteId(null);
    persistNotesForPage(activeNotePage, next, true);
  };

  if (error) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => navigate(-1)}>
            돌아가기
          </button>
        </div>
      </AppShell>
    );
  }

  if (!pdf || !textbook || !room || !effectiveUid) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-slate-400">교재를 불러오는 중...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      fullBleed
      badge={`${room.grade}학년 ${room.classNum}반 · ${readOnly ? (location.state?.studentName ?? "학생") : session?.name}`}
      right={
        <button className="btn-ghost" onClick={() => navigate("/")}>
          나가기
        </button>
      }
    >
      <div className="flex h-full flex-col">
        {readOnly && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-700">
            👀 {location.state?.studentName ?? "학생"}의 학습 화면을 실시간으로 보고 있어요 (읽기 전용)
          </div>
        )}
        <Toolbar
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          penStyleId={penStyleId}
          onPenStyleChange={setPenStyleId}
          eraserSize={eraserSize}
          onEraserSizeChange={setEraserSize}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSearch={handleSearch}
          searchResults={searchResults}
          onJumpToResult={jumpTo}
          onCapture={handleCapture}
          magnifierMode={magnifierMode}
          onToggleMagnifier={() => {
            setMagnifierMode((v) => !v);
            setTool("none");
          }}
          onZoomReset={() => setZoom(1)}
          whiteboardMode={whiteboardMode}
          onToggleWhiteboard={() => setWhiteboardMode((v) => !v)}
          onClearWhiteboard={() => whiteboardRef.current?.clear()}
          readOnly={readOnly}
        />

        <div className="flex flex-1 overflow-hidden">
          {!whiteboardMode && (
            <TocPanel title={textbook.title} chapters={textbook.chapters} currentPage={currentPage} onJump={jumpTo} />
          )}

          <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-200">
            {whiteboardMode ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  className="relative overflow-hidden rounded-xl bg-white shadow-2xl"
                  style={{
                    width: Math.max(300, containerSize.w - CONTAINER_PADDING * 2),
                    height: Math.max(300, containerSize.h - CONTAINER_PADDING * 2),
                  }}
                >
                  <AnnotationLayer
                    ref={whiteboardRef}
                    uid={effectiveUid}
                    textbookId={textbookId!}
                    page={0}
                    width={Math.max(300, containerSize.w - CONTAINER_PADDING * 2)}
                    height={Math.max(300, containerSize.h - CONTAINER_PADDING * 2)}
                    tool={tool === "note" ? "none" : tool}
                    color={color}
                    eraserSize={eraserSize}
                    readOnly={readOnly}
                    historyMap={whiteboardHistoryMap.current}
                    futureMap={whiteboardFutureMap.current}
                    persist={false}
                    penWidth={activePenStyle.width}
                    penAlpha={activePenStyle.alpha}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="absolute inset-0 overflow-auto">
                  {/* items-center/justify-center로 가운데 정렬하면, 확대해서 내용이 컨테이너보다
                      커졌을 때 브라우저가 넘치는 부분을 좌우/상하로 "똑같이" 넘치게 만드는데,
                      그중 시작(왼쪽/위) 쪽으로 넘친 부분은 스크롤해도 닿지 않는 버그가 있다.
                      (짝수쪽처럼 스프레드의 왼쪽에 있는 페이지를 돋보기로 확대하면 그 쪽으로
                      스크롤이 안 되고 가운데만 보이던 원인이 바로 이것.) 대신 바깥은 정렬 없이
                      두고 안쪽 내용에 margin:auto로 가운데를 맞추면, 내용이 작을 때는 그대로
                      가운데 정렬되면서 커졌을 때는 처음(왼쪽/위)부터 자연스럽게 넘쳐서 전체를
                      스크롤로 온전히 볼 수 있다. */}
                  <div className="flex min-h-full p-4">
                    <div
                      className="relative m-auto flex shadow-2xl"
                      style={{ gap: PAGE_GAP, opacity: pageOpacity, transition: "opacity 120ms" }}
                    >
                      {viewMode === "spread" && pagesToShow.length === 1 && pagesToShow[0] === 1 && (
                        <div style={{ width: boxWidth, height: boxHeight }} />
                      )}
                      {pagesToShow.map((n) => (
                        <div key={n} className="relative" style={{ width: boxWidth, height: boxHeight }}>
                          <BookPage
                            ref={(el) => {
                              if (el) pageRefs.current.set(n, el);
                              else pageRefs.current.delete(n);
                            }}
                            pdf={pdf}
                            pageNumber={n}
                            boxWidth={boxWidth}
                            boxHeight={boxHeight}
                            uid={effectiveUid}
                            textbookId={textbookId!}
                            tool={tool}
                            color={color}
                            eraserSize={eraserSize}
                            readOnly={readOnly}
                            onDraw={() => {
                              lastDrawAction.current = { seq: nextActionSeq(), page: n };
                            }}
                            historyMap={historyMapRef.current}
                            futureMap={futureMapRef.current}
                            penWidth={activePenStyle.width}
                            penAlpha={activePenStyle.alpha}
                            showNotes
                            noteItems={notesByPage.get(n) ?? []}
                            activeNoteId={n === activeNotePage ? activeNoteId : null}
                            onCreateNote={(x, y) => handleCreateNote(n, x, y)}
                            onSelectNote={(id) => handleSelectNote(n, id)}
                            onMoveNote={(id, x, y) => handleMoveNote(n, id, x, y)}
                          />
                        </div>
                      ))}

                      {magnifierMode && (
                        <MagnifierOverlay
                          rect={magnifierRect}
                          boxWidth={spreadWidth}
                          boxHeight={boxHeight}
                          onChange={setMagnifierRect}
                          onConfirm={handleMagnifierConfirm}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 shadow-lg">
                    <button className="btn-ghost px-2" title="이전 쪽" onClick={goPrev}>
                      ◀
                    </button>
                    <PageJumpInput currentPage={currentPage} numPages={numPages} onJump={jumpTo} />
                    <button className="btn-ghost px-2" title="다음 쪽" onClick={goNext}>
                      ▶
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {!whiteboardMode && (
            <NotesPanel
              items={notesByPage.get(activeNotePage) ?? []}
              activeId={activeNoteId}
              readOnly={readOnly}
              noteToolActive={tool === "note"}
              studentLabel={readOnly ? location.state?.studentName : undefined}
              onSelect={(id) => setActiveNoteId(id)}
              onChangeText={handleUpdateNoteText}
              onChangeFontSize={handleChangeNoteFontSize}
              onDelete={handleDeleteNote}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PageJumpInput({
  currentPage,
  numPages,
  onJump,
}: {
  currentPage: number;
  numPages: number;
  onJump: (page: number) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value);
        if (n >= 1 && n <= numPages) onJump(n);
        setValue("");
      }}
    >
      <input
        className="w-12 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
        placeholder={`${currentPage}`}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
      />
      <span className="text-sm text-slate-500">/ {numPages}쪽</span>
    </form>
  );
}
