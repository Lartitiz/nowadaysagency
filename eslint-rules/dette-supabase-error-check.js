// ───────────────────────────────────────────────────────────────────────────
// DETTE GELÉE AU 17/08/2026 — nowadays/require-supabase-error-check
//
// 175 écritures Supabase sans lecture d'erreur, dans les 80 fichiers ci-dessous
// (état du jour où la règle est devenue bloquante ; mélange de vrais « succès
// menteurs » et de logs volontairement fire-and-forget, à trier au fil de
// l'eau). Même principe que la dette knip : la règle ne bloque que ce qui
// s'AJOUTE — tout nouveau fichier, et tout fichier qu'on retire d'ici.
// Quand tu assainis un fichier de cette liste, retire sa ligne : il redevient
// protégé. Ne JAMAIS ajouter de fichier à cette liste.
//
// Liste partagée entre eslint.a11y.config.js (verrou CI) et eslint.config.js
// (retour dans l'éditeur) pour qu'elle ne puisse pas diverger.
export const DETTE_SUPABASE_ERROR_CHECK = [
  "src/pages/CreerUnifie.tsx",
];

// Fichiers de test : les fakes écrivent via la même API et ne risquent rien.
export const EXCLUSIONS_TESTS_SUPABASE_ERROR_CHECK = [
  "src/test/**",
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/*_test.ts",
  "supabase/functions/_shared/test-edge-harness.ts",
];
