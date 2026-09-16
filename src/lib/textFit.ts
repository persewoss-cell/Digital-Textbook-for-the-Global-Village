let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d")!;
  }
  return measureCtx;
}

function wraps(text: string, fontPx: number, maxWidth: number, maxLines: number): boolean {
  const ctx = getMeasureCtx();
  ctx.font = `${fontPx}px sans-serif`;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  let lines = 1;
  let lineWidth = 0;
  for (const word of words) {
    const w = ctx.measureText(`${word} `).width;
    if (lineWidth + w > maxWidth) {
      lines += 1;
      lineWidth = w;
      if (lines > maxLines) return false;
    } else {
      lineWidth += w;
    }
  }
  return true;
}

/** 텍스트가 주어진 너비/줄 수 안에 들어가도록 폰트 크기를 자동으로 줄여준다. */
export function fitFontSize(
  text: string,
  maxWidthPx: number,
  { maxFontPx = 18, minFontPx = 8, maxLines = 3 }: { maxFontPx?: number; minFontPx?: number; maxLines?: number } = {},
): number {
  if (!text.trim()) return maxFontPx;
  for (let size = maxFontPx; size >= minFontPx; size -= 1) {
    if (wraps(text, size, maxWidthPx, maxLines)) return size;
  }
  return minFontPx;
}
