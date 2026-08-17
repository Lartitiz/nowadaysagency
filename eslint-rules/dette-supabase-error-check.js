// ───────────────────────────────────────────────────────────────────────────
// DETTE GELÉE AU 17/08/2026 — nowadays/require-supabase-error-check
//
// 175 écritures Supabase sans lecture d'erreur dans 80 fichiers au jour où la
// règle est devenue bloquante (mélange de vrais « succès menteurs » et de logs
// volontairement fire-and-forget). Résorbée intégralement le 17/08/2026 (12 PR).
// Même principe que la dette knip : la règle ne bloque que ce qui s'AJOUTE —
// tout nouveau fichier, et tout fichier qu'on retire d'ici. Si un fichier
// redevient trop compliqué à corriger d'un coup, on peut l'y remettre, mais on
// n'y AJOUTE jamais un fichier qui n'y était pas listé au 17/08/2026.
//
// Liste partagée entre eslint.a11y.config.js (verrou CI) et eslint.config.js
// (retour dans l'éditeur) pour qu'elle ne puisse pas diverger.
export const DETTE_SUPABASE_ERROR_CHECK = [];

// Fichiers de test : les fakes écrivent via la même API et ne risquent rien.
export const EXCLUSIONS_TESTS_SUPABASE_ERROR_CHECK = [
  "src/test/**",
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/*_test.ts",
  "supabase/functions/_shared/test-edge-harness.ts",
];
