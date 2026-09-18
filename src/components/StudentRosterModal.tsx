import { useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/Modal";
import { bulkRegisterParticipants, registerParticipant, removeParticipant } from "@/lib/rooms";
import { downloadRosterSample, parseRosterExcel } from "@/lib/roster";
import type { ParticipantDoc } from "@/types";

export function StudentRosterModal({
  roomId,
  participants,
  onClose,
}: {
  roomId: string;
  participants: ParticipantDoc[];
  onClose: () => void;
}) {
  const [studentNum, setStudentNum] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sorted = [...participants].sort((a, b) => a.studentNum - b.studentNum);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = Number(studentNum);
    if (!studentNum || !Number.isInteger(n) || n < 1) {
      setError("번호를 입력해 주세요.");
      return;
    }
    if (!name.trim()) {
      setError("이름을 입력해 주세요.");
      return;
    }
    setAdding(true);
    try {
      await registerParticipant(roomId, n, name);
      setStudentNum("");
      setName("");
    } catch {
      setError("등록 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (num: number) => {
    if (!confirm(`${num}번 학생을 목록에서 지울까요?`)) return;
    await removeParticipant(roomId, num);
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setUploadMessage(null);
    setUploading(true);
    try {
      const rows = await parseRosterExcel(file);
      if (rows.length === 0) {
        setUploadMessage("엑셀에서 번호/이름을 읽지 못했어요. 샘플 양식을 참고해 주세요.");
        return;
      }
      await bulkRegisterParticipants(roomId, rows);
      setUploadMessage(`${rows.length}명 등록했어요.`);
    } catch {
      setUploadMessage("엑셀 파일을 읽는 중 문제가 발생했어요.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Modal title="학생 등록" onClose={onClose}>
      <form className="mb-4 flex items-end gap-2" onSubmit={handleAdd}>
        <div className="w-20">
          <label className="label">번호</label>
          <input
            className="input text-center"
            inputMode="numeric"
            value={studentNum}
            onChange={(e) => setStudentNum(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            placeholder="1"
          />
        </div>
        <div className="flex-1">
          <label className="label">이름</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 입력하세요"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? "추가 중..." : "추가"}
        </button>
      </form>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      <div className="mb-4 rounded-xl border border-dashed border-slate-300 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-600">엑셀로 일괄 등록</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={downloadRosterSample}>
            샘플 엑셀 다운로드
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="text-xs"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          첫 행은 "번호", "이름" 열 제목으로 두고, 그 아래에 학생들을 한 줄씩 적어 올려주세요.
        </p>
        {uploading && <p className="mt-2 text-xs text-slate-500">업로드 중...</p>}
        {uploadMessage && <p className="mt-2 text-xs text-brand-700">{uploadMessage}</p>}
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {sorted.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
          >
            <span>
              <span className="font-semibold">{p.studentNum}번</span> {p.name}
            </span>
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => handleRemove(p.studentNum)}
            >
              삭제
            </button>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
            아직 등록된 학생이 없어요.
          </p>
        )}
      </div>
    </Modal>
  );
}
