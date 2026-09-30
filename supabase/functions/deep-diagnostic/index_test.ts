// Régression du fix "pas de crédit sur fallback IA" (PR #843 — voir CLAUDE.md,
// pattern checkQuota -> appel IA -> logUsage UNIQUEMENT en cas de succès).
//
// Particularité (même cas que creative-flow) : deep-diagnostic utilise
// `serve()` de std/http qui ouvre un VRAI socket TCP au chargement du module,
// incompatible avec la CI (`deno test --allow-env --allow-read`, SANS
// --allow-net). La phase 1 + décision de facturation est donc extraite en
// fonction exportée `runFastDiagnostic` (voir index.ts), testée directement,
// et on neutralise Deno.listen() le temps de l'import.
//
// Lancer : deno test --allow-env --allow-read --no-check --node-modules-dir=none supabase/functions/deep-diagnostic/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  installFetchMock,
  setTestEnv,
  anthropicToolSuccess,
  anthropicFailure,
} from "../_shared/test-edge-harness.ts";

setTestEnv();

// Importer index.ts exécute AUSSI `serve(handler)` en haut de fichier (effet
// de bord non testé ici). Sans neutraliser Deno.listen(), ça tente un vrai
// socket TCP et plante en CI (pas de --allow-net). On neutralise AVANT
// l'import (obligatoirement dynamique : un import statique s'exécute avant
// tout le reste du fichier, trop tôt pour patcher Deno.listen).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }; // ne se résout jamais : pas de crash, juste une tâche de fond inerte
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { runFastDiagnostic, normalizeDiagnosticRoute, finalizeDiagnosticEvidence } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

const BASE_OPTS = {
  systemPrompt: "Tu es une experte en diagnostic de communication (test).",
  userPrompt: "=== PROFIL ===\nActivité : céramiste (test)",
  instagramScreenshots: [],
  profile: { activity: "céramiste", activityType: "artisane", blocker: "invisible" },
  freeformAnswers: { uniqueness: "pièces uniques faites main" },
  sourcesUsed: [],
  userId: "test-user-id",
  workspaceId: "test-workspace-id",
  isOnboarding: false,
};

// Diagnostic valide (strengths/weaknesses non vides : passe isDegenerateDiagnostic).
const VALID_DIAGNOSTIC = {
  summary: "Un diagnostic de test clair et net.",
  strengths: [{ title: "Force", detail: "détail avec « citation »", source: "profile" }],
  weaknesses: [{ title: "Faiblesse", detail: "détail", source: "profile", fix_hint: "piste" }],
  scores: { total: 55, branding: 55, instagram: null, website: null, linkedin: null },
  priorities: [{ title: "Priorité", why: "raison", time: "20 min", route: "/persona", impact: "high" }],
  branding_prefill: { positioning: null, mission: null, target_description: null, tone_keywords: [], values: [], offers: [] },
};

Deno.test("les anciennes routes du diagnostic ouvrent une page existante", () => {
  assertEquals(normalizeDiagnosticRoute("/audit-instagram"), "/instagram/audit");
  assertEquals(normalizeDiagnosticRoute("/persona"), "/branding");
  assertEquals(normalizeDiagnosticRoute("/site/audit"), "/site/audit");
  assertEquals(normalizeDiagnosticRoute("/route-inventee"), "/branding");
});

Deno.test("succès IA -> logUsage appelé (1 ligne ai_usage, action deep_diagnostic)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicToolSuccess("rendre_diagnostic", VALID_DIAGNOSTIC),
  });
  try {
    const { analysisResult, usageLog } = await runFastDiagnostic(BASE_OPTS);
    assertEquals(analysisResult.summary, VALID_DIAGNOSTIC.summary);
    assertEquals(analysisResult._fallback, undefined);
    assertEquals(usageLog !== null, true);
    await usageLog;
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, "audit");
    assertEquals(mock.aiUsageInserts[0].action_type, "deep_diagnostic");
  } finally {
    mock.restore();
  }
});

Deno.test("échec IA -> fallback renvoyé SANS logUsage (aucune ligne ai_usage)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicFailure(),
  });
  try {
    const { analysisResult, usageLog } = await runFastDiagnostic(BASE_OPTS);
    // Le fallback générique est bien servi (UX préservée)…
    assertEquals(analysisResult._fallback, true);
    // …mais AUCUN crédit débité : c'est LA régression du fix #843.
    assertEquals(usageLog, null);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("onboarding : succès IA -> pas de logUsage (diagnostic d'onboarding gratuit)", async () => {
  const mock = installFetchMock({
    anthropic: () => anthropicToolSuccess("rendre_diagnostic", VALID_DIAGNOSTIC),
  });
  try {
    const { analysisResult, usageLog } = await runFastDiagnostic({ ...BASE_OPTS, isOnboarding: true });
    assertEquals(analysisResult._fallback, undefined);
    assertEquals(usageLog, null);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("capture seule : le constat et le conseil conservent la provenance de l'image", () => {
  const used: string[] = [];
  const failed: string[] = [];
  const analysis = structuredClone(VALID_DIAGNOSTIC) as Record<string, unknown>;
  analysis.screenshot_readable = true;
  analysis.strengths = [{ title: "Bio lisible", detail: "La bio affiche « céramique peinte à la main » et le lien vers les pièces.", source: "instagram_screenshot" }];
  analysis.priorities = [{ title: "Préciser la commande", why: "La bio montre la céramique, mais pas la marche à suivre pour commander.", first_step: "Ajoute une invitation à consulter les pièces disponibles.", example: "« Pièces en faïence et grès : voir les créations disponibles [lien] »", route: "/instagram/profil/bio", source: "instagram_screenshot" }];
  finalizeDiagnosticEvidence(analysis, used, failed, 1);
  assertEquals(used, ["instagram_screenshot"]);
  assertEquals(failed, []);
  assertEquals((analysis.priorities as any[])[0].source, "instagram_screenshot");
});

Deno.test("capture annoncée lisible mais oubliée par le modèle : second passage avec l'image", async () => {
  let calls = 0;
  const mock = installFetchMock({
    anthropic: () => {
      calls++;
      const answer = structuredClone(VALID_DIAGNOSTIC) as Record<string, unknown>;
      answer.screenshot_readable = true;
      if (calls === 2) answer.strengths = [
        { title: "Bio visible", detail: "La bio montre « poteries peintes à la main » et un lien vers la boutique.", source: "instagram_screenshot" },
      ];
      return anthropicToolSuccess("rendre_diagnostic", answer);
    },
  });
  try {
    const { analysisResult } = await runFastDiagnostic({ ...BASE_OPTS,
      instagramScreenshots: [{ mediaType: "image/png", base64: "iVBORw0KGgo=" }], isOnboarding: true,
    });
    assertEquals(mock.anthropicCallCount, 2);
    assertEquals((analysisResult.strengths as any[])[0].source, "instagram_screenshot");
  } finally { mock.restore(); }
});

Deno.test("capture illisible et connexion sans données : aucun canal social annoncé ou scoré", () => {
  const used = ["website"];
  const failed: string[] = [];
  const analysis = structuredClone(VALID_DIAGNOSTIC) as Record<string, unknown>;
  analysis.screenshot_readable = false;
  analysis.strengths = [
    { title: "Site", detail: "La page affiche « pièces uniques en faïence ».", source: "website" },
    { title: "Inventé", detail: "La bio Instagram dit quelque chose de non vérifié.", source: "instagram_screenshot" },
  ];
  (analysis.scores as any).instagram = 70;
  (analysis.scores as any).website = 60;
  finalizeDiagnosticEvidence(analysis, used, failed, 1);
  assertEquals(used, ["website"]);
  assertEquals(failed, ["social_screenshot"]);
  assertEquals((analysis.strengths as any[]).length, 1);
  assertEquals((analysis.scores as any).instagram, null);
  assertEquals((analysis.scores as any).website, 60);
});

Deno.test("statistiques LinkedIn seules : chiffre disponible, score éditorial absent", () => {
  const used = ["linkedin_analytics"];
  const analysis = structuredClone(VALID_DIAGNOSTIC) as Record<string, unknown>;
  (analysis.scores as any).linkedin = 82;
  finalizeDiagnosticEvidence(analysis, used, [], 0);
  assertEquals((analysis.scores as any).linkedin, null);
});
