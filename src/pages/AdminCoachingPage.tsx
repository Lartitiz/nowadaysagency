import { useAuth } from "@/contexts/AuthContext";
import AppHeader from "@/components/AppHeader";
import { Navigate, useNavigate } from "react-router-dom";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminStatsTab from "@/components/admin/AdminStatsTab";
import AdminFeedbackTab from "@/components/admin/AdminFeedbackTab";
import AdminEmailTab from "@/components/admin/AdminEmailTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminCoachingPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="users">Utilisatrices</TabsTrigger>
            <TabsTrigger value="emails">✉️ Emails</TabsTrigger>
            <TabsTrigger value="stats">📊 Stats</TabsTrigger>
            <TabsTrigger value="feedback">🐛 Feedback</TabsTrigger>
            <TabsTrigger value="tools" onClick={() => navigate("/admin/tools")} className="text-xs">
              🔧 Outils
            </TabsTrigger>
          </TabsList>
          <TabsContent value="users"><AdminUsersTab /></TabsContent>
          <TabsContent value="emails"><AdminEmailTab /></TabsContent>
          <TabsContent value="stats"><AdminStatsTab /></TabsContent>
          <TabsContent value="feedback"><AdminFeedbackTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
