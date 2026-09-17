import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { ChapterMeta } from "@/types";

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

interface TocRow {
  ordinal: number;
  title: string;
  printedPage: number;
}

/** y좌표가 가까운(같은 줄) 텍스트 아이템끼리 묶는다. */
function clusterRowsByY(items: TextItem[]): { y: number; items: { str: string; x: number }[] }[] {
  const points = items
    .filter((it) => it.str.trim().length > 0)
    .map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }))
    .sort((a, b) => b.y - a.y);
  const rows: { y: number; items: { str: string; x: number }[] }[] = [];
  for (const pt of points) {
    let row = rows.find((r) => Math.abs(r.y - pt.y) <= 4);
    if (!row) {
      row = { y: pt.y, items: [] };
      rows.push(row);
    }
    row.items.push({ str: pt.str, x: pt.x });
  }
  return rows;
}

/**
 * "차례" 쪽 특유의 표 형태(번호 · 차시 제목 · 쪽번호가 한 줄에 나란히 배치)를 인식해서
 * 실제 목차 후보를 뽑아낸다. 번호/제목/쪽번호가 왼쪽→가운데→오른쪽 순서로 나열된 줄만 골라낸다.
 */
function extractTocRows(items: TextItem[]): TocRow[] {
  const rows = clusterRowsByY(items);
  const out: TocRow[] = [];
  for (const { items: row } of rows) {
    if (row.length < 3) continue;
    const sorted = [...row].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!/^\d{1,3}$/.test(first.str) || !/^\d{1,3}$/.test(last.str)) continue;
    const ordinal = Number(first.str);
    const printedPage = Number(last.str);
    if (printedPage <= ordinal) continue;
    const title = sorted
      .slice(1, -1)
      .map((r) => r.str)
      .join(" ")
      .trim();
    if (title.length < 2 || title.length > 40 || /^[0-9\s]+$/.test(title)) continue;
    out.push({ ordinal, title, printedPage });
  }
  out.sort((a, b) => a.printedPage - b.printedPage);
  return out;
}

/** 단원 도입쪽에 큼직하게 적힌 단원 제목(본문 글자보다 크고, 장식용 큰 번호보다는 작은 글자)을 찾는다. */
function findUnitTitle(items: TextItem[]): string | null {
  let best: { str: string; h: number } | null = null;
  for (const it of items) {
    const s = it.str.trim();
    if (!s || /^\d+$/.test(s)) continue;
    const h = Math.hypot(it.transform[2], it.transform[3]);
    if (h < 20 || h > 60) continue;
    if (!best || h > best.h) best = { str: s, h };
  }
  return best?.str ?? null;
}

const isTextItem = (it: unknown): it is TextItem =>
  typeof it === "object" && it !== null && "str" in it && "transform" in it;

/**
 * 교재 앞부분의 "차례" 쪽을 분석해서 실제 단원/차시 목차를 만든다.
 * 1) 쪽 하단에 인쇄된 쪽번호(예: "12 | 지구마을 첫걸음")를 스캔해서
 *    "인쇄된 쪽번호 → 실제 PDF 쪽번호" 대응표를 만들고,
 * 2) 앞부분 쪽들 중 번호·제목·쪽번호가 나란히 배열된 표 형태를 찾아 차시 목록으로 삼는다.
 * PDF 자체에 포함된 실제 차례를 그대로 읽어오는 방식이라 추측(휴리스틱)인 suggestChapters보다 정확하다.
 */
export async function extractRealChapters(pdf: PDFDocumentProxy): Promise<ChapterMeta[]> {
  const printedToPhysical = new Map<number, number>();
  const scanLimit = Math.min(pdf.numPages, 80);
  for (let p = 1; p <= scanLimit; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    const m = text.match(/(?:^|\s)(\d{1,3})\s*\|/) ?? text.match(/\|\s*(\d{1,3})(?:\s|$)/);
    if (m) {
      const n = Number(m[1]);
      if (!printedToPhysical.has(n)) printedToPhysical.set(n, p);
    }
  }

  const chapters: ChapterMeta[] = [];
  let unitCounter = 0;
  const tocScanLimit = Math.min(pdf.numPages, 20);
  for (let p = 1; p <= tocScanLimit; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter(isTextItem);
    const rows = extractTocRows(items);
    if (rows.length < 2) continue;

    unitCounter += 1;
    const unitTitle = findUnitTitle(items) ?? `단원 ${unitCounter}`;
    const firstPhysical = printedToPhysical.get(rows[0].printedPage);
    if (firstPhysical) {
      const unitStart = Math.max(1, firstPhysical - 1);
      chapters.push({
        title: `${unitCounter}단원. ${unitTitle}`,
        startPage: unitStart,
        printedPage: rows[0].printedPage - 1 > 0 ? rows[0].printedPage - 1 : undefined,
      });
    }
    for (const row of rows) {
      const physical = printedToPhysical.get(row.printedPage);
      if (!physical) continue;
      chapters.push({
        title: `${unitCounter}-${row.ordinal}. ${row.title}`,
        startPage: physical,
        printedPage: row.printedPage,
      });
    }
  }

  return chapters;
}
