import jsQR from "jsqr";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface PageLink {
  url: string;
  // 쪽 안에서의 위치/크기 (0-1 정규화, 왼쪽 위 기준)
  x: number;
  y: number;
  w: number;
  h: number;
}

const URL_REGEX = /(https?:\/\/[^\s"'<>]+|www\.[a-z0-9-]+\.[a-z]{2,}[^\s"'<>]*)/gi;

function normalizeUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** 쪽 텍스트에 그대로 적힌 http(s):// 링크를 찾아 클릭 가능한 영역으로 만든다. */
async function detectTextLinks(pdf: PDFDocumentProxy, pageNumber: number): Promise<PageLink[]> {
  const page = await pdf.getPage(pageNumber);
  const [content, viewport] = await Promise.all([page.getTextContent(), Promise.resolve(page.getViewport({ scale: 1 }))]);
  const links: PageLink[] = [];

  for (const item of content.items) {
    if (!("str" in item) || !("transform" in item)) continue;
    const textItem = item as TextItem;
    const matches = textItem.str.match(URL_REGEX);
    if (!matches) continue;

    const h = Math.hypot(textItem.transform[2], textItem.transform[3]) || 10;
    const x0 = textItem.transform[4];
    const yBottom = textItem.transform[5];
    const w = textItem.width || h * textItem.str.length * 0.5;

    for (const raw of matches) {
      links.push({
        url: normalizeUrl(raw),
        x: Math.max(0, x0 / viewport.width),
        y: Math.max(0, 1 - (yBottom + h) / viewport.height),
        w: Math.min(1, w / viewport.width),
        h: Math.min(1, h / viewport.height),
      });
    }
  }

  return links;
}

/** 렌더링된 쪽 캔버스 안에서 QR코드를 찾아 클릭 가능한 영역으로 만든다. */
function detectQrLinks(canvas: HTMLCanvasElement): PageLink[] {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(data, width, height);
    if (!result || !result.data) return [];
    const url = normalizeUrl(result.data);

    const pts = [
      result.location.topLeftCorner,
      result.location.topRightCorner,
      result.location.bottomLeftCorner,
      result.location.bottomRightCorner,
    ];
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));

    return [
      {
        url,
        x: minX / width,
        y: minY / height,
        w: (maxX - minX) / width,
        h: (maxY - minY) / height,
      },
    ];
  } catch {
    // 캔버스 픽셀을 읽을 수 없는 경우(예: 아직 그려지기 전) 조용히 무시한다.
    return [];
  }
}

/** 쪽에 있는 텍스트 링크와 QR코드를 모두 찾아 하나의 목록으로 합친다. */
export async function detectPageLinks(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement | null,
): Promise<PageLink[]> {
  const [textLinks, qrLinks] = await Promise.all([
    detectTextLinks(pdf, pageNumber).catch(() => []),
    Promise.resolve(canvas ? detectQrLinks(canvas) : []),
  ]);
  return [...textLinks, ...qrLinks];
}
