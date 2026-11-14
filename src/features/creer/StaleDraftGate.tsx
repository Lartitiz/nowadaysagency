// Brouillon d'une fiche qui n'existe plus : avant d'ouvrir /creer, on vérifie
// que la fiche de Mes idées liée au brouillon de l'onglet (editingIdeaId)
// existe encore, quand le brouillon vient d'un onglet fermé. Supprimée (ici avant le 14/11/2026, ou sur un autre appareil),
// le brouillon est oublié au lieu de revenir (QA du 13/11/2026). Une erreur
// réseau ne supprime rien ; au-delà de 3 s, la page s'ouvre quand même.
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { forgetIdeaDrafts, hasTabFlowState, loadFlowState, setFlowWorkspaceId } from "@/hooks/use-flow-persistence";
import { supabase } from "@/integrations/supabase/client";

export default function StaleDraftGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const workspaceId = useWorkspaceId();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    if (!session?.user?.id || !workspaceId) { const t = setTimeout(() => setReady(true), 3000); return () => clearTimeout(t); }
    setFlowWorkspaceId(workspaceId);
    // Rechargement du même onglet : la suppression dans Mes idées l'a déjà nettoyé.
    if (hasTabFlowState()) { setReady(true); return; }
    const ideaId = loadFlowState()?.editingIdeaId;
    if (!ideaId) { setReady(true); return; }
    let alive = true;
    const timer = setTimeout(() => { if (alive) setReady(true); }, 3000);
    (async () => supabase.from("saved_ideas").select("id").eq("id", ideaId).maybeSingle())()
      .then(({ data, error }) => { if (alive && !error && !data) forgetIdeaDrafts(ideaId); })
      .catch(() => { /* réseau : le brouillon reste */ })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, session?.user?.id, workspaceId]);

  if (ready) return <>{children}</>;
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Chargement" />
    </div>
  );
}
