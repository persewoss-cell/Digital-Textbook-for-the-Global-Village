import jsQR from "jsqr";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface PageLink {
  // "url": 그냥 웹 링크(새 창으로 열기). "video": 유튜브 등 임베드 가능한 동영상
  // (팝업 안에 재생 화면을 띄움). "citation": 링크/QR 없이 "*출처: OOO"만 적혀 있는
  // 경우(눌렀을 때 그 출처를 새 창에서 검색해 보여줌).
  kind: "url" | "video" | "citation";
  url: string;
  // 쪽 안에서의 위치/크기 (0-1 정규화, 왼쪽 위 기준)
  x: number;
  y: number;
  w: number;
  h: number;
}

const URL_REGEX = /(https?:\/\/[^\s"'<>]+|www\.[a-z0-9-]+\.[a-z]{2,}[^\s"'<>]*)/gi;
const VIDEO_HOST_REGEX = /(youtube\.com|youtu\.be|vimeo\.com)/i;
// "*출처: OOO", "출처: OOO" 처럼 링크/QR 없이 글로만 적힌 출처 표기를 찾는다.
const CITATION_REGEX = /^\*?\s*(?:영상\s*)?출처\s*[:：]\s*(.+)$/;

function normalizeUrl(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** 유튜브 workspace/watch/단축 링크를 팝업 안에 그대로 재생할 수 있는 embed 주소로 바꾼다. */
export function toEmbeddableUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (/youtu\.be$/i.test(u.hostname)) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (/(^|\.)youtube\.com$/i.test(u.hostname)) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
      if (u.pathname.startsWith("/shorts/")) return `https://www.youtube.com/embed/${u.pathname.split("/")[2]}`;
      return null;
    }
    if (/(^|\.)vimeo\.com$/i.test(u.hostname)) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 쪽 텍스트에 그대로 적힌 http(s):// 링크를 찾아 클릭 가능한 영역으로 만든다. 링크가
 * 하나도 없는 줄에서 "출처: OOO"만 적혀 있으면(주로 영상 출처 표기), 눌렀을 때 그
 * 출처를 검색해 볼 수 있는 영역으로 만든다.
 */
async function detectTextLinks(pdf: PDFDocumentProxy, pageNumber: number): Promise<PageLink[]> {
  const page = await pdf.getPage(pageNumber);
  const [content, viewport] = await Promise.all([page.getTextContent(), Promise.resolve(page.getViewport({ scale: 1 }))]);
  const links: PageLink[] = [];

  for (const item of content.items) {
    if (!("str" in item) || !("transform" in item)) continue;
    const textItem = item as TextItem;
    const str = textItem.str.trim();
    const matches = textItem.str.match(URL_REGEX);

    const h = Math.hypot(textItem.transform[2], textItem.transform[3]) || 10;
    const x0 = textItem.transform[4];
    const yBottom = textItem.transform[5];
    const w = textItem.width || h * textItem.str.length * 0.5;
    const rect = {
      x: Math.max(0, x0 / viewport.width),
      y: Math.max(0, 1 - (yBottom + h) / viewport.height),
      w: Math.min(1, w / viewport.width),
      h: Math.min(1, h / viewport.height),
    };

    if (matches) {
      for (const raw of matches) {
        const url = normalizeUrl(raw);
        links.push({ kind: VIDEO_HOST_REGEX.test(url) ? "video" : "url", url, ...rect });
      }
      continue;
    }

    const citation = str.match(CITATION_REGEX);
    if (citation) {
      const query = citation[1].trim();
      if (query) {
        links.push({
          kind: "citation",
          url: `https://www.google.com/search?q=${encodeURIComponent(`${query} 영상`)}`,
          ...rect,
        });
      }
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
        kind: VIDEO_HOST_REGEX.test(url) ? "video" : "url",
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
