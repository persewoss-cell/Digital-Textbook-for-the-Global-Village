import { useEffect, useState } from "react";
import { ensureClassDoc, orderClasses, watchAllUsers, watchClasses } from "@/lib/firestore";
import { callSetAssignedTeacher } from "@/lib/functionsApi";
import { GRADES, type ClassDoc, type Grade, type UserDoc } from "@/types";

export default function ClassesTab() {
  const [classes, setClasses] = useState<ClassDoc[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [newGrade, setNewGrade] = useState<Grade>(3);
  const [newClassNum, setNewClassNum] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => watchClasses(setClasses), []);
  useEffect(() => watchAllUsers(setUsers), []);

  const teachers = users.filter((u) => u.role === "teacher" && u.status === "active");

  const addClass = async () => {
    await ensureClassDoc(newGrade, newClassNum);
  };

  const assign = async (classId: string, teacherUid: string) => {
    setBusyId(classId);
    try {
      await callSetAssignedTeacher({ classId, teacherUid: teacherUid || null });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="card mb-5 flex flex-wrap items-end gap-2 p-4">
        <div>
          <label className="label">학년</label>
          <select className="input w-28" value={newGrade} onChange={(e) => setNewGrade(Number(e.target.value) as Grade)}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">반</label>
          <input
            type="number"
            className="input w-20"
            value={newClassNum}
            onChange={(e) => setNewClassNum(Number(e.target.value))}
          />
        </div>
        <button className="btn-primary" onClick={addClass}>
          학급 추가
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">학급</th>
              <th className="px-3 py-2">담임 선생님</th>
            </tr>
          </thead>
          <tbody>
            {orderClasses(classes).map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="px-3 py-2 text-sm font-medium">
                  {c.grade}학년 {c.classNum}반
                </td>
                <td className="px-3 py-2">
                  <select
                    className="input w-56"
                    value={c.teacherUid ?? ""}
                    disabled={busyId === c.id}
                    onChange={(e) => assign(c.id, e.target.value)}
                  >
                    <option value="">미배정</option>
                    {teachers.map((t) => (
                      <option key={t.uid} value={t.uid}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-sm text-slate-400">
                  등록된 학급이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
