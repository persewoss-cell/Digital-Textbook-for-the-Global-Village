export type Grade = 3 | 4 | 5 | 6;

export const GRADES: Grade[] = [3, 4, 5, 6];

/** 4자리 숫자 비밀번호 (방 비밀번호, 관리자 마스터 비밀번호 공통 형식) */
export const ROOM_PASSWORD_PATTERN = /^\d{4}$/;

export interface RoomDoc {
  id: string;
  grade: Grade;
  classNum: number;
  password: string; // 선생님(관리)용 비밀번호. 학생 참여에는 쓰이지 않음
  teacherName: string;
  createdAt: number;
  // 관리자가 승인하기 전까지는 학생 목록(방 찾기 화면)에 보이지 않는다. 선생님은
  // 승인 전에도 관리 화면에 들어가 학생 등록 등을 미리 준비할 수 있다.
  approved: boolean;
}

export interface ParticipantDoc {
  id: string; // `${roomId}_${studentNum}`
  roomId: string;
  studentNum: number;
  name: string;
  joinedAt: number;
}

export interface ChapterMeta {
  title: string;
  startPage: number; // 1-based page number in the PDF (실제 이동에 쓰는 물리적 쪽번호)
  printedPage?: number; // 교재에 실제로 인쇄된 쪽번호 (화면 표시용, startPage와 다를 수 있음)
}

export interface TextbookDoc {
  id: string;
  grade: Grade;
  subject: string;
  title: string;
  filePath: string; // 정적 파일 경로 (예: /textbooks/3/book.pdf), Firebase Hosting이 그대로 서빙
  pageCount: number | null;
  chapters: ChapterMeta[];
  uploadedAt: number;
}

export type DrawTool = "pen" | "colorPen" | "eraser";
export type ShapeTool = "rectangle" | "circle" | "line" | "triangle" | "arrow";
export type AnnotationTool = DrawTool | ShapeTool | "note" | "none";

export interface Stroke {
  tool: "pen" | "colorPen";
  color: string;
  width: number;
  alpha?: number; // 0-1, 형광펜처럼 반투명한 느낌을 위한 값. 없으면 1(불투명)
  // 색연필처럼 펜 종류에 따라 선을 다르게(질감 있게) 그려야 할 때 어떤 종류였는지
  // 기억해 둔다. colorPen이 아니거나 옛날에 저장된 획에는 없을 수 있다.
  penStyleId?: PenStyleId;
  points: number[]; // flattened [x1,y1,x2,y2,...] in 0-1 normalized page coordinates
}

/** 색펜을 눌렀을 때 고를 수 있는 펜 종류. 굵기/투명도 조합으로 느낌을 다르게 낸다.
 * width는 그 종류를 처음 고를 때 기준이 되는 "기본" 굵기 - 실제 그려지는 굵기는
 * 사용자가 슬라이더로 조정한 값(1~10단계)을 따로 저장해서 쓴다. */
export type PenStyleId = "ballpoint" | "highlighter" | "colorPencil" | "marker";
export interface PenStyleDef {
  id: PenStyleId;
  label: string;
  width: number;
  alpha: number;
}
export const PEN_STYLES: PenStyleDef[] = [
  { id: "ballpoint", label: "볼펜", width: 1.8, alpha: 1 },
  { id: "marker", label: "사인펜", width: 5, alpha: 1 },
  { id: "colorPencil", label: "색연필", width: 3.5, alpha: 0.8 },
  { id: "highlighter", label: "형광펜", width: 14, alpha: 0.35 },
];
export const DEFAULT_PEN_STYLE: PenStyleId = "ballpoint";

// 연필(색 없는 검정 연필)의 "기본" 굵기 - AnnotationLayer에서 예전에 고정값으로
// 쓰던 것과 같은 값이라, 굵기 조정 슬라이더를 새로 넣어도 지금까지 그려 둔
// 연필 필기의 두께가 그대로 유지된다.
export const PENCIL_BASE_WIDTH = 1.4;

// 굵기 조정 슬라이더는 1~10 정수 단계로 보여준다. 가장 얇은 1단계는 그 펜의
// "기본 굵기"의 5분의 1, 가장 굵은 10단계는 형광펜의 기본 굵기 - 즉 어떤 펜을
// 골라도 "이 펜다운 얇음"부터 "형광펜만큼 굵게"까지 조절할 수 있게 한다.
export const WIDTH_LEVELS = 10;
export const MAX_PEN_WIDTH = PEN_STYLES.find((s) => s.id === "highlighter")!.width;

export function widthForLevel(baseWidth: number, level: number): number {
  const min = baseWidth / 5;
  const clampedLevel = Math.min(WIDTH_LEVELS, Math.max(1, level));
  if (MAX_PEN_WIDTH <= min) return min;
  return min + (MAX_PEN_WIDTH - min) * ((clampedLevel - 1) / (WIDTH_LEVELS - 1));
}

export function levelForWidth(width: number, baseWidth: number): number {
  const min = baseWidth / 5;
  if (MAX_PEN_WIDTH <= min) return 1;
  const level = 1 + ((width - min) / (MAX_PEN_WIDTH - min)) * (WIDTH_LEVELS - 1);
  return Math.min(WIDTH_LEVELS, Math.max(1, Math.round(level)));
}

// 각 펜 종류를 처음 골랐을 때(아직 슬라이더를 만진 적 없을 때) 기본으로 보여줄
// 굵기 단계. 볼펜/색연필/사인펜/연필은 중간(5), 형광펜은 원래도 굵은 펜이라
// 조금 더 굵은 7단계를 기본으로 둔다.
export const DEFAULT_WIDTH_LEVEL: Record<PenStyleId, number> = {
  ballpoint: 5,
  marker: 5,
  colorPencil: 5,
  highlighter: 7,
};
export const DEFAULT_PENCIL_WIDTH_LEVEL = 5;

export interface PlacedNote {
  id: string;
  x: number; // 0-1 normalized page coordinates
  y: number;
  text: string;
  fontSize?: number; // px, 위/아래 화살표로 직접 조정. 없으면 기본값 사용
}

// uid 필드는 Firebase Auth 계정이 아니라 `${roomId}_${studentNum}` 형태의
// "방 안에서의 참가자 키"입니다. 계정 없이도 같은 방+번호로 다시 들어오면
// 이전 필기/노트/진도를 이어서 볼 수 있도록 하기 위한 값이에요.
export interface StudentNoteDoc {
  id: string; // `${uid}_${textbookId}_${page}`
  uid: string;
  roomId: string;
  textbookId: string;
  page: number;
  items: PlacedNote[];
  updatedAt: number;
}

export interface StudentAnnotationDoc {
  id: string;
  uid: string;
  roomId: string;
  textbookId: string;
  page: number;
  strokes: Stroke[];
  updatedAt: number;
}

export interface StudentProgressDoc {
  id: string; // `${uid}_${textbookId}`
  uid: string;
  roomId: string;
  textbookId: string;
  lastPage: number;
  viewedPages: Record<string, boolean>;
  totalPages: number;
  updatedAt: number;
}
