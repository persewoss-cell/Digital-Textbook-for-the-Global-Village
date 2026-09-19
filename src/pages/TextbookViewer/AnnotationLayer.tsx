import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { saveAnnotation, watchAnnotation } from "@/lib/firestore";
import type { DrawTool, ShapeTool, Stroke } from "@/types";

// iOS Safari 등에서 캔버스가 너무 크면(가로/세로 한 변 기준) 그리기가 깨지거나
// 캔버스가 비어버리는 문제가 있어 안전선을 둔다 (PdfPageCanvas와 동일한 이유).
const MAX_CANVAS_DIMENSION = 4096;

export const SHAPE_TOOLS: ShapeTool[] = ["line", "arrow", "rectangle", "triangle", "circle"];
const isShapeTool = (t: DrawTool | ShapeTool | "none"): t is ShapeTool =>
  (SHAPE_TOOLS as string[]).includes(t);

// 지우개는 (아래 eraseAtPoint) 저장된 점 하나하나와의 거리로만 지울지 말지 판단한다.
// 도형은 사각형이면 모서리 5개, 직선이면 2개처럼 점이 서로 멀리 떨어져 있어서, 그
// 사이 변 한가운데를 지우개로 눌러도 가까운 점이 하나도 없어 전혀 지워지지 않는
// 문제가 있었다. 도형의 각 변을 이 정도 촘촘하게(캔버스 픽셀 기준) 점으로 잘게
// 쪼개 두면, 자유롭게 그린 선처럼 지우개가 닿은 부분만 자연스럽게 지워진다.
const SHAPE_DENSIFY_STEP_PX = 8;

function densifyPolyline(points: number[], canvasW: number, canvasH: number): number[] {
  if (points.length < 4) return points;
  const out: number[] = [points[0], points[1]];
  for (let i = 0; i < points.length - 2; i += 2) {
    const x1 = points[i];
    const y1 = points[i + 1];
    const x2 = points[i + 2];
    const y2 = points[i + 3];
    const distPx = Math.hypot((x2 - x1) * canvasW, (y2 - y1) * canvasH);
    const steps = Math.max(1, Math.round(distPx / SHAPE_DENSIFY_STEP_PX));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    }
  }
  return out;
}

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
  let points: number[];
  if (kind === "line") points = [sx, sy, ex, ey];
  else if (kind === "rectangle") points = [sx, sy, ex, sy, ex, ey, sx, ey, sx, sy];
  else if (kind === "triangle") {
    const topMidX = (sx + ex) / 2;
    points = [topMidX, sy, ex, ey, sx, ey, topMidX, sy];
  } else if (kind === "arrow") {
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
    points = [sx, sy, ex, ey, wing1x, wing1y, ex, ey, wing2x, wing2y];
  } else {
    // circle/ellipse: start~end 사이 사각형에 내접하는 타원
    const cx = (sx + ex) / 2;
    const cy = (sy + ey) / 2;
    const rx = Math.abs(ex - sx) / 2;
    const ry = Math.abs(ey - sy) / 2;
    points = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
    }
  }
  return densifyPolyline(points, canvasW, canvasH);
}

export interface AnnotationLayerHandle {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  getCanvas: () => HTMLCanvasElement | null;
  /** 두 쪽 보기에서 옆 쪽으로 넘어간 획(자유롭게 그린 선이나 도형의 일부)을 이
   * 쪽에 이어서 그려 넣는다. clientPoints는 화면 좌표([x1,y1,x2,y2,...])라서, 각
   * 쪽이 자기 캔버스 기준으로 알아서 변환해 정확히 이어붙는다. */
  commitExternalPoints: (
    clientPoints: number[],
    meta: { tool: DrawTool | ShapeTool; color: string; width: number; alpha: number },
  ) => void;
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

/** 두 쪽 보기에서 한 획이 쪽 경계(boundaryFx: 왼쪽 이웃이면 0, 오른쪽 이웃이면 1)를
 * 넘나들 때, 이 쪽 안쪽(self)과 이웃 쪽으로 넘어간 부분(other)으로 잘라 나눈다.
 * (여러 번 왔다갔다 했으면 조각이 여러 개가 된다.) 경계를 지나는 지점을 정확히
 * 계산해 양쪽 끝에 같이 넣어 두어, 두 쪽에 나눠 그려도 이어붙는 자리가 어긋나지
 * 않는다. */
function splitPointsByBoundary(
  points: number[],
  boundaryFx: 0 | 1,
): { self: boolean; points: number[] }[] {
  const isSelf = (x: number) => (boundaryFx === 1 ? x <= 1 : x >= 0);
  const runs: { self: boolean; points: number[] }[] = [];
  let cur: { self: boolean; points: number[] } | null = null;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const self = isSelf(x);
    if (cur && cur.self !== self) {
      const prevX: number = cur.points[cur.points.length - 2];
      const prevY: number = cur.points[cur.points.length - 1];
      const denom = x - prevX;
      const t = denom === 0 ? 0 : (boundaryFx - prevX) / denom;
      const crossX: number = boundaryFx;
      const crossY: number = prevY + (y - prevY) * t;
      cur.points.push(crossX, crossY);
      runs.push(cur);
      cur = { self, points: [crossX, crossY] };
    } else if (!cur) {
      cur = { self, points: [] };
    }
    cur.points.push(x, y);
  }
  if (cur) runs.push(cur);
  return runs;
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
    /** 캔버스 자체 해상도로 쓸 크기(줌과 무관하게 상한이 있음 - 부모가
     * RENDER_ZOOM_CEILING 기준으로 계산해 넘겨준다). 손가락 제스처로 줌이 계속
     * 바뀔 때마다 이 값 기준으로 캔버스를 다시 그리면(지우고 모든 획을 다시 그림)
     * 매 프레임 무거운 작업이 끼어들어 뚝뚝 끊기므로, 실제로 다시 그리는 건 이
     * 상한 안에서만 하고 그 이상은 CSS 확대로 매끄럽게 처리한다(PdfPageCanvas의
     * renderWidth/displayWidth 분리와 같은 원리). */
    renderWidth: number;
    renderHeight: number;
    /** 실제로 화면에 보여줄 크기(줌에 따라 계속 바뀜). <canvas>는 img처럼 대체
     * 요소라서 className="absolute inset-0"만으로는 부모 div 크기에 맞춰 늘어나지
     * 않고 자기 raster 크기(renderWidth/renderHeight) 그대로 표시돼 버린다 - 그래서
     * PdfPageCanvas와 똑같이 style의 width/height로 명시적으로 지정해 줘야 한다.
     * 이게 빠져 있으면 필기 캔버스가 PDF와 다른 크기로 보여서, 쓴 글씨의 위치가
     * 어긋나고 줌에 비례해 커지지도 않는다. */
    displayWidth: number;
    displayHeight: number;
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
    /** 두 쪽 보기에서 이 쪽의 옆(경계) 너머로 그은 부분을 넘겨줄 옆 쪽. boundaryFx는
     * 이 쪽 기준 경계 위치(왼쪽 이웃이면 0, 오른쪽 이웃이면 1)다. 한 쪽 보기이거나
     * 이 쪽이 스프레드의 끝이라 옆 쪽이 없으면 undefined. */
    neighborAnnotation?: { boundaryFx: 0 | 1; getHandle: () => AnnotationLayerHandle | null };
  }
>(function AnnotationLayer(
  {
    uid,
    textbookId,
    page,
    renderWidth,
    renderHeight,
    displayWidth,
    displayHeight,
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
    neighborAnnotation,
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
      commitExternalPoints: (clientPoints, meta) => {
        if (readOnly) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const points: number[] = [];
        for (let i = 0; i < clientPoints.length; i += 2) {
          const [x, y] = toLocal(clientPoints[i], clientPoints[i + 1]);
          points.push(x / canvas.width, y / canvas.height);
        }
        if (points.length < 4) return;
        commit([
          ...strokesRef.current,
          { tool: meta.tool as "pen" | "colorPen", color: meta.color, width: meta.width, alpha: meta.alpha, points },
        ]);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, textbookId, page, readOnly, persist],
  );

  const redraw = (source: Stroke[], extra?: Stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // stroke.width는 STROKE_WIDTH_REFERENCE 기준으로 고른 값이므로, 확대/축소로 이
    // 캔버스의 실제 크기가 달라질 때마다 그 비율만큼 다시 환산해야 굵기가 쪽 크기에
    // 비례해서 커지고 작아진다(그렇지 않으면 축소했을 때 상대적으로 두꺼워 보인다).
    const widthScale = canvas.width / STROKE_WIDTH_REFERENCE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    source.forEach((s) => drawStroke(ctx, s, canvas.width, canvas.height, widthScale));
    if (extra) drawStroke(ctx, extra, canvas.width, canvas.height, widthScale);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 브라우저별 캔버스 최대 크기 한도를 넘으면 그리기가 깨지므로 안전하게 낮춘다
    // (PdfPageCanvas와 같은 이유 — 크게 확대했을 때 필기 캔버스도 함께 문제가 없도록).
    const largestSide = Math.max(renderWidth, renderHeight);
    const shrink = largestSide > MAX_CANVAS_DIMENSION ? MAX_CANVAS_DIMENSION / largestSide : 1;
    canvas.width = renderWidth * shrink;
    canvas.height = renderHeight * shrink;
    redraw(strokes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, renderWidth, renderHeight]);

  const toLocal = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      ((clientX - rect.left) / rect.width) * canvas.width,
      ((clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const strokeWidth = tool === "colorPen" ? penWidth : isShapeTool(tool) ? 2.5 : 1.4;
  const strokeAlpha = tool === "colorPen" ? penAlpha : 1;

  /** 이 쪽 경계 안에서 끝난 획은 그대로 커밋하고, 두 쪽 보기에서 옆 쪽 경계 너머로
   * 넘어간 획은 넘어간 부분만큼 옆 쪽에도 같이 커밋해서, 볼펜이나 도형을 두 쪽에
   * 걸쳐 자연스럽게 이어 그릴 수 있게 한다. */
  const commitAcrossBoundary = (
    points: number[],
    meta: { tool: DrawTool | ShapeTool; color: string; width: number; alpha: number },
  ) => {
    if (!neighborAnnotation) {
      commit([
        ...strokesRef.current,
        { tool: meta.tool as "pen" | "colorPen", color: meta.color, width: meta.width, alpha: meta.alpha, points },
      ]);
      return;
    }
    const runs = splitPointsByBoundary(points, neighborAnnotation.boundaryFx);
    const selfRuns = runs.filter((r) => r.self && r.points.length >= 4);
    const otherRuns = runs.filter((r) => !r.self && r.points.length >= 4);
    if (selfRuns.length > 0) {
      commit([
        ...strokesRef.current,
        ...selfRuns.map((r) => ({
          tool: meta.tool as "pen" | "colorPen",
          color: meta.color,
          width: meta.width,
          alpha: meta.alpha,
          points: r.points,
        })),
      ]);
    }
    if (otherRuns.length > 0) {
      const canvas = canvasRef.current;
      const neighbor = neighborAnnotation.getHandle();
      if (canvas && neighbor) {
        const rect = canvas.getBoundingClientRect();
        otherRuns.forEach((r) => {
          const clientPoints: number[] = [];
          for (let i = 0; i < r.points.length; i += 2) {
            clientPoints.push(rect.left + r.points[i] * rect.width, rect.top + r.points[i + 1] * rect.height);
          }
          neighbor.commitExternalPoints(clientPoints, meta);
        });
      }
    }
  };

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
      commitAcrossBoundary(points, { tool: "colorPen", color, width: strokeWidth, alpha: 1 });
      return;
    }
    if (!drawing.current) return;
    const points = drawing.current;
    drawing.current = null;
    if (points.length < 4) return; // ignore accidental taps
    commitAcrossBoundary(points, { tool: tool as DrawTool, color, width: strokeWidth, alpha: strokeAlpha });
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
          width: displayWidth,
          height: displayHeight,
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
