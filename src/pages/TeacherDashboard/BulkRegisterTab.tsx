import { useState } from "react";
import { PASSWORD_PATTERN } from "@/lib/auth";
import { callBulkCreateStudents, type BulkCreateStudentsResultRow } from "@/lib/functionsApi";
import type { Grade } from "@/types";

const PLACEHOLDER = `1,김민준,abcd
2,이서연,bcda
3,박도윤,cdab`;

export default function BulkRegisterTab({
  grade,
  classNum,
}: {
  grade: Grade;
  classNum: number;
}) {
  const [raw, setRaw] = useState("");
  const [results, setResults] = useState<BulkCreateStudentsResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setParseError(null);
    setResults(null);
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setParseError("등록할 학생 정보를 입력해 주세요.");
      return;
    }

    const students = [];
    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length !== 3) {
        setParseError(`형식이 올바르지 않아요: "${line}" (번호,이름,비밀번호 순서예요)`);
        return;
      }
      const [numStr, name, password] = parts;
      const studentNum = Number(numStr);
      if (!Number.isInteger(studentNum) || studentNum <= 0) {
        setParseError(`번호가 올바르지 않아요: "${line}"`);
        return;
      }
      if (!name) {
        setParseError(`이름이 비어 있어요: "${line}"`);
        return;
      }
      if (!PASSWORD_PATTERN.test(password)) {
        setParseError(`비밀번호는 알파벳 4자리여야 해요: "${line}"`);
        return;
      }
      students.push({ studentNum, name, password });
    }

    setLoading(true);
    try {
      const res = await callBulkCreateStudents({ grade, classNum, students });
      setResults(res.data.results);
    } catch {
      setParseError("등록 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <p className="mb-2 text-sm text-slate-600">
        한 줄에 <b>번호,이름,비밀번호(알파벳 4자리)</b> 형식으로 입력해 주세요. 엑셀에서 복사해
        붙여넣어도 돼요. {grade}학년 {classNum}반 학생으로 바로 승인된 상태로 등록돼요.
      </p>
      <textarea
        className="input h-40 font-mono"
        placeholder={PLACEHOLDER}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {parseError && (
        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{parseError}</div>
      )}
      <button className="btn-primary mt-3" onClick={handleSubmit} disabled={loading}>
        {loading ? "등록 중..." : "일괄 등록하기"}
      </button>

      {results && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">등록 결과</h3>
          <table className="w-full text-sm">
            <tbody>
              {results.map((r) => (
                <tr key={r.studentNum} className="border-b border-slate-100">
                  <td className="py-1.5">{r.studentNum}번</td>
                  <td className="py-1.5">{r.name}</td>
                  <td className={`py-1.5 text-right ${r.ok ? "text-brand-600" : "text-red-500"}`}>
                    {r.ok ? "등록 완료" : r.error || "실패"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
