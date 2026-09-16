import { useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/firebase";
import { callAdminCreateAdmin } from "@/lib/functionsApi";

export default function SettingsTab() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    const user = auth.currentUser;
    if (!user || !user.email) return;
    setPwLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setPwMessage("비밀번호가 변경되었어요.");
      setCurrentPw("");
      setNewPw("");
    } catch {
      setPwMessage("변경에 실패했어요. 현재 비밀번호를 확인해 주세요.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleCreateAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setCreateMessage(null);
    setCreateLoading(true);
    try {
      await callAdminCreateAdmin({ name, email, password });
      setCreateMessage(`${name} 관리자 계정이 생성되었어요.`);
      setName("");
      setEmail("");
      setPassword("");
    } catch {
      setCreateMessage("생성에 실패했어요. 이메일이 이미 사용 중일 수 있어요.");
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-3 font-semibold">내 비밀번호 변경</h3>
        <form className="space-y-3" onSubmit={handleChangePassword}>
          <div>
            <label className="label">현재 비밀번호</label>
            <input
              type="password"
              className="input"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">새 비밀번호 (6자 이상)</label>
            <input
              type="password"
              className="input"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <button className="btn-primary" disabled={pwLoading}>
            {pwLoading ? "변경 중..." : "비밀번호 변경"}
          </button>
          {pwMessage && <p className="text-sm text-slate-500">{pwMessage}</p>}
        </form>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 font-semibold">관리자 계정 추가</h3>
        <form className="space-y-3" onSubmit={handleCreateAdmin}>
          <div>
            <label className="label">이름</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
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
            <label className="label">비밀번호 (6자 이상)</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <button className="btn-primary" disabled={createLoading}>
            {createLoading ? "생성 중..." : "관리자 계정 만들기"}
          </button>
          {createMessage && <p className="text-sm text-slate-500">{createMessage}</p>}
        </form>
      </div>
    </div>
  );
}
