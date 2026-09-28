import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useAnonSession } from "@/lib/session";
import { UsageGuideModal } from "@/components/UsageGuideModal";
import RoomLobbyPage from "@/pages/RoomLobbyPage";
import CreateRoomPage from "@/pages/CreateRoomPage";
import StudentJoinPage from "@/pages/StudentJoinPage";
import RoomManagePage from "@/pages/RoomManagePage";
import AdminMasterPage from "@/pages/AdminMasterPage";
import TextbookViewerPage from "@/pages/TextbookViewer/TextbookViewerPage";
import GradePreviewPage from "@/pages/Preview/GradePreviewPage";
import PreviewViewerPage from "@/pages/Preview/PreviewViewerPage";

export default function App() {
  const ready = useAnonSession();

  // "교재 사용 방법" 창의 열림/항상 띄워놓기 상태를 라우트(페이지)보다 위에 둔다 -
  // RoomLobbyPage 안에 두면 방/교재 화면으로 이동하는 순간 그 페이지가 통째로
  // 사라지면서 상태도 같이 사라져, "항상 띄워놓기"를 켜도 페이지를 옮기면 꺼져
  // 버린다. 여기 App 레벨에 두면 라우트가 바뀌어도(RoomLobbyPage가 언마운트돼도)
  // 계속 떠 있을 수 있다.
  const [guideOpen, setGuideOpen] = useState(false);
  const [guidePinned, setGuidePinned] = useState(false);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        불러오는 중...
      </div>
    );
  }

  const openGuide = () => setGuideOpen(true);
  const closeGuide = () => {
    setGuideOpen(false);
    setGuidePinned(false);
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<RoomLobbyPage onOpenGuide={openGuide} />} />
        <Route path="/create-room" element={<CreateRoomPage />} />
        <Route path="/admin" element={<AdminMasterPage />} />
        <Route path="/preview" element={<GradePreviewPage />} />
        <Route path="/preview/:textbookId" element={<PreviewViewerPage />} />

        <Route path="/room/:roomId/join" element={<StudentJoinPage />} />
        <Route path="/room/:roomId/manage" element={<RoomManagePage />} />
        <Route path="/room/:roomId/textbook/:textbookId" element={<TextbookViewerPage />} />

        <Route path="*" element={<RoomLobbyPage onOpenGuide={openGuide} />} />
      </Routes>

      {guideOpen && (
        <UsageGuideModal
          pinned={guidePinned}
          onTogglePin={() => setGuidePinned((v) => !v)}
          onClose={closeGuide}
        />
      )}
    </>
  );
}
