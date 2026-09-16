import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  orderBy,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import type {
  ChapterMeta,
  ClassDoc,
  Grade,
  StudentAnnotationDoc,
  StudentBookmarkDoc,
  StudentNoteDoc,
  StudentProgressDoc,
  Stroke,
  TextbookDoc,
  UserDoc,
} from "@/types";

// ---------- users ----------
export function watchUser(uid: string, cb: (u: UserDoc | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    cb(snap.exists() ? (snap.data() as UserDoc) : null);
  });
}

export async function getUsersByClass(classId: string): Promise<UserDoc[]> {
  const q = query(
    collection(db, "users"),
    where("classId", "==", classId),
    where("role", "==", "student"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as UserDoc);
}

export function watchUsersByClass(
  classId: string,
  cb: (users: UserDoc[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "users"),
    where("classId", "==", classId),
    where("role", "==", "student"),
  );
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as UserDoc)));
}

export function watchAllUsers(cb: (users: UserDoc[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "users"), (snap) =>
    cb(snap.docs.map((d) => d.data() as UserDoc)),
  );
}

// ---------- classes ----------
export function classId(grade: Grade | number, classNum: number) {
  return `${grade}-${classNum}`;
}

export async function ensureClassDoc(grade: Grade, classNum: number) {
  const id = classId(grade, classNum);
  const ref = doc(db, "classes", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const data: ClassDoc = {
      id,
      grade,
      classNum,
      teacherUid: null,
      teacherName: null,
      createdAt: Date.now(),
    };
    await setDoc(ref, data);
  }
  return id;
}

export function watchClasses(cb: (classes: ClassDoc[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "classes"), (snap) =>
    cb(snap.docs.map((d) => d.data() as ClassDoc)),
  );
}

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

// ---------- student notes / annotations / bookmarks / progress ----------
const pageKey = (uid: string, textbookId: string, page: number) =>
  `${uid}_${textbookId}_${page}`;

export async function saveNote(
  uid: string,
  textbookId: string,
  page: number,
  text: string,
) {
  const id = pageKey(uid, textbookId, page);
  const data: StudentNoteDoc = {
    id,
    uid,
    textbookId,
    page,
    text,
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

export async function toggleBookmark(
  uid: string,
  textbookId: string,
  page: number,
  bookmarked: boolean,
) {
  const id = pageKey(uid, textbookId, page);
  if (bookmarked) {
    const data: StudentBookmarkDoc = {
      id,
      uid,
      textbookId,
      page,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, "studentBookmarks", id), data);
  } else {
    await setDoc(doc(db, "studentBookmarks", id), { id, uid, textbookId, page, deleted: true, createdAt: 0 });
  }
}

export function watchBookmarks(
  uid: string,
  textbookId: string,
  cb: (bookmarks: StudentBookmarkDoc[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, "studentBookmarks"),
    where("uid", "==", uid),
    where("textbookId", "==", textbookId),
  );
  return onSnapshot(q, (snap) =>
    cb(
      snap.docs
        .map((d) => d.data() as StudentBookmarkDoc & { deleted?: boolean })
        .filter((b) => !b.deleted)
        .sort((a, b) => a.page - b.page),
    ),
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
  const prevViewed = snap.exists()
    ? ((snap.data() as StudentProgressDoc).viewedPages ?? {})
    : {};
  const data: StudentProgressDoc = {
    id,
    uid,
    textbookId,
    lastPage: page,
    viewedPages: { ...prevViewed, [String(page)]: true },
    totalPages,
    updatedAt: Date.now(),
  };
  await setDoc(ref, data);
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

export function orderClasses<T extends { grade: number; classNum: number }>(
  arr: T[],
): T[] {
  return [...arr].sort((a, b) => a.grade - b.grade || a.classNum - b.classNum);
}

// ---------- admin: textbooks ----------
export async function createTextbookDoc(input: {
  id: string;
  grade: Grade;
  subject: string;
  title: string;
  storagePath: string;
  pageCount: number;
  uploadedBy: string;
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

export async function deleteClassDoc(id: string) {
  await deleteDoc(doc(db, "classes", id));
}

export { orderBy };
