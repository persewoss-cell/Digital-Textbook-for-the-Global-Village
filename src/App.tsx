import { Route, Routes } from "react-router-dom";
import { useAnonSession } from "@/lib/session";
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

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        불러오는 중...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<RoomLobbyPage />} />
      <Route path="/create-room" element={<CreateRoomPage />} />
      <Route path="/admin" element={<AdminMasterPage />} />
      <Route path="/preview" element={<GradePreviewPage />} />
      <Route path="/preview/:textbookId" element={<PreviewViewerPage />} />

      <Route path="/room/:roomId/join" element={<StudentJoinPage />} />
      <Route path="/room/:roomId/manage" element={<RoomManagePage />} />
      <Route path="/room/:roomId/textbook/:textbookId" element={<TextbookViewerPage />} />

      <Route path="*" element={<RoomLobbyPage />} />
    </Routes>
  );
}
