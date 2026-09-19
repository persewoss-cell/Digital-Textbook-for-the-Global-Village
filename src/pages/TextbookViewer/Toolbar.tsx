import { useId, useState } from "react";
import { PEN_STYLES, type AnnotationTool, type PenStyleId, type ShapeTool } from "@/types";
import { SHAPE_TOOLS as SHAPE_TOOL_ORDER } from "./AnnotationLayer";

const SHAPE_META: Record<ShapeTool, { icon: string; title: string }> = {
  line: { icon: "／", title: "직선" },
  arrow: { icon: "➔", title: "화살표" },
  rectangle: { icon: "▭", title: "사각형" },
  triangle: { icon: "△", title: "삼각형" },
  circle: { icon: "◯", title: "원" },
};
const SHAPE_TOOLS = SHAPE_TOOL_ORDER.map((tool) => ({ tool, ...SHAPE_META[tool] }));

/** 실제 지우개처럼 보이도록, 비스듬히 기울어진 알약(캡슐) 모양 몸통을 반은 회색,
 * 반은 흰색으로 나눠 그린다(흔히 쓰는 지우개 아이콘과 같은 실루엣). */
function EraserIcon({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <g transform="rotate(-40 12 12)">
        <clipPath id={clipId}>
          <rect x="3" y="8.5" width="18" height="7" rx="3.5" />
        </clipPath>
        <rect x="3" y="8.5" width="18" height="7" rx="3.5" fill="white" stroke="currentColor" strokeWidth="1.1" />
        <g clipPath={`url(#${clipId})`}>
          <rect x="3" y="8.5" width="10.5" height="7" fill="currentColor" fillOpacity="0.55" />
        </g>
        <rect x="3" y="8.5" width="18" height="7" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </g>
    </svg>
  );
}

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

function ColorSwatches({ color, onColorChange }: { color: string; onColorChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          className={`h-5 w-5 rounded-full border-2 ${color === c ? "border-slate-700" : "border-transparent"}`}
          style={{ backgroundColor: c }}
          onClick={() => onColorChange(c)}
          title="색상 선택"
        />
      ))}
    </div>
  );
}

export function Toolbar({
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
  tool,
  onToolChange,
  color,
  onColorChange,
  penStyleId,
  onPenStyleChange,
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
  whiteboardMode,
  onToggleWhiteboard,
  onClearWhiteboard,
  showToc,
  onToggleToc,
  showNotes,
  onToggleNotes,
  currentPage,
  numPages,
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
  penStyleId: PenStyleId;
  onPenStyleChange: (id: PenStyleId) => void;
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
  whiteboardMode: boolean;
  onToggleWhiteboard: () => void;
  onClearWhiteboard: () => void;
  showToc: boolean;
  onToggleToc: () => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  currentPage: number;
  numPages: number;
  readOnly: boolean;
}) {
  const [query, setQuery] = useState("");
  const [penMenuOpen, setPenMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);

  const isShapeTool = (t: AnnotationTool): t is ShapeTool =>
    (SHAPE_TOOL_ORDER as string[]).includes(t);

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-1 py-2 lg:gap-1 lg:px-2">
      <button
        className={`btn-ghost !px-1 text-xs ${showToc ? "bg-brand-100 text-brand-700" : ""}`}
        title="목차 보이기/숨기기"
        onClick={onToggleToc}
      >
        📚 <span className="hidden lg:inline">목차</span>
      </button>

      <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

      {/* view mode */}
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        <button
          className={`px-1.5 py-1 text-xs font-semibold ${viewMode === "spread" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
          onClick={() => onViewModeChange("spread")}
          title="두 쪽 보기"
        >
          두쪽
        </button>
        <button
          className={`px-1.5 py-1 text-xs font-semibold ${viewMode === "single" ? "bg-brand-600 text-white" : "bg-white text-slate-600"}`}
          onClick={() => onViewModeChange("single")}
          title="한 쪽 크게 보기"
        >
          한쪽
        </button>
      </div>

      <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

      <span className="text-sm font-semibold text-slate-600">
        {currentPage} / {numPages}쪽
      </span>

      <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

      {/* zoom */}
      <div className="flex items-center gap-0.5">
        <button className="btn-ghost !px-1" title="축소" onClick={() => onZoomChange(-0.2)}>
          －
        </button>
        <span className="w-10 text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <button className="btn-ghost !px-1" title="확대" onClick={() => onZoomChange(0.2)}>
          ＋
        </button>
        <button
          className={`btn-ghost !px-1 text-xs ${magnifierMode ? "bg-brand-100 text-brand-700" : ""}`}
          title="부분만 크게 보기(돋보기)"
          onClick={onToggleMagnifier}
        >
          🔍 <span className="hidden lg:inline">확대</span>
        </button>
        {zoom !== 1 && (
          <button className="btn-ghost !px-1 text-xs" title="원래 크기로" onClick={onZoomReset}>
            ↺100%
          </button>
        )}
      </div>

      {!readOnly && (
        <>
          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />
          {/* annotation tools */}
          <div className="flex items-center gap-0.5">
            <button
              className={`btn-ghost !px-1 ${tool === "pen" ? "bg-brand-100 text-brand-700" : ""}`}
              title="연필"
              onClick={() => onToolChange(tool === "pen" ? "none" : "pen")}
            >
              ✏️
            </button>

            {/* 색펜: 누르면 펜 종류 + 색상을 고르는 창이 뜬다 */}
            <div className="relative">
              <button
                className={`btn-ghost !px-1 ${tool === "colorPen" ? "bg-brand-100 text-brand-700" : ""}`}
                title="색펜"
                onClick={() => {
                  setPenMenuOpen((v) => !v);
                  setShapeMenuOpen(false);
                }}
              >
                🖊️
              </button>
              {penMenuOpen && (
                <div className="absolute left-0 top-9 z-20 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">펜 종류</p>
                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {PEN_STYLES.map((s) => (
                      <button
                        key={s.id}
                        className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                          tool === "colorPen" && penStyleId === s.id
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          onPenStyleChange(s.id);
                          onToolChange("colorPen");
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">색상</p>
                  <ColorSwatches
                    color={color}
                    onColorChange={(c) => {
                      onColorChange(c);
                      setPenMenuOpen(false);
                    }}
                  />
                </div>
              )}
            </div>

            {/* 도형: 누르면 어떤 도형을 그릴지 고르는 창이 뜬다 */}
            <div className="relative">
              <button
                className={`btn-ghost !px-1 ${isShapeTool(tool) ? "bg-brand-100 text-brand-700" : ""}`}
                title="도형"
                onClick={() => {
                  setShapeMenuOpen((v) => !v);
                  setPenMenuOpen(false);
                }}
              >
                🔷 <span className="hidden lg:inline">도형</span>
              </button>
              {shapeMenuOpen && (
                <div className="absolute left-0 top-9 z-20 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">도형 종류</p>
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {SHAPE_TOOLS.map((s) => (
                      <button
                        key={s.tool}
                        className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] ${
                          tool === s.tool
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                        title={s.title}
                        onClick={() => {
                          onToolChange(tool === s.tool ? "none" : s.tool);
                        }}
                      >
                        <span className="text-base leading-none">{s.icon}</span>
                        {s.title}
                      </button>
                    ))}
                  </div>
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">색상</p>
                  <ColorSwatches
                    color={color}
                    onColorChange={(c) => {
                      onColorChange(c);
                      setShapeMenuOpen(false);
                    }}
                  />
                </div>
              )}
            </div>

            <button
              className={`btn-ghost !px-1 ${tool === "eraser" ? "bg-brand-100 text-brand-700" : ""}`}
              title="지우개"
              onClick={() => onToolChange(tool === "eraser" ? "none" : "eraser")}
            >
              <EraserIcon className="h-4 w-4" />
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
              className="btn-ghost !px-1 disabled:opacity-30"
              title="실행 취소"
              onClick={onUndo}
            >
              ↶
            </button>
            <button className="btn-ghost !px-1 disabled:opacity-30" title="다시 실행" onClick={onRedo}>
              ↷
            </button>
          </div>
          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />

          {/* 화이트보드 */}
          <div className="flex items-center gap-0.5">
            <button
              className={`btn-ghost !px-1 text-xs ${whiteboardMode ? "bg-brand-100 text-brand-700" : ""}`}
              title="화이트보드"
              onClick={onToggleWhiteboard}
            >
              🖍️ <span className="hidden lg:inline">화이트보드</span>
            </button>
            {whiteboardMode && (
              <button className="btn-ghost !px-1 text-xs" title="화이트보드 모두 지우기" onClick={onClearWhiteboard}>
                🗑️ <span className="hidden lg:inline">모두 지우기</span>
              </button>
            )}
          </div>
          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />
        </>
      )}

      {/* 검색·캡처저장·노트는 항상 서로 줄바꿈 없이 한 줄로 붙어서, 툴바 오른쪽 끝에
          (노트창이 뜨는 칸 바로 위에) 함께 자리하도록 한 묶음으로 둔다. */}
      <div className="ml-auto flex flex-nowrap items-center gap-1">
        {/* search: 팝오버가 아니라 항상 상단 줄에 보이도록 */}
        <div className="relative flex items-center gap-1">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearch(query);
            }}
            className="flex flex-nowrap items-center gap-1"
          >
            <input
              className="input h-8 !w-10 !px-1 !py-1 text-xs lg:!w-24"
              placeholder="교재 내 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn-ghost shrink-0 !px-1" type="submit" title="검색">
              🔎
            </button>
          </form>
          {query.trim() && (
            <div className="absolute right-0 top-9 z-20 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <div className="max-h-48 space-y-1 overflow-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    className="block w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-slate-100"
                    onClick={() => {
                      onJumpToResult(r.page);
                      setQuery("");
                    }}
                  >
                    <span className="font-semibold text-brand-700">{r.page}쪽</span> {r.snippet}
                  </button>
                ))}
                {searchResults.length === 0 && (
                  <p className="px-2 py-1 text-xs text-slate-400">검색 결과가 없어요.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <button className="btn-ghost shrink-0 !px-1" title="이 쪽 캡처 저장" onClick={onCapture}>
          📷 <span className="hidden lg:inline">캡처저장</span>
        </button>

        <button
          className={`btn-ghost shrink-0 !px-1 text-xs ${showNotes ? "bg-brand-100 text-brand-700" : ""}`}
          title="노트창 보이기/숨기기"
          onClick={onToggleNotes}
        >
          📝 <span className="hidden lg:inline">노트</span>
        </button>
      </div>
    </div>
  );
}
