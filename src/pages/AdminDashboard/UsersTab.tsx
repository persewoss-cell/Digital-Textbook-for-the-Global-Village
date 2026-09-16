import { useEffect, useMemo, useState } from "react";
import { watchAllUsers } from "@/lib/firestore";
import {
  callAdminDeleteUser,
  callAdminResetPassword,
  callAdminUpdateUser,
  callApproveUser,
  callRejectUser,
} from "@/lib/functionsApi";
import { PASSWORD_PATTERN } from "@/lib/auth";
import { GRADES, type AccountStatus, type Grade, type Role, type UserDoc } from "@/types";

const roleLabel: Record<Role, string> = { admin: "관리자", teacher: "선생님", student: "학생" };
const statusLabel: Record<AccountStatus, string> = {
  active: "활성",
  pending: "승인대기",
  rejected: "거절됨",
  disabled: "정지",
};

function EditRow({ user, onClose }: { user: UserDoc; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const [grade, setGrade] = useState<Grade>(user.grade ?? 3);
  const [classNum, setClassNum] = useState(user.classNum ?? 1);
  const [studentNum, setStudentNum] = useState(user.studentNum ?? 1);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await callAdminUpdateUser({
        uid: user.uid,
        name,
        grade,
        classNum,
        studentNum: user.role === "student" ? studentNum : null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-brand-50/40">
      <td colSpan={6} className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">이름</label>
            <input className="input w-32" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {user.role !== "admin" && (
            <>
              <div>
                <label className="label">학년</label>
                <select
                  className="input w-24"
                  value={grade}
                  onChange={(e) => setGrade(Number(e.target.value) as Grade)}
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}학년
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">반</label>
                <input
                  type="number"
                  className="input w-20"
                  value={classNum}
                  onChange={(e) => setClassNum(Number(e.target.value))}
                />
              </div>
              {user.role === "student" && (
                <div>
                  <label className="label">번호</label>
                  <input
                    type="number"
                    className="input w-20"
                    value={studentNum}
                    onChange={(e) => setStudentNum(Number(e.target.value))}
                  />
                </div>
              )}
            </>
          )}
          <button className="btn-primary text-xs" disabled={saving} onClick={save}>
            저장
          </button>
          <button className="btn-ghost text-xs" onClick={onClose}>
            취소
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function UsersTab() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => watchAllUsers(setUsers), []);

  const filtered = useMemo(
    () =>
      users
        .filter((u) => roleFilter === "all" || u.role === roleFilter)
        .filter((u) => statusFilter === "all" || u.status === statusFilter)
        .sort(
          (a, b) =>
            (a.grade ?? 0) - (b.grade ?? 0) ||
            (a.classNum ?? 0) - (b.classNum ?? 0) ||
            (a.studentNum ?? 0) - (b.studentNum ?? 0),
        ),
    [users, roleFilter, statusFilter],
  );

  const resetPassword = async (uid: string) => {
    const pw = prompt("새 비밀번호 (알파벳 4자리)를 입력하세요");
    if (!pw) return;
    if (!PASSWORD_PATTERN.test(pw)) {
      alert("비밀번호는 알파벳 4자리여야 해요.");
      return;
    }
    setBusyUid(uid);
    try {
      await callAdminResetPassword({ uid, password: pw });
      alert("비밀번호가 변경되었어요.");
    } finally {
      setBusyUid(null);
    }
  };

  const toggleDisabled = async (u: UserDoc) => {
    setBusyUid(u.uid);
    try {
      await callAdminUpdateUser({ uid: u.uid, status: u.status === "disabled" ? "active" : "disabled" });
    } finally {
      setBusyUid(null);
    }
  };

  const removeUser = async (u: UserDoc) => {
    if (!confirm(`${u.name} 계정을 완전히 삭제할까요? 되돌릴 수 없어요.`)) return;
    setBusyUid(u.uid);
    try {
      await callAdminDeleteUser({ uid: u.uid });
    } finally {
      setBusyUid(null);
    }
  };

  const approve = async (uid: string) => {
    setBusyUid(uid);
    try {
      await callApproveUser({ uid });
    } finally {
      setBusyUid(null);
    }
  };
  const reject = async (uid: string) => {
    setBusyUid(uid);
    try {
      await callRejectUser({ uid });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "all")}>
          <option value="all">전체 역할</option>
          <option value="admin">관리자</option>
          <option value="teacher">선생님</option>
          <option value="student">학생</option>
        </select>
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AccountStatus | "all")}
        >
          <option value="all">전체 상태</option>
          <option value="active">활성</option>
          <option value="pending">승인대기</option>
          <option value="rejected">거절됨</option>
          <option value="disabled">정지</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">역할</th>
              <th className="px-3 py-2">학년/반/번호</th>
              <th className="px-3 py-2">이름</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2" colSpan={2} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) =>
              editingUid === u.uid ? (
                <EditRow key={u.uid} user={u} onClose={() => setEditingUid(null)} />
              ) : (
                <tr key={u.uid} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-sm">{roleLabel[u.role]}</td>
                  <td className="px-3 py-2 text-sm text-slate-500">
                    {u.grade ? `${u.grade}학년` : ""} {u.classNum ? `${u.classNum}반` : ""}{" "}
                    {u.studentNum ? `${u.studentNum}번` : ""}
                  </td>
                  <td className="px-3 py-2 text-sm font-medium">{u.name}</td>
                  <td className="px-3 py-2 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        u.status === "active"
                          ? "bg-brand-50 text-brand-700"
                          : u.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {statusLabel[u.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    <div className="flex flex-wrap justify-end gap-1">
                      {u.status === "pending" && (
                        <>
                          <button
                            className="btn-primary px-2 py-1 text-xs"
                            disabled={busyUid === u.uid}
                            onClick={() => approve(u.uid)}
                          >
                            승인
                          </button>
                          <button
                            className="btn-secondary px-2 py-1 text-xs"
                            disabled={busyUid === u.uid}
                            onClick={() => reject(u.uid)}
                          >
                            거절
                          </button>
                        </>
                      )}
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditingUid(u.uid)}>
                        수정
                      </button>
                      {u.role !== "admin" && (
                        <button
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={busyUid === u.uid}
                          onClick={() => resetPassword(u.uid)}
                        >
                          비밀번호 초기화
                        </button>
                      )}
                      {u.role !== "admin" && (
                        <button
                          className="btn-secondary px-2 py-1 text-xs"
                          disabled={busyUid === u.uid}
                          onClick={() => toggleDisabled(u)}
                        >
                          {u.status === "disabled" ? "정지 해제" : "정지"}
                        </button>
                      )}
                      {u.role !== "admin" && (
                        <button
                          className="btn-secondary px-2 py-1 text-xs text-red-500"
                          disabled={busyUid === u.uid}
                          onClick={() => removeUser(u)}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ),
            )}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                  조건에 맞는 사용자가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
