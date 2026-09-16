import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ref, getDownloadURL } from "firebase/storage";
import type { PDFDocumentProxy } from "pdfjs-dist";
import HTMLFlipBook from "react-pageflip-enhanced";
import { storage } from "@/firebase";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/components/AppShell";
import {
  getTextbook,
  saveAnnotation,
  toggleBookmark,
  updateProgress,
  watchBookmarks,
} from "@/lib/firestore";
import { extractPageText, loadPdf } from "@/lib/pdf";
import type { StudentBookmarkDoc, TextbookDoc } from "@/types";
import { BookPage } from "./BookPage";
import { Toolbar, type SearchResult } from "./Toolbar";
import { TocPanel } from "./TocPanel";
import { NotesPanel } from "./NotesPanel";
import type { AnnotationTool } from "./AnnotationLayer";

const ZOOM_LEVELS = [0.7, 0.85, 1, 1.15, 1.3, 1.5];
const BASE_WIDTH = 420;

export default function TextbookViewerPage() {
  const { textbookId } = useParams<{ textbookId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation() as { state?: { studentName?: string } };
  const navigate = useNavigate();
  const { userDoc } = useAuth();

  const asUid = searchParams.get("asUid");
  const readOnly = Boolean(asUid);
  const effectiveUid = asUid || userDoc?.uid || "";

  const [textbook, setTextbook] = useState<TextbookDoc | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [aspect, setAspect] = useState(1.41); // height/width fallback (A4-ish)
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"single" | "spread">("spread");
  const [zoomIndex, setZoomIndex] = useState(2);
  const [tool, setTool] = useState<AnnotationTool>("none");
  const [color, setColor] = useState("#ef4444");
  const [highContrast, setHighContrast] = useState(false);
  const [rulerOn, setRulerOn] = useState(false);
  const [rulerY, setRulerY] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<StudentBookmarkDoc[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const flipRef = useRef<{
    pageFlip: () => {
      flip: (page: number) => void;
      flipNext: () => void;
      flipPrev: () => void;
    };
  } | null>(null);
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
        const url = await getDownloadURL(ref(storage, doc.storagePath));
        const pdfDoc = await loadPdf(url);
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
    if (!effectiveUid || !textbookId) return;
    return watchBookmarks(effectiveUid, textbookId, setBookmarks);
  }, [effectiveUid, textbookId]);

  const boxWidth = BASE_WIDTH * ZOOM_LEVELS[zoomIndex];
  const boxHeight = boxWidth * aspect;

  const bookmarkedCurrent = bookmarks.some((b) => b.page === currentPage);

  const handleFlip = (e: { data: number }) => {
    const page = e.data + 1;
    setCurrentPage(page);
    if (!readOnly && userDoc) {
      void updateProgress(effectiveUid, textbookId!, page, numPages);
    }
  };

  const jumpTo = (page: number) => {
    const clamped = Math.max(1, Math.min(numPages, page));
    flipRef.current?.pageFlip().flip(clamped - 1);
    setCurrentPage(clamped);
  };

  const handleToggleBookmark = async () => {
    if (readOnly || !textbookId) return;
    await toggleBookmark(effectiveUid, textbookId, currentPage, !bookmarkedCurrent);
  };

  const handleToggleTTS = () => {
    if (!pdf) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    (async () => {
      const text = textCache.current.get(currentPage) ?? (await extractPageText(pdf, currentPage));
      textCache.current.set(currentPage, text);
      if (!text.trim()) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ko-KR";
      utter.rate = 0.95;
      utter.onend = () => setIsSpeaking(false);
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      setIsSpeaking(true);
    })();
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

  const handleClearPage = async () => {
    if (readOnly || !textbookId) return;
    await saveAnnotation(effectiveUid, textbookId, currentPage, []);
  };

  const pages = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

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

  if (!pdf || !textbook) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center text-slate-400">교재를 불러오는 중...</div>
      </AppShell>
    );
  }

  return (
    <AppShell fullBleed>
      <div className="flex h-full flex-col">
        {readOnly && (
          <div className="bg-amber-50 px-4 py-1.5 text-center text-xs font-semibold text-amber-700">
            👀 {location.state?.studentName ?? "학생"}의 학습 화면을 보고 있어요 (읽기 전용)
          </div>
        )}
        <Toolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          zoomIndex={zoomIndex}
          zoomLevels={ZOOM_LEVELS}
          onZoomChange={setZoomIndex}
          currentPage={currentPage}
          totalPages={numPages}
          onPrev={() => flipRef.current?.pageFlip().flipPrev()}
          onNext={() => flipRef.current?.pageFlip().flipNext()}
          onJump={jumpTo}
          tool={tool}
          onToolChange={setTool}
          color={color}
          onColorChange={setColor}
          onClearPage={handleClearPage}
          bookmarked={bookmarkedCurrent}
          onToggleBookmark={handleToggleBookmark}
          isSpeaking={isSpeaking}
          onToggleTTS={handleToggleTTS}
          onSearch={handleSearch}
          searchResults={searchResults}
          onJumpToResult={jumpTo}
          highContrast={highContrast}
          onToggleHighContrast={() => setHighContrast((v) => !v)}
          rulerOn={rulerOn}
          onToggleRuler={() => setRulerOn((v) => !v)}
          onPrint={() => window.print()}
          readOnly={readOnly}
        />

        <div className="flex flex-1 overflow-hidden">
          <TocPanel
            title={textbook.title}
            chapters={textbook.chapters}
            currentPage={currentPage}
            onJump={jumpTo}
            bookmarks={bookmarks}
          />

          <div
            className="relative flex flex-1 items-center justify-center overflow-auto bg-slate-200 p-8"
            onMouseMove={(e) => rulerOn && setRulerY(e.clientY - e.currentTarget.getBoundingClientRect().top)}
            onMouseLeave={() => setRulerY(null)}
          >
            <HTMLFlipBook
              ref={flipRef}
              width={boxWidth}
              height={boxHeight}
              size="fixed"
              minWidth={200}
              maxWidth={900}
              minHeight={280}
              maxHeight={1200}
              singlePage={viewMode === "single"}
              showCover={false}
              drawShadow
              flippingTime={500}
              className="shadow-2xl"
              onFlip={handleFlip}
              useMouseEvents
            >
              {pages.map((n) => (
                <BookPage
                  key={n}
                  pdf={pdf}
                  pageNumber={n}
                  boxWidth={boxWidth}
                  boxHeight={boxHeight}
                  uid={effectiveUid}
                  textbookId={textbookId!}
                  tool={tool}
                  color={color}
                  readOnly={readOnly}
                  bookmarked={bookmarks.some((b) => b.page === n)}
                  highContrast={highContrast}
                />
              ))}
            </HTMLFlipBook>

            {rulerOn && rulerY !== null && (
              <div
                className="pointer-events-none absolute left-0 right-0 h-10 bg-yellow-200/40 mix-blend-multiply"
                style={{ top: rulerY - 20 }}
              />
            )}
          </div>

          <NotesPanel
            uid={effectiveUid}
            textbookId={textbookId!}
            page={currentPage}
            readOnly={readOnly}
            studentLabel={readOnly ? location.state?.studentName : undefined}
          />
        </div>
      </div>
    </AppShell>
  );
}
