import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, ChevronRight, AlertTriangle, Eye, FolderOpen, ExternalLink, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace, type Workspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  const confirm = useConfirm();

  const activePrograms = programs.filter(p => p.status === "active" || p.status === "paused");
  const completedPrograms = programs.filter(p => p.status === "completed");

  const [loadingWsFor, setLoadingWsFor] = useState<string | null>(null);
  const [creatingStandalone, setCreatingStandalone] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsEmail, setNewWsEmail] = useState("");
  const [showNewWsInput, setShowNewWsInput] = useState(false);
  const [deletingWs, setDeletingWs] = useState<string | null>(null);
  const [removedWsIds, setRemovedWsIds] = useState<Set<string>>(new Set());
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = standaloneWorkspaces.map(w => w.id);
    if (ids.length === 0) { setMemberCounts({}); return; }
    (async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .in("workspace_id", ids);
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.workspace_id] = (counts[r.workspace_id] || 0) + 1; });
      setMemberCounts(counts);
    })();
  }, [standaloneWorkspaces]);

  const getNextSession = (programId: string) => sessions.find(s => s.program_id === programId && s.status === "scheduled" && s.scheduled_date);
  const getSessionStats = (programId: string) => {
    const ps = sessions.filter(s => s.program_id === programId);
    return { done: ps.filter(s => s.status === "completed").length, total: ps.length };
  };

  const handleOpenWorkspace = async (clientUserId: string, clientName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingWsFor(clientUserId);
    try {
      // Use SECURITY DEFINER function to find workspace (bypasses RLS)
      const { data: wsId, error } = await supabase.rpc("get_user_owner_workspace", { target_user_id: clientUserId });

      if (wsId && !error) {
        // Ensure admin is a member before switching
        const { data: existingMember } = await supabase
          .from("workspace_members")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("user_id", user!.id)
          .maybeSingle();

        if (!existingMember) {
          await supabase.from("workspace_members").insert({ workspace_id: wsId, user_id: user!.id, role: "manager" } as any);
        }

        await switchWorkspace(wsId);
        navigate("/dashboard");
      } else {
        // No workspace → create one
        await createWorkspaceForClient(clientUserId, clientName);
      }
    } catch (err) {
      console.error("Erreur accès espace:", err);
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
    const { error: managerErr } = await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: "manager" } as any);
    if (managerErr) {
      console.error("Erreur ajout admin comme manager:", managerErr);
      toast.error(`Espace créé pour ${clientName}, mais ton accès manager a échoué : ${managerErr.message}. Réessaie avant de la prévenir.`);
      return;
    }
    // Then add client as owner
    const { error: ownerErr } = await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: clientUserId, role: "owner" } as any);
    if (ownerErr) {
      console.error("Erreur ajout cliente comme owner:", ownerErr);
      toast.error(`Espace créé mais ${clientName} n'y a PAS accès (échec de l'ajout en owner) : ${ownerErr.message}. Réessaie avant de la prévenir.`);
      return;
    }

    toast.success(`Espace créé pour ${clientName}`);
    switchWorkspace(ws.id);
    navigate("/dashboard");
  };

  const handleOpenStandaloneWs = (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    switchWorkspace(wsId);
    navigate("/dashboard");
  };

  const handleLeaveOrDeleteWs = async (wsId: string, wsName: string, hasOthers: boolean) => {
    if (hasOthers) {
      const confirmed = await confirm({
        title: `Quitter l'espace « ${wsName} » ?`,
        description: "Cet espace a d'autres membres : tu vas le quitter, l'espace ne sera pas supprimé.",
        confirmText: "Quitter l'espace",
      });
      if (!confirmed) return;
      setDeletingWs(wsId);
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", wsId)
        .eq("user_id", user!.id);
      if (error) {
        toast.error(`Impossible de quitter : ${error.message}`);
        setDeletingWs(null);
        return;
      }
      toast.success(`Tu as quitté l'espace « ${wsName} »`);
    } else {
      const confirmed = await confirm({
        title: `Supprimer l'espace « ${wsName} » ?`,
        description: "Toutes ses données (branding, contenus, calendrier…) seront supprimées définitivement. Action irréversible.",
        confirmText: "Supprimer définitivement",
        destructive: true,
      });
      if (!confirmed) return;
      setDeletingWs(wsId);
      const { error } = await supabase.rpc("delete_workspace_with_cleanup" as any, { _workspace_id: wsId });
      if (error) {
        toast.error(`Suppression échouée : ${error.message}`);
        setDeletingWs(null);
        return;
      }
      toast.success(`Espace « ${wsName} » supprimé définitivement`);
    }
    setRemovedWsIds(prev => new Set(prev).add(wsId));
    setDeletingWs(null);
    onReload();
  };

  const handleCreateStandaloneWs = async () => {
    if (!newWsName.trim() || !user?.id) return;
    setCreatingStandalone(true);
    try {
      // If email provided, check if a profile + workspace already exist
      const trimmedEmail = newWsEmail.trim();
      if (trimmedEmail) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id, prenom")
          .ilike("email", trimmedEmail)
          .maybeSingle();

        if (profile) {
          // Find their existing owner workspace (oldest)
          const { data: existing } = await supabase
            .from("workspace_members")
            .select("workspace_id, workspaces!inner(name, created_at)")
            .eq("user_id", profile.user_id)
            .eq("role", "owner")
            .order("workspaces(created_at)" as any, { ascending: true });

          if (existing && existing.length > 0) {
            const targetWsId = (existing[0] as any).workspace_id;
            const targetWsName = (existing[0] as any).workspaces?.name || profile.prenom || trimmedEmail;
            const confirmed = await confirm({
              title: "Un espace existe déjà",
              description: `${profile.prenom || trimmedEmail} a déjà un espace « ${targetWsName} ». Recommandé : t'attacher à cet espace existant plutôt que créer un doublon.`,
              confirmText: "M'attacher à l'espace existant",
              cancelText: "Créer un doublon",
            });

            if (confirmed) {
              // Attach as manager
              const { data: alreadyMember } = await supabase
                .from("workspace_members")
                .select("id")
                .eq("workspace_id", targetWsId)
                .eq("user_id", user.id)
                .maybeSingle();

              if (!alreadyMember) {
                const { error: addErr } = await supabase
                  .from("workspace_members")
                  .insert({ workspace_id: targetWsId, user_id: user.id, role: "manager" } as any);
                if (addErr) {
                  toast.error("Impossible de t'attacher : " + addErr.message);
                  return;
                }
              }
              toast.success(`Tu es maintenant rattachée à l'espace de ${profile.prenom || trimmedEmail} 🎉`);
              setNewWsName(""); setNewWsEmail(""); setShowNewWsInput(false);
              onReload();
              return;
            }
            // User chose to create duplicate anyway → fall through
          }
        }
      }

      // Create a new standalone workspace
      const { data: ws, error } = await supabase
        .from("workspaces")
        .insert({ name: newWsName.trim(), created_by: user.id } as any)
        .select("id")
        .single();

      if (error || !ws) { console.error("Erreur création workspace:", error); toast.error("Erreur création: " + (error?.message || "inconnu")); return; }

      await supabase.from("workspace_members").insert({ workspace_id: ws.id, user_id: user.id, role: "owner" } as any);

      toast.success(`Espace « ${newWsName.trim()} » créé`);

      setNewWsName(""); setNewWsEmail(""); setShowNewWsInput(false);
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
              <div key={p.id} className="rounded-2xl border border-border bg-card p-5 cursor-pointer hover:border-primary/40 transition-colors" role="button" tabIndex={0} onClick={() => onSelectProgram(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectProgram(p.id); } }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                      {p.client_name || "Cliente"}
                      {p.status === "paused" && <Badge variant="secondary" className="text-2xs">⏸️ En pause</Badge>}
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
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 rounded-lg px-2 transition-colors" role="button" tabIndex={0} onClick={() => onSelectProgram(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectProgram(p.id); } }}>
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
          <div className="rounded-xl border border-border bg-card p-3 mb-4 space-y-2">
            <Input value={newWsName} onChange={e => setNewWsName(e.target.value)} placeholder="Nom de l'espace…" onKeyDown={e => e.key === "Enter" && handleCreateStandaloneWs()} />
            <Input value={newWsEmail} onChange={e => setNewWsEmail(e.target.value)} placeholder="Email de la cliente (optionnel : évite les doublons)" type="email" onKeyDown={e => e.key === "Enter" && handleCreateStandaloneWs()} />
            <p className="text-2xs text-muted-foreground">Si tu renseignes un email déjà inscrit, on te proposera de t'attacher à son espace existant au lieu d'en créer un en doublon.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateStandaloneWs} disabled={creatingStandalone || !newWsName.trim()} className="rounded-full">
                {creatingStandalone ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowNewWsInput(false); setNewWsName(""); setNewWsEmail(""); }}>Annuler</Button>
            </div>
          </div>
        )}

        {standaloneWorkspaces.filter(ws => !removedWsIds.has(ws.id)).length === 0 && !showNewWsInput ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucun espace standalone pour le moment</p>
        ) : (
          <div className="space-y-2">
            {standaloneWorkspaces.filter(ws => !removedWsIds.has(ws.id)).map(ws => (
              <div key={ws.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{ws.name}</p>
                  <p className="text-xs text-muted-foreground">Plan : {ws.plan || "free"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => handleOpenStandaloneWs(ws.id, e)}>
                    <ExternalLink className="h-3 w-3" /> Ouvrir
                  </Button>
                  {(() => {
                    const count = memberCounts[ws.id] ?? 1;
                    const hasOthers = count > 1;
                    return (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleLeaveOrDeleteWs(ws.id, ws.name, hasOthers); }}
                        disabled={deletingWs === ws.id}
                      >
                        {deletingWs === ws.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {hasOthers ? "Quitter" : "Supprimer définitivement"}
                      </Button>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
