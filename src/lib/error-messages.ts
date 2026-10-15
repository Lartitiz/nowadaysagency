import { findQuota, quotaLimitMessage } from "@/lib/quota-message";

export { quotaLimitMessage };

const ERROR_PATTERNS: { test: RegExp; message: string }[] = [
  { test: /La génération a échoué en cours de route/i, message: "Le recyclage n'a produit aucun texte utilisable. Réessaie ou ajoute des faits à ta source." },
  // AVANT la règle /quota|crédit/ : une panne de VÉRIFICATION des crédits (503
  // quota_check_failed) n'est pas un quota épuisé — dire « tu as tout utilisé »
  // à une cliente qui n'a rien consommé serait mensonger.
  { test: /quota_check_failed|impossible de vérifier ton abonnement/i, message: "Impossible de vérifier ton abonnement pour le moment. Réessaie dans un instant." },
  { test: /JSON/i, message: "L'IA a généré une réponse dans un format inattendu. Réessaie, ça devrait fonctionner." },
  // Réponse IA lue mais vide ou mal formée (AiParseError et listes vides des pages).
  { test: /réponse IA illisible/i, message: "L'IA a généré une réponse dans un format inattendu. Réessaie, ça devrait fonctionner." },
  { test: /edge function|functions?fetcherror|functions?httperror|send a request|non-?2xx/i, message: "Ce service est momentanément indisponible. Réessaie dans un instant — si ça persiste, contacte-nous." },
  { test: /fetch|network|Failed to fetch|ERR_NETWORK/i, message: "Problème de connexion. Vérifie ton Wi-Fi et réessaie." },
  { test: /timeout|timed out|504|524/i, message: "La requête a pris trop de temps. Réessaie dans quelques secondes." },
  { test: /429|rate.?limit|too many/i, message: "Trop de requêtes en même temps. Attends quelques secondes et réessaie." },
  { test: /quota|crédit|limit.*atteint|limit_reached/i, message: "Tu as atteint une de tes limites du mois. Le détail est dans « Mon abonnement » ; tout revient le 1er du mois." },
  { test: /401|non.?authentifi|not.?authenticated/i, message: "Ta session a expiré. Reconnecte-toi pour continuer." },
  { test: /403|interdit|forbidden/i, message: "Tu n'as pas accès à cette fonctionnalité avec ton plan actuel." },
  { test: /500|internal.?server|erreur.?serveur/i, message: "Oups, un problème côté serveur. Réessaie dans un instant." },
  { test: /supabase|postgrest|PGRST/i, message: "Problème de sauvegarde des données. Réessaie ou contacte le support si ça persiste." },
  { test: /anthropic|claude|overloaded|529/i, message: "L'IA est surchargée en ce moment. Réessaie dans quelques secondes." },
  { test: /storage|upload|file.*too/i, message: "Problème avec le fichier. Vérifie qu'il fait moins de 5 Mo et réessaie." },
  { test: /stripe|payment|paiement/i, message: "Problème avec le paiement. Vérifie tes infos bancaires ou contacte le support." },
];

// Phrases de quota déjà claires écrites par le serveur (plan-limiter) : elles
// nomment la limite atteinte (« tes 3 carrousels »), on les garde telles quelles.
const SERVER_QUOTA_SENTENCE = /^(Tu as (utilisé|fait|créé) tes \d+ |Tu as atteint la limite|Cette fonctionnalité est disponible à partir|Les vidéos sont comprises|La Qualité Max est comprise)/;

export function friendlyError(error: unknown): string {
  const quotaText = quotaLimitMessage(findQuota(error));
  if (quotaText) return quotaText;
  const raw = error instanceof Error ? error.message : String(error);
  if (SERVER_QUOTA_SENTENCE.test(raw.trim())) return raw.trim();

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test.test(raw)) return pattern.message;
  }

  return "Quelque chose n'a pas fonctionné. Réessaie, et si le problème persiste, contacte-nous.";
}

// Message technique (anglais, code, statut HTTP, nom d'erreur JS) : à traduire.
// Un message déjà écrit en français pour l'utilisatrice (serveur du Studio,
// invokeWithTimeout…) passe tel quel.
const TECHNICAL = /[A-Za-z]*Error\b|\bat \S+ \(|\b(undefined|null|NaN|fetch|network|timeout|timed out|status|edge function|non-2xx|JSON|unexpected|cannot|failed|invalid|internal|server|request|response|token|abort|denied|not found)\b|\b[a-z]+_[a-z_]+\b|\b[45]\d\d\b/i;

/**
 * Texte d'erreur à montrer : garde un message déjà clair en français,
 * traduit un message technique, et prend `fallback` si l'erreur est vide.
 */
export function readableError(error: unknown, fallback: string): string {
  const quotaText = quotaLimitMessage(findQuota(error));
  if (quotaText) return quotaText;
  const raw = (error instanceof Error ? error.message : typeof error === "string" ? error : (error as any)?.message || "").trim();
  if (!raw) return fallback;
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const o = JSON.parse(raw);
      const inner = quotaLimitMessage(o?.quota) || o?.message;
      if (typeof inner === "string" && inner) return readableError(inner, fallback);
    } catch { /* pas du JSON : on continue */ }
    return friendlyError(raw);
  }
  if (SERVER_QUOTA_SENTENCE.test(raw)) return raw;
  return TECHNICAL.test(raw) ? friendlyError(raw) : raw;
}
