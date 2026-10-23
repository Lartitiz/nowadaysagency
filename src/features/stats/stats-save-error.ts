import { toast } from "sonner";
import { trackError } from "@/lib/error-tracker";

// Échec d'enregistrement dans monthly_stats après une lecture réussie (Instagram,
// LinkedIn). Avant le 23/10/2026 l'erreur était avalée : une migration non appliquée
// en production (source « instagram » refusée) n'a laissé aucune trace. trackError
// l'envoie à Sentry et au bilan quotidien.
type Reseau = "instagram" | "linkedin";
const NOMS: Record<Reseau, string> = { instagram: "Instagram", linkedin: "LinkedIn" };

// Les erreurs Supabase sont des objets simples : sans ça, Sentry ne verrait que « [object Object] ».
function enErreur(error: unknown): unknown {
  if (error instanceof Error || !error || typeof error !== "object") return error;
  const e = error as { message?: string; code?: string };
  return new Error(e.code ? `${e.code} ${e.message ?? ""}`.trim() : e.message ?? JSON.stringify(error));
}

export function tracerEchecEnregistrementStats(reseau: Reseau, error: unknown, month: string) {
  trackError(enErreur(error), { step: `${reseau}-stats-save`, month });
}

export function signalerEchecEnregistrementStats(reseau: Reseau, error: unknown, month: string) {
  tracerEchecEnregistrementStats(reseau, error, month);
  toast.error(`Erreur d'enregistrement des stats ${reseau === "instagram" ? "récupérées" : NOMS[reseau]}`, {
    description: `Tes chiffres ${NOMS[reseau]} ont bien été lus, mais pas enregistrés. Réessaie dans quelques minutes.`,
  });
}
