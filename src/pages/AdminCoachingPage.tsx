import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Navigate } from "react-router-dom";
import CoachingProgramList from "@/components/admin/CoachingProgramList";
import CoachingSessionManager from "@/components/admin/CoachingSessionManager";
import KickoffPreparation from "@/components/admin/KickoffPreparation";
import type { ProgramWithProfile, SessionData } from "@/components/admin/admin-coaching-types";

export default function AdminCoachingPage() {
  const { user } = useAuth();
  const [programs, setPrograms] = useState<ProgramWithProfile[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const isAdmin = user?.email === "laetitia@nowadaysagency.com";

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
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
    setLoading(false);
  }, [isAdmin]);

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
        <CoachingProgramList
          programs={programs}
          sessions={sessions}
          loading={loading}
          onSelectProgram={setSelectedProgramId}
          onAddClient={() => setAddOpen(true)}
        />
        <KickoffPreparation open={addOpen} onOpenChange={setAddOpen} coachUserId={user?.id || ""} onCreated={loadData} />
      </main>
    </div>
  );
}
