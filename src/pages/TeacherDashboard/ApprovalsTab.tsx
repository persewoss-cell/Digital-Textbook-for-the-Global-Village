import { useEffect, useState } from "react";
import { watchUsersByClass } from "@/lib/firestore";
import { callApproveUser, callRejectUser } from "@/lib/functionsApi";
import type { UserDoc } from "@/types";

export default function ApprovalsTab({ classId }: { classId: string }) {
  const [students, setStudents] = useState<UserDoc[]>([]);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => watchUsersByClass(classId, setStudents), [classId]);

  const pending = students
    .filter((s) => s.status === "pending")
    .sort((a, b) => (a.studentNum ?? 0) - (b.studentNum ?? 0));

  const approve = async (uid: string) => {
    setBusyUid(uid);
    try {
      await callApproveUser({ uid });
    } finally {
      setBusyUid(null);
    }
  };
  const reject = async (uid: string) => {
    if (!confirm("이 가입 신청을 거절할까요?")) return;
    setBusyUid(uid);
    try {
      await callRejectUser({ uid });
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="card divide-y divide-slate-100">
      {pending.map((s) => (
        <div key={s.uid} className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              {s.studentNum}번 {s.name}
            </p>
            <p className="text-xs text-slate-400">
              {s.grade}학년 {s.classNum}반으로 가입 신청했어요.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs"
              disabled={busyUid === s.uid}
              onClick={() => approve(s.uid)}
            >
              승인
            </button>
            <button
              className="btn-secondary text-xs"
              disabled={busyUid === s.uid}
              onClick={() => reject(s.uid)}
            >
              거절
            </button>
          </div>
        </div>
      ))}
      {pending.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-400">대기 중인 가입 신청이 없어요.</p>
      )}
    </div>
  );
}
