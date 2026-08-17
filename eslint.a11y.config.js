import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import dialogTitle from "./eslint-rules/require-dialog-title.js";
import supabaseErrorCheck from "./eslint-rules/require-supabase-error-check.js";

const nowadays = {
  rules: {
    ...dialogTitle.rules,
    ...supabaseErrorCheck.rules,
  },
};

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
const DETTE_SUPABASE_ERROR_CHECK = [
  "src/components/CoachingFlow.tsx",
  "src/components/ContentRecycling.tsx",
  "src/components/admin/AdminEmailTab.tsx",
  "src/components/admin/CoachingProgramList.tsx",
  "src/components/audit/AuditCoachingPanel.tsx",
  "src/components/branding/SynthesisRenderer.tsx",
  "src/components/calendar/CalendarCoachingDialog.tsx",
  "src/components/calendar/CalendarIdeasSidebar.tsx",
  "src/components/calendar/CalendarPostDialog.tsx",
  "src/components/calendar/IdeaDetailSheet.tsx",
  "src/components/coaching/IntakeQuestionnaire.tsx",
  "src/components/engagement/CommentGenerator.tsx",
  "src/components/plan/AuditRecommendationsSection.tsx",
  "src/components/prospection/DmGenerator.tsx",
  "src/components/prospection/ProspectDetailDialog.tsx",
  "src/components/stats/ExcelImportDialog.tsx",
  "src/hooks/use-calendar-save.ts",
  "src/hooks/use-generate-visuals.ts",
  "src/hooks/use-onboarding.ts",
  "src/hooks/use-personas.ts",
  "src/hooks/use-user-photos.ts",
  "src/lib/photo-storage.ts",
  "src/pages/BrandCharterPage.tsx",
  "src/pages/BrandingAuditPage.tsx",
  "src/pages/BrandingAuditResultPage.tsx",
  "src/pages/BrandingPage.tsx",
  "src/pages/Calendar.tsx",
  "src/pages/ChatGuidePage.tsx",
  "src/pages/CommunautePage.tsx",
  "src/pages/ContactsPage.tsx",
  "src/pages/CreerUnifie.tsx",
  "src/pages/IdeasPage.tsx",
  "src/pages/InstagramAudit.tsx",
  "src/pages/InstagramEngagement.tsx",
  "src/pages/InstagramHighlights.tsx",
  "src/pages/InstagramProfileEdito.tsx",
  "src/pages/InstagramProfileEpingles.tsx",
  "src/pages/InstagramStats.tsx",
  "src/pages/LinkedInAudit.tsx",
  "src/pages/LinkedInCommentStrategy.tsx",
  "src/pages/LinkedInParcours.tsx",
  "src/pages/LinkedInRecommandations.tsx",
  "src/pages/LinkedInResume.tsx",
  "src/pages/LivesPage.tsx",
  "src/pages/PinterestCompte.tsx",
  "src/pages/PinterestEpingles.tsx",
  "src/pages/PinterestMotsCles.tsx",
  "src/pages/PinterestRoutine.tsx",
  "src/pages/PinterestTableaux.tsx",
  "src/pages/PropositionRecapPage.tsx",
  "src/pages/SiteAPropos.tsx",
  "src/pages/SiteAccueil.tsx",
  "src/pages/StorytellingEditPage.tsx",
  "supabase/functions/_shared/content-quality.ts",
  "supabase/functions/_shared/ga4.ts",
  "supabase/functions/_shared/instagram-graph.ts",
  "supabase/functions/_shared/pinterest-graph.ts",
  "supabase/functions/_shared/plan-limiter.ts",
  "supabase/functions/analyze-branding-impact/index.ts",
  "supabase/functions/analyze-documents/index.ts",
  "supabase/functions/assistant-chat/index.ts",
  "supabase/functions/audit-branding/index.ts",
  "supabase/functions/audit-instagram-ai/index.ts",
  "supabase/functions/deep-diagnostic/index.ts",
  "supabase/functions/email-trigger/index.ts",
  "supabase/functions/generate-branding-summary/index.ts",
  "supabase/functions/mini-audit-instagram/index.ts",
  "supabase/functions/newsjacking-ai/index.ts",
  "supabase/functions/photo-background-replace/index.ts",
  "supabase/functions/photo-describe/index.ts",
  "supabase/functions/public-calendar-edit/index.ts",
  "supabase/functions/public-calendar/index.ts",
  "supabase/functions/resend-webhook/index.ts",
  "supabase/functions/send-email/index.ts",
  "supabase/functions/shared-branding-access/index.ts",
  "supabase/functions/social-canva-import/index.ts",
  "supabase/functions/social-instagram-publish/index.ts",
  "supabase/functions/social-publish-scheduled/index.ts",
  "supabase/functions/stripe-webhook/index.ts",
  "supabase/functions/website-ai/index.ts",
];

// Config dédiée, volontairement séparée de eslint.config.js.
//
// `npm run lint` est en `continue-on-error` dans la CI (dette legacy : ~1054
// `as any`), donc une règle ajoutée là-bas n'aurait bloqué personne. Ici on ne
// charge QUE les règles à zéro dette, ce qui permet à `npm run lint:a11y` d'être
// une étape CI bloquante.
export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.tsx"],
    ignores: ["supabase/functions/**"],
    // Les `eslint-disable react-hooks/*` du code visent la config principale ;
    // ici la règle n'est pas activée, donc ils sont « inutilisés » sans l'être.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks n'est là que pour rendre résolvables les `eslint-disable
    // react-hooks/exhaustive-deps` déjà posés dans le code : aucune de ses
    // règles n'est activée ici.
    plugins: { nowadays, "react-hooks": reactHooks },
    rules: {
      "nowadays/require-dialog-title": "error",
    },
  },
  // Écritures Supabase dont l'erreur n'est pas lue (« succès menteur »).
  // Couvre le front (src/) ET les edge functions (supabase/functions/), hors
  // tests : les fakes des tests écrivent via la même API et ne risquent rien.
  {
    files: ["src/**/*.{ts,tsx}", "supabase/functions/**/*.ts"],
    ignores: [
      "src/test/**",
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "**/*_test.ts",
      "supabase/functions/_shared/test-edge-harness.ts",
      ...DETTE_SUPABASE_ERROR_CHECK,
    ],
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // react-hooks et @typescript-eslint ne sont là que pour rendre résolvables
    // les `eslint-disable` déjà posés dans le code (sinon ESLint sort une
    // erreur « Definition for rule not found ») : aucune de leurs règles n'est
    // activée ici.
    plugins: {
      nowadays,
      "react-hooks": reactHooks,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "nowadays/require-supabase-error-check": "error",
    },
  },
);
