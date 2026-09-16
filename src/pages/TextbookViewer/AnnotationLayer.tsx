import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { saveAnnotation, watchAnnotation } from "@/lib/firestore";
import type { DrawTool, Stroke } from "@/types";

export interface AnnotationLayerHandle {
  undo: () => void;
  redo: () => void;
  getCanvas: () => HTMLCanvasElement | null;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, w: number, h: number) {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
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
  ctx.globalAlpha = 1;
}

function distanceToStrokePx(stroke: Stroke, px: number, py: number, w: number, h: number): number {
  let min = Infinity;
  for (let i = 0; i < stroke.points.length; i += 2) {
    const sx = stroke.points[i] * w;
    const sy = stroke.points[i + 1] * h;
    const d = Math.hypot(px - sx, py - sy);
    if (d < min) min = d;
  }
  return min;
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
  const erasing = useRef<Set<number> | null>(null);
  const history = useRef<Stroke[][]>([]);
  const future = useRef<Stroke[][]>([]);

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

  const redraw = (extra?: Stroke, skip?: Set<number>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach((s, i) => {
      if (skip?.has(i)) return;
      drawStroke(ctx, s, canvas.width, canvas.height);
    });
    if (extra) drawStroke(ctx, extra, canvas.width, canvas.height);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    redraw();
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

  const strokeWidth = tool === "highlighter" ? 16 : 3;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || tool === "none") return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (tool === "eraser") {
      erasing.current = new Set();
      const [px, py] = toLocal(e.clientX, e.clientY);
      strokes.forEach((s, i) => {
        if (distanceToStrokePx(s, px, py, canvasRef.current!.width, canvasRef.current!.height) <= eraserSize) {
          erasing.current!.add(i);
        }
      });
      redraw(undefined, erasing.current);
      return;
    }
    const [x, y] = toLocal(e.clientX, e.clientY);
    drawing.current = [x / canvasRef.current!.width, y / canvasRef.current!.height];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "eraser" && erasing.current) {
      const [px, py] = toLocal(e.clientX, e.clientY);
      strokes.forEach((s, i) => {
        if (erasing.current!.has(i)) return;
        if (distanceToStrokePx(s, px, py, canvasRef.current!.width, canvasRef.current!.height) <= eraserSize) {
          erasing.current!.add(i);
        }
      });
      redraw(undefined, erasing.current);
      return;
    }
    if (!drawing.current) return;
    const [x, y] = toLocal(e.clientX, e.clientY);
    drawing.current.push(x / canvasRef.current!.width, y / canvasRef.current!.height);
    redraw({ tool: tool as "pen" | "highlighter", color, width: strokeWidth, points: drawing.current });
  };

  const handlePointerUp = () => {
    if (tool === "eraser" && erasing.current) {
      if (erasing.current.size > 0) {
        commit(strokes.filter((_, i) => !erasing.current!.has(i)));
      }
      erasing.current = null;
      return;
    }
    if (!drawing.current) return;
    const points = drawing.current;
    drawing.current = null;
    if (points.length < 4) return; // ignore accidental taps
    commit([...strokes, { tool: tool as "pen" | "highlighter", color, width: strokeWidth, points }]);
  };

  const interactive = !readOnly && tool !== "none";

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        touchAction: interactive ? "none" : "auto",
        pointerEvents: interactive ? "auto" : "none",
        cursor:
          tool === "eraser" ? "cell" : tool === "pen" || tool === "highlighter" ? "crosshair" : "default",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
});
