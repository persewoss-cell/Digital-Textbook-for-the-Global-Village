import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import UsersTab from "./UsersTab";
import ClassesTab from "./ClassesTab";
import TextbooksTab from "./TextbooksTab";
import SettingsTab from "./SettingsTab";

type Tab = "users" | "classes" | "textbooks" | "settings";

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "사용자 관리" },
    { key: "classes", label: "학급 관리" },
    { key: "textbooks", label: "교과서 관리" },
    { key: "settings", label: "관리자 설정" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-xl font-bold">관리자 페이지</h1>
        <p className="mb-6 text-sm text-slate-500">
          사용자, 학급, 교과서 등 모든 항목을 관리할 수 있어요.
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

        {tab === "users" && <UsersTab />}
        {tab === "classes" && <ClassesTab />}
        {tab === "textbooks" && <TextbooksTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </AppShell>
  );
}
