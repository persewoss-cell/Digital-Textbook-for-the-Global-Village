import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { getTextbook, updateTextbookChapters } from "@/lib/firestore";
import { extractPageText, extractRealChapters, loadPdf } from "@/lib/pdf";
import {
  DEFAULT_PEN_STYLE,
  PEN_STYLES,
  type AnnotationTool,
  type PenStyleId,
  type PlacedNote,
  type Stroke,
  type TextbookDoc,
} from "@/types";
import { BookPage, type BookPageHandle } from "@/pages/TextbookViewer/BookPage";
import { AnnotationLayer, type AnnotationLayerHandle } from "@/pages/TextbookViewer/AnnotationLayer";
import { Toolbar, type SearchResult } from "@/pages/TextbookViewer/Toolbar";
import { TocPanel } from "@/pages/TextbookViewer/TocPanel";
import { NotesPanel } from "@/pages/TextbookViewer/NotesPanel";
import { MagnifierOverlay, type MagnifierRect } from "@/pages/TextbookViewer/MagnifierOverlay";
import { usePinchZoom } from "@/pages/TextbookViewer/usePinchZoom";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const PAGE_GAP = 0;
const CONTAINER_PADDING = 4;
const FIT_SAFETY_MARGIN = 6;

// 체험 모드는 방/학생 계정이 없으므로 uid는 저장에 쓰이지 않는 자리표시자일 뿐이다.
const PREVIEW_UID = "preview";

// 표지(1쪽)는 혼자 오른쪽에 보이고, 2쪽부터 (2,3) (4,5) (6,7)... 순서로 짝을 이룬다.
const spreadStart = (n: number) => (n <= 1 ? 1 : n % 2 === 0 ? n : n - 1);

/**
 * 선생님/관리자가 학년별 교재를 미리 둘러보는 체험 화면. TextbookViewerPage와 UI는 같지만
 * 방/학생 개념이 없고, 필기·노트가 전부 이 화면 안의 로컬 상태로만 남아 있다가 나가면
 * 사라진다 (Firestore에 전혀 저장하지 않음).
 */
export default function PreviewViewerPage() {
  const { textbookId } = useParams<{ textbookId: string }>();
  const navigate = useNavigate();

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

  const [magnifierMode, setMagnifierMode] = useState(false);
  const [magnifierRect, setMagnifierRect] = useState<MagnifierRect>({ fx: 0.3, fy: 0.3, fw: 0.4, fh: 0.4 });

  const [whiteboardMode, setWhiteboardMode] = useState(false);
  const whiteboardRef = useRef<AnnotationLayerHandle>(null);
  const whiteboardHistoryMap = useRef<Map<number, Stroke[][]>>(new Map());
  const whiteboardFutureMap = useRef<Map<number, Stroke[][]>>(new Map());

  // 태블릿처럼 화면이 좁을 때는 목차 패널이 교재가 보일 자리를 너무 많이 차지해서
  // 교재 주변에 회색 여백이 크게 남는다. 넓은 화면(데스크톱)에서는 기본으로 열어 두고,
  // 좁은 화면에서는 기본으로 닫아서 교재가 최대한 크게 보이게 하고, 필요하면 툴바에서
  // 언제든 다시 열 수 있게 한다. 노트창은 별도 토글 없이 기본으로 켜져 있다가, 노트
  // 도구를 선택하면 자동으로 열리고(아래 effect), 안에 있는 ✕ 버튼으로 닫을 수 있다.
  const [showToc, setShowToc] = useState(() => window.innerWidth >= 1024);
  const [showNotes, setShowNotes] = useState(true);
  useEffect(() => {
    if (tool === "note") setShowNotes(true);
  }, [tool]);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 900, h: 600 });
  const pageRefs = useRef<Map<number, BookPageHandle>>(new Map());
  const textCache = useRef<Map<number, string>>(new Map());
  const historyMapRef = useRef<Map<number, Stroke[][]>>(new Map());
  const futureMapRef = useRef<Map<number, Stroke[][]>>(new Map());

  // 필기(그리기)와 노트, 둘 중 더 최근에 한 일을 실행취소 버튼 하나가 올바르게 되돌리도록
  // 전역 일련번호로 순서를 비교한다 (TextbookViewerPage와 동일한 방식, 저장만 안 할 뿐).
  const actionSeqRef = useRef(0);
  const nextActionSeq = () => ++actionSeqRef.current;
  const lastDrawAction = useRef<{ seq: number; page: number } | null>(null);
  const lastNoteAction = useRef<{ seq: number; page: number } | null>(null);
  const lastUndoneType = useRef<"note" | "draw" | null>(null);
  const lastUndonePage = useRef<number | null>(null);
  const notesHistoryMapRef = useRef<Map<number, { seq: number; prev: PlacedNote[] }[]>>(new Map());
  const notesFutureMapRef = useRef<Map<number, { seq: number; next: PlacedNote[] }[]>>(new Map());
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

        // printedPage(실제 인쇄된 쪽번호) 필드가 생기기 전에 이미 추출/저장된 목차는
        // 그 필드가 없어서 물리적 PDF 쪽번호가 대신 표시되는 문제가 있었다. 그런 옛
        // 데이터를 만나면 한 번 더 다시 추출해서 새 필드로 갱신한다.
        const needsReextract =
          doc.chapters.length === 0 || doc.chapters.some((c) => c.printedPage === undefined);
        if (needsReextract) {
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

  // pdf/textbook을 불러오는 동안은 로딩 화면만 그려져서 containerRef가 아직 DOM에
  // 붙지 않은 상태다. 의존성 배열이 비어 있으면 그 순간(el이 null)에 딱 한 번만 실행되고
  // 다시는 재실행되지 않아, 느린 네트워크(태블릿 등)에서는 실제 교재 화면이 뜬 뒤에도
  // 회색 영역 크기를 영영 측정하지 못해 항상 기본값(900x600)으로 계산되는 문제가 있었다.
  // pdf/textbook이 준비된 시점에 맞춰 재실행되도록 의존성에 넣어 이 경쟁 상태를 없앤다.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf, textbook]);

  // 손가락으로 꼬집어 축소해도 회색 영역에 맞춘 기본 크기(100%)보다 작아지지 않도록
  // 한다(사진 앱처럼 원래 크기 밑으로는 축소되지 않고 확대만 되는 느낌).
  usePinchZoom({
    scrollRef,
    contentRef,
    zoom,
    setZoom,
    minZoom: 1,
    maxZoom: MAX_ZOOM,
    enabled: !whiteboardMode && !magnifierMode && tool === "none",
  });

  const pagesToShow = useMemo(() => {
    if (viewMode === "single") return [currentPage];
    const start = spreadStart(currentPage);
    if (start === 1) return [1];
    const arr = [start];
    if (start + 1 <= numPages) arr.push(start + 1);
    return arr;
  }, [viewMode, currentPage, numPages]);

  // 표지 혼자일 때도 다음 스프레드와 같은 크기를 유지하기 위해 항상 2쪽 기준으로 계산한다.
  const layoutPageCount = viewMode === "spread" ? 2 : 1;
  const primaryPage = pagesToShow[0] ?? currentPage;

  useEffect(() => {
    commitNoteEditSession();
    setActiveNoteId(null);
    setActiveNotePage(primaryPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryPage]);

  const pushNoteHistory = (page: number, prevItems: PlacedNote[]) => {
    const stack = notesHistoryMapRef.current.get(page) ?? [];
    const seq = nextActionSeq();
    stack.push({ seq, prev: prevItems });
    if (stack.length > 50) stack.shift();
    notesHistoryMapRef.current.set(page, stack);
    notesFutureMapRef.current.set(page, []);
    lastNoteAction.current = { seq, page };
  };

  const commitNoteEditSession = () => {
    const session = noteEditSession.current;
    if (!session) return;
    clearTimeout(session.timer);
    noteEditSession.current = null;
    pushNoteHistory(session.page, session.preState);
  };

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
    const availW = Math.max(
      100,
      containerSize.w - CONTAINER_PADDING * 2 - PAGE_GAP * (pageCount - 1) - FIT_SAFETY_MARGIN,
    );
    const availH = Math.max(100, containerSize.h - CONTAINER_PADDING * 2 - FIT_SAFETY_MARGIN);
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

  const undoRedoTarget = () => {
    const target = lastDrawAction.current?.page;
    return target !== undefined && pageRefs.current.has(target) ? target : primaryPage;
  };

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
      lastUndoneType.current = null;
      return;
    }
    pageRefs.current.get(undoRedoTarget())?.redo();
    lastUndoneType.current = null;
  };

  const handleMagnifierConfirm = (el: HTMLDivElement) => {
    const targetZoom = Math.min(MAX_ZOOM, 1 / Math.max(magnifierRect.fw, magnifierRect.fh));
    setZoom(targetZoom);
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
    commitNoteEditSession();
    const id = `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const current = notesByPage.get(page) ?? [];
    pushNoteHistory(page, current);
    const next = [...current, { id, x, y, text: "" }];
    setNotesByPage((prev) => new Map(prev).set(page, next));
    setActiveNotePage(page);
    setActiveNoteId(id);
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
  };
  const handleChangeNoteFontSize = (id: string, fontSize: number) => {
    commitNoteEditSession();
    const current = notesByPage.get(activeNotePage) ?? [];
    pushNoteHistory(activeNotePage, current);
    const next = current.map((n) => (n.id === id ? { ...n, fontSize } : n));
    setNotesByPage((prev) => new Map(prev).set(activeNotePage, next));
  };
  const handleMoveNote = (page: number, id: string, x: number, y: number) => {
    touchNoteEditSession(page);
    const current = notesByPage.get(page) ?? [];
    const next = current.map((n) => (n.id === id ? { ...n, x, y } : n));
    setNotesByPage((prev) => new Map(prev).set(page, next));
  };
  const handleDeleteNote = (id: string) => {
    commitNoteEditSession();
    const current = notesByPage.get(activeNotePage) ?? [];
    pushNoteHistory(activeNotePage, current);
    const next = current.filter((n) => n.id !== id);
    setNotesByPage((prev) => new Map(prev).set(activeNotePage, next));
    if (activeNoteId === id) setActiveNoteId(null);
  };

  if (error) {
    return (
      <AppShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
          <p>{error}</p>
          <button className="btn-secondary" onClick={() => navigate("/preview")}>
            돌아가기
          </button>
        </div>
      </AppShell>
    );
  }

  if (!pdf || !textbook) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-slate-400">교재를 불러오는 중...</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      fullBleed
      badge={`체험 모드 · ${textbook.grade}학년`}
      right={
        <button className="btn-ghost" onClick={() => navigate("/preview")}>
          나가기
        </button>
      }
    >
      <div className="flex h-full flex-col">
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-700">
          🧪 교재 체험 모드예요. 여기서 한 필기와 메모는 저장되지 않아요.
        </div>
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
          showToc={showToc}
          onToggleToc={() => setShowToc((v) => !v)}
          readOnly={false}
        />

        <div className="flex flex-1 overflow-hidden">
          {!whiteboardMode && showToc && (
            <TocPanel
              title={textbook.title}
              chapters={textbook.chapters}
              currentPage={currentPage}
              onJump={jumpTo}
              onClose={() => setShowToc(false)}
            />
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
                    uid={PREVIEW_UID}
                    textbookId={textbookId!}
                    page={0}
                    width={Math.max(300, containerSize.w - CONTAINER_PADDING * 2)}
                    height={Math.max(300, containerSize.h - CONTAINER_PADDING * 2)}
                    tool={tool === "note" ? "none" : tool}
                    color={color}
                    eraserSize={eraserSize}
                    readOnly={false}
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
                <div ref={scrollRef} className="absolute inset-0 overflow-auto">
                  <div className="flex min-h-full p-1">
                    <div
                      ref={contentRef}
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
                            uid={PREVIEW_UID}
                            textbookId={textbookId!}
                            tool={tool}
                            color={color}
                            eraserSize={eraserSize}
                            readOnly={false}
                            onDraw={() => {
                              lastDrawAction.current = { seq: nextActionSeq(), page: n };
                            }}
                            historyMap={historyMapRef.current}
                            futureMap={futureMapRef.current}
                            persist={false}
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

                <button
                  className="absolute bottom-4 left-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-lg hover:bg-white"
                  title="이전 쪽"
                  onClick={goPrev}
                >
                  ◀
                </button>
                <button
                  className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-lg hover:bg-white"
                  title="다음 쪽"
                  onClick={goNext}
                >
                  ▶
                </button>
              </>
            )}
          </div>

          {!whiteboardMode && showNotes && (
            <NotesPanel
              items={notesByPage.get(activeNotePage) ?? []}
              activeId={activeNoteId}
              readOnly={false}
              noteToolActive={tool === "note"}
              onSelect={(id) => setActiveNoteId(id)}
              onChangeText={handleUpdateNoteText}
              onChangeFontSize={handleChangeNoteFontSize}
              onDelete={handleDeleteNote}
              onClose={() => setShowNotes(false)}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
