// Sorti de src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 1). 
import { findQuota, quotaLimitMessage } from "@/lib/quota-message";
import { readableError } from "@/lib/error-messages";

/**
 * Filet anti-JSON brut : certains edges renvoient leur erreur quota sous forme
 * d'objet ({"error":"limit_reached","message":"…","quota":{…}}) qui finissait
 * affiché TEL QUEL à l'utilisatrice. On extrait le `message` lisible (ou un
 * fallback) au lieu de dumper le JSON. Idempotent sur un message déjà propre.
 */
export function cleanErrorMessage(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  const t = s.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const o = JSON.parse(t);
      const m = o?.message || o?.quota?.message || o?.error;
      if (m && typeof m === "string") return m;
      return "Une erreur est survenue. Réessaie 🌸";
    } catch {
      /* pas du JSON valide → on garde le texte */
    }
  }
  return s || "Une erreur est survenue. Réessaie 🌸";
}

// Message honnête affiché en ligne à l'étape résultat quand le quota a coupé la
// génération : il nomme la limite atteinte (carrousels, images, vidéos ou
// crédits) à partir de la réponse du serveur (src/lib/quota-message.ts).
// Sans objet quota lisible, on garde le message serveur, déjà en français.
export function quotaInlineMessage(e: unknown, serverMessage: string): string {
  return quotaLimitMessage(findQuota(e)) || readableError(serverMessage, "Tu as atteint une de tes limites du mois. Elle revient le 1er du mois 🌸");
}
