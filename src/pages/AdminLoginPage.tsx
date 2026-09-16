import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FriendlyAuthError, loginAdmin } from "@/lib/auth";
import { callBootstrapFirstAdmin } from "@/lib/functionsApi";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bName, setBName] = useState("");
  const [bEmail, setBEmail] = useState("");
  const [bPassword, setBPassword] = useState("");
  const [bMessage, setBMessage] = useState<string | null>(null);
  const [bLoading, setBLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAdmin(email, password);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(
        err instanceof FriendlyAuthError
          ? err.message
          : "로그인에 실패했어요. 이메일/비밀번호를 확인해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    setBMessage(null);
    setBLoading(true);
    try {
      await callBootstrapFirstAdmin({ name: bName, email: bEmail, password: bPassword });
      setBMessage("최초 관리자 계정이 생성되었어요. 위 로그인 폼으로 로그인해 주세요.");
    } catch {
      setBMessage(
        "생성에 실패했어요. 이미 관리자가 존재하거나 입력값을 확인해야 할 수 있어요.",
      );
    } finally {
      setBLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mb-2 text-4xl">🛡️</div>
          <h1 className="text-xl font-bold">관리자 로그인</h1>
        </div>

        <div className="card p-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="label">이메일</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">비밀번호</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "로그인 중..." : "관리자 로그인"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/" className="text-sm text-slate-500 hover:underline">
              ← 일반 로그인으로 돌아가기
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <button
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
            onClick={() => setShowBootstrap((v) => !v)}
          >
            {showBootstrap ? "숨기기" : "처음 사용하시나요? 최초 관리자 계정 만들기"}
          </button>
          {showBootstrap && (
            <form onSubmit={handleBootstrap} className="card mt-3 space-y-3 p-4">
              <p className="text-xs text-slate-500">
                관리자 계정이 하나도 없을 때만 한 번 사용할 수 있어요.
              </p>
              <input
                className="input"
                placeholder="이름"
                value={bName}
                onChange={(e) => setBName(e.target.value)}
                required
              />
              <input
                className="input"
                type="email"
                placeholder="이메일"
                value={bEmail}
                onChange={(e) => setBEmail(e.target.value)}
                required
              />
              <input
                className="input"
                type="password"
                placeholder="비밀번호 (6자 이상)"
                value={bPassword}
                onChange={(e) => setBPassword(e.target.value)}
                minLength={6}
                required
              />
              <button type="submit" className="btn-secondary w-full" disabled={bLoading}>
                {bLoading ? "생성 중..." : "최초 관리자 생성"}
              </button>
              {bMessage && <p className="text-xs text-slate-500">{bMessage}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
