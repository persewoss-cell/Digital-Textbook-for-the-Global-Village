import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/types";

export function RequireAuth({
  roles,
  children,
}: {
  roles?: Role[];
  children: ReactNode;
}) {
  const { firebaseUser, userDoc, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        불러오는 중...
      </div>
    );
  }
  if (!firebaseUser || !userDoc || userDoc.status !== "active") {
    return <Navigate to="/" replace />;
  }
  if (roles && !roles.includes(userDoc.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
