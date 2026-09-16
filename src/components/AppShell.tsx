import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function AppShell({
  children,
  fullBleed,
  badge,
  right,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  badge?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <Link to="/" className="font-bold text-brand-700">
          🌍 지구마을 디지털 교과서
        </Link>
        <div className="flex items-center gap-3">
          {badge && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {badge}
            </span>
          )}
          {right}
        </div>
      </header>
      <main className={fullBleed ? "flex-1 overflow-hidden" : "flex-1 overflow-auto p-6"}>
        {children}
      </main>
    </div>
  );
}
