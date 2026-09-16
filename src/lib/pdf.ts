import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const cache = new Map<string, Promise<PDFDocumentProxy>>();

export function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let existing = cache.get(url);
  if (!existing) {
    existing = pdfjsLib.getDocument(url).promise;
    cache.set(url, existing);
  }
  return existing;
}

export async function getPdfPageCountFromBuffer(data: ArrayBuffer): Promise<number> {
  const pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  return pdfDoc.numPages;
}

export async function extractPageText(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ");
}

/**
 * PDF에 임베드된 목차(outline)가 있으면 그걸 쓰고, 없으면 페이지별 텍스트 크기를 분석해서
 * 단원 시작으로 보이는 쪽을 후보로 뽑아준다. 100% 정확하지 않을 수 있어서 관리자가
 * 확인하고 수정한 뒤 저장하도록 "제안" 용도로만 써야 한다.
 */
export async function suggestChapters(
  pdf: PDFDocumentProxy,
): Promise<{ title: string; startPage: number }[]> {
  const suggestions: { title: string; startPage: number }[] = [];
  const maxScan = Math.min(pdf.numPages, 200);

  for (let p = 1; p <= maxScan; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter(
      (it): it is TextItem => "str" in it && "transform" in it && it.str.trim().length > 0,
    );
    if (items.length === 0) continue;

    const sizes = items.map((it) => Math.hypot(it.transform[2], it.transform[3]));
    const maxSize = Math.max(...sizes);
    if (maxSize < 40) continue;

    const bigText = items
      .filter((_, i) => sizes[i] >= maxSize - 1)
      .map((it) => it.str.trim())
      .join(" ")
      .trim();
    if (!bigText || bigText.length > 20) continue;

    const contextText = items
      .filter((it, i) => sizes[i] < maxSize - 1 && it.str.trim().length > 1)
      .slice(0, 3)
      .map((it) => it.str.trim())
      .join(" ")
      .slice(0, 30);

    suggestions.push({
      title: contextText ? `${bigText}. ${contextText}` : bigText,
      startPage: p,
    });
  }

  return suggestions.slice(0, 20);
}
