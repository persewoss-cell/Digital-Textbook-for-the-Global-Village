import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import type {
  ChapterMeta,
  Grade,
  PlacedNote,
  StudentAnnotationDoc,
  StudentNoteDoc,
  StudentProgressDoc,
  Stroke,
  TextbookDoc,
} from "@/types";

// ---------- textbooks ----------
export function watchTextbooksByGrade(
  grade: Grade,
  cb: (books: TextbookDoc[]) => void,
): Unsubscribe {
  const q = query(collection(db, "textbooks"), where("grade", "==", grade));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as TextbookDoc)));
}

export function watchAllTextbooks(cb: (books: TextbookDoc[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "textbooks"), (snap) =>
    cb(snap.docs.map((d) => d.data() as TextbookDoc)),
  );
}

export async function getTextbook(id: string): Promise<TextbookDoc | null> {
  const snap = await getDoc(doc(db, "textbooks", id));
  return snap.exists() ? (snap.data() as TextbookDoc) : null;
}

/** 방에 처음 들어갈 때 해당 학년의 (첫 번째) 교재로 바로 이동하기 위한 1회성 조회 */
export async function getFirstTextbookForGrade(grade: Grade): Promise<TextbookDoc | null> {
  const q = query(collection(db, "textbooks"), where("grade", "==", grade), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : (snap.docs[0].data() as TextbookDoc);
}

export async function createTextbookDoc(input: {
  id: string;
  grade: Grade;
  subject: string;
  title: string;
  filePath: string;
  pageCount: number;
}) {
  const data: TextbookDoc = {
    ...input,
    chapters: [],
    uploadedAt: Date.now(),
  };
  await setDoc(doc(db, "textbooks", input.id), data);
}

export async function updateTextbookChapters(id: string, chapters: ChapterMeta[]) {
  await updateDoc(doc(db, "textbooks", id), { chapters });
}

export async function deleteTextbookDoc(id: string) {
  await deleteDoc(doc(db, "textbooks", id));
}

// ---------- 참가자(=uid: `${roomId}_${studentNum}`)별 노트/필기/진도 ----------
const pageKey = (uid: string, textbookId: string, page: number) => `${uid}_${textbookId}_${page}`;
const roomIdOf = (uid: string) => uid.split("_")[0];

export async function saveNoteItems(
  uid: string,
  textbookId: string,
  page: number,
  items: PlacedNote[],
) {
  const id = pageKey(uid, textbookId, page);
  const data: StudentNoteDoc = {
    id,
    uid,
    roomId: roomIdOf(uid),
    textbookId,
    page,
    items,
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, "studentNotes", id), data);
}

export function watchNote(
  uid: string,
  textbookId: string,
  page: number,
  cb: (note: StudentNoteDoc | null) => void,
): Unsubscribe {
  const id = pageKey(uid, textbookId, page);
  return onSnapshot(doc(db, "studentNotes", id), (snap) =>
    cb(snap.exists() ? (snap.data() as StudentNoteDoc) : null),
  );
}

export async function saveAnnotation(
  uid: string,
  textbookId: string,
  page: number,
  strokes: Stroke[],
) {
  const id = pageKey(uid, textbookId, page);
  const data: StudentAnnotationDoc = {
    id,
    uid,
    roomId: roomIdOf(uid),
    textbookId,
    page,
    strokes,
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, "studentAnnotations", id), data);
}

export function watchAnnotation(
  uid: string,
  textbookId: string,
  page: number,
  cb: (a: StudentAnnotationDoc | null) => void,
): Unsubscribe {
  const id = pageKey(uid, textbookId, page);
  return onSnapshot(doc(db, "studentAnnotations", id), (snap) =>
    cb(snap.exists() ? (snap.data() as StudentAnnotationDoc) : null),
  );
}

export async function updateProgress(
  uid: string,
  textbookId: string,
  page: number,
  totalPages: number,
) {
  const id = `${uid}_${textbookId}`;
  const ref = doc(db, "studentProgress", id);
  const snap = await getDoc(ref);
  const prevViewed = snap.exists() ? (snap.data() as StudentProgressDoc).viewedPages ?? {} : {};
  const data: StudentProgressDoc = {
    id,
    uid,
    roomId: roomIdOf(uid),
    textbookId,
    lastPage: page,
    viewedPages: { ...prevViewed, [String(page)]: true },
    totalPages,
    updatedAt: Date.now(),
  };
  await setDoc(ref, data);
}

export async function getProgress(
  uid: string,
  textbookId: string,
): Promise<StudentProgressDoc | null> {
  const id = `${uid}_${textbookId}`;
  const snap = await getDoc(doc(db, "studentProgress", id));
  return snap.exists() ? (snap.data() as StudentProgressDoc) : null;
}

export function watchProgress(
  uid: string,
  textbookId: string,
  cb: (p: StudentProgressDoc | null) => void,
): Unsubscribe {
  const id = `${uid}_${textbookId}`;
  return onSnapshot(doc(db, "studentProgress", id), (snap) =>
    cb(snap.exists() ? (snap.data() as StudentProgressDoc) : null),
  );
}
