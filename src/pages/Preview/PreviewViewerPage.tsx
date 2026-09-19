import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { PhoneScaleFit, isPhoneViewport } from "@/components/PhoneScaleFit";
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
import type { ActivityZone } from "@/pages/TextbookViewer/activityZones";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 7;
const PAGE_GAP = 0;
const CONTAINER_PADDING = 4;
const FIT_SAFETY_MARGIN = 6;
// 쪽을 처음 펼칠 때 PDF를 미리 그려 둘 기본 배율(줌=1 기준의 몇 배 해상도로).
// 평소 읽기+약간의 확대까지는 이 정도면 충분히 선명하고, 태블릿에서도 부담 없다.
const INITIAL_RENDER_ZOOM_CAP = 2;
// 손가락 제스처(핀치)로 계속 확대하는 동안, 배율이 늘어날 때마다 PDF를 그 배율
// 기준으로 다시 그리면(캔버스 재렌더링) 매 프레임 무거운 작업이 끼어들어 뚝뚝
// 끊기는 현상이 있었다(특히 이 값을 넘어서부터 두드러짐). 그래서 다시 그리는
// 것은 이 배율까지만 하고, 그 이상은 이미 그려 둔 것을 CSS로 더 키우기만 한다 -
// 화질은 조금 흐려지지만 계속 다시 그리느라 끊기지는 않는다.
const RENDER_ZOOM_CEILING = 3.5;

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
  // 좁은 화면(태블릿)에서는 기본으로 닫아서 교재가 최대한 크게 보이게 하고, 필요하면
  // 툴바에서 언제든 다시 열 수 있게 한다. 핸드폰(태블릿 레이아웃을 통째로 축소해서
  // 보여주는 PhoneScaleFit 모드)에서는 반대로 목차를 기본으로 열고 노트창은 닫아
  // 둔다 - 화면이 작아 노트창까지 펼치면 교재가 너무 작게 보이고, 처음 들어왔을 때
  // 어디로 이동할지부터 볼 수 있는 목차가 더 유용하다.
  const [showToc, setShowToc] = useState(() => isPhoneViewport() || window.innerWidth >= 1024);
  const [showNotes, setShowNotes] = useState(() => !isPhoneViewport());

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
  const pagesKey = pagesToShow.join(",");

  // 쪽을 넘길 때마다 그 쪽이(PdfPageCanvas가 최소 한 번 그려서 onSize를 부를
  // 때까지) 다 준비되기 전에는 화면 가운데 로딩 표시를 띄운다 - 그 전에 만지면
  // 확대/스크롤이 버벅이므로, 로딩 중에는 조작을 막아 둔다. pagesKey가 바뀐 걸
  // useEffect로 뒤늦게 알아채면 새 쪽이 잠깐 준비 안 된 채로 조작 가능해 보이는
  // 틈이 생기므로, 렌더링 중에 바로 알아채서(리액트의 "렌더 중 상태 조정" 패턴)
  // 그 쪽을 처음 그릴 때부터 바로 로딩 표시가 켜져 있게 한다.
  const [pageLoading, setPageLoading] = useState(true);
  const [loadingForKey, setLoadingForKey] = useState(pagesKey);
  const readyPagesRef = useRef<Set<number>>(new Set());
  if (loadingForKey !== pagesKey) {
    setLoadingForKey(pagesKey);
    readyPagesRef.current = new Set();
    setPageLoading(true);
  }
  const handlePageReady = (n: number) => {
    readyPagesRef.current.add(n);
    if (pagesToShow.every((p) => readyPagesRef.current.has(p))) setPageLoading(false);
  };

  // 표지 혼자일 때도 다음 스프레드와 같은 크기를 유지하기 위해 항상 2쪽 기준으로 계산한다.
  const layoutPageCount = viewMode === "spread" ? 2 : 1;
  const primaryPage = pagesToShow[0] ?? currentPage;

  useEffect(() => {
    commitNoteEditSession();
    setActiveNoteId(null);
    setActiveNotePage(primaryPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryPage]);

  // 툴바에 보여줄 쪽수는 PDF 파일 안에서의 물리적 순번이 아니라, 교재에 실제로 인쇄된
  // 쪽번호와 맞아야 한다(둘이 보통 다르다 — 표지/차례 등 앞부분 때문에). 목차에 이미
  // "물리적 쪽번호 -> 인쇄된 쪽번호" 오프셋 정보가 들어 있으니(printedPage), 지금 쪽에
  // 가장 가까운 단원의 오프셋을 그대로 가져다 쓴다.
  const printedOffset = useMemo(() => {
    const withPrinted = (textbook?.chapters ?? []).filter((c) => c.printedPage !== undefined);
    if (withPrinted.length === 0) return 0;
    const active = [...withPrinted].reverse().find((c) => c.startPage <= primaryPage) ?? withPrinted[0];
    return active.startPage - (active.printedPage as number);
  }, [textbook, primaryPage]);
  const printedCurrentPage = Math.max(1, primaryPage - printedOffset);
  const printedNumPages = Math.max(printedCurrentPage, numPages - printedOffset);

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

  // fitWidth는 줌과 무관하게 "회색 영역에 꼭 맞는 기본 크기"다. 실제 보여줄 크기
  // (boxWidth)는 여기에 zoom을 곱한 값이다.
  const fitWidth = useMemo(() => {
    const pageCount = layoutPageCount;
    const availW = Math.max(
      100,
      containerSize.w - CONTAINER_PADDING * 2 - PAGE_GAP * (pageCount - 1) - FIT_SAFETY_MARGIN,
    );
    const availH = Math.max(100, containerSize.h - CONTAINER_PADDING * 2 - FIT_SAFETY_MARGIN);
    const perPageMaxW = availW / pageCount;
    const widthFromHeight = availH / aspect;
    return Math.max(120, Math.min(perPageMaxW, widthFromHeight));
  }, [containerSize, aspect, layoutPageCount]);
  const boxWidth = fitWidth * zoom;
  // PdfPageCanvas가 한 번 그려 둘 최대 해상도 기준. 예전에는 무조건 MAX_ZOOM(8배)
  // 기준으로 미리 그려 뒀는데, 그러면 확대를 전혀 안 하고 그냥 넘겨보기만 해도
  // 모든 쪽을 8배 해상도로 렌더링하게 되어(태블릿의 캔버스 메모리 한도를 계속
  // 최대치로 채움) 로딩이 오래 걸리고 특히 태블릿에서 페이지를 넘기다 브라우저가
  // 죽는 원인이 됐다. 대신 처음엔 평소 읽기에 충분한 배율로만 그려 두고, 실제로
  // 그 배율을 넘어서게 확대할 때만(활동 확대, 돋보기, +버튼 등) 그때 필요한 만큼으로
  // 한 번 더 그린다. 같은 쪽에 머무는 동안은 줄어들지 않고 늘어나기만 해서(확대했다
  // 살짝 축소해도 다시 흐려지지 않음), 다른 쪽으로 넘어가면(currentPage 변경) 그
  // 쪽에서 새로 판단하도록 초기화한다 - 안 그러면 어느 한 쪽에서 크게 확대해 본
  // 뒤로는 계속 다른 모든 쪽까지 불필요하게 고해상도로 그려지게 된다.
  const [renderZoomCap, setRenderZoomCap] = useState(INITIAL_RENDER_ZOOM_CAP);
  // 쪽이 바뀐 걸 useEffect로 뒤늦게 알아채면, 새 쪽이 이미 예전 쪽의(높을 수 있는)
  // 배율로 한 번 그려진 뒤에야 낮은 배율로 다시 그려져서 - 태블릿에 부담을 주는
  // 비싼 고해상도 렌더링을 오히려 한 번 더 하게 된다. 그래서 렌더링 중에 바로
  // 알아채서(리액트의 "렌더 중 상태 조정" 패턴) 새 쪽을 처음 그릴 때부터 바로
  // 맞는 배율을 쓰게 한다.
  const [renderCapPage, setRenderCapPage] = useState(currentPage);
  if (renderCapPage !== currentPage) {
    setRenderCapPage(currentPage);
    setRenderZoomCap(Math.min(RENDER_ZOOM_CEILING, Math.max(INITIAL_RENDER_ZOOM_CAP, zoom)));
  }
  useEffect(() => {
    setRenderZoomCap((cap) => Math.max(cap, Math.min(RENDER_ZOOM_CEILING, zoom)));
  }, [zoom]);
  const maxBoxWidth = fitWidth * renderZoomCap;
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

  // +/- 버튼으로 확대·축소할 때, 지금 화면 한가운데 보이던 지점이 계속 한가운데
  // 있도록 스크롤을 보정한다(핀치줌이 손가락 사이 지점을 고정하는 것과 같은 원리).
  // 이게 없으면 스크롤 위치(scrollLeft/Top)는 그대로인데 콘텐츠만 커져서, 이미
  // 활동/그림을 확대해 본 상태에서 +/-를 누르면 화면이 그 콘텐츠의 왼쪽 위 방향으로
  // 쏠려 보인다.
  const handleZoomChange = (delta: number) => {
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) {
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
      return;
    }
    const containerRect = scrollEl.getBoundingClientRect();
    const contentRectBefore = contentEl.getBoundingClientRect();
    const cx = containerRect.left + containerRect.width / 2;
    const cy = containerRect.top + containerRect.height / 2;
    const fx = contentRectBefore.width > 0 ? (cx - contentRectBefore.left) / contentRectBefore.width : 0.5;
    const fy = contentRectBefore.height > 0 ? (cy - contentRectBefore.top) / contentRectBefore.height : 0.5;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const contentRectAfter = contentEl.getBoundingClientRect();
        const targetX = contentRectAfter.left + fx * contentRectAfter.width;
        const targetY = contentRectAfter.top + fy * contentRectAfter.height;
        scrollEl.scrollLeft += targetX - cx;
        scrollEl.scrollTop += targetY - cy;
      });
    });
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

  // pageEl은 반드시 "확대해도 절대 사라지지 않는" 안정적인 요소여야 한다 - hover/누름
  // 상태에 따라 조건부로 렌더링되는 미리보기 테두리 div 등을 넘기면, setZoom으로 인한
  // 리렌더 사이에 그 요소가 DOM에서 떨어져 나가 getBoundingClientRect가 전부 0을
  // 반환하면서 "항상 맨 위 왼쪽으로 확대되는" 버그가 생긴다. 그래서 실제 영역의 위치는
  // DOM에서 다시 재는 대신, 이미 알고 있는 비율(rect)과 페이지 요소의 현재 크기로
  // 계산한다.
  const zoomToRect = (
    rect: { x: number; y: number; w: number; h: number },
    pageEl: HTMLElement,
    align?: "left" | "right" | "center",
    // rect의 x/y/w/h(0-1 비율)가 기준으로 삼는, 줌=1일 때의 너비/높이. 활동
    // 단계/사진처럼 쪽 하나를 기준으로 한 비율이면 그 쪽의 fitWidth/fitWidth*aspect,
    // 돋보기처럼 두 쪽이 나란한 스프레드 전체를 기준으로 한 비율이면 스프레드 전체의
    // 줌=1 너비를 넘겨야 한다(기본값은 쪽 하나 기준).
    unitWidth: number = fitWidth,
    unitHeight: number = fitWidth * aspect,
  ) => {
    // 이 영역이 회색 화면(컨테이너)에 꽉 차도록 하는 배율을 "contain" 방식으로 구한다.
    // fitWidth(줌=1일 때 쪽 너비)는 컨테이너의 가로/세로 중 더 좁게 맞춰지는 쪽 기준이라
    // 남는 여백이 있을 수 있으므로, 단순히 "1/영역비율"만으로는 부족할 때가 있다 - 실제
    // 컨테이너 크기(availW/availH) 기준으로 가로/세로 각각 꽉 채우는 배율을 구해 더 작은
    // 쪽(=잘리지 않는 쪽)을 택한다.
    const availW = Math.max(50, containerSize.w - CONTAINER_PADDING * 2 - FIT_SAFETY_MARGIN);
    const availH = Math.max(50, containerSize.h - CONTAINER_PADDING * 2 - FIT_SAFETY_MARGIN);
    const zoomForWidth = availW / (rect.w * unitWidth);
    const zoomForHeight = availH / (rect.h * unitHeight);
    const targetZoom = Math.min(MAX_ZOOM, zoomForWidth, zoomForHeight);
    setZoom(targetZoom);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        const containerRect = scrollEl.getBoundingClientRect();
        const pageRect = pageEl.getBoundingClientRect();
        const zoneLeft = pageRect.left + rect.x * pageRect.width;
        const zoneTop = pageRect.top + rect.y * pageRect.height;
        const zoneWidth = rect.w * pageRect.width;
        const zoneHeight = rect.h * pageRect.height;
        const deltaY = zoneTop + zoneHeight / 2 - (containerRect.top + containerRect.height / 2);
        const deltaX =
          align === "left"
            ? pageRect.left - containerRect.left
            : align === "right"
              ? pageRect.right - containerRect.right
              : zoneLeft + zoneWidth / 2 - (containerRect.left + containerRect.width / 2);
        scrollEl.scrollLeft += deltaX;
        scrollEl.scrollTop += deltaY;
      });
    });
  };

  const handleMagnifierConfirm = () => {
    // 돋보기 박스는 (책 한 쪽이 아니라) 두 쪽이 나란한 스프레드 전체를 덮는 하나의
    // 오버레이라서(MagnifierOverlay의 boxWidth={spreadWidth}), fx/fy/fw/fh는 그
    // 스프레드 전체를 기준으로 한 비율이다. el(눌린 박스 자신)은 어떤 쪽의
    // .shadow-inner 안에도 속하지 않는 형제 요소라 el.closest(".shadow-inner")로는
    // 절대 페이지를 찾을 수 없고(항상 null), 대신 스프레드 전체를 담는 contentRef를
    // 기준 요소로 써야 한다 - 아니면 el 자신(작은 돋보기 박스)이 기준이 되어 버려
    // 완전히 엉뚱한 위치로 확대되는 문제가 있었다.
    const pageEl = contentRef.current;
    if (!pageEl) return;
    const spreadUnitWidth = fitWidth * layoutPageCount + PAGE_GAP * (layoutPageCount - 1);
    zoomToRect(
      { x: magnifierRect.fx, y: magnifierRect.fy, w: magnifierRect.fw, h: magnifierRect.fh },
      pageEl,
      undefined,
      spreadUnitWidth,
      fitWidth * aspect,
    );
    setMagnifierMode(false);
  };

  const handleActivateZone = (
    zone: ActivityZone,
    el: HTMLDivElement,
    pageNumber: number,
    kind: "step" | "sub" | "img",
  ) => {
    // el(트리거를 눌렀을 때 보이는 미리보기 테두리)은 확대 도중 사라질 수 있으니, 절대
    // 사라지지 않는 쪽 컨테이너(.shadow-inner)를 지금 미리 찾아 안전하게 넘긴다.
    const pageEl = (el.closest(".shadow-inner") as HTMLElement | null) ?? el;
    // 사진은 책등 기준 정렬 없이, 확대한 사진의 정중앙이 회색 화면 정중앙에 오도록 한다.
    if (kind === "img") {
      zoomToRect(zone.target, pageEl, "center");
      return;
    }
    const align =
      viewMode === "spread" && pagesToShow.length === 2
        ? pageNumber === spreadStart(pageNumber)
          ? "left"
          : "right"
        : undefined;
    zoomToRect(zone.target, pageEl, align);
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
      <PhoneScaleFit>
        <AppShell>
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <p>{error}</p>
            <button className="btn-secondary" onClick={() => navigate("/preview")}>
              돌아가기
            </button>
          </div>
        </AppShell>
      </PhoneScaleFit>
    );
  }

  if (!pdf || !textbook) {
    return (
      <PhoneScaleFit>
        <AppShell>
          <div className="flex h-full items-center justify-center text-slate-400">교재를 불러오는 중...</div>
        </AppShell>
      </PhoneScaleFit>
    );
  }

  return (
    <PhoneScaleFit>
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
          showNotes={showNotes}
          onToggleNotes={() => setShowNotes((v) => !v)}
          currentPage={printedCurrentPage}
          numPages={printedNumPages}
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
                    renderWidth={Math.max(300, containerSize.w - CONTAINER_PADDING * 2)}
                    renderHeight={Math.max(300, containerSize.h - CONTAINER_PADDING * 2)}
                    displayWidth={Math.max(300, containerSize.w - CONTAINER_PADDING * 2)}
                    displayHeight={Math.max(300, containerSize.h - CONTAINER_PADDING * 2)}
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
                            maxBoxWidth={maxBoxWidth}
                            maxBoxHeight={maxBoxWidth * aspect}
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
                            onActivateZone={handleActivateZone}
                            onPageReady={() => handlePageReady(n)}
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

            {/* 쪽을 넘기면 그 쪽이 실제로 다 그려질 때까지(확대·스크롤이 버벅이지
                않을 정도로 안정될 때까지) 가운데에 로딩 표시를 띄우고 조작을 막는다. */}
            {!whiteboardMode && pageLoading && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60">
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-lg">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
                  <p className="text-sm font-semibold text-slate-600">불러오는 중...</p>
                </div>
              </div>
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
              onAddNote={() => setTool((t) => (t === "note" ? "none" : "note"))}
            />
          )}
        </div>
      </div>
    </AppShell>
    </PhoneScaleFit>
  );
}
