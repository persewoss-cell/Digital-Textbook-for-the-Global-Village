import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import {
  buildLoginKey,
  classId,
  loginKeyToEmail,
  padPassword,
  PASSWORD_RE,
  type BasicRole,
} from "./constants";

admin.initializeApp();
setGlobalOptions({ region: "asia-northeast3" });

const db = admin.firestore();
const authAdmin = admin.auth();

interface UserRecordDoc {
  uid: string;
  role: "admin" | "teacher" | "student";
  name: string;
  grade: number | null;
  classNum: number | null;
  studentNum: number | null;
  classId: string | null;
  status: "active" | "pending" | "rejected" | "disabled";
}

async function getCaller(uid: string): Promise<UserRecordDoc> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "권한이 없어요.");
  return snap.data() as UserRecordDoc;
}

function requireAuthed(auth: { uid: string } | undefined): { uid: string } {
  if (!auth) throw new HttpsError("unauthenticated", "로그인이 필요해요.");
  return auth;
}

// ---------------------------------------------------------------------------
// 회원가입 (학생/선생님 자가 가입 - 승인 대기 상태로 생성)
// ---------------------------------------------------------------------------
export const signup = onCall(async (request) => {
  const { role, name, grade, classNum, studentNum, password } = (request.data ??
    {}) as {
    role: BasicRole;
    name: string;
    grade: number;
    classNum: number;
    studentNum?: number;
    password: string;
  };

  if (role !== "teacher" && role !== "student") {
    throw new HttpsError("invalid-argument", "구분 값이 올바르지 않아요.");
  }
  if (!name?.trim() || !grade || !classNum || !password || !PASSWORD_RE.test(password)) {
    throw new HttpsError("invalid-argument", "입력값을 확인해 주세요.");
  }
  if (role === "student" && !studentNum) {
    throw new HttpsError("invalid-argument", "번호를 입력해 주세요.");
  }

  const loginKey = buildLoginKey(role, grade, classNum, studentNum);
  const email = loginKeyToEmail(loginKey);

  let userRecord;
  try {
    userRecord = await authAdmin.createUser({
      email,
      password: padPassword(password),
      displayName: name.trim(),
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "이미 등록된 정보예요.");
    }
    throw new HttpsError("internal", "계정 생성에 실패했어요.");
  }

  await authAdmin.setCustomUserClaims(userRecord.uid, { role });

  const cId = classId(grade, classNum);
  const classRef = db.collection("classes").doc(cId);
  const classSnap = await classRef.get();
  if (!classSnap.exists) {
    await classRef.set({
      id: cId,
      grade,
      classNum,
      teacherUid: null,
      teacherName: null,
      createdAt: Date.now(),
    });
  }

  await db
    .collection("users")
    .doc(userRecord.uid)
    .set({
      uid: userRecord.uid,
      role,
      name: name.trim(),
      grade,
      classNum,
      studentNum: role === "student" ? studentNum : null,
      classId: cId,
      status: "pending",
      loginKey,
      createdAt: Date.now(),
      approvedAt: null,
      approvedBy: null,
    });

  return { uid: userRecord.uid };
});

// ---------------------------------------------------------------------------
// 최초 관리자 계정 생성 (관리자가 한 명도 없을 때만 동작)
// ---------------------------------------------------------------------------
export const bootstrapFirstAdmin = onCall(async (request) => {
  const { name, email, password } = (request.data ?? {}) as {
    name: string;
    email: string;
    password: string;
  };
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    throw new HttpsError("invalid-argument", "입력값을 확인해 주세요.");
  }

  const existing = await db.collection("users").where("role", "==", "admin").limit(1).get();
  if (!existing.empty) {
    throw new HttpsError("failed-precondition", "이미 관리자 계정이 있어요.");
  }

  let userRecord;
  try {
    userRecord = await authAdmin.createUser({ email, password, displayName: name.trim() });
  } catch {
    throw new HttpsError("internal", "계정 생성에 실패했어요.");
  }

  await authAdmin.setCustomUserClaims(userRecord.uid, { role: "admin" });
  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    role: "admin",
    name: name.trim(),
    grade: null,
    classNum: null,
    studentNum: null,
    classId: null,
    status: "active",
    loginKey: email,
    createdAt: Date.now(),
    approvedAt: Date.now(),
    approvedBy: "system",
  });

  return { uid: userRecord.uid };
});

// ---------------------------------------------------------------------------
// 가입 승인 / 거절 (관리자는 누구나, 선생님은 자기 반 학생만)
// ---------------------------------------------------------------------------
async function setApprovalStatus(
  callerUid: string,
  targetUid: string,
  status: "active" | "rejected",
) {
  const caller = await getCaller(callerUid);
  const targetRef = db.collection("users").doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError("not-found", "대상을 찾을 수 없어요.");
  const target = targetSnap.data() as UserRecordDoc;

  const isAdmin = caller.role === "admin";
  const isOwnTeacher =
    caller.role === "teacher" && target.role === "student" && target.classId === caller.classId;
  if (!isAdmin && !isOwnTeacher) {
    throw new HttpsError("permission-denied", "승인 권한이 없어요.");
  }

  await targetRef.update({
    status,
    approvedAt: Date.now(),
    approvedBy: callerUid,
  });
}

export const approveUser = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  const { uid } = (request.data ?? {}) as { uid: string };
  await setApprovalStatus(auth.uid, uid, "active");
  return { ok: true };
});

export const rejectUser = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  const { uid } = (request.data ?? {}) as { uid: string };
  await setApprovalStatus(auth.uid, uid, "rejected");
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 관리자 전용: 사용자 정보 수정 / 비밀번호 초기화 / 삭제 / 관리자 추가
// ---------------------------------------------------------------------------
async function requireAdmin(uid: string) {
  const caller = await getCaller(uid);
  if (caller.role !== "admin") throw new HttpsError("permission-denied", "관리자만 할 수 있어요.");
  return caller;
}

export const adminUpdateUser = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  await requireAdmin(auth.uid);

  const { uid, name, grade, classNum, studentNum, status, role } = (request.data ?? {}) as {
    uid: string;
    name?: string;
    grade?: number;
    classNum?: number;
    studentNum?: number | null;
    status?: UserRecordDoc["status"];
    role?: UserRecordDoc["role"];
  };

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "대상을 찾을 수 없어요.");
  const current = snap.data() as UserRecordDoc;

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (status !== undefined) update.status = status;
  if (studentNum !== undefined) update.studentNum = studentNum;
  if (role !== undefined && role !== current.role) {
    update.role = role;
    await authAdmin.setCustomUserClaims(uid, { role });
  }
  if (grade !== undefined) update.grade = grade;
  if (classNum !== undefined) update.classNum = classNum;
  if (grade !== undefined || classNum !== undefined) {
    const nextGrade = grade ?? current.grade;
    const nextClassNum = classNum ?? current.classNum;
    if (nextGrade && nextClassNum) update.classId = classId(nextGrade, nextClassNum);
  }

  await ref.update(update);
  return { ok: true };
});

export const adminResetPassword = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  await requireAdmin(auth.uid);
  const { uid, password } = (request.data ?? {}) as { uid: string; password: string };
  if (!PASSWORD_RE.test(password)) {
    throw new HttpsError("invalid-argument", "비밀번호는 알파벳 4자리여야 해요.");
  }
  await authAdmin.updateUser(uid, { password: padPassword(password) });
  return { ok: true };
});

export const adminDeleteUser = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  await requireAdmin(auth.uid);
  const { uid } = (request.data ?? {}) as { uid: string };
  await authAdmin.deleteUser(uid).catch(() => undefined);
  await db.collection("users").doc(uid).delete();
  return { ok: true };
});

export const adminCreateAdmin = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  await requireAdmin(auth.uid);
  const { name, email, password } = (request.data ?? {}) as {
    name: string;
    email: string;
    password: string;
  };
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    throw new HttpsError("invalid-argument", "입력값을 확인해 주세요.");
  }

  let userRecord;
  try {
    userRecord = await authAdmin.createUser({ email, password, displayName: name.trim() });
  } catch {
    throw new HttpsError("already-exists", "이미 사용 중인 이메일이에요.");
  }

  await authAdmin.setCustomUserClaims(userRecord.uid, { role: "admin" });
  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    role: "admin",
    name: name.trim(),
    grade: null,
    classNum: null,
    studentNum: null,
    classId: null,
    status: "active",
    loginKey: email,
    createdAt: Date.now(),
    approvedAt: Date.now(),
    approvedBy: auth.uid,
  });

  return { uid: userRecord.uid };
});

export const setAssignedTeacher = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  await requireAdmin(auth.uid);
  const { classId: cId, teacherUid } = (request.data ?? {}) as {
    classId: string;
    teacherUid: string | null;
  };

  const classRef = db.collection("classes").doc(cId);
  const classSnap = await classRef.get();
  if (!classSnap.exists) throw new HttpsError("not-found", "학급을 찾을 수 없어요.");

  let teacherName: string | null = null;
  if (teacherUid) {
    const tSnap = await db.collection("users").doc(teacherUid).get();
    const tData = tSnap.data() as UserRecordDoc | undefined;
    if (!tSnap.exists || tData?.role !== "teacher") {
      throw new HttpsError("invalid-argument", "선생님 계정이 아니에요.");
    }
    teacherName = tData.name;
  }

  await classRef.update({ teacherUid: teacherUid ?? null, teacherName });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// 학생 일괄 등록 (선생님: 자기 반만 / 관리자: 모든 반)
// ---------------------------------------------------------------------------
export const bulkCreateStudents = onCall(async (request) => {
  const auth = requireAuthed(request.auth);
  const caller = await getCaller(auth.uid);
  if (caller.role !== "teacher" && caller.role !== "admin") {
    throw new HttpsError("permission-denied", "권한이 없어요.");
  }

  const { grade, classNum, students } = (request.data ?? {}) as {
    grade: number;
    classNum: number;
    students: { name: string; studentNum: number; password: string }[];
  };

  if (caller.role === "teacher" && (caller.grade !== grade || caller.classNum !== classNum)) {
    throw new HttpsError("permission-denied", "담당 학급의 학생만 등록할 수 있어요.");
  }
  if (!Array.isArray(students) || students.length === 0) {
    throw new HttpsError("invalid-argument", "등록할 학생 정보가 없어요.");
  }
  if (students.length > 60) {
    throw new HttpsError("invalid-argument", "한 번에 최대 60명까지 등록할 수 있어요.");
  }

  const cId = classId(grade, classNum);
  const classRef = db.collection("classes").doc(cId);
  const classSnap = await classRef.get();
  if (!classSnap.exists) {
    await classRef.set({
      id: cId,
      grade,
      classNum,
      teacherUid: caller.role === "teacher" ? auth.uid : null,
      teacherName: caller.role === "teacher" ? caller.name : null,
      createdAt: Date.now(),
    });
  }

  const results: { studentNum: number; name: string; ok: boolean; error?: string }[] = [];

  for (const s of students) {
    if (!s.name?.trim() || !s.studentNum || !PASSWORD_RE.test(s.password)) {
      results.push({ studentNum: s.studentNum, name: s.name, ok: false, error: "입력 형식 오류" });
      continue;
    }
    const loginKey = buildLoginKey("student", grade, classNum, s.studentNum);
    const email = loginKeyToEmail(loginKey);
    try {
      const userRecord = await authAdmin.createUser({
        email,
        password: padPassword(s.password),
        displayName: s.name.trim(),
      });
      await authAdmin.setCustomUserClaims(userRecord.uid, { role: "student" });
      await db
        .collection("users")
        .doc(userRecord.uid)
        .set({
          uid: userRecord.uid,
          role: "student",
          name: s.name.trim(),
          grade,
          classNum,
          studentNum: s.studentNum,
          classId: cId,
          status: "active",
          loginKey,
          createdAt: Date.now(),
          approvedAt: Date.now(),
          approvedBy: auth.uid,
        });
      results.push({ studentNum: s.studentNum, name: s.name, ok: true });
    } catch (err) {
      const code = (err as { code?: string }).code;
      results.push({
        studentNum: s.studentNum,
        name: s.name,
        ok: false,
        error: code === "auth/email-already-exists" ? "이미 등록된 번호예요" : "등록 실패",
      });
    }
  }

  return { results };
});
