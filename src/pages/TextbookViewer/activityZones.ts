import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

export interface Rect {
  // 쪽 안에서의 위치/크기 (0-1 정규화, 왼쪽 위 기준) - PageLink와 같은 좌표계
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ActivityZone {
  // 실제로 누를 수 있는(hover/tap) 작은 영역 - 캐릭터 아이콘이나 번호 배지만큼만.
  trigger: Rect;
  // 확대됐을 때(또는 미리보기 테두리로) 보여줄 그 활동의 전체 범위.
  target: Rect;
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
// "1", "2"처럼 활동 단계 안의 세부 문항 앞에 붙는 숫자 배지. 표 안의 숫자 등과
// 헷갈리지 않도록, 바로 옆(같은 줄)에 숫자가 아닌 제목 글자가 있을 때만 인정한다.
const NUMBER_MARKER_REGEX = /^[1-9][0-9]?$/;

// 캐릭터 아이콘+라벨 글자를 덮는 정도의 작은 클릭 범위(라벨 왼쪽/위로 캐릭터가 있고,
// 오른쪽으로 글자가 이어짐).
const STEP_TRIGGER_LEFT_PAD = 14;
const STEP_TRIGGER_WIDTH = 130;
const STEP_TRIGGER_TOP_PAD = 44;
const STEP_TRIGGER_BOTTOM_PAD = 14;
// 숫자 배지 하나만 덮는 아주 작은 클릭 범위.
const NUMBER_TRIGGER_LEFT_PAD = 8;
const NUMBER_TRIGGER_WIDTH = 26;
const NUMBER_TRIGGER_TOP_PAD = 15;
const NUMBER_TRIGGER_BOTTOM_PAD = 7;

interface Point {
  x: number;
  y: number;
}

function toLocal(items: TextItem[], viewport: { viewBox: number[] }) {
  const [vx0, vy0] = viewport.viewBox;
  return items.map((it) => ({
    str: it.str.trim(),
    x: it.transform[4] - vx0,
    y: it.transform[5] - vy0,
    size: Math.hypot(it.transform[2], it.transform[3]),
  }));
}

function toRect(left: number, top: number, right: number, bottom: number, viewport: { width: number; height: number }): Rect {
  return {
    x: left / viewport.width,
    y: 1 - top / viewport.height,
    w: (right - left) / viewport.width,
    h: (top - bottom) / viewport.height,
  };
}

/** anchor(현재 항목)부터 다음 anchor 전까지를 하나의 확대 구간(target)으로 만든다. */
function buildTarget(
  anchor: Point,
  prevY: number,
  nextY: number,
  left: number,
  right: number,
  viewport: { width: number; height: number },
): Rect | null {
  const top = Math.min(anchor.y + TOP_PAD, anchor.y + (prevY - anchor.y) / 2);
  const bottom = nextY;
  if (top <= bottom) return null;
  return toRect(left, top, right, bottom, viewport);
}

/**
 * 쪽 텍스트에서 "준비하기/활동하기/계획하기/실천하기/키워가기" 라벨의 위치를 찾아, 각
 * 라벨부터 다음 라벨(또는 쪽 끝) 전까지를 하나의 확대 구간(target - 캐릭터를 누르면 그
 * 단계 전체가 확대됨)으로 묶는다. 그 안에 "1", "2"처럼 번호가 매겨진 세부 문항이 있으면,
 * 번호부터 다음 번호(또는 다음 단계) 전까지를 더 작은 확대 구간(캐릭터 없이 번호만 있는
 * 문항도 포함 - 예: "3 발표하기")으로 따로 만든다. 실제로 누를 수 있는 범위(trigger)는
 * 캐릭터 아이콘/번호 배지 부분만큼만 작게 잡아서, 그 옆 본문 내용을 눌렀을 때는(필기 등)
 * 확대 테두리가 뜨지 않게 한다. 한 쪽에 좌/우 두 흐름이 나란히 있을 수도 있어서, 가로
 * 위치를 기준으로 좌/우 그룹으로 나눈 뒤 각 그룹 안에서만 순서를 매긴다.
 */
export async function detectActivityZones(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<{ zones: ActivityZone[]; subZones: ActivityZone[] }> {
  const page = await pdf.getPage(pageNumber);
  const [content, viewport] = await Promise.all([
    page.getTextContent(),
    Promise.resolve(page.getViewport({ scale: 1 })),
  ]);

  // 이 PDF는 스프레드의 오른쪽 쪽이 원점이 0이 아닌 별도 좌표 공간을 쓰기도 해서
  // (viewport.viewBox[0]이 0이 아님), 원본 좌표를 그대로 쓰면 오른쪽 쪽에서 위치가
  // 완전히 어긋난다. 항상 이 쪽만의 좌표(0부터 시작)로 옮겨서 계산해야 한다.
  const items = toLocal(
    content.items.filter((it): it is TextItem => "str" in it && "transform" in it),
    viewport,
  );

  const stepHeaders = items.filter((it) => STEP_LABELS.has(it.str) && it.size >= MIN_HEADER_SIZE);
  const numberMarkers = items.filter((it) => NUMBER_MARKER_REGEX.test(it.str)).filter((marker) =>
    // 같은 줄(y가 비슷함)에 숫자가 아닌 텍스트가 오른쪽에 있어야 "번호 배지"로 인정한다
    // (표 안에 덩그러니 있는 숫자 데이터 등을 걸러내기 위함).
    items.some(
      (other) =>
        other !== marker &&
        Math.abs(other.y - marker.y) <= 4 &&
        other.x > marker.x &&
        other.x - marker.x < 60 &&
        !/^[0-9]+$/.test(other.str) &&
        other.str.length >= 2,
    ),
  );

  if (stepHeaders.length === 0 && numberMarkers.length === 0) return { zones: [], subZones: [] };

  const midX = viewport.width / 2;
  const zones: ActivityZone[] = [];
  const subZones: ActivityZone[] = [];

  // 한 쪽 안에 좌/우 두 흐름이 나란히 있을 때만(양쪽 절반에 모두 라벨/번호가 있을 때만)
  // 가운데로 나눠서 각자의 확대 범위가 서로 넘어가지 않게 한다. 흐름이 하나뿐인
  // (한쪽 절반에만 내용이 있는) 보통의 쪽에서까지 나누면, 확대 범위가 페이지의 절반
  // 너비로 잘려서 실제 내용의 오른쪽 끝까지 닿지 못하는 문제가 생긴다.
  const hasLeftFlow = [...stepHeaders, ...numberMarkers].some((p) => p.x < midX);
  const hasRightFlow = [...stepHeaders, ...numberMarkers].some((p) => p.x >= midX);
  const twoColumns = hasLeftFlow && hasRightFlow;
  const columns: [number, number][] = twoColumns
    ? [
        [0, midX],
        [midX, viewport.width],
      ]
    : [[0, viewport.width]];

  for (const [left, right] of columns) {
    const inColumn = (p: Point) => (!twoColumns ? true : left === 0 ? p.x < midX : p.x >= midX);

    const steps = stepHeaders.filter(inColumn).sort((a, b) => b.y - a.y);
    steps.forEach((header, i) => {
      const prevY = i === 0 ? viewport.height : steps[i - 1].y;
      const nextY = i === steps.length - 1 ? BOTTOM_MARGIN : steps[i + 1].y;
      const target = buildTarget(header, prevY, nextY, left, right, viewport);
      if (!target) return;
      const trigger = toRect(
        header.x - STEP_TRIGGER_LEFT_PAD,
        header.y + STEP_TRIGGER_TOP_PAD,
        header.x - STEP_TRIGGER_LEFT_PAD + STEP_TRIGGER_WIDTH,
        header.y - STEP_TRIGGER_BOTTOM_PAD,
        viewport,
      );
      zones.push({ trigger, target });
    });

    // 세부 문항 확대 구간은 "번호"와 "단계 라벨"을 모두 합쳐 순서대로 나열한 뒤, 번호
    // 하나하나가 그 다음 항목(번호든 단계든) 직전까지를 자기 구간으로 갖게 한다.
    const combined = [
      ...numberMarkers.filter(inColumn).map((p) => ({ ...p, isNumber: true })),
      ...steps.map((p) => ({ ...p, isNumber: false })),
    ].sort((a, b) => b.y - a.y);
    combined.forEach((anchor, i) => {
      if (!anchor.isNumber) return;
      const prevY = i === 0 ? viewport.height : combined[i - 1].y;
      const nextY = i === combined.length - 1 ? BOTTOM_MARGIN : combined[i + 1].y;
      const target = buildTarget(anchor, prevY, nextY, left, right, viewport);
      if (!target) return;
      const trigger = toRect(
        anchor.x - NUMBER_TRIGGER_LEFT_PAD,
        anchor.y + NUMBER_TRIGGER_TOP_PAD,
        anchor.x - NUMBER_TRIGGER_LEFT_PAD + NUMBER_TRIGGER_WIDTH,
        anchor.y - NUMBER_TRIGGER_BOTTOM_PAD,
        viewport,
      );
      subZones.push({ trigger, target });
    });
  }

  return { zones, subZones };
}
