import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
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
