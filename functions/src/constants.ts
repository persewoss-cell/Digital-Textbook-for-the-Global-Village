/**
 * 이 값들은 클라이언트(src/firebase.ts, src/lib/auth.ts)와 반드시 동일해야 합니다.
 * 값을 바꾸면 기존에 만들어진 모든 계정이 로그인할 수 없게 되니, 서비스 시작 전에만 변경하세요.
 */
export const PASSWORD_PAD = "gvtb";
export const AUTH_EMAIL_DOMAIN = "accounts.gvtextbook.internal";

export type BasicRole = "teacher" | "student";

export function buildLoginKey(
  role: BasicRole,
  grade: number,
  classNum: number,
  studentNum?: number | null,
): string {
  if (role === "teacher") return `t-${grade}-${classNum}`;
  return `s-${grade}-${classNum}-${studentNum}`;
}

export function loginKeyToEmail(loginKey: string): string {
  return `${loginKey}@${AUTH_EMAIL_DOMAIN}`;
}

export function padPassword(raw: string): string {
  return `${raw}${PASSWORD_PAD}`;
}

export function classId(grade: number, classNum: number): string {
  return `${grade}-${classNum}`;
}

export const PASSWORD_RE = /^[A-Za-z]{4}$/;
