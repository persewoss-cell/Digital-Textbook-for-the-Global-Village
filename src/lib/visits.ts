import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/firebase";
import type { Grade, VisitDoc } from "@/types";

/** 한국 시간 기준 오늘 날짜("YYYY-MM-DD"). 자정 근처의 시차 혼동을 피하려고
 * 브라우저 로컬 시간 대신 명시적으로 Asia/Seoul로 고정한다. */
function todayDateStr(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 방문 집계는 부가 기능일 뿐이라, 여기서 실패해도(네트워크 문제 등) 학생의
 * 입장/체험 흐름을 절대 막지 않도록 오류를 그 자리에서 삼킨다. */
async function safeSetVisit(id: string, data: VisitDoc) {
  try {
    await setDoc(doc(db, "visits", id), data, { merge: true });
  } catch {
    // 무시: 접속 기록 실패가 사용자에게 보여서는 안 된다.
  }
}

/** 같은 사람이 같은 날 여러 번 들어와도 문서 하나로 합쳐지도록(merge) 저장한다. */
export async function logRoomVisit(roomId: string, studentNum: number, name: string) {
  const date = todayDateStr();
  const id = `${date}_${roomId}_${studentNum}`;
  await safeSetVisit(id, { id, date, kind: "room", roomId, studentNum, name, lastSeenAt: Date.now() });
}

export async function logPreviewVisit(uid: string, grade?: Grade) {
  const date = todayDateStr();
  const id = `${date}_preview_${uid}`;
  await safeSetVisit(id, { id, date, kind: "preview", uid, grade, lastSeenAt: Date.now() });
}

export interface VisitSummary {
  room: number;
  preview: number;
  total: number;
}

export async function getTodayVisitSummary(): Promise<VisitSummary> {
  const date = todayDateStr();
  // date 하나로만 걸러서(등호 조건 하나) 별도 복합 색인 없이도 항상 동작하게 하고,
  // 방/체험 갈래별 개수는 받아온 문서를 그 자리에서 나눠 센다(하루 방문 수는
  // 몇백 건 수준이라 이 정도는 가볍다).
  const snap = await getDocs(query(collection(db, "visits"), where("date", "==", date)));
  let room = 0;
  let preview = 0;
  snap.docs.forEach((d) => {
    const v = d.data() as VisitDoc;
    if (v.kind === "room") room++;
    else if (v.kind === "preview") preview++;
  });
  return { room, preview, total: room + preview };
}
