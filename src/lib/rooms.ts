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
    approved: false,
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

/** 선생님이 학생 목록 화면에서 번호/이름을 직접 등록·수정할 때도 학생이 스스로 입장할 때와
 * 같은 방식(같은 방+번호는 같은 학생)으로 저장되도록 joinRoom과 동일한 upsert를 그대로 쓴다. */
export const registerParticipant = joinRoom;

/** 여러 명을 한 번에 등록할 때(엑셀 일괄 등록) 문서 수만큼 왕복하지 않도록 배치로 저장한다. */
export async function bulkRegisterParticipants(
  roomId: string,
  students: { studentNum: number; name: string }[],
): Promise<void> {
  const CHUNK_SIZE = 400; // Firestore 배치 쓰기 상한(500)보다 여유 있게 나눠서 처리
  for (let i = 0; i < students.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const now = Date.now();
    for (const { studentNum, name } of students.slice(i, i + CHUNK_SIZE)) {
      const key = participantKey(roomId, studentNum);
      const data: ParticipantDoc = { id: key, roomId, studentNum, name: name.trim(), joinedAt: now };
      batch.set(doc(db, "participants", key), data, { merge: true });
    }
    await batch.commit();
  }
}

export async function removeParticipant(roomId: string, studentNum: number): Promise<void> {
  await deleteDoc(doc(db, "participants", participantKey(roomId, studentNum)));
}

export async function updateRoomPassword(roomId: string, password: string): Promise<void> {
  await updateDoc(doc(db, "rooms", roomId), { password });
}

/** 관리자가 새로 만들어진 방을 승인해서 학생들이 방 목록에서 볼 수 있게 한다. */
export async function approveRoom(roomId: string): Promise<void> {
  await updateDoc(doc(db, "rooms", roomId), { approved: true });
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
