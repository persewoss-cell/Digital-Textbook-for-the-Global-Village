import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import type { Grade, ParticipantDoc, RoomDoc } from "@/types";

export function participantKey(roomId: string, studentNum: number): string {
  return `${roomId}_${studentNum}`;
}

export async function createRoom(
  grade: Grade,
  classNum: number,
  password: string,
  teacherName: string,
): Promise<string> {
  const ref = doc(collection(db, "rooms"));
  const data: RoomDoc = {
    id: ref.id,
    grade,
    classNum,
    password,
    teacherName: teacherName.trim(),
    createdAt: Date.now(),
  };
  await setDoc(ref, data);
  return ref.id;
}

export function watchRooms(cb: (rooms: RoomDoc[]) => void): Unsubscribe {
  return onSnapshot(collection(db, "rooms"), (snap) => {
    const rooms = snap.docs.map((d) => d.data() as RoomDoc);
    rooms.sort(
      (a, b) => a.grade - b.grade || a.classNum - b.classNum || a.createdAt - b.createdAt,
    );
    cb(rooms);
  });
}

export function watchRoom(roomId: string, cb: (room: RoomDoc | null) => void): Unsubscribe {
  return onSnapshot(doc(db, "rooms", roomId), (snap) => cb(snap.exists() ? (snap.data() as RoomDoc) : null));
}

export async function getRoom(roomId: string): Promise<RoomDoc | null> {
  const snap = await getDoc(doc(db, "rooms", roomId));
  return snap.exists() ? (snap.data() as RoomDoc) : null;
}

export async function joinRoom(roomId: string, studentNum: number, name: string): Promise<string> {
  const key = participantKey(roomId, studentNum);
  const data: ParticipantDoc = {
    id: key,
    roomId,
    studentNum,
    name: name.trim(),
    joinedAt: Date.now(),
  };
  await setDoc(doc(db, "participants", key), data, { merge: true });
  return key;
}

export function watchParticipants(roomId: string, cb: (rows: ParticipantDoc[]) => void): Unsubscribe {
  const q = query(collection(db, "participants"), where("roomId", "==", roomId));
  return onSnapshot(q, (snap) =>
    cb(snap.docs.map((d) => d.data() as ParticipantDoc).sort((a, b) => a.studentNum - b.studentNum)),
  );
}

const ROOM_SCOPED_COLLECTIONS = [
  "participants",
  "studentNotes",
  "studentAnnotations",
  "studentProgress",
];

/** 방과 그 안의 모든 학습 기록(노트/필기/진도)을 함께 삭제합니다. */
export async function deleteRoomCascade(roomId: string) {
  for (const col of ROOM_SCOPED_COLLECTIONS) {
    const q = query(collection(db, col), where("roomId", "==", roomId));
    const snap = await getDocs(q);
    if (snap.empty) continue;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(doc(db, "rooms", roomId));
}
