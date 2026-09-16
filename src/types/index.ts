export type Role = "admin" | "teacher" | "student";

export type Grade = 3 | 4 | 5 | 6;

export const GRADES: Grade[] = [3, 4, 5, 6];

export type AccountStatus = "pending" | "active" | "rejected" | "disabled";

export interface UserDoc {
  uid: string;
  role: Role;
  name: string;
  grade: Grade | null;
  classNum: number | null;
  studentNum: number | null;
  classId: string | null; // `${grade}-${classNum}`
  status: AccountStatus;
  loginKey: string; // deterministic key used to build the synthetic auth email
  createdAt: number;
  approvedAt?: number | null;
  approvedBy?: string | null;
}

export interface ClassDoc {
  id: string; // `${grade}-${classNum}`
  grade: Grade;
  classNum: number;
  teacherUid: string | null;
  teacherName: string | null;
  createdAt: number;
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
  storagePath: string; // Firebase Storage path to the PDF
  pageCount: number | null;
  chapters: ChapterMeta[];
  uploadedAt: number;
  uploadedBy: string;
}

export interface StudentNoteDoc {
  id: string; // `${uid}_${textbookId}_${page}`
  uid: string;
  textbookId: string;
  page: number;
  text: string;
  updatedAt: number;
}

export type StrokeTool = "pen" | "highlighter";

export interface Stroke {
  tool: StrokeTool;
  color: string;
  width: number;
  points: number[]; // flattened [x1,y1,x2,y2,...] in 0-1 normalized page coordinates
}

export interface StudentAnnotationDoc {
  id: string; // `${uid}_${textbookId}_${page}`
  uid: string;
  textbookId: string;
  page: number;
  strokes: Stroke[];
  updatedAt: number;
}

export interface StudentBookmarkDoc {
  id: string; // `${uid}_${textbookId}_${page}`
  uid: string;
  textbookId: string;
  page: number;
  createdAt: number;
}

export interface StudentProgressDoc {
  id: string; // `${uid}_${textbookId}`
  uid: string;
  textbookId: string;
  lastPage: number;
  viewedPages: Record<string, boolean>;
  totalPages: number;
  updatedAt: number;
}

export interface AppUser {
  uid: string;
  doc: UserDoc;
}
