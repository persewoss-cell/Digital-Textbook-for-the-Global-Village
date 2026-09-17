import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { watchRooms } from "@/lib/rooms";
import type { RoomDoc } from "@/types";

export default function RoomLobbyPage() {
  const [rooms, setRooms] = useState<RoomDoc[]>([]);
  const navigate = useNavigate();

  useEffect(() => watchRooms(setRooms), []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mb-2 text-5xl">🌍</div>
          <h1 className="text-2xl font-extrabold text-brand-800">지구마을 디지털 교과서</h1>
          <p className="mt-1 text-sm text-slate-500">
            선생님이 만든 반 방에 들어가서 디지털 교과서를 함께 봐요.
          </p>
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
          <Link to="/preview" className="btn w-full bg-orange-500 text-center text-white hover:bg-orange-600">
            📖 학년별 교재 체험하기
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {rooms.map((r) => (
            <div key={r.id} className="card flex flex-col gap-3 p-5">
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {r.grade}학년 {r.classNum}반
                </p>
                {r.teacherName && (
                  <p className="text-xs text-slate-400">{r.teacherName} 선생님</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1 text-sm"
                  onClick={() => navigate(`/room/${r.id}/join`)}
                >
                  학생 참여하기
                </button>
                <button
                  className="btn-secondary text-sm"
                  onClick={() => navigate(`/room/${r.id}/manage`)}
                >
                  선생님
                </button>
              </div>
            </div>
          ))}
          {rooms.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400">
              아직 만들어진 방이 없어요. 선생님이 먼저 방을 만들어 주세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
