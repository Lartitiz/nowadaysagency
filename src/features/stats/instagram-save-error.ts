import { toast } from "sonner";
import { trackError } from "@/lib/error-tracker";

// Échec de save_monthly_stats après une lecture Instagram réussie. Avant le 23/10/2026
// l'erreur était avalée : une migration non appliquée en production (source « instagram »
// refusée) n'a laissé aucune trace. trackError l'envoie à Sentry et au bilan quotidien.
export function tracerEchecEnregistrementInstagram(error: unknown, month: string) {
  trackError(error, { step: "instagram-stats-save", month });
}

export function signalerEchecEnregistrementInstagram(error: unknown, month: string) {
  tracerEchecEnregistrementInstagram(error, month);
  toast.error("Erreur d'enregistrement des stats récupérées", {
    description: "Tes chiffres Instagram ont bien été lus, mais pas enregistrés. Réessaie dans quelques minutes.",
  });
}
