const ERROR_PATTERNS: { test: RegExp; message: string }[] = [
  { test: /JSON/i, message: "L'IA a généré une réponse dans un format inattendu. Réessaie, ça devrait fonctionner." },
  { test: /fetch|network|Failed to fetch|ERR_NETWORK/i, message: "Problème de connexion. Vérifie ton Wi-Fi et réessaie." },
  { test: /timeout|timed out|504|524/i, message: "La requête a pris trop de temps. Réessaie dans quelques secondes." },
  { test: /429|rate.?limit|too many/i, message: "Trop de requêtes en même temps. Attends quelques secondes et réessaie." },
  { test: /quota|crédit|limit.*atteint/i, message: "Tu as utilisé tous tes crédits IA ce mois-ci. Ils reviennent le 1er du mois, ou tu peux ajouter un pack de crédits." },
  { test: /401|non.?authentifi|not.?authenticated/i, message: "Ta session a expiré. Rafraîchis la page pour te reconnecter." },
  { test: /403|interdit|forbidden/i, message: "Tu n'as pas accès à cette fonctionnalité avec ton plan actuel." },
  { test: /500|internal.?server|erreur.?serveur/i, message: "Oups, un problème côté serveur. Réessaie dans un instant." },
  { test: /supabase|postgrest|PGRST/i, message: "Problème de sauvegarde des données. Réessaie ou contacte le support si ça persiste." },
  { test: /anthropic|claude|overloaded|529/i, message: "L'IA est surchargée en ce moment. Réessaie dans quelques secondes." },
  { test: /storage|upload|file.*too/i, message: "Problème avec le fichier. Vérifie qu'il fait moins de 5 Mo et réessaie." },
  { test: /stripe|payment|paiement/i, message: "Problème avec le paiement. Vérifie tes infos bancaires ou contacte le support." },
];

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test.test(raw)) return pattern.message;
  }

  return "Quelque chose n'a pas fonctionné. Réessaie, et si le problème persiste, contacte-nous.";
}

// ─── Messages d'erreur IA contextuels ───

export const AI_ERROR_MESSAGES: Record<string, { title: string; description: string; action?: string }> = {
  "429": {
    title: "L'IA fait une pause",
    description: "Trop de demandes en même temps. C'est comme la queue au marché : ça vaut le coup d'attendre 30 secondes.",
    action: "Réessaie dans un moment",
  },
  "529": {
    title: "L'IA est débordée",
    description: "Beaucoup de monde utilise l'IA en ce moment. Rien de grave, ça revient vite.",
    action: "Réessaie dans 2-3 minutes",
  },
  "quota_category": {
    title: "Crédits épuisés pour cette catégorie",
    description: "Tes crédits se renouvellent le 1er du mois. En attendant, tu peux continuer à travailler sur d'autres sections de l'outil.",
    action: "Voir mes crédits",
  },
  "quota_total": {
    title: "Tes crédits du mois sont utilisés",
    description: "Bonne nouvelle : ça veut dire que tu bosses ta com' ! Ils reviennent le 1er du mois.",
    action: "Voir les options",
  },
  "parse_error": {
    title: "L'IA a eu un moment de confusion",
    description: "La réponse n'était pas dans le bon format. Ça arrive parfois. Un deuxième essai suffit généralement.",
    action: "Réessayer",
  },
  "network": {
    title: "Problème de connexion",
    description: "Vérifie ta connexion internet et réessaie.",
    action: "Réessayer",
  },
  "unknown": {
    title: "Oups, quelque chose a coincé",
    description: "Une erreur inattendue. Si ça persiste, contacte-nous.",
    action: "Réessayer",
  },
};

export function getAIErrorMessage(error: { status?: number; message?: string } | null): { title: string; description: string; action?: string } {
  if (error?.status) {
    return AI_ERROR_MESSAGES[String(error.status)] || AI_ERROR_MESSAGES.unknown;
  }
  if (error?.message?.includes("quota") || error?.message?.includes("crédit")) {
    return AI_ERROR_MESSAGES.quota_total;
  }
  if (error?.message?.includes("fetch") || error?.message?.includes("network")) {
    return AI_ERROR_MESSAGES.network;
  }
  return AI_ERROR_MESSAGES.unknown;
}
