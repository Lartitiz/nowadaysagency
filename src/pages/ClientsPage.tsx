import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Mail, ExternalLink, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useUserPlan } from "@/hooks/use-user-plan";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

export default function ClientsPage() {
  const { user } = useAuth();
  const { workspaces, switchWorkspace, loading, activeRole } = useWorkspace();
  const { plan, loading: planLoading, isPilot } = useUserPlan();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !user?.id) return;
    setCreating(true);
    try {
      const { data: ws, error: wsErr } = await supabase
        .from("workspaces" as any)
        .insert({ name: name.trim(), created_by: user.id } as any)
        .select("id")
        .single();

      if (wsErr || !ws) throw wsErr || new Error("Erreur création workspace");

      const { error: memErr } = await supabase
        .from("workspace_members" as any)
        .insert({ workspace_id: (ws as any).id, user_id: user.id, role: "manager" } as any);

      if (memErr) throw memErr;

      toast.success(`Espace "${name.trim()}" créé !`);
      setName("");
      setEmail("");
      setDialogOpen(false);

      // Refresh — the WorkspaceProvider will pick up new data on next render
      // Force a page reload to refresh workspace list
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  }, [name, user?.id]);

  const handleOpen = (wsId: string) => {
    switchWorkspace(wsId);
    navigate("/dashboard");
  };

  // Gatekeeping: only studio, now_pilot, or users who manage a workspace
  const hasManagerRole = workspaces.length > 0 && activeRole === "manager";
  const canAccess = plan === "studio" || plan === "now_pilot" || isPilot || hasManagerRole;

  if (!planLoading && !canAccess) {
    return (
      <div className="min-h-screen bg-background pb-24 md:pb-8">
        <AppHeader />
        <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-12">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg font-bold text-foreground mb-2">Fonctionnalité Now Studio</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
              Le mode multi-clients est disponible à partir du plan Now Studio. Gère plusieurs client·es depuis un seul compte.
            </p>
            <Button asChild className="rounded-full">
              <Link to="/parametres">Découvrir le Now Studio →</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <AppHeader />
      <main className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Mes client·es</h1>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nouveau client
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.15s" }} />
              <div className="h-3 w-3 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <p className="text-4xl">👥</p>
            <p className="text-muted-foreground text-sm max-w-sm">
              Tu n'as pas encore de client·es. Crée un premier espace pour commencer.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Créer un espace client
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="p-5 space-y-3 rounded-[20px] border border-border hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between">
                  <h3 className="font-display text-base font-bold text-foreground">{ws.name}</h3>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {ws.plan === "free" ? "Gratuit" : ws.plan}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="flex-1" onClick={() => handleOpen(ws.id)}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ouvrir
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" disabled className="shrink-0">
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bientôt disponible</TooltipContent>
                  </Tooltip>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Nouvel espace client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="client-name">Nom du/de la client·e *</Label>
                <Input
                  id="client-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Marie Dupont"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email">Email (optionnel)</Label>
                <Input
                  id="client-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="marie@exemple.com"
                />
                <p className="text-[11px] text-muted-foreground">L'invitation par email sera disponible prochainement.</p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating ? "Création..." : "Créer l'espace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
