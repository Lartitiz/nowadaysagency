import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace, type Workspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Navigate } from "react-router-dom";
import CoachingProgramList from "@/components/admin/CoachingProgramList";
import CoachingSessionManager from "@/components/admin/CoachingSessionManager";
import KickoffPreparation from "@/components/admin/KickoffPreparation";
import AdminUsersTab from "@/components/admin/AdminUsersTab";
import AdminStatsTab from "@/components/admin/AdminStatsTab";
import AdminFeedbackTab from "@/components/admin/AdminFeedbackTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProgramWithProfile, SessionData } from "@/components/admin/admin-coaching-types";

export default function AdminCoachingPage() {
  const { user, isAdmin } = useAuth();
  const { workspaces } = useWorkspace();
  const [programs, setPrograms] = useState<ProgramWithProfile[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [standaloneWorkspaces, setStandaloneWorkspaces] = useState<Workspace[]>([]);

  

  const loadData = useCallback(async () => {
    if (!isAdmin || !user?.id) return;
    setLoading(true);
    const { data: progs } = await (supabase.from("coaching_programs" as any).select("*").order("created_at", { ascending: false }) as any);
    const programList = (progs || []) as ProgramWithProfile[];
    const clientIds = programList.map(p => p.client_user_id);
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, prenom, email, activite").in("user_id", clientIds);
      if (profiles) {
        programList.forEach(p => {
          const prof = profiles.find((pr: any) => pr.user_id === p.client_user_id);
          if (prof) {
            p.client_name = (prof as any).prenom || (prof as any).email;
            p.client_email = (prof as any).email;
            p.client_activity = (prof as any).activite;
          }
        });
      }
    }
    const { data: allSessions } = await (supabase.from("coaching_sessions" as any).select("*").order("session_number") as any);
    setSessions((allSessions || []) as SessionData[]);
    setPrograms(programList);

    // Load workspaces where admin is manager OR owner (standalone spaces created as owner)
    const { data: managerWs } = await supabase
      .from("workspace_members")
      .select("workspace_id, role, workspaces:workspace_id(id, name, slug, avatar_url, plan)")
      .eq("user_id", user.id)
      .in("role", ["manager", "owner"]);

    const coachingClientUserIds = new Set(programList.map(p => p.client_user_id));

    const managerWsList = (managerWs || []).map((r: any) => r.workspaces).filter(Boolean) as Workspace[];
    // Build a role map so we know the admin's role in each workspace
    const adminRoleMap = new Map<string, string>();
    (managerWs || []).forEach((r: any) => {
      if (r.workspaces) adminRoleMap.set(r.workspaces.id, r.role);
    });
    
    if (managerWsList.length > 0) {
      const wsIds = managerWsList.map(w => w.id);
      const { data: owners } = await supabase
        .from("workspace_members")
        .select("workspace_id, user_id")
        .in("workspace_id", wsIds)
        .eq("role", "owner");

      const ownerMap = new Map<string, string>();
      (owners || []).forEach((o: any) => ownerMap.set(o.workspace_id, o.user_id));

      const standalone = managerWsList.filter(ws => {
        const ownerId = ownerMap.get(ws.id);
        // Exclure les workspaces de clientes coaching
        if (ownerId && coachingClientUserIds.has(ownerId)) return false;
        // Exclure le workspace personnel de l'admin (where admin is owner, not manager)
        if (ownerId === user.id && adminRoleMap.get(ws.id) === "owner") return false;
        return true;
      });
      setStandaloneWorkspaces(standalone);
    } else {
      setStandaloneWorkspaces([]);
    }

    setLoading(false);
  }, [isAdmin, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  if (selectedProgramId) {
    const program = programs.find(p => p.id === selectedProgramId);
    if (!program) { setSelectedProgramId(null); return null; }
    return (
      <CoachingSessionManager
        program={program}
        sessions={sessions.filter(s => s.program_id === selectedProgramId)}
        onBack={() => { setSelectedProgramId(null); loadData(); }}
        onReload={loadData}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        {isAdmin ? (
          <Tabs defaultValue="clientes" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="clientes">Mes clientes</TabsTrigger>
              <TabsTrigger value="users">Utilisatrices</TabsTrigger>
              <TabsTrigger value="stats">📊 Stats</TabsTrigger>
              <TabsTrigger value="feedback">🐛 Feedback</TabsTrigger>
            </TabsList>
            <TabsContent value="clientes">
              <CoachingProgramList
                programs={programs}
                sessions={sessions}
                loading={loading}
                onSelectProgram={setSelectedProgramId}
                onAddClient={() => setAddOpen(true)}
                standaloneWorkspaces={standaloneWorkspaces}
                onReload={loadData}
              />
            </TabsContent>
            <TabsContent value="users">
              <AdminUsersTab />
            </TabsContent>
            <TabsContent value="stats">
              <AdminStatsTab />
            </TabsContent>
            <TabsContent value="feedback">
              <AdminFeedbackTab />
            </TabsContent>
          </Tabs>
        ) : (
          <CoachingProgramList
            programs={programs}
            sessions={sessions}
            loading={loading}
            onSelectProgram={setSelectedProgramId}
            onAddClient={() => setAddOpen(true)}
            standaloneWorkspaces={standaloneWorkspaces}
            onReload={loadData}
          />
        )}
        <KickoffPreparation open={addOpen} onOpenChange={setAddOpen} coachUserId={user?.id || ""} onCreated={loadData} />
      </main>
    </div>
  );
}
