// Brouillons de fiches qui n'existent plus : avant d'ouvrir /creer, quand
// l'onglet n'a pas sa propre copie (il va reprendre celle d'un onglet fermé),
// on vérifie que chaque fiche de Mes idées portée par les copies de ce compte
// (editingIdeaId, tous espaces confondus) existe encore. Supprimée (avant le
// 14/11/2026 ou sur un autre appareil), ses copies sont oubliées au lieu de
// revenir (QA des 13 et 14/11/2026). Une erreur réseau ne supprime rien ;
// au-delà de 3 s, la page s'ouvre quand même.
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { draftIdeaIds, forgetIdeaDrafts, hasTabFlowState } from "@/hooks/use-flow-persistence";
import { supabase } from "@/integrations/supabase/client";

export default function StaleDraftGate({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    if (!userId) { const t = setTimeout(() => setReady(true), 3000); return () => clearTimeout(t); }
    // Rechargement du même onglet : la suppression dans Mes idées l'a déjà nettoyé.
    const ids = hasTabFlowState() ? [] : draftIdeaIds().slice(0, 10);
    if (!ids.length) { setReady(true); return; }
    let alive = true;
    const timer = setTimeout(() => { if (alive) setReady(true); }, 3000);
    (async () => {
      for (const id of ids) {
        const { data, error } = await supabase.from("saved_ideas").select("id").eq("id", id).maybeSingle();
        if (error || !alive) return;
        if (!data) forgetIdeaDrafts(id);
      }
    })()
      .catch(() => { /* réseau : les brouillons restent */ })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, userId]);

  if (ready) return <>{children}</>;
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Chargement" />
    </div>
  );
}
