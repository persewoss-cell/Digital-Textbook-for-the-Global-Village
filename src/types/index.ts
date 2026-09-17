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
  startPage: number; // 1-based page number in the PDF
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
export type ShapeTool = "rectangle" | "circle" | "line";
export type AnnotationTool = DrawTool | ShapeTool | "note" | "none";

export interface Stroke {
  tool: "pen" | "colorPen";
  color: string;
  width: number;
  points: number[]; // flattened [x1,y1,x2,y2,...] in 0-1 normalized page coordinates
}

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
