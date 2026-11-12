import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { isFairUsePlan } from "@/lib/plan-limits";

/**
 * Crédits restants affichés à droite des étapes de /creer.
 *
 * Premium et Ta Binôme de Com' : les textes ne se comptent pas, le compteur
 * global n'est qu'un garde-fou (200/400). La pastille du haut dit « Illimité » :
 * l'étape n'affiche donc rien (QA du 12/11/2026 : « Illimité » en haut et
 * « 269 crédits restants » juste dessous). Plan gratuit : le vrai chiffre.
 */
export function creerStepCredits({
  loading,
  plan,
  totalLimit,
  remaining,
}: {
  loading: boolean;
  plan: string | null | undefined;
  totalLimit: number | null | undefined;
  remaining: number;
}): ReactNode | null {
  if (loading || !Number.isFinite(remaining) || remaining >= 9000) return null;
  if (isFairUsePlan(plan, totalLimit)) return null;
  return (
    <span className="text-2xs text-muted-foreground whitespace-nowrap inline-flex items-center gap-1">
      <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} /> {remaining} crédit{remaining > 1 ? "s" : ""} restant{remaining > 1 ? "s" : ""}
    </span>
  );
}
