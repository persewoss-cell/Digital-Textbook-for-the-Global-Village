import { useState } from "react";
import type { AnnotationTool, ShapeTool } from "@/types";

const SHAPE_TOOLS: { tool: ShapeTool; icon: string; title: string }[] = [
  { tool: "line", icon: "／", title: "직선" },
  { tool: "rectangle", icon: "▭", title: "사각형" },
  { tool: "circle", icon: "◯", title: "원" },
];

export interface SearchResult {
  page: number;
  snippet: string;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];
const ERASER_SIZES = [
  { label: "S", value: 6 },
  { label: "M", value: 10 },
  { label: "L", value: 16 },
];

export function Toolbar({
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
  tool,
  onToolChange,
  color,
  onColorChange,
  eraserSize,
  onEraserSizeChange,
  onUndo,
  onRedo,
  onSearch,
  searchResults,
  onJumpToResult,
  onCapture,
  magnifierMode,
  onToggleMagnifier,
  onZoomReset,
  readOnly,
}: {
  viewMode: "single" | "spread";
  onViewModeChange: (m: "single" | "spread") => void;
  zoom: number;
  onZoomChange: (delta: number) => void;
  tool: AnnotationTool;
  onToolChange: (t: AnnotationTool) => void;
  color: string;
  onColorChange: (c: string) => void;
  eraserSize: number;
  onEraserSizeChange: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: (q: string) => void;
  searchResults: SearchResult[];
  onJumpToResult: (page: number) => void;
  onCapture: () => void;
  magnifierMode: boolean;
  onToggleMagnifier: () => void;
  onZoomReset: () => void;
  readOnly: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
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
        <button className="btn-ghost px-2" title="축소" onClick={() => onZoomChange(-0.2)}>
          －
        </button>
        <span className="w-10 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost px-2" title="확대" onClick={() => onZoomChange(0.2)}>
          ＋
        </button>
        <button
          className={`btn-ghost px-2 ${magnifierMode ? "bg-brand-100 text-brand-700" : ""}`}
          title="부분만 크게 보기(돋보기)"
          onClick={onToggleMagnifier}
        >
          🔍
        </button>
        {zoom !== 1 && (
          <button className="btn-ghost px-2 text-xs" title="원래 크기로" onClick={onZoomReset}>
            ↺100%
          </button>
        )}
      </div>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      {!readOnly && (
        <>
          {/* annotation tools */}
          <div className="flex items-center gap-1">
            <button
              className={`btn-ghost px-2 ${tool === "pen" ? "bg-brand-100 text-brand-700" : ""}`}
              title="연필"
              onClick={() => onToolChange(tool === "pen" ? "none" : "pen")}
            >
              ✏️
            </button>
            <button
              className={`btn-ghost px-2 ${tool === "colorPen" ? "bg-brand-100 text-brand-700" : ""}`}
              title="색펜"
              onClick={() => onToolChange(tool === "colorPen" ? "none" : "colorPen")}
            >
              🖊️
            </button>
            {SHAPE_TOOLS.map((s) => (
              <button
                key={s.tool}
                className={`btn-ghost px-2 ${tool === s.tool ? "bg-brand-100 text-brand-700" : ""}`}
                title={s.title}
                onClick={() => onToolChange(tool === s.tool ? "none" : s.tool)}
              >
                {s.icon}
              </button>
            ))}
            {(tool === "colorPen" || tool === "rectangle" || tool === "circle" || tool === "line") &&
              COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-slate-700" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => onColorChange(c)}
                  title="색상 선택"
                />
              ))}
            <button
              className={`btn-ghost px-2 ${tool === "eraser" ? "bg-brand-100 text-brand-700" : ""}`}
              title="지우개"
              onClick={() => onToolChange(tool === "eraser" ? "none" : "eraser")}
            >
              🧽
            </button>
            {tool === "eraser" &&
              ERASER_SIZES.map((s) => (
                <button
                  key={s.value}
                  className={`rounded-lg px-1.5 text-xs font-semibold ${eraserSize === s.value ? "bg-brand-100 text-brand-700" : "text-slate-500"}`}
                  onClick={() => onEraserSizeChange(s.value)}
                >
                  {s.label}
                </button>
              ))}
            <button
              className="btn-ghost px-2 disabled:opacity-30"
              title="실행 취소"
              onClick={onUndo}
            >
              ↶
            </button>
            <button className="btn-ghost px-2 disabled:opacity-30" title="다시 실행" onClick={onRedo}>
              ↷
            </button>
            <button
              className={`btn-ghost px-2 text-xs ${tool === "note" ? "bg-brand-100 text-brand-700" : ""}`}
              title="노트(빈칸에 글쓰기)"
              onClick={() => onToolChange(tool === "note" ? "none" : "note")}
            >
              📝 노트
            </button>
          </div>
          <div className="mx-1 h-5 w-px bg-slate-200" />
        </>
      )}

      {/* search */}
      <div className="relative">
        <button className="btn-ghost px-2" title="검색" onClick={() => setSearchOpen((v) => !v)}>
          🔎
        </button>
        {searchOpen && (
          <div className="absolute left-0 top-9 z-20 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearch(query);
              }}
              className="mb-2 flex flex-nowrap items-center gap-1"
            >
              <input
                className="input min-w-0 flex-1"
                placeholder="교재 내 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button className="btn-secondary shrink-0 whitespace-nowrap px-3" type="submit">
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

      <button className="btn-ghost px-2" title="이 쪽 캡처 저장" onClick={onCapture}>
        📷 캡처저장
      </button>
    </div>
  );
}
