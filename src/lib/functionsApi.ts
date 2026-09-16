import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import type { Grade, Role } from "@/types";

export interface SignupInput {
  role: Exclude<Role, "admin">;
  name: string;
  grade: Grade;
  classNum: number;
  studentNum?: number;
  password: string; // raw 4-letter password, padded server-side
}

export const callSignup = httpsCallable<SignupInput, { uid: string }>(
  functions,
  "signup",
);

export interface BootstrapAdminInput {
  name: string;
  email: string;
  password: string;
}
export const callBootstrapFirstAdmin = httpsCallable<
  BootstrapAdminInput,
  { uid: string }
>(functions, "bootstrapFirstAdmin");

export const callApproveUser = httpsCallable<{ uid: string }, { ok: true }>(
  functions,
  "approveUser",
);

export const callRejectUser = httpsCallable<{ uid: string }, { ok: true }>(
  functions,
  "rejectUser",
);

export interface AdminUpdateUserInput {
  uid: string;
  name?: string;
  grade?: Grade;
  classNum?: number;
  studentNum?: number | null;
  status?: "active" | "pending" | "rejected" | "disabled";
  role?: Role;
}
export const callAdminUpdateUser = httpsCallable<
  AdminUpdateUserInput,
  { ok: true }
>(functions, "adminUpdateUser");

export const callAdminResetPassword = httpsCallable<
  { uid: string; password: string },
  { ok: true }
>(functions, "adminResetPassword");

export const callAdminDeleteUser = httpsCallable<
  { uid: string },
  { ok: true }
>(functions, "adminDeleteUser");

export interface AdminCreateAdminInput {
  name: string;
  email: string;
  password: string;
}
export const callAdminCreateAdmin = httpsCallable<
  AdminCreateAdminInput,
  { uid: string }
>(functions, "adminCreateAdmin");

export const callSetAssignedTeacher = httpsCallable<
  { classId: string; teacherUid: string | null },
  { ok: true }
>(functions, "setAssignedTeacher");

export interface BulkStudentRow {
  name: string;
  studentNum: number;
  password: string;
}
export interface BulkCreateStudentsInput {
  grade: Grade;
  classNum: number;
  students: BulkStudentRow[];
}
export interface BulkCreateStudentsResultRow {
  studentNum: number;
  name: string;
  ok: boolean;
  error?: string;
}
export const callBulkCreateStudents = httpsCallable<
  BulkCreateStudentsInput,
  { results: BulkCreateStudentsResultRow[] }
>(functions, "bulkCreateStudents");
