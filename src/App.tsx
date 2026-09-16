import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/RequireAuth";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import AdminLoginPage from "@/pages/AdminLoginPage";
import TextbookHome from "@/pages/TextbookHome";
import TextbookViewerPage from "@/pages/TextbookViewer/TextbookViewerPage";
import TeacherDashboard from "@/pages/TeacherDashboard/TeacherDashboard";
import AdminDashboard from "@/pages/AdminDashboard/AdminDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />

      <Route
        path="/textbook"
        element={
          <RequireAuth roles={["student", "teacher"]}>
            <TextbookHome />
          </RequireAuth>
        }
      />
      <Route
        path="/textbook/:textbookId"
        element={
          <RequireAuth roles={["student", "teacher"]}>
            <TextbookViewerPage />
          </RequireAuth>
        }
      />
      <Route
        path="/teacher"
        element={
          <RequireAuth roles={["teacher"]}>
            <TeacherDashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth roles={["admin"]}>
            <AdminDashboard />
          </RequireAuth>
        }
      />

      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}
