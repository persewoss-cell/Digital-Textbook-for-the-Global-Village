import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { watchRooms } from "@/lib/rooms";
import { UsageGuideModal } from "@/components/UsageGuideModal";
import type { RoomDoc } from "@/types";

export default function RoomLobbyPage() {
  const [rooms, setRooms] = useState<RoomDoc[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const navigate = useNavigate();

  useEffect(() => watchRooms(setRooms), []);

  // 관리자가 아직 승인하지 않은 방은 학생이 찾아 들어갈 수 없도록 목록에서 숨긴다.
  const approvedRooms = rooms.filter((r) => r.approved);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">🌍</div>
          <h1 className="text-2xl font-extrabold text-brand-800">지구마을 시리즈 디지털 교재</h1>
          <p className="mt-1 text-sm text-slate-500">광양중동초등학교 학교자율시간 활동 디지털 교재</p>
        </div>

        <div className="mx-auto mb-6 flex max-w-md flex-col gap-2">
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => navigate("/create-room")}>
              + 선생님: 방 만들기
            </button>
            <Link to="/admin" className="btn-secondary flex-1 text-center">
              관리자
            </Link>
          </div>
          <div className="flex gap-2">
            <Link
              to="/preview"
              className="btn flex-1 bg-orange-500 text-center text-white hover:bg-orange-600"
            >
              📖 학년별 교재 체험하기
            </Link>
            <button
              className="btn flex-1 bg-sky-500 text-white hover:bg-sky-600"
              onClick={() => setShowGuide(true)}
            >
              📘 교재 사용 방법
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {approvedRooms.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 p-3">
              <div className="text-center">
                <p className="text-base font-bold leading-tight text-slate-800">
                  {r.grade}학년 {r.classNum}반
                </p>
                {r.teacherName && (
                  <p className="truncate text-xs text-slate-400">{r.teacherName} 선생님</p>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  className="btn-primary flex-1 px-1 text-xs"
                  onClick={() => navigate(`/room/${r.id}/join`)}
                >
                  학생
                </button>
                <button
                  className="btn-secondary flex-1 px-1 text-xs"
                  onClick={() => navigate(`/room/${r.id}/manage`)}
                >
                  선생님
                </button>
              </div>
            </div>
          ))}
          {approvedRooms.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              아직 만들어진 방이 없어요. 선생님이 먼저 방을 만들어 주세요.
            </p>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-slate-400">만든이: 강형권 선생님</p>
      </div>
      {showGuide && <UsageGuideModal onClose={() => setShowGuide(false)} />}
    </div>
  );
}
