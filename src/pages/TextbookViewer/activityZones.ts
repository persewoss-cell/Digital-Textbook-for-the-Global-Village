import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface ActivityZone {
  // 쪽 안에서의 위치/크기 (0-1 정규화, 왼쪽 위 기준) - PageLink와 같은 좌표계
  x: number;
  y: number;
  w: number;
  h: number;
}

// "지구마을" 시리즈 전체에서 공통으로 쓰이는 활동 단계 라벨(캐릭터 아이콘 옆에 적힌 글자).
// 이 단어들이 정확히 일치하는 텍스트 항목만 단계 제목으로 본다(문장 속 일부로 등장하는
// "결과 정리하기" 같은 건 걸러내기 위해 부분일치가 아니라 완전일치로 검사).
const STEP_LABELS = new Set(["준비하기", "활동하기", "계획하기", "실천하기", "키워가기"]);
// 쪽 맨 앞에 그 단원의 전체 흐름을 미리 보여주는 작은 요약 그림(글자 크기 13 안팎)에도
// 같은 단어가 쓰이는데, 그건 실제 활동 내용이 아니라 안내용이라 확대 대상에서 제외한다.
const MIN_HEADER_SIZE = 14;
// 라벨 위쪽에 있는 캐릭터/장식 아이콘까지 함께 확대되도록 라벨 위로 살짝 더 여유를 둔다.
const TOP_PAD = 46;
const BOTTOM_MARGIN = 22;

interface HeaderPoint {
  x: number;
  y: number;
}

/**
 * 쪽 텍스트에서 "준비하기/활동하기/계획하기/실천하기" 라벨의 위치를 찾아, 각 라벨부터
 * 다음 라벨(또는 쪽 끝) 전까지를 하나의 확대 구간으로 묶는다. 한 쪽에 좌/우 두 흐름이
 * 나란히 있을 수도 있어서(예: 왼쪽엔 준비하기→활동하기, 오른쪽엔 계획하기→실천하기),
 * 라벨의 가로 위치를 기준으로 좌/우 그룹으로 나눈 뒤 각 그룹 안에서만 순서를 매긴다.
 */
export async function detectActivityZones(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<ActivityZone[]> {
  const page = await pdf.getPage(pageNumber);
  const [content, viewport] = await Promise.all([
    page.getTextContent(),
    Promise.resolve(page.getViewport({ scale: 1 })),
  ]);

  const headers: HeaderPoint[] = content.items
    .filter((it): it is TextItem => "str" in it && "transform" in it)
    .filter((it) => STEP_LABELS.has(it.str.trim()))
    .map((it) => ({ x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[2], it.transform[3]) }))
    .filter((h) => h.size >= MIN_HEADER_SIZE);

  if (headers.length === 0) return [];

  const midX = viewport.width / 2;
  const columns = [headers.filter((h) => h.x < midX), headers.filter((h) => h.x >= midX)];

  const zones: ActivityZone[] = [];
  columns.forEach((col, colIndex) => {
    if (col.length === 0) return;
    const sorted = [...col].sort((a, b) => b.y - a.y); // 페이지 위에서 아래 순서
    const left = colIndex === 0 ? 0 : midX;
    const right = colIndex === 0 ? midX : viewport.width;

    sorted.forEach((header, i) => {
      const prevY = i === 0 ? viewport.height : sorted[i - 1].y;
      const nextY = i === sorted.length - 1 ? BOTTOM_MARGIN : sorted[i + 1].y;
      const top = Math.min(header.y + TOP_PAD, header.y + (prevY - header.y) / 2);
      const bottom = nextY;
      if (top <= bottom) return;

      zones.push({
        x: left / viewport.width,
        y: 1 - top / viewport.height,
        w: (right - left) / viewport.width,
        h: (top - bottom) / viewport.height,
      });
    });
  });

  return zones;
}
