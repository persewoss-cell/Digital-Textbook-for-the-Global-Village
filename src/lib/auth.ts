import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, AUTH_EMAIL_DOMAIN, PASSWORD_PAD } from "@/firebase";
import type { Grade, Role, UserDoc } from "@/types";

/** role/학년/반/번호로부터 결정적인 로그인 키를 만든다. (예: t-3-2, s-3-2-15) */
export function buildLoginKey(params: {
  role: Exclude<Role, "admin">;
  grade: Grade;
  classNum: number;
  studentNum?: number | null;
}): string {
  const { role, grade, classNum, studentNum } = params;
  if (role === "teacher") return `t-${grade}-${classNum}`;
  return `s-${grade}-${classNum}-${studentNum}`;
}

export function loginKeyToEmail(loginKey: string): string {
  return `${loginKey}@${AUTH_EMAIL_DOMAIN}`;
}

export function padPassword(raw: string): string {
  return `${raw}${PASSWORD_PAD}`;
}

export const PASSWORD_PATTERN = /^[A-Za-z]{4}$/;

export class FriendlyAuthError extends Error {}

/** 학생/교사 로그인: 이메일 대신 학년·반·번호·이름 조합을 사용한다. */
export async function loginWithProfile(params: {
  role: Exclude<Role, "admin">;
  grade: Grade;
  classNum: number;
  studentNum?: number | null;
  name: string;
  password: string;
}): Promise<UserDoc> {
  const { role, grade, classNum, studentNum, name, password } = params;

  if (!PASSWORD_PATTERN.test(password)) {
    throw new FriendlyAuthError("비밀번호는 알파벳 4자리여야 해요.");
  }

  const loginKey = buildLoginKey({ role, grade, classNum, studentNum });
  const email = loginKeyToEmail(loginKey);

  let uid: string;
  try {
    const cred = await signInWithEmailAndPassword(
      auth,
      email,
      padPassword(password),
    );
    uid = cred.user.uid;
  } catch {
    throw new FriendlyAuthError(
      "입력한 정보와 일치하는 계정을 찾을 수 없어요. 학년/반/번호/비밀번호를 확인해 주세요.",
    );
  }

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError("계정 정보를 찾을 수 없어요. 선생님/관리자에게 문의하세요.");
  }
  const userDoc = snap.data() as UserDoc;

  if (userDoc.name.trim() !== name.trim()) {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError("이름이 일치하지 않아요. 다시 확인해 주세요.");
  }
  if (userDoc.role !== role) {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError("선택한 구분(선생님/학생)이 올바르지 않아요.");
  }
  if (userDoc.status === "pending") {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError(
      role === "student"
        ? "아직 담임 선생님의 가입 승인을 기다리고 있어요."
        : "아직 관리자의 가입 승인을 기다리고 있어요.",
    );
  }
  if (userDoc.status === "rejected") {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError("가입 신청이 승인되지 않았어요. 관리자에게 문의하세요.");
  }
  if (userDoc.status === "disabled") {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError("사용이 중지된 계정이에요. 관리자에게 문의하세요.");
  }

  return userDoc;
}

export async function loginAdmin(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, "users", cred.user.uid));
  if (!snap.exists() || (snap.data() as UserDoc).role !== "admin") {
    await firebaseSignOut(auth);
    throw new FriendlyAuthError("관리자 계정이 아니에요.");
  }
  return snap.data() as UserDoc;
}

export async function signOut() {
  await firebaseSignOut(auth);
}
