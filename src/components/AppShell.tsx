import { Link, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { signOut } from "@/lib/auth";

const roleLabel: Record<string, string> = {
  admin: "관리자",
  teacher: "선생님",
  student: "학생",
};

export function AppShell({
  children,
  fullBleed,
}: {
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const { userDoc } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-bold text-brand-700">
            🌍 지구마을 디지털 교과서
          </Link>
          {userDoc?.role === "student" && (
            <Link to="/textbook" className="text-sm text-slate-500 hover:text-brand-600">
              내 교과서
            </Link>
          )}
          {userDoc?.role === "teacher" && (
            <>
              <Link to="/textbook" className="text-sm text-slate-500 hover:text-brand-600">
                교과서 보기
              </Link>
              <Link to="/teacher" className="text-sm text-slate-500 hover:text-brand-600">
                선생님 도구
              </Link>
            </>
          )}
          {userDoc?.role === "admin" && (
            <Link to="/admin" className="text-sm text-slate-500 hover:text-brand-600">
              관리자 페이지
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3">
          {userDoc && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {roleLabel[userDoc.role]}
              {userDoc.grade ? ` · ${userDoc.grade}학년` : ""}
              {userDoc.classNum ? ` ${userDoc.classNum}반` : ""}
              {" · "}
              {userDoc.name}
            </span>
          )}
          <button className="btn-ghost" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className={fullBleed ? "flex-1 overflow-hidden" : "flex-1 overflow-auto p-6"}>
        {children}
      </main>
    </div>
  );
}
