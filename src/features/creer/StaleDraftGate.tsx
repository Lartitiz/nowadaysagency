// Brouillon d'une fiche qui n'existe plus : avant d'ouvrir /creer, on vérifie
// que la fiche de Mes idées liée au brouillon de l'onglet (editingIdeaId)
// existe encore, quand le brouillon vient d'un onglet fermé. Supprimée (ici avant le 14/11/2026, ou sur un autre appareil),
// le brouillon est oublié au lieu de revenir (QA du 13/11/2026). Une erreur
// réseau ne supprime rien ; au-delà de 3 s, la page s'ouvre quand même.
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceReady } from "@/hooks/use-workspace-query";
import { forgetIdeaDrafts, hasTabFlowState, loadFlowState, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";
import { supabase } from "@/integrations/supabase/client";

export default function StaleDraftGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const workspaceId = useWorkspaceId();
  // Tant que l'espace charge, useWorkspaceId renvoie un espace provisoire : on
  // regarderait les copies du mauvais espace (vu en ligne le 14/11/2026).
  const workspaceReady = useWorkspaceReady();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    if (!session?.user?.id || !workspaceId || !workspaceReady) { const t = setTimeout(() => setReady(true), 3000); return () => clearTimeout(t); }
    setFlowWorkspaceId(workspaceId);
    // Rechargement du même onglet : la suppression dans Mes idées l'a déjà nettoyé.
    if (hasTabFlowState()) { setReady(true); return; }
    if (!loadFlowState()?.editingIdeaId) { setReady(true); return; }
    let alive = true;
    const timer = setTimeout(() => { if (alive) setReady(true); }, 3000);
    // Plusieurs copies d'onglets fermés peuvent porter une fiche supprimée :
    // chaque oubli fait remonter la suivante, on les passe toutes (5 au plus).
    (async () => {
      for (let i = 0; i < 5 && alive; i++) {
        const ideaId = loadFlowState()?.editingIdeaId;
        if (!ideaId) return;
        const { data, error } = await supabase.from("saved_ideas").select("id").eq("id", ideaId).maybeSingle();
        if (error || data || !alive) return;
        forgetIdeaDrafts(ideaId);
      }
    })()
      .catch(() => { /* réseau : le brouillon reste */ })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, session?.user?.id, workspaceId, workspaceReady]);

  if (ready) return <>{children}</>;
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Chargement" />
    </div>
  );
}
