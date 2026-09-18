import { useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { updateRoomPassword } from "@/lib/rooms";
import { ROOM_PASSWORD_PATTERN } from "@/types";

export function ChangeRoomPasswordModal({
  roomId,
  currentPassword,
  onClose,
  onChanged,
}: {
  roomId: string;
  currentPassword: string;
  onClose: () => void;
  onChanged: (newPassword: string) => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (current !== currentPassword) {
      setError("현재 비밀번호가 올바르지 않아요.");
      return;
    }
    if (!ROOM_PASSWORD_PATTERN.test(next)) {
      setError("새 비밀번호는 숫자 4자리여야 해요.");
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호가 서로 달라요.");
      return;
    }

    setSaving(true);
    try {
      await updateRoomPassword(roomId, next);
      onChanged(next);
      setDone(true);
    } catch {
      setError("변경 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="비밀번호 변경" onClose={onClose} widthClassName="max-w-sm">
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-600">비밀번호를 변경했어요.</p>
          <button className="btn-primary w-full" onClick={onClose}>
            확인
          </button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className="label">현재 비밀번호</label>
            <input
              className="input tracking-widest"
              value={current}
              onChange={(e) => setCurrent(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              inputMode="numeric"
              maxLength={4}
              autoFocus
            />
          </div>
          <div>
            <label className="label">새 비밀번호 (숫자 4자리)</label>
            <input
              className="input tracking-widest"
              value={next}
              onChange={(e) => setNext(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              inputMode="numeric"
              maxLength={4}
            />
          </div>
          <div>
            <label className="label">새 비밀번호 확인</label>
            <input
              className="input tracking-widest"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              inputMode="numeric"
              maxLength={4}
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? "변경 중..." : "변경하기"}
          </button>
        </form>
      )}
    </Modal>
  );
}
