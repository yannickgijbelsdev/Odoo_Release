import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Activity from "@/pages/Activity";
import Users from "@/pages/Users";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) return <Login />;
  return <AppShell>{children}</AppShell>;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="/activity" element={<Protected><Activity /></Protected>} />
            <Route path="/users" element={<Protected><Users /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
