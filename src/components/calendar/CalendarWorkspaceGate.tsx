import type { ReactNode } from "react";
import { useWorkspaceReady } from "@/hooks/use-workspace-query";

/* ── Attendre l'espace de travail AVANT de monter le calendrier ──
   Le calendrier est remonté (clé React) dès que le filtre d'espace change.
   Tant que l'espace n'est pas résolu, ce filtre vaut le repli « user_id » :
   le calendrier s'affichait donc une première fois avec la mauvaise portée,
   puis se REMONTAIT quand l'espace arrivait — en jetant ce que l'utilisatrice
   venait de faire (clic « Semaine » perdu, retour en vue mois).
   Sonde du 27/09/2026 : « Rien de prévu cette semaine » jamais affiché sous
   charge ; reproduit en retardant la lecture des espaces de 4 s. */
export function CalendarWorkspaceGate({ children }: { children: ReactNode }) {
  const ready = useWorkspaceReady();
  if (!ready) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Chargement du calendrier">
        <div className="h-10 rounded-lg bg-muted animate-pulse" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-24 rounded-[12px] bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
