import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { saveAnnotation, watchAnnotation } from "@/lib/firestore";
import type { DrawTool, ShapeTool, Stroke } from "@/types";

export const SHAPE_TOOLS: ShapeTool[] = ["line", "arrow", "rectangle", "triangle", "circle"];
const isShapeTool = (t: DrawTool | ShapeTool | "none"): t is ShapeTool =>
  (SHAPE_TOOLS as string[]).includes(t);

/** 시작점과 끝점(0-1 정규화 좌표)으로 도형의 외곽선 점 배열을 만든다.
 * 정규화 좌표는 가로/세로 비율이 다르므로(교재 쪽은 정사각형이 아님), 화살촉처럼
 * 각도가 중요한 도형은 실제 캔버스 픽셀 비율(canvasW/canvasH)로 잠깐 환산해서
 * 계산한 뒤 다시 정규화 좌표로 되돌려야 비율이 비뚤어지지 않는다. */
function buildShapePoints(
  kind: ShapeTool,
  start: [number, number],
  end: [number, number],
  canvasW: number,
  canvasH: number,
): number[] {
  const [sx, sy] = start;
  const [ex, ey] = end;
  if (kind === "line") return [sx, sy, ex, ey];
  if (kind === "rectangle") return [sx, sy, ex, sy, ex, ey, sx, ey, sx, sy];
  if (kind === "triangle") {
    const topMidX = (sx + ex) / 2;
    return [topMidX, sy, ex, ey, sx, ey, topMidX, sy];
  }
  if (kind === "arrow") {
    const dxPix = (ex - sx) * canvasW;
    const dyPix = (ey - sy) * canvasH;
    const len = Math.hypot(dxPix, dyPix) || 1;
    const backX = -dxPix / len;
    const backY = -dyPix / len;
    const headLenPix = Math.min(len * 0.35, canvasW * 0.06);
    const angle = (28 * Math.PI) / 180;
    const rotate = (vx: number, vy: number, a: number): [number, number] => [
      vx * Math.cos(a) - vy * Math.sin(a),
      vx * Math.sin(a) + vy * Math.cos(a),
    ];
    const [w1x, w1y] = rotate(backX, backY, angle);
    const [w2x, w2y] = rotate(backX, backY, -angle);
    const wing1x = ex + (w1x * headLenPix) / canvasW;
    const wing1y = ey + (w1y * headLenPix) / canvasH;
    const wing2x = ex + (w2x * headLenPix) / canvasW;
    const wing2y = ey + (w2y * headLenPix) / canvasH;
    return [sx, sy, ex, ey, wing1x, wing1y, ex, ey, wing2x, wing2y];
  }
  // circle/ellipse: start~end 사이 사각형에 내접하는 타원
  const cx = (sx + ex) / 2;
  const cy = (sy + ey) / 2;
  const rx = Math.abs(ex - sx) / 2;
  const ry = Math.abs(ey - sy) / 2;
  const points: number[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
  }
  return points;
}

export interface AnnotationLayerHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

const PENCIL_COLOR = "#52525b"; // 연필은 항상 회색 연필 느낌으로 고정

/** 필기 두께(stroke.width)는 대략 이 정도 쪽 너비를 기준으로 고른 값이다.
 * 훨씬 작은 캔버스(예: 선생님 화면의 미리보기 썸네일)에 그대로 그리면 상대적으로
 * 훨씬 두꺼워 보이므로, 그런 곳에서는 widthScale로 비례해서 줄여줘야 한다. */
export const STROKE_WIDTH_REFERENCE = 600;

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
  widthScale = 1,
) {
  if (stroke.points.length < 4) return;
  ctx.strokeStyle = stroke.tool === "pen" ? PENCIL_COLOR : stroke.color;
  ctx.globalAlpha = stroke.alpha ?? 1;
  ctx.lineWidth = stroke.width * widthScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i < stroke.points.length; i += 2) {
    const x = stroke.points[i] * w;
    const y = stroke.points[i + 1] * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** 지우개가 지나간 점만 잘라내고, 남은 부분은 (필요하면 여러 개로 쪼개서) 그대로 유지한다. */
function eraseAtPoint(
  strokes: Stroke[],
  px: number,
  py: number,
  w: number,
  h: number,
  radius: number,
): Stroke[] {
  const result: Stroke[] = [];
  for (const s of strokes) {
    const pts = s.points;
    let current: number[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] * w;
      const y = pts[i + 1] * h;
      if (Math.hypot(px - x, py - y) <= radius) {
        if (current.length >= 4) result.push({ ...s, points: current });
        current = [];
      } else {
        current.push(pts[i], pts[i + 1]);
      }
    }
    if (current.length >= 4) result.push({ ...s, points: current });
  }
  return result;
}

/** 쪽 번호별 실행취소 기록을 Map에서 가져오거나, 없으면 새로 만들어 등록한다. */
function getPageHistory(map: Map<number, Stroke[][]>, page: number): Stroke[][] {
  let arr = map.get(page);
  if (!arr) {
    arr = [];
    map.set(page, arr);
  }
  return arr;
}

export const AnnotationLayer = forwardRef<
  AnnotationLayerHandle,
  {
    uid: string;
    textbookId: string;
    page: number;
    width: number;
    height: number;
    tool: DrawTool | ShapeTool | "none";
    color: string;
    eraserSize: number;
    readOnly: boolean;
    onDraw?: () => void;
    /** 쪽을 넘겼다가 돌아와도 실행취소 기록이 사라지지 않도록, 쪽 번호별 기록을
     * 이 컴포넌트보다 오래 사는 부모(TextbookViewerPage)의 Map에 보관한다. */
    historyMap: Map<number, Stroke[][]>;
    futureMap: Map<number, Stroke[][]>;
    /** false면 서버에서 불러오거나 저장하지 않고 화면에서만 그려진다 (교재 체험 모드용). */
    persist?: boolean;
    /** 색펜(볼펜/형광펜/색연필/사인펜)의 굵기·투명도. 도형/연필에는 영향을 주지 않는다. */
    penWidth?: number;
    penAlpha?: number;
  }
>(function AnnotationLayer(
  {
    uid,
    textbookId,
    page,
    width,
    height,
    tool,
    color,
    eraserSize,
    readOnly,
    onDraw,
    historyMap,
    futureMap,
    persist = true,
    penWidth = 2.5,
    penAlpha = 1,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const drawing = useRef<number[] | null>(null);
  const shapeStart = useRef<[number, number] | null>(null);
  const shapeDraft = useRef<number[] | null>(null);
  const erasingDraft = useRef<Stroke[] | null>(null);
  const history = useRef<Stroke[][]>(getPageHistory(historyMap, page));
  const future = useRef<Stroke[][]>(getPageHistory(futureMap, page));
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    if (!persist) return;
    return watchAnnotation(uid, textbookId, page, (a) => setStrokes(a?.strokes ?? []));
  }, [uid, textbookId, page, persist]);

  const commit = (next: Stroke[]) => {
    history.current.push(strokesRef.current);
    if (history.current.length > 50) history.current.shift();
    future.current.length = 0; // 배열 참조를 유지해야 historyMap/futureMap에 계속 연결된다
    setStrokes(next);
    if (persist) void saveAnnotation(uid, textbookId, page, next);
    onDraw?.();
  };

  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        if (readOnly || history.current.length === 0) return;
        const prev = history.current.pop()!;
        future.current.push(strokesRef.current);
        setStrokes(prev);
        if (persist) void saveAnnotation(uid, textbookId, page, prev);
      },
      redo: () => {
        if (readOnly || future.current.length === 0) return;
        const next = future.current.pop()!;
        history.current.push(strokesRef.current);
        setStrokes(next);
        if (persist) void saveAnnotation(uid, textbookId, page, next);
      },
      clear: () => {
        if (readOnly || strokesRef.current.length === 0) return;
        commit([]);
      },
      getCanvas: () => canvasRef.current,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, textbookId, page, readOnly, persist],
  );

  const redraw = (source: Stroke[], extra?: Stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    source.forEach((s) => drawStroke(ctx, s, canvas.width, canvas.height));
    if (extra) drawStroke(ctx, extra, canvas.width, canvas.height);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    redraw(strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, width, height]);

  const toLocal = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      ((clientX - rect.left) / rect.width) * canvas.width,
      ((clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const strokeWidth = tool === "colorPen" ? penWidth : isShapeTool(tool) ? 2.5 : 2;
  const strokeAlpha = tool === "colorPen" ? penAlpha : 1;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || tool === "none") return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (tool === "eraser") {
      const [px, py] = toLocal(e.clientX, e.clientY);
      const canvas = canvasRef.current!;
      erasingDraft.current = eraseAtPoint(strokes, px, py, canvas.width, canvas.height, eraserSize);
      redraw(erasingDraft.current);
      return;
    }
    const [x, y] = toLocal(e.clientX, e.clientY);
    const canvas = canvasRef.current!;
    if (isShapeTool(tool)) {
      shapeStart.current = [x / canvas.width, y / canvas.height];
      return;
    }
    drawing.current = [x / canvas.width, y / canvas.height];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "eraser") {
      setHoverPos({ x: e.clientX, y: e.clientY });
    }
    if (tool === "eraser" && erasingDraft.current) {
      const [px, py] = toLocal(e.clientX, e.clientY);
      const canvas = canvasRef.current!;
      erasingDraft.current = eraseAtPoint(erasingDraft.current, px, py, canvas.width, canvas.height, eraserSize);
      redraw(erasingDraft.current);
      return;
    }
    if (isShapeTool(tool) && shapeStart.current) {
      const [x, y] = toLocal(e.clientX, e.clientY);
      const canvas = canvasRef.current!;
      const points = buildShapePoints(
        tool,
        shapeStart.current,
        [x / canvas.width, y / canvas.height],
        canvas.width,
        canvas.height,
      );
      shapeDraft.current = points;
      redraw(strokes, { tool: "colorPen", color, width: strokeWidth, alpha: 1, points });
      return;
    }
    if (!drawing.current) return;
    const [x, y] = toLocal(e.clientX, e.clientY);
    drawing.current.push(x / canvasRef.current!.width, y / canvasRef.current!.height);
    redraw(strokes, {
      tool: tool as "pen" | "colorPen",
      color,
      width: strokeWidth,
      alpha: strokeAlpha,
      points: drawing.current,
    });
  };

  const handlePointerUp = () => {
    if (tool === "eraser" && erasingDraft.current) {
      const next = erasingDraft.current;
      erasingDraft.current = null;
      if (next.length !== strokes.length || next.some((s, i) => s !== strokes[i])) {
        commit(next);
      }
      return;
    }
    if (isShapeTool(tool) && shapeStart.current) {
      const points = shapeDraft.current;
      shapeStart.current = null;
      shapeDraft.current = null;
      if (!points || points.length < 4) return;
      commit([...strokes, { tool: "colorPen", color, width: strokeWidth, alpha: 1, points }]);
      return;
    }
    if (!drawing.current) return;
    const points = drawing.current;
    drawing.current = null;
    if (points.length < 4) return; // ignore accidental taps
    commit([...strokes, { tool: tool as "pen" | "colorPen", color, width: strokeWidth, alpha: strokeAlpha, points }]);
  };

  const interactive = !readOnly && tool !== "none";

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        style={{
          touchAction: interactive ? "none" : "auto",
          pointerEvents: interactive ? "auto" : "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          ...({ WebkitUserDrag: "none" } as Record<string, string>),
          cursor:
            tool === "eraser"
              ? "none"
              : tool === "pen" || tool === "colorPen" || isShapeTool(tool)
                ? "crosshair"
                : "default",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          setHoverPos(null);
          handlePointerUp();
        }}
      />
      {tool === "eraser" && hoverPos && !readOnly && (
        <div
          className="pointer-events-none fixed z-50 rounded-full border-2 border-slate-500 bg-slate-400/20"
          style={{
            left: hoverPos.x - eraserSize,
            top: hoverPos.y - eraserSize,
            width: eraserSize * 2,
            height: eraserSize * 2,
          }}
        />
      )}
    </>
  );
});
