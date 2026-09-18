import { OPS, type PDFDocumentProxy } from "pdfjs-dist";

export interface ImageRegion {
  // 쪽 안에서의 위치/크기 (0-1 정규화, 왼쪽 위 기준) - PageLink와 같은 좌표계
  x: number;
  y: number;
  w: number;
  h: number;
}

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m1을 먼저 적용한 뒤 m2를 적용한 것과 같은 합성 행렬을 만든다 (PDF cm 연산자와 같은 규칙). */
function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function apply([a, b, c, d, e, f]: Matrix, x: number, y: number): [number, number] {
  return [a * x + c * y + e, b * x + d * y + f];
}

// 캐릭터 아이콘/불릿 같은 작은 장식 이미지는 확대해서 볼 가치가 없으니, 쪽 크기 대비
// 일정 비율보다 작은 이미지는 후보에서 뺀다.
const MIN_FRACTION = 0.08;
// 표의 배경색 칸처럼 단색 위에 검은 글씨/테두리가 살짝 섞인 경우, 최대-최소 밝기
// 차이만 보면 사진처럼 오해하기 쉽다(글자색과 배경색 차이가 커서). 그래서 "색이
// 얼마나 다양한가"가 아니라 "한 가지 색이 얼마나 압도적인가"로 판단한다 - 사진은
// 특정 색 하나가 점유율을 크게 차지하는 경우가 드물지만, 색칠+글자 조합은 배경색
// 하나가 대부분을 차지하고 글자색은 소수라서 한 색이 압도적으로 많다.
const DOMINANT_COLOR_SHARE_LIMIT = 0.6;

function isLikelyPhoto(canvas: HTMLCanvasElement, region: ImageRegion): boolean {
  try {
    const sx = Math.round(region.x * canvas.width);
    const sy = Math.round(region.y * canvas.height);
    const sw = Math.max(1, Math.round(region.w * canvas.width));
    const sh = Math.max(1, Math.round(region.h * canvas.height));
    const SAMPLE = 16;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = SAMPLE;
    sampleCanvas.height = SAMPLE;
    const sctx = sampleCanvas.getContext("2d");
    if (!sctx) return true;
    sctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, SAMPLE, SAMPLE);
    const { data } = sctx.getImageData(0, 0, SAMPLE, SAMPLE);

    const counts = new Map<string, number>();
    const totalSamples = SAMPLE * SAMPLE;
    const BUCKET = 24; // 색을 성기게 양자화해서 사실상 같은 색을 하나로 묶는다
    for (let i = 0; i < data.length; i += 4) {
      const key = [data[i], data[i + 1], data[i + 2]]
        .map((c) => Math.round(c / BUCKET))
        .join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dominantShare = Math.max(...counts.values()) / totalSamples;
    return dominantShare < DOMINANT_COLOR_SHARE_LIMIT;
  } catch {
    // 캔버스 픽셀을 못 읽는 경우(아직 안 그려짐 등)엔 안전하게 사진으로 취급한다.
    return true;
  }
}

/**
 * 쪽 콘텐츠 안에 그려진 실제 사진(래스터 이미지)의 위치를 찾는다. PDF 콘텐츠 스트림은
 * 이미지를 항상 (0,0)-(1,1) 정사각형에 그리고 그 시점의 변환행렬(CTM)로 실제 위치/크기가
 * 정해지므로, save/restore/transform 연산을 그대로 재생해서 CTM을 추적한 뒤 이미지를
 * 그리는 시점마다 그 사각형의 네 꼭짓점을 CTM으로 변환해 경계 상자를 구한다. 표 배경색
 * 처럼 단색을 늘린 "가짜 이미지"는 렌더링된 캔버스 픽셀을 확인해서 걸러낸다.
 */
export async function detectPageImages(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement | null,
): Promise<ImageRegion[]> {
  const page = await pdf.getPage(pageNumber);
  const [opList, viewport] = await Promise.all([
    page.getOperatorList(),
    Promise.resolve(page.getViewport({ scale: 1 })),
  ]);

  const regions: ImageRegion[] = [];
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === OPS.transform) {
      const args = opList.argsArray[i] as number[];
      ctm = multiply(args as Matrix, ctm);
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const corners = [
        apply(ctm, 0, 0),
        apply(ctm, 1, 0),
        apply(ctm, 0, 1),
        apply(ctm, 1, 1),
      ];
      const xs = corners.map((p) => p[0]);
      const ys = corners.map((p) => p[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const w = (x1 - x0) / viewport.width;
      const h = (y1 - y0) / viewport.height;
      if (w < MIN_FRACTION || h < MIN_FRACTION) continue;
      const region = { x: x0 / viewport.width, y: 1 - y1 / viewport.height, w, h };
      if (canvas && !isLikelyPhoto(canvas, region)) continue;
      regions.push(region);
    }
  }

  return regions;
}
