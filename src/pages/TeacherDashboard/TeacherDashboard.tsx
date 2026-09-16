import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/context/AuthContext";
import RosterTab from "./RosterTab";
import ApprovalsTab from "./ApprovalsTab";
import BulkRegisterTab from "./BulkRegisterTab";

type Tab = "roster" | "approvals" | "bulk";

export default function TeacherDashboard() {
  const { userDoc } = useAuth();
  const [tab, setTab] = useState<Tab>("roster");

  if (!userDoc?.classId) {
    return (
      <AppShell>
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          담당 반 정보가 없어요. 관리자에게 학급 배정을 요청해 주세요.
        </div>
      </AppShell>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "roster", label: "학급 현황" },
    { key: "approvals", label: "가입 승인" },
    { key: "bulk", label: "학생 일괄 등록" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-xl font-bold">선생님 도구</h1>
        <p className="mb-6 text-sm text-slate-500">
          {userDoc.grade}학년 {userDoc.classNum}반을 관리하고 있어요.
        </p>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
                tab === t.key
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "roster" && <RosterTab classId={userDoc.classId} grade={userDoc.grade!} />}
        {tab === "approvals" && <ApprovalsTab classId={userDoc.classId} />}
        {tab === "bulk" && (
          <BulkRegisterTab grade={userDoc.grade!} classNum={userDoc.classNum!} />
        )}
      </div>
    </AppShell>
  );
}
