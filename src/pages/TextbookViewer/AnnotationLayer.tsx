import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { saveAnnotation, watchAnnotation } from "@/lib/firestore";
import type { DrawTool, Stroke } from "@/types";

export interface AnnotationLayerHandle {
  undo: () => void;
  redo: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

const PENCIL_COLOR = "#52525b"; // 연필은 항상 회색 연필 느낌으로 고정

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  if (stroke.points.length < 4) return;
  ctx.strokeStyle = stroke.tool === "pen" ? PENCIL_COLOR : stroke.color;
  ctx.globalAlpha = 1;
  ctx.lineWidth = stroke.width;
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

export const AnnotationLayer = forwardRef<
  AnnotationLayerHandle,
  {
    uid: string;
    textbookId: string;
    page: number;
    width: number;
    height: number;
    tool: DrawTool | "none";
    color: string;
    eraserSize: number;
    readOnly: boolean;
    onDraw?: () => void;
  }
>(function AnnotationLayer(
  { uid, textbookId, page, width, height, tool, color, eraserSize, readOnly, onDraw },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const drawing = useRef<number[] | null>(null);
  const erasingDraft = useRef<Stroke[] | null>(null);
  const history = useRef<Stroke[][]>([]);
  const future = useRef<Stroke[][]>([]);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    history.current = [];
    future.current = [];
    return watchAnnotation(uid, textbookId, page, (a) => setStrokes(a?.strokes ?? []));
  }, [uid, textbookId, page]);

  const commit = (next: Stroke[]) => {
    history.current.push(strokesRef.current);
    if (history.current.length > 50) history.current.shift();
    future.current = [];
    setStrokes(next);
    void saveAnnotation(uid, textbookId, page, next);
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
        void saveAnnotation(uid, textbookId, page, prev);
      },
      redo: () => {
        if (readOnly || future.current.length === 0) return;
        const next = future.current.pop()!;
        history.current.push(strokesRef.current);
        setStrokes(next);
        void saveAnnotation(uid, textbookId, page, next);
      },
      getCanvas: () => canvasRef.current,
    }),
    [uid, textbookId, page, readOnly],
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

  const strokeWidth = tool === "colorPen" ? 2.5 : 2;

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
    drawing.current = [x / canvasRef.current!.width, y / canvasRef.current!.height];
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
    if (!drawing.current) return;
    const [x, y] = toLocal(e.clientX, e.clientY);
    drawing.current.push(x / canvasRef.current!.width, y / canvasRef.current!.height);
    redraw(strokes, { tool: tool as "pen" | "colorPen", color, width: strokeWidth, points: drawing.current });
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
    if (!drawing.current) return;
    const points = drawing.current;
    drawing.current = null;
    if (points.length < 4) return; // ignore accidental taps
    commit([...strokes, { tool: tool as "pen" | "colorPen", color, width: strokeWidth, points }]);
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
          cursor: tool === "eraser" ? "none" : tool === "pen" || tool === "colorPen" ? "crosshair" : "default",
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
