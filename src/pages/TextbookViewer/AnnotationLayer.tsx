import { useEffect, useRef, useState } from "react";
import { saveAnnotation, watchAnnotation } from "@/lib/firestore";
import type { Stroke, StrokeTool } from "@/types";

export type AnnotationTool = StrokeTool | "none";

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
) {
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

export function AnnotationLayer({
  uid,
  textbookId,
  page,
  width,
  height,
  tool,
  color,
  readOnly,
}: {
  uid: string;
  textbookId: string;
  page: number;
  width: number;
  height: number;
  tool: AnnotationTool;
  color: string;
  readOnly: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const drawing = useRef<number[] | null>(null);

  useEffect(
    () => watchAnnotation(uid, textbookId, page, (a) => setStrokes(a?.strokes ?? [])),
    [uid, textbookId, page],
  );

  const redraw = (extra?: Stroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(ctx, s, canvas.width, canvas.height);
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

  const toNorm = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height];
  };

  const strokeWidth = tool === "highlighter" ? 16 : 3;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || tool === "none") return;
    const [x, y] = toNorm(e.clientX, e.clientY);
    drawing.current = [x, y];
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const [x, y] = toNorm(e.clientX, e.clientY);
    drawing.current.push(x, y);
    redraw({ tool: tool as StrokeTool, color, width: strokeWidth, points: drawing.current });
  };

  const handlePointerUp = async () => {
    if (!drawing.current) return;
    const points = drawing.current;
    drawing.current = null;
    if (points.length < 4) return; // ignore accidental taps
    const next = [...strokes, { tool: tool as StrokeTool, color, width: strokeWidth, points }];
    setStrokes(next);
    await saveAnnotation(uid, textbookId, page, next);
  };

  const interactive = !readOnly && tool !== "none";

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        touchAction: interactive ? "none" : "auto",
        pointerEvents: interactive ? "auto" : "none",
        cursor: interactive ? "crosshair" : "default",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
