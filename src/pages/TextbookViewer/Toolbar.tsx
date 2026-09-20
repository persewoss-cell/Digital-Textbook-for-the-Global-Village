import { useEffect, useId, useRef, useState } from "react";
import {
  PENCIL_BASE_WIDTH,
  PEN_STYLES,
  WIDTH_LEVELS,
  levelForPenWidth,
  linearLevelForWidth,
  linearWidthForLevel,
  widthForPenLevel,
  type AnnotationTool,
  type PenStyleId,
  type ShapeTool,
} from "@/types";
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

// 빨주노초파남보검 순서(무지개 색 + 검정)
const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#4f46e5", "#a855f7", "#000000"];

// 지우개 반지름 9단계 - STROKE_WIDTH_REFERENCE(=600, 펜 굵기/메모 글씨 크기와 같은
// 기준의 "가상 쪽 너비") 기준값이라, 필기 굵기나 노트 글씨처럼 쪽 크기(확대/축소)에
// 비례해서 커지고 작아진다. 가장 큰 9단계는 지름이 쪽 너비의 1/4 정도(반지름 =
// 600/4/2 = 75), 가장 작은 1단계는 노트 최소 글씨 크기(8, NotesPanel의
// MIN_FONT_SIZE와 같음) 정도의 지름이 되도록, 그 사이를 등비수열로 9단계 나눈다.
const ERASER_MIN_RADIUS = 4; // 지름 8 (교재의 가장 작은 글씨 크기 정도)
const ERASER_MAX_RADIUS = 75; // 지름 150 = 쪽 너비(600)의 1/4
const ERASER_SIZES = Array.from({ length: 9 }, (_, i) =>
  Math.round(ERASER_MIN_RADIUS * Math.pow(ERASER_MAX_RADIUS / ERASER_MIN_RADIUS, i / 8)),
);
export const DEFAULT_ERASER_SIZE = ERASER_SIZES[4];
// 목록 안에서 미리보기 원을 그릴 때 쓰는 화면상 크기(px) - 실제 지우개 반지름은
// 쪽 크기에 비례해 계속 달라지므로, 이 미리보기는 "상대적으로 몇 번째로 큰지"만
// 보여주는 고정된 크기다.
const ERASER_PREVIEW_MIN_PX = 8;
const ERASER_PREVIEW_MAX_PX = 34;

/** 도구가 선택돼 있음을 보여주는 아이콘 오른쪽 위 빨간 점. */
function SelectedDot() {
  return (
    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white" />
  );
}

/** 도구를 처음 선택했을 때 "오른쪽 버튼으로 해제할 수 있다"를 잠깐 알려주는 말풍선. */
function DeselectHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-max -translate-x-1/2 rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-medium text-white shadow-lg transition-opacity duration-150 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
그 위에서 마우스 오른쪽 버튼을 누르면 선택이 해제돼요
      <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-800" />
    </div>
  );
}

function ColorSwatches({ color, onColorChange }: { color: string; onColorChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
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

/** 굵기 1~10단계를 고르는 슬라이더. 실제 픽셀 굵기가 아니라 단계(정수)만 다루고,
 * 그 단계 ↔ 실제 굵기 변환은 부르는 쪽(widthForLevel/levelForWidth)에서 한다. */
function WidthSlider({ level, onLevelChange }: { level: number; onLevelChange: (level: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={1}
        max={WIDTH_LEVELS}
        step={1}
        value={level}
        onChange={(e) => onLevelChange(Number(e.target.value))}
        className="h-1.5 w-full accent-brand-600"
      />
      <span className="w-4 text-right text-[11px] font-semibold text-slate-500">{level}</span>
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
  penWidth,
  onPenWidthChange,
  pencilWidth,
  onPencilWidthChange,
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
  isFullscreen,
  onToggleFullscreen,
  showToc,
  onToggleToc,
  showNotes,
  onToggleNotes,
  currentPage,
  numPages,
  readOnly,
  compact,
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
  /** 지금 선택된 색펜 종류(penStyleId)의 실제 굵기(px, STROKE_WIDTH_REFERENCE 기준) */
  penWidth: number;
  onPenWidthChange: (width: number) => void;
  /** 연필(색 없는 검정 연필)의 실제 굵기 */
  pencilWidth: number;
  onPencilWidthChange: (width: number) => void;
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
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showToc: boolean;
  onToggleToc: () => void;
  showNotes: boolean;
  onToggleNotes: () => void;
  currentPage: number;
  numPages: number;
  readOnly: boolean;
  /** 전체화면 모드에서, 원래 두 번째 줄을 통째로 차지하던 툴바 대신 상단바의
   * "지구마을 디지털 교재" 로고 옆에 한 줄로 작게 붙여 넣을 때 켠다 - 목차 버튼과
   * 검색·캡처저장·노트 묶음은 빼고, 나머지(보기 방식/쪽수/확대·축소/돋보기/필기
   * 도구/실행취소·다시실행/화이트보드/전체화면)만 촘촘하게 보여준다. */
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [penMenuOpen, setPenMenuOpen] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [eraserMenuOpen, setEraserMenuOpen] = useState(false);
  const [pencilMenuOpen, setPencilMenuOpen] = useState(false);
  const penWrapRef = useRef<HTMLDivElement>(null);
  const shapeWrapRef = useRef<HTMLDivElement>(null);
  const eraserWrapRef = useRef<HTMLDivElement>(null);
  const pencilWrapRef = useRef<HTMLDivElement>(null);

  const isShapeTool = (t: AnnotationTool): t is ShapeTool =>
    (SHAPE_TOOL_ORDER as string[]).includes(t);

  // 펜/도형/지우개 크기 선택 창은, 무언가 골라야만 닫히는 게 아니라 교재에 그리기
  // 시작하거나(그 순간 캔버스에서 pointerdown이 일어남) 다른 아이콘을 누르는 등
  // 창 밖 아무 곳이나 다시 조작하면 바로 닫혀야 자연스럽다. capture 단계에서
  // 감지해야 실제로 그리기가 시작되기 전에(그 pointerdown이 캔버스에 도달하기
  // 전에) 먼저 닫을 수 있다.
  useEffect(() => {
    if (!penMenuOpen && !shapeMenuOpen && !eraserMenuOpen && !pencilMenuOpen) return;
    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target as Node;
      const insidePen = !!penWrapRef.current?.contains(target);
      const insideShape = !!shapeWrapRef.current?.contains(target);
      const insideEraser = !!eraserWrapRef.current?.contains(target);
      const insidePencil = !!pencilWrapRef.current?.contains(target);
      // "완전히 네 창 다 밖일 때만 닫기"로 묶어 두면, 예를 들어 지우개 창이 열린
      // 채로 색펜 아이콘(penWrapRef 안)을 눌렀을 때 그 클릭이 "펜 쪽 안"이라는
      // 이유로 지우개 창까지 안 닫히는 문제가 있었다. 각 창은 자기 것이 아닌
      // 클릭이면 무조건 닫혀야 한다 - 자기 자신은 각자의 onClick이 알아서 처리한다.
      // 연필 굵기 창도 같은 규칙으로 닫는다 - 특히 캔버스에 실제로 그리기 시작하면
      // (그 pointerdown은 이 네 wrapper 중 어디에도 안 속하므로) 자동으로 닫힌다.
      if (!insidePen) setPenMenuOpen(false);
      if (!insideShape) setShapeMenuOpen(false);
      if (!insideEraser) setEraserMenuOpen(false);
      if (!insidePencil) setPencilMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => document.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, [penMenuOpen, shapeMenuOpen, eraserMenuOpen, pencilMenuOpen]);

  // 도구가 새로 선택될 때(연필/색펜/도형/지우개/화이트보드) 잠깐 "오른쪽 버튼으로
  // 해제할 수 있다"는 안내를 보여준다.
  const [hintKey, setHintKey] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevToolRef = useRef(tool);
  const prevWhiteboardRef = useRef(whiteboardMode);
  const showHint = (key: string) => {
    setHintKey(key);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHintKey(null), 2200);
  };
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = tool;
    if (prev === tool || tool === "none" || tool === "note") return;
    if (tool === "pen") showHint("pen");
    else if (tool === "colorPen") showHint("colorPen");
    else if (tool === "eraser") showHint("eraser");
    else if (isShapeTool(tool)) showHint("shape");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);
  useEffect(() => {
    if (!prevWhiteboardRef.current && whiteboardMode) showHint("whiteboard");
    prevWhiteboardRef.current = whiteboardMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteboardMode]);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  return (
    <div
      className={
        compact
          ? // overflow-x-auto를 쓰면(가로로 넘칠 때 스크롤) CSS 규칙상 overflow-y도
            // 덩달아 auto로 바뀌어서, 색펜/도형 버튼 아래로 펼쳐지는 메뉴(absolute,
            // top-9)가 이 줄 높이에 잘려 안 보이는 문제가 있었다. 전체화면 모드는
            // 주로 넓은 화면(태블릿/PC)에서 쓰므로 가로 스크롤은 포기하고 넘치면
            // 그냥 넘치게 둔다.
            "flex flex-nowrap items-center gap-0.5"
          : "flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-1 py-2 lg:gap-1 lg:px-2"
      }
    >
      {!compact && (
        <>
          <div className="relative">
            <button
              className={`btn-ghost !px-1 text-xs ${showToc ? "bg-brand-100 text-brand-700" : ""}`}
              title="목차 보이기/숨기기"
              onClick={onToggleToc}
            >
              📚 <span className="hidden lg:inline">목차</span>
              {showToc && <SelectedDot />}
            </button>
          </div>

          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />
        </>
      )}

      {/* view mode: 전체화면(모바일/태블릿 중심 모드)에서는 항상 두 쪽 보기로
          고정하므로 이 토글 자체를 뺀다. */}
      {!compact && (
        <>
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
        </>
      )}

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
            <div className="relative" ref={pencilWrapRef}>
              <button
                className={`btn-ghost !px-1 ${tool === "pen" ? "bg-brand-100 text-brand-700" : ""}`}
                title="연필"
                onClick={() => {
                  if (tool === "pen") {
                    onToolChange("none");
                    setPencilMenuOpen(false);
                    return;
                  }
                  // 연필을 고르면 바로 쓸 수 있어야 하므로 굵기는 이미 기본값(중간)으로
                  // 정해져 있고, 그 옆에 굵기를 조정할 수 있는 창만 잠깐 띄워 준다 -
                  // 실제로 쓰기 시작하면(캔버스에 pointerdown) 위 effect가 자동으로 닫는다.
                  onToolChange("pen");
                  setPencilMenuOpen(true);
                  setPenMenuOpen(false);
                  setShapeMenuOpen(false);
                  setEraserMenuOpen(false);
                }}
              >
                ✏️
                {tool === "pen" && <SelectedDot />}
              </button>
              {hintKey === "pen" && <DeselectHint />}
              {pencilMenuOpen && (
                <div className="absolute left-1/2 top-9 z-20 w-48 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">굵기</p>
                  <WidthSlider
                    level={linearLevelForWidth(pencilWidth, PENCIL_BASE_WIDTH)}
                    onLevelChange={(level) => onPencilWidthChange(linearWidthForLevel(PENCIL_BASE_WIDTH, level))}
                  />
                </div>
              )}
            </div>

            {/* 색펜: 누르면 펜 종류 + 색상을 고르는 창이 뜬다 */}
            <div className="relative" ref={penWrapRef}>
              <button
                className={`btn-ghost !px-1 ${tool === "colorPen" ? "bg-brand-100 text-brand-700" : ""}`}
                title="색펜"
                onClick={() => {
                  // 이미 색펜이 선택된 상태(빨간 점)에서 다시 누르면, 창을 다시 띄우지
                  // 않고 바로 꺼지게 한다 - 연필/지우개처럼 아이콘 한 번으로 켜고 끌 수
                  // 있어야 자연스럽다. 아직 선택 전이면 지금까지처럼 펜 종류/색상을
                  // 고르는 창을 연다.
                  if (tool === "colorPen") {
                    onToolChange("none");
                    setPenMenuOpen(false);
                    return;
                  }
                  setPenMenuOpen((v) => !v);
                  setShapeMenuOpen(false);
                  setEraserMenuOpen(false);
                  setPencilMenuOpen(false);
                }}
              >
                🖊️
                {tool === "colorPen" && <SelectedDot />}
              </button>
              {hintKey === "colorPen" && <DeselectHint />}
              {penMenuOpen && (
                <div className="absolute left-1/2 top-9 z-20 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
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
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">굵기</p>
                  <div className="mb-3">
                    <WidthSlider
                      level={levelForPenWidth(penStyleId, penWidth, PEN_STYLES.find((s) => s.id === penStyleId)!.width)}
                      onLevelChange={(level) =>
                        onPenWidthChange(
                          widthForPenLevel(penStyleId, PEN_STYLES.find((s) => s.id === penStyleId)!.width, level),
                        )
                      }
                    />
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
            <div className="relative" ref={shapeWrapRef}>
              <button
                className={`btn-ghost !px-1 ${isShapeTool(tool) ? "bg-brand-100 text-brand-700" : ""}`}
                title="도형"
                onClick={() => {
                  // 이미 도형 도구가 선택된 상태(빨간 점)에서 다시 누르면, 창을 다시
                  // 띄우지 않고 바로 꺼지게 한다 - 색펜과 같은 이유.
                  if (isShapeTool(tool)) {
                    onToolChange("none");
                    setShapeMenuOpen(false);
                    return;
                  }
                  setShapeMenuOpen((v) => !v);
                  setPenMenuOpen(false);
                  setEraserMenuOpen(false);
                  setPencilMenuOpen(false);
                }}
              >
                🔷 <span className="hidden lg:inline">도형</span>
                {isShapeTool(tool) && <SelectedDot />}
              </button>
              {hintKey === "shape" && <DeselectHint />}
              {shapeMenuOpen && (
                <div className="absolute left-1/2 top-9 z-20 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
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

            {/* 지우개: 색펜/도형처럼 누르면 크기를 고르는 창이 뜬다. 이미 선택된
                상태(빨간 점)에서 다시 누르면 색펜/도형과 똑같이 창을 다시 띄우지
                않고 바로 꺼진다. */}
            <div className="relative" ref={eraserWrapRef}>
              <button
                className={`btn-ghost !px-1 ${tool === "eraser" ? "bg-brand-100 text-brand-700" : ""}`}
                title="지우개"
                onClick={() => {
                  if (tool === "eraser") {
                    onToolChange("none");
                    setEraserMenuOpen(false);
                    return;
                  }
                  setEraserMenuOpen((v) => !v);
                  setPenMenuOpen(false);
                  setShapeMenuOpen(false);
                  setPencilMenuOpen(false);
                }}
              >
                <EraserIcon className="h-4 w-4" />
                {tool === "eraser" && <SelectedDot />}
              </button>
              {hintKey === "eraser" && <DeselectHint />}
              {eraserMenuOpen && (
                <div className="absolute left-1/2 top-9 z-20 w-56 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <p className="mb-1.5 text-[11px] font-semibold text-slate-400">지우개 크기</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {ERASER_SIZES.map((size, i) => {
                      const previewPx =
                        ERASER_PREVIEW_MIN_PX +
                        ((ERASER_PREVIEW_MAX_PX - ERASER_PREVIEW_MIN_PX) * i) / (ERASER_SIZES.length - 1);
                      return (
                        <button
                          key={size}
                          className={`flex items-center justify-center rounded-lg border py-2 ${
                            tool === "eraser" && eraserSize === size
                              ? "border-brand-500 bg-brand-50"
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                          title={`${i + 1}단계`}
                          onClick={() => {
                            onEraserSizeChange(size);
                            onToolChange("eraser");
                            setEraserMenuOpen(false);
                          }}
                        >
                          <span
                            className="rounded-full bg-slate-500"
                            style={{ width: previewPx, height: previewPx }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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
            <div className="relative">
              <button
                className={`btn-ghost !px-1 text-xs ${whiteboardMode ? "bg-brand-100 text-brand-700" : ""}`}
                title="화이트보드"
                onClick={onToggleWhiteboard}
              >
                🖍️ <span className="hidden lg:inline">화이트보드</span>
                {whiteboardMode && <SelectedDot />}
              </button>
              {hintKey === "whiteboard" && <DeselectHint />}
            </div>
            {whiteboardMode && (
              <button className="btn-ghost !px-1 text-xs" title="화이트보드 모두 지우기" onClick={onClearWhiteboard}>
                🗑️ <span className="hidden lg:inline">모두 지우기</span>
              </button>
            )}
            <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />
            <button
              className={`btn-ghost !px-1 text-xs ${isFullscreen ? "bg-brand-100 text-brand-700" : ""}`}
              title={isFullscreen ? "전체화면 나가기" : "전체화면"}
              onClick={onToggleFullscreen}
            >
              {/* "축소" 전용 아이콘(🗗 등)은 안드로이드/아이폰 기본 글꼴에서 지원하지
                  않아 빈 네모(글자 깨짐)로 보이는 경우가 많아서, 이미 잘 보이는 것이
                  확인된 ⛶를 그대로 쓴다. 이 아이콘 하나로는(전체화면/축소 둘 다
                  같은 모양) 핸드폰처럼 좁은 화면에서 배경색 차이만으로 상태를
                  구분하기 어려워서, 다른 버튼과 달리 이 글자만은(hidden lg:inline
                  없이) 화면 크기와 무관하게 항상 보이게 한다. */}
              ⛶ <span>{isFullscreen ? "축소" : "전체화면"}</span>
            </button>
          </div>
          <div className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" />
        </>
      )}

      {/* 검색·캡처저장·노트는 항상 서로 줄바꿈 없이 한 줄로 붙어서, 툴바 오른쪽 끝에
          (노트창이 뜨는 칸 바로 위에) 함께 자리하도록 한 묶음으로 둔다. 전체화면의
          축소판 줄에는 자리가 좁고 목차/노트 패널 자체도 그 모드에서는 안 보이므로 뺀다. */}
      {!compact && (
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

          <div className="relative">
            <button
              className={`btn-ghost shrink-0 !px-1 text-xs ${showNotes ? "bg-brand-100 text-brand-700" : ""}`}
              title="노트창 보이기/숨기기"
              onClick={onToggleNotes}
            >
              📝 <span className="hidden lg:inline">노트</span>
              {showNotes && <SelectedDot />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
