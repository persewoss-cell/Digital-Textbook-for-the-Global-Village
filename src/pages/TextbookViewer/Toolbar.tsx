import { useState } from "react";
import type { AnnotationTool } from "./AnnotationLayer";

export interface SearchResult {
  page: number;
  snippet: string;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

export function Toolbar({
  viewMode,
  onViewModeChange,
  zoomIndex,
  zoomLevels,
  onZoomChange,
  currentPage,
  totalPages,
  onPrev,
  onNext,
  onJump,
  tool,
  onToolChange,
  color,
  onColorChange,
  onClearPage,
  bookmarked,
  onToggleBookmark,
  isSpeaking,
  onToggleTTS,
  onSearch,
  searchResults,
  onJumpToResult,
  highContrast,
  onToggleHighContrast,
  rulerOn,
  onToggleRuler,
  onPrint,
  readOnly,
}: {
  viewMode: "single" | "spread";
  onViewModeChange: (m: "single" | "spread") => void;
  zoomIndex: number;
  zoomLevels: number[];
  onZoomChange: (i: number) => void;
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (page: number) => void;
  tool: AnnotationTool;
  onToolChange: (t: AnnotationTool) => void;
  color: string;
  onColorChange: (c: string) => void;
  onClearPage: () => void;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  isSpeaking: boolean;
  onToggleTTS: () => void;
  onSearch: (q: string) => void;
  searchResults: SearchResult[];
  onJumpToResult: (page: number) => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  rulerOn: boolean;
  onToggleRuler: () => void;
  onPrint: () => void;
  readOnly: boolean;
}) {
  const [jumpValue, setJumpValue] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
      {/* page nav */}
      <div className="flex items-center gap-1">
        <button className="btn-ghost px-2" title="이전 쪽" onClick={onPrev}>
          ◀
        </button>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(jumpValue);
            if (n >= 1 && n <= totalPages) onJump(n);
            setJumpValue("");
          }}
        >
          <input
            className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
            placeholder={`${currentPage}`}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </form>
        <span className="text-sm text-slate-500">/ {totalPages}쪽</span>
        <button className="btn-ghost px-2" title="다음 쪽" onClick={onNext}>
          ▶
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {/* view mode */}
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        <button
          className={`px-2 py-1 text-xs font-semibold ${viewMode === "spread" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
          onClick={() => onViewModeChange("spread")}
          title="두 쪽 보기"
        >
          두쪽
        </button>
        <button
          className={`px-2 py-1 text-xs font-semibold ${viewMode === "single" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
          onClick={() => onViewModeChange("single")}
          title="한 쪽 크게 보기"
        >
          한쪽
        </button>
      </div>

      {/* zoom */}
      <div className="flex items-center gap-1">
        <button
          className="btn-ghost px-2"
          title="축소"
          onClick={() => onZoomChange(Math.max(0, zoomIndex - 1))}
        >
          －
        </button>
        <span className="w-10 text-center text-xs text-slate-500">
          {Math.round(zoomLevels[zoomIndex] * 100)}%
        </span>
        <button
          className="btn-ghost px-2"
          title="확대"
          onClick={() => onZoomChange(Math.min(zoomLevels.length - 1, zoomIndex + 1))}
        >
          ＋
        </button>
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {!readOnly && (
        <>
          {/* annotation tools */}
          <div className="flex items-center gap-1">
            <button
              className={`btn-ghost px-2 ${tool === "pen" ? "bg-brand-100 text-brand-700" : ""}`}
              title="펜"
              onClick={() => onToolChange(tool === "pen" ? "none" : "pen")}
            >
              ✏️
            </button>
            <button
              className={`btn-ghost px-2 ${tool === "highlighter" ? "bg-brand-100 text-brand-700" : ""}`}
              title="형광펜"
              onClick={() => onToolChange(tool === "highlighter" ? "none" : "highlighter")}
            >
              🖍️
            </button>
            {COLORS.map((c) => (
              <button
                key={c}
                className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-slate-700" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                onClick={() => onColorChange(c)}
                title="색상 선택"
              />
            ))}
            <button className="btn-ghost px-2 text-xs" title="이 쪽 필기 지우기" onClick={onClearPage}>
              지우기
            </button>
          </div>
          <div className="mx-1 h-5 w-px bg-slate-200" />
        </>
      )}

      {/* bookmark */}
      <button
        className={`btn-ghost px-2 ${bookmarked ? "text-amber-500" : ""}`}
        title="책갈피"
        onClick={onToggleBookmark}
      >
        {bookmarked ? "★" : "☆"}
      </button>

      {/* TTS */}
      <button className={`btn-ghost px-2 ${isSpeaking ? "text-brand-600" : ""}`} title="읽어주기" onClick={onToggleTTS}>
        {isSpeaking ? "⏹ 읽기중지" : "🔊 읽어주기"}
      </button>

      {/* search */}
      <div className="relative">
        <button className="btn-ghost px-2" title="검색" onClick={() => setSearchOpen((v) => !v)}>
          🔍
        </button>
        {searchOpen && (
          <div className="absolute left-0 top-9 z-20 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearch(query);
              }}
              className="mb-2 flex gap-1"
            >
              <input
                className="input"
                placeholder="교재 내 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="btn-secondary px-3" type="submit">
                검색
              </button>
            </form>
            <div className="max-h-48 space-y-1 overflow-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  className="block w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-100"
                  onClick={() => {
                    onJumpToResult(r.page);
                    setSearchOpen(false);
                  }}
                >
                  <span className="font-semibold text-brand-700">{r.page}쪽</span> {r.snippet}
                </button>
              ))}
              {searchResults.length === 0 && query && (
                <p className="px-2 py-1 text-xs text-slate-400">검색 결과가 없어요.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {/* accessibility */}
      <button
        className={`btn-ghost px-2 text-xs ${highContrast ? "bg-slate-800 text-white" : ""}`}
        title="고대비 모드"
        onClick={onToggleHighContrast}
      >
        고대비
      </button>
      <button
        className={`btn-ghost px-2 text-xs ${rulerOn ? "bg-brand-100 text-brand-700" : ""}`}
        title="읽기 자"
        onClick={onToggleRuler}
      >
        읽기자
      </button>
      <button className="btn-ghost px-2" title="인쇄" onClick={onPrint}>
        🖨️
      </button>
    </div>
  );
}
