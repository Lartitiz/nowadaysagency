import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ChevronRight, AlertTriangle, Eye, FolderOpen, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace, type Workspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import type { ProgramWithProfile, SessionData } from "./admin-coaching-types";

interface CoachingProgramListProps {
  programs: ProgramWithProfile[];
  sessions: SessionData[];
  loading: boolean;
  onSelectProgram: (id: string) => void;
  onAddClient: () => void;
  standaloneWorkspaces: Workspace[];
  onReload: () => void;
}

export default function CoachingProgramList({ programs, sessions, loading, onSelectProgram, onAddClient, standaloneWorkspaces, onReload }: CoachingProgramListProps) {
  const { user } = useAuth();
  const { switchWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const activePrograms = programs.filter(p => p.status === "active" || p.status === "paused");
  const completedPrograms = programs.filter(p => p.status === "completed");

  const [loadingWsFor, setLoadingWsFor] = useState<string | null>(null);
  const [creatingStandalone, setCreatingStandalone] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [showNewWsInput, setShowNewWsInput] = useState(false);

  const getNextSession = (programId: string) => sessions.find(s => s.program_id === programId && s.status === "scheduled" && s.scheduled_date);
  const getSessionStats = (programId: string) => {
    const ps = sessions.filter(s => s.program_id === programId);
    return { done: ps.filter(s => s.status === "completed").length, total: ps.length };
  };

  const handleOpenWorkspace = async (clientUserId: string, clientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingWsFor(clientUserId);
    try {
      // Find workspace for this client
      const { data: members } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", clientUserId)
        .eq("role", "owner");

      if (members && members.length > 0) {
        switchWorkspace(members[0].workspace_id);
        navigate("/dashboard");
      } else {
        // No workspace → create one
        await createWorkspaceForClient(clientUserId, clientName);
      }
    } catch (err) {
      toast.error("Erreur lors de l'accès à l'espace");
    } finally {
      setLoadingWsFor(null);
    }
  };

  const createWorkspaceForClient = async (clientUserId: string, clientName: string) => {
    if (!user?.id) return;
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .insert({ name: clientName, created_by: user.id } as any)
      .select("id")
      .single();

    if (wsErr || !ws) {
      console.error("Erreur création workspace:", wsErr);
      toast.error("Impossible de créer l'espace");
      return;
    }

    // Add admin as manager FIRST (creator can bootstrap)
    await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: "manager" } as any);
    // Then add client as owner
    await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: clientUserId, role: "owner" } as any);

    toast.success(`Espace créé pour ${clientName}`);
    switchWorkspace(ws.id);
    navigate("/dashboard");
  };

  const handleOpenStandaloneWs = (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    switchWorkspace(wsId);
    navigate("/dashboard");
  };

  const handleCreateStandaloneWs = async () => {
    if (!newWsName.trim() || !user?.id) return;
    setCreatingStandalone(true);
    try {
      const { data: ws, error } = await supabase
        .from("workspaces")
        .insert({ name: newWsName.trim(), created_by: user.id } as any)
        .select("id")
        .single();

      if (error || !ws) { toast.error("Erreur création"); return; }

      await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: "owner" } as any);

      toast.success(`Espace « ${newWsName.trim()} » créé`);
      setNewWsName("");
      setShowNewWsInput(false);
      onReload();
    } catch {
      toast.error("Erreur création");
    } finally {
      setCreatingStandalone(false);
    }
  };

  const coachingClientIds = programs.map(p => p.client_user_id);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">🎓 Mes clientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activePrograms.length} accompagnement{activePrograms.length > 1 ? "s" : ""} actif{activePrograms.length > 1 ? "s" : ""} · {standaloneWorkspaces.length} espace{standaloneWorkspaces.length > 1 ? "s" : ""} client{standaloneWorkspaces.length > 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={onAddClient} className="rounded-full gap-2"><Plus className="h-4 w-4" /> Ajouter une cliente</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-4">
          {activePrograms.map(p => {
            const next = getNextSession(p.id);
            const stats = getSessionStats(p.id);
            const pct = Math.round(((p.current_month || 1) / 6) * 100);
            const isLoadingWs = loadingWsFor === p.client_user_id;
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:border-primary/40 transition-colors" onClick={() => onSelectProgram(p.id)}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                      {p.client_name || "Cliente"}
                      {p.status === "paused" && <Badge variant="secondary" className="text-[10px]">⏸️ En pause</Badge>}
                    </h3>
                    {p.client_activity && <p className="text-xs text-muted-foreground">{p.client_activity}</p>}
                  </div>
                  <Badge variant="secondary">Mois {p.current_month || 1}/6</Badge>
                </div>
                <Progress value={pct} className="h-2 mb-3" />
                <div className="space-y-1 text-sm text-muted-foreground mb-3">
                  {next ? (
                    <p>📅 Prochaine : {format(new Date(next.scheduled_date!), "d MMM", { locale: fr })} · {next.title}</p>
                  ) : (
                    <p className="text-destructive flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Aucune session planifiée</p>
                  )}
                  <p>📚 Sessions : {stats.done}/{stats.total}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex items-center gap-1 text-xs text-primary font-semibold" onClick={(e) => { e.stopPropagation(); onSelectProgram(p.id); }}>
                    Voir le programme <ChevronRight className="h-3 w-3" />
                  </button>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-semibold transition-colors"
                    onClick={(e) => handleOpenWorkspace(p.client_user_id, p.client_name || "Cliente", e)}
                    disabled={isLoadingWs}
                  >
                    {isLoadingWs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                    Ouvrir son espace
                  </button>
                </div>
              </div>
            );
          })}

          {completedPrograms.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Programmes terminés</p>
              {completedPrograms.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 rounded-lg px-2 transition-colors" onClick={() => onSelectProgram(p.id)}>
                  <span className="text-sm text-muted-foreground">{p.client_name} · Terminé</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Standalone workspaces section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
              <FolderOpen className="h-5 w-5" /> Espaces clients
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Espaces non liés à un accompagnement coaching</p>
          </div>
          <Button variant="outline" size="sm" className="rounded-full gap-1 text-xs" onClick={() => setShowNewWsInput(true)}>
            <Plus className="h-3 w-3" /> Nouvel espace
          </Button>
        </div>

        {showNewWsInput && (
          <div className="flex gap-2 mb-4">
            <Input value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="Nom de l'espace…" className="flex-1" onKeyDown={e => e.key === "Enter" && handleCreateStandaloneWs()} />
            <Button size="sm" onClick={handleCreateStandaloneWs} disabled={creatingStandalone || !newWsName.trim()} className="rounded-full">
              {creatingStandalone ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowNewWsInput(false); setNewWsName(""); }}>Annuler</Button>
          </div>
        )}

        {standaloneWorkspaces.length === 0 && !showNewWsInput ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun espace standalone pour le moment</p>
        ) : (
          <div className="space-y-2">
            {standaloneWorkspaces.map(ws => (
              <div key={ws.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{ws.name}</p>
                  <p className="text-xs text-muted-foreground">Plan : {ws.plan || "free"}</p>
                </div>
                <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => handleOpenStandaloneWs(ws.id, e)}>
                  <ExternalLink className="h-3 w-3" /> Ouvrir
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
