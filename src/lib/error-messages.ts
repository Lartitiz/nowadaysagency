const ERROR_PATTERNS: { test: RegExp; message: string }[] = [
  { test: /JSON/i, message: "L'IA a généré une réponse dans un format inattendu. Réessaie, ça devrait fonctionner." },
  { test: /fetch|network|Failed to fetch|ERR_NETWORK/i, message: "Problème de connexion. Vérifie ton Wi-Fi et réessaie." },
  { test: /timeout|timed out|504|524/i, message: "La requête a pris trop de temps. Réessaie dans quelques secondes." },
  { test: /429|rate.?limit|too many/i, message: "Trop de requêtes en même temps. Attends quelques secondes et réessaie." },
  { test: /quota|crédit|limit.*atteint/i, message: "Tu as utilisé tous tes crédits IA ce mois-ci. Passe au plan supérieur pour continuer." },
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
