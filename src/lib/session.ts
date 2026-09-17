import { useEffect, useState } from "react";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "@/firebase";

/**
 * 계정/로그인 없이도 Firestore 보안 규칙에서 "우리 앱을 통해 접속했는지" 정도를
 * 구분할 수 있도록 익명 인증을 사용합니다. 사용자에게는 전혀 보이지 않아요.
 */
export function useAnonSession(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setReady(true);
      } else {
        signInAnonymously(auth).catch(() => setReady(true));
      }
    });
    return unsub;
  }, []);

  return ready;
}

const ROOM_UNLOCK_PREFIX = "gvtb:unlockedRoom:";
const ROOM_UNLOCK_REMEMBER_PREFIX = "gvtb:rememberedUnlockedRoom:";
const PARTICIPANT_KEY = "gvtb:participant:";
const REMEMBERED_PARTICIPANT_PREFIX = "gvtb:rememberedParticipant:";
const ADMIN_UNLOCK_KEY = "gvtb:adminUnlocked";

/** remember=true면 이 기기에서는 브라우저를 껐다 켜도(로컬스토리지) 계속 잠금 해제 상태로 남는다. */
export function markRoomUnlocked(roomId: string, remember = false) {
  sessionStorage.setItem(`${ROOM_UNLOCK_PREFIX}${roomId}`, "1");
  if (remember) localStorage.setItem(`${ROOM_UNLOCK_REMEMBER_PREFIX}${roomId}`, "1");
}
export function isRoomUnlocked(roomId: string): boolean {
  return (
    sessionStorage.getItem(`${ROOM_UNLOCK_PREFIX}${roomId}`) === "1" ||
    localStorage.getItem(`${ROOM_UNLOCK_REMEMBER_PREFIX}${roomId}`) === "1" ||
    isAdminUnlocked()
  );
}

export interface ParticipantSession {
  roomId: string;
  studentNum: number;
  name: string;
}
export function saveParticipantSession(session: ParticipantSession) {
  sessionStorage.setItem(`${PARTICIPANT_KEY}${session.roomId}`, JSON.stringify(session));
}
export function loadParticipantSession(roomId: string): ParticipantSession | null {
  const raw = sessionStorage.getItem(`${PARTICIPANT_KEY}${roomId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParticipantSession;
  } catch {
    return null;
  }
}

export interface RememberedParticipant {
  studentNum: number;
  name: string;
}
/** "번호랑 이름 기억하기"를 체크했을 때, 이 방에 한해 다음 방문에도 자동으로 채워 넣는다. */
export function saveRememberedParticipant(roomId: string, participant: RememberedParticipant) {
  localStorage.setItem(`${REMEMBERED_PARTICIPANT_PREFIX}${roomId}`, JSON.stringify(participant));
}
export function loadRememberedParticipant(roomId: string): RememberedParticipant | null {
  const raw = localStorage.getItem(`${REMEMBERED_PARTICIPANT_PREFIX}${roomId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RememberedParticipant;
  } catch {
    return null;
  }
}
export function clearRememberedParticipant(roomId: string) {
  localStorage.removeItem(`${REMEMBERED_PARTICIPANT_PREFIX}${roomId}`);
}

export function markAdminUnlocked() {
  sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
}
export function isAdminUnlocked(): boolean {
  return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1";
}
export function clearAdminUnlock() {
  sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
}
