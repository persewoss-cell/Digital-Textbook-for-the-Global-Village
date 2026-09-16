import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import {
  getTextbook,
  saveNoteItems,
  updateProgress,
  watchNote,
} from "@/lib/firestore";
import { extractPageText, loadPdf } from "@/lib/pdf";
import { getRoom, participantKey } from "@/lib/rooms";
import { isRoomUnlocked, loadParticipantSession, type ParticipantSession } from "@/lib/session";
import type { AnnotationTool, PlacedNote, RoomDoc, TextbookDoc } from "@/types";
import { BookPage, type BookPageHandle } from "./BookPage";
import { Toolbar, type SearchResult } from "./Toolbar";
import { TocPanel } from "./TocPanel";
import { NotesPanel } from "./NotesPanel";

const ZOOM_LEVELS = [0.6, 0.8, 1, 1.25, 1.5, 2];
const FIT_ZOOM_INDEX = 2;
const PAGE_GAP = 10;
const CONTAINER_PADDING = 24;
const BOTTOM_BAR_SPACE = 72;

const pairStart = (n: number) => (n % 2 === 1 ? n : n - 1);

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
  const [zoomIndex, setZoomIndex] = useState(FIT_ZOOM_INDEX);
  const [tool, setTool] = useState<AnnotationTool>("none");
  const [color, setColor] = useState("#ef4444");
  const [eraserSize, setEraserSize] = useState(26);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const [noteItems, setNoteItems] = useState<PlacedNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 900, h: 600 });
  const pageRefs = useRef<Map<number, BookPageHandle>>(new Map());
  const lastDrawnPage = useRef<number | null>(null);
  const textCache = useRef<Map<number, string>>(new Map());

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

  const pagesToShow = useMemo(() => {
    if (viewMode === "single") return [currentPage];
    const start = pairStart(currentPage);
    const arr = [start];
    if (start + 1 <= numPages) arr.push(start + 1);
    return arr;
  }, [viewMode, currentPage, numPages]);

  const primaryPage = pagesToShow[0] ?? currentPage;

  useEffect(() => {
    setActiveNoteId(null);
  }, [primaryPage]);

  useEffect(() => {
    if (!effectiveUid || !textbookId) return;
    return watchNote(effectiveUid, textbookId, primaryPage, (note) => setNoteItems(note?.items ?? []));
  }, [effectiveUid, textbookId, primaryPage]);

  const persistNotes = (items: PlacedNote[], immediate = false) => {
    if (!effectiveUid || !textbookId) return;
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    const save = () => saveNoteItems(effectiveUid, textbookId, primaryPage, items);
    if (immediate) save();
    else noteSaveTimer.current = setTimeout(save, 500);
  };

  const boxWidth = useMemo(() => {
    const pageCount = pagesToShow.length;
    const availW = Math.max(100, containerSize.w - CONTAINER_PADDING * 2 - PAGE_GAP * (pageCount - 1));
    const availH = Math.max(100, containerSize.h - CONTAINER_PADDING * 2 - BOTTOM_BAR_SPACE);
    const perPageMaxW = availW / pageCount;
    const widthFromHeight = availH / aspect;
    const fit = Math.min(perPageMaxW, widthFromHeight);
    return Math.max(120, fit * ZOOM_LEVELS[zoomIndex]);
  }, [containerSize, aspect, pagesToShow.length, zoomIndex]);
  const boxHeight = boxWidth * aspect;

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
    animateTo(viewMode === "spread" ? pairStart(clamped) : clamped);
  };
  const goNext = () => {
    const step = viewMode === "spread" ? 2 : 1;
    const max = viewMode === "spread" ? pairStart(numPages) : numPages;
    animateTo(Math.min(max, currentPage + step));
  };
  const goPrev = () => {
    const step = viewMode === "spread" ? 2 : 1;
    animateTo(Math.max(1, currentPage - step));
  };

  const handleViewModeChange = (m: "single" | "spread") => {
    setViewMode(m);
    if (m === "spread") setCurrentPage((p) => pairStart(p));
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

  const handleUndo = () => {
    const target = lastDrawnPage.current ?? primaryPage;
    pageRefs.current.get(target)?.undo();
  };
  const handleRedo = () => {
    const target = lastDrawnPage.current ?? primaryPage;
    pageRefs.current.get(target)?.redo();
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

  const handleCreateNote = (x: number, y: number) => {
    if (readOnly) return;
    const id = `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const next = [...noteItems, { id, x, y, text: "" }];
    setNoteItems(next);
    setActiveNoteId(id);
    persistNotes(next, true);
  };
  const handleUpdateNoteText = (id: string, text: string) => {
    const next = noteItems.map((n) => (n.id === id ? { ...n, text } : n));
    setNoteItems(next);
    persistNotes(next);
  };
  const handleDeleteNote = (id: string) => {
    const next = noteItems.filter((n) => n.id !== id);
    setNoteItems(next);
    if (activeNoteId === id) setActiveNoteId(null);
    persistNotes(next, true);
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
            👀 {location.state?.studentName ?? "학생"}의 학습 화면을 보고 있어요 (읽기 전용)
          </div>
        )}
        <Toolbar
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          zoomIndex={zoomIndex}
          zoomLevels={ZOOM_LEVELS}
          onZoomChange={setZoomIndex}
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          eraserSize={eraserSize}
          onEraserSizeChange={setEraserSize}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSearch={handleSearch}
          searchResults={searchResults}
          onJumpToResult={jumpTo}
          onCapture={handleCapture}
          readOnly={readOnly}
        />

        <div className="flex flex-1 overflow-hidden">
          <TocPanel title={textbook.title} chapters={textbook.chapters} currentPage={currentPage} onJump={jumpTo} />

          <div ref={containerRef} className="relative flex-1 overflow-hidden bg-slate-200">
            <div className="absolute inset-0 overflow-auto">
              <div className="flex min-h-full items-center justify-center p-6">
                <div
                  className="flex shadow-2xl"
                  style={{ gap: PAGE_GAP, opacity: pageOpacity, transition: "opacity 120ms" }}
                >
                  {pagesToShow.map((n) => (
                    <BookPage
                      key={n}
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
                        lastDrawnPage.current = n;
                      }}
                      showNotes={n === primaryPage}
                      noteItems={n === primaryPage ? noteItems : []}
                      activeNoteId={n === primaryPage ? activeNoteId : null}
                      onCreateNote={handleCreateNote}
                      onSelectNote={setActiveNoteId}
                    />
                  ))}
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
          </div>

          <NotesPanel
            items={noteItems}
            activeId={activeNoteId}
            readOnly={readOnly}
            noteToolActive={tool === "note"}
            studentLabel={readOnly ? location.state?.studentName : undefined}
            onSelect={setActiveNoteId}
            onChangeText={handleUpdateNoteText}
            onDelete={handleDeleteNote}
          />
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
