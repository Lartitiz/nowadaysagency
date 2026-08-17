/**
 * MarronnierBanner — carte contextuelle du calendrier : un marronnier approche
 * (fenêtre d'anticipation déterministe, voir src/lib/marronniers), on propose
 * de décliner une photo produit en version de saison.
 *
 * Un seul marronnier à la fois (le plus proche dans sa fenêtre). « Plus tard »
 * masque CE marronnier pour CETTE année (localStorage), pas les suivants.
 *
 * Masqué pour les profils « services » uniquement : ce bandeau concerne les
 * photos produit, donc il n'est pas pertinent sans offre matérielle.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/use-profile";
import { activeMarronnier, type MarronnierOccurrence } from "@/lib/marronniers";

interface MarronnierBannerProps {
  onDecliner: (occ: MarronnierOccurrence) => void;
}

function dismissKey(occ: MarronnierOccurrence): string {
  return `marronnier-dismissed-${occ.marronnier.key}-${occ.date.getFullYear()}`;
}

export function MarronnierBanner({ onDecliner }: MarronnierBannerProps) {
  const { data: profileData } = useProfile();
  const occ = useMemo(() => activeMarronnier(new Date()), []);
  const [dismissed, setDismissed] = useState(() => {
    if (!occ) return true;
    try {
      return localStorage.getItem(dismissKey(occ)) === "1";
    } catch {
      return false;
    }
  });

  const isServiceOnly = profileData?.type_activite === "services";
  if (!occ || dismissed || isServiceOnly) return null;
  const { marronnier: m, daysUntil } = occ;
  const when =
    daysUntil === 0 ? "c'est aujourd'hui" : daysUntil === 1 ? "c'est demain" : `c'est dans ${daysUntil} jours`;

  return (
    // Au doigt (390 px), le texte et le bloc d'actions ne tiennent pas côte à
    // côte : les actions sont `shrink-0`, la colonne de texte tombait à ~60 px
    // et s'écrasait en « Tes photos / produit en / … » (constaté au regard du
    // 17/08). On empile sous `sm`, on repasse en rangée au-dessus.
    <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 mb-4 sm:flex-row sm:items-center">
      <span className="text-2xl shrink-0" aria-hidden="true">
        {m.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {m.label}, {when}
        </p>
        <p className="text-xs text-muted-foreground">
          Tes photos produit en version {m.label} — même produit, décor de saison, prêt à poster.
        </p>
      </div>
      <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => {
            try {
              localStorage.setItem(dismissKey(occ), "1");
            } catch {
              /* stockage indisponible : on masque au moins pour la session */
            }
            setDismissed(true);
          }}
        >
          Plus tard
        </button>
        <Button size="sm" onClick={() => onDecliner(occ)}>
          Décliner une photo
        </Button>
      </div>
    </div>
  );
}
