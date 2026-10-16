// Bases de marque écrites à la fin de l'onboarding (`brand_proposition`,
// `brand_strategy`) : une mission, prévenir l'utilisatrice quand l'une d'elles
// n'a pas pu être enregistrée. Importé par src/hooks/use-onboarding.ts.
// L'échec ne bloque pas la suite : le profil et le plan sont déjà enregistrés,
// et le branding se complète ensuite dans l'espace Branding.
import { toast } from "sonner";

export const BRANDING_SAVE_ERROR_TITLE = "Ton branding n'a pas pu être enregistré. Réessaie dans un instant.";

/**
 * Rend une fonction à appeler avec l'erreur (ou `null`) de chaque écriture.
 * Chaque erreur part en console ; le toast ne s'affiche qu'une fois par
 * sauvegarde, même si plusieurs tables échouent.
 */
export function createBrandingSaveErrorReporter(): (label: string, error: unknown) => void {
  let warned = false;
  return (label, error) => {
    if (!error) return;
    console.error(`Failed to ${label}:`, error);
    if (warned) return;
    warned = true;
    toast.error(BRANDING_SAVE_ERROR_TITLE, { description: "Tu peux continuer ton démarrage : tu pourras le compléter dans ton espace Branding." });
  };
}
