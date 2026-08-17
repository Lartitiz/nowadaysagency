// Tests du contrat checkQuota → callAnthropic → logUsage pour carousel-ai.
// La logique métier (prompts, gates, correction) reste non testée ici : ce fichier
// vérifie uniquement l'ORCHESTRATION — quota bloque avant l'IA, l'IA réussie
// déclenche logUsage avec les bons arguments, un échec IA ne loggue jamais.
// On injecte de faux comportements via `_deps` (seam d'injection de dépendances,
// cf. index.ts) : aucun appel réseau réel (Supabase, Anthropic) n'est effectué.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/carousel-ai/index_test.ts

import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AnthropicError } from "../_shared/anthropic.ts";
import { handleRequest, _deps } from "./index.ts";

// SUPABASE_URL / SERVICE_ROLE_KEY ne sont jamais lus (checkQuota/logUsage/runPipeline
// sont TOUJOURS mockés via _deps dans ces tests), mais on pose des valeurs factices
// par prudence — même patron que plan-limiter_test.ts.
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");

const TEST_USER_ID = "test-user-1";
const TEST_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Faux client Supabase générique et permissif : répond gracieusement à N'IMPORTE
 * QUELLE table/requête pour que les requêtes de contexte (branding, persona,
 * briefs récents…) qui tournent AVANT le dispatch du handler ne plantent jamais.
 * Pas de fichier partagé — chaque *_test.ts du repo est autonome par convention.
 */
function makeFakeSupabase() {
  // deno-lint-ignore no-explicit-any
  function builder(): any {
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    b.select = () => b;
    b.eq = () => b;
    b.neq = () => b;
    b.gte = () => b;
    b.lte = () => b;
    b.contains = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.in = () => b;
    b.is = () => b;
    b.single = () => Promise.resolve({ data: null, error: null });
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.update = () => b;
    b.delete = () => b;
    b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return b;
  }
  return {
    from: () => builder(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: TEST_USER_ID } }, error: null }) },
  };
}

/** Réinitialise TOUS les champs de `_deps` avant chaque test (état de module partagé). */
function resetDeps() {
  _deps.runPipeline = (async () => ({
    ok: true,
    userId: TEST_USER_ID,
    // deno-lint-ignore no-explicit-any
    supabase: makeFakeSupabase() as any,
    corsHeaders: {},
    quota: null,
    // deno-lint-ignore no-explicit-any
  })) as any;
  // deno-lint-ignore no-explicit-any
  _deps.checkQuota = (async () => ({ allowed: true, plan: "free" })) as any;
  // deno-lint-ignore no-explicit-any
  _deps.logUsage = (async () => {}) as any;
  _deps.callAnthropic = (async () => {
    throw new Error("_deps.callAnthropic non configuré pour ce test");
    // deno-lint-ignore no-explicit-any
  }) as any;
}

function makeHooksRequest(overrides: Record<string, unknown> = {}): Request {
  const body = {
    type: "hooks",
    carousel_type: "storytelling",
    subject: "Sujet de test",
    objective: "engagement",
    workspace_id: TEST_WORKSPACE_ID,
    ...overrides,
  };
  return new Request("http://localhost/carousel-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------- Test 1 : quota épuisée bloque avant l'appel IA ----------

Deno.test("quota épuisée bloque avant l'appel IA (429 limit_reached, callAnthropic jamais appelé, logUsage jamais appelé)", async () => {
  resetDeps();

  _deps.checkQuota = (async () => ({
    allowed: false,
    plan: "free",
    reason: "total",
    message: "quota épuisé",
    // deno-lint-ignore no-explicit-any
  })) as any;

  // Poison pill : si le code appelle quand même l'IA malgré le quota refusé, le
  // test échoue bruyamment plutôt que de laisser passer une régression silencieuse.
  _deps.callAnthropic = (async () => {
    throw new Error("callAnthropic ne doit jamais être appelé quand le quota est épuisé");
    // deno-lint-ignore no-explicit-any
  }) as any;

  let logUsageCalled = false;
  // deno-lint-ignore no-explicit-any
  _deps.logUsage = (async () => {
    logUsageCalled = true;
  }) as any;

  const res = await handleRequest(makeHooksRequest());

  assertEquals(res.status, 429);
  const bodyJson = await res.json();
  assertEquals(bodyJson.error, "limit_reached");
  assertEquals(logUsageCalled, false);
});

// ---------- Test 2 : quota disponible → IA puis logUsage, contrat frontend respecté ----------

Deno.test("quota disponible → appelle l'IA puis logUsage avec les bons arguments, renvoie { content }", async () => {
  resetDeps();

  _deps.checkQuota = (async () => ({
    allowed: true,
    plan: "free",
    remaining: 5,
    // deno-lint-ignore no-explicit-any
  })) as any;

  const fakeAiContent = JSON.stringify({ hooks: [{ id: "A", text: "Hook de test", word_count: 3, style: "curiosité" }] });
  // deno-lint-ignore no-explicit-any
  _deps.callAnthropic = (async () => fakeAiContent) as any;

  // deno-lint-ignore no-explicit-any
  let logUsageArgs: any[] | null = null;
  _deps.logUsage = (async (...args: unknown[]) => {
    logUsageArgs = args;
    // deno-lint-ignore no-explicit-any
  }) as any;

  const res = await handleRequest(makeHooksRequest());

  assertEquals(res.status, 200);
  const bodyJson = await res.json();
  // Contrat frontend de ce endpoint : { content: "<string>" } — cf. runGenerationAndRespond
  // dans index.ts (`new Response(JSON.stringify({ content }), ...)`).
  assertEquals(typeof bodyJson.content, "string");
  assertEquals(bodyJson.content, fakeAiContent);

  assertExists(logUsageArgs);
  const args = logUsageArgs as unknown as unknown[];
  // logUsage(userId, category, actionType, tokensUsed, modelUsed, workspaceId)
  assertEquals(args[0], TEST_USER_ID);
  assertEquals(args[1], "content"); // "hooks" n'est pas dans la liste "suggestion" → catégorie "content"
  assertEquals(args[2], "carousel_hooks");
  assertEquals(args[5], TEST_WORKSPACE_ID);
});

// ---------- Test 3 : échec de l'appel IA → logUsage n'est jamais appelé ----------

Deno.test("échec de l'appel IA → logUsage n'est jamais appelé, l'erreur est reflétée dans la réponse", async () => {
  resetDeps();

  _deps.checkQuota = (async () => ({
    allowed: true,
    plan: "free",
    remaining: 5,
    // deno-lint-ignore no-explicit-any
  })) as any;

  // deno-lint-ignore no-explicit-any
  _deps.callAnthropic = (async () => {
    throw new AnthropicError("erreur simulée", 500);
    // deno-lint-ignore no-explicit-any
  }) as any;

  let logUsageCalled2 = false;
  // deno-lint-ignore no-explicit-any
  _deps.logUsage = (async () => {
    logUsageCalled2 = true;
  }) as any;

  const res = await handleRequest(makeHooksRequest());

  // Le catch d'AnthropicError dans handleRequest remonte e.status tel quel (cf.
  // index.ts : `status: e.status >= 400 && e.status < 600 ? e.status : 500`).
  assertEquals(res.status, 500);
  const bodyJson = await res.json();
  assertEquals(bodyJson.error, "erreur simulée");
  assertEquals(logUsageCalled2, false);
});

// ---------- Tests 4-5 : rappel anti-refus (photo_mismatch) dans le SYSTEM des chemins vision ----------
// Bug live 17/08 : sans description utilisateur, le modèle refusait des photos
// pour des motifs interdits (univers de marque, esthétique, identité) lus dans
// le CONTEXTE BRANDING du system — l'interdit ne vivait que dans la description
// du tool, rencontrée trop tard. Le rappel doit être dans le system quand des
// photos partent en vision, et SEULEMENT là (les chemins sans photos n'ont pas
// à traîner un bloc sur des photos inexistantes).

// Marqueur du bloc PHOTO_MISMATCH_SYSTEM_REMINDER (cf. index.ts).
const REMINDER_MARKER = "TU GÉNÈRES, TU NE JUGES PAS";

function makeMixPhotosRequest(): Request {
  const body = {
    type: "express_full",
    carousel_type: "mix",
    subject: "Qui je suis : le visage derrière la marque",
    objective: "engagement",
    workspace_id: TEST_WORKSPACE_ID,
    // Coupe la recherche « creuser le sujet » (fetchDepthMaterial ferait un
    // appel réseau réel hors de _deps).
    deepening_answers: { anecdote: "réponse de test" },
    photos: [{ base64: "aGVsbG8=", mimeType: "image/jpeg" }],
  };
  return new Request("http://localhost/carousel-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("mix avec photos : rappel anti-refus dans le system, photo_mismatch remonté sans logUsage", async () => {
  resetDeps();

  let capturedSystem = "";
  // deno-lint-ignore no-explicit-any
  _deps.callAnthropic = (async (params: any) => {
    if (!capturedSystem) capturedSystem = String(params?.system ?? "");
    // Refus structuré : le handler doit court-circuiter AVANT correction/gates
    // (aucun autre appel IA) et ne JAMAIS débiter.
    return JSON.stringify({ photo_mismatch: { reason: "Refus simulé pour le test." } });
    // deno-lint-ignore no-explicit-any
  }) as any;

  let logUsageCalled = false;
  // deno-lint-ignore no-explicit-any
  _deps.logUsage = (async () => {
    logUsageCalled = true;
  }) as any;

  const res = await handleRequest(makeMixPhotosRequest());

  assertEquals(res.status, 200); // 200 volontaire : l'erreur structurée passe par le corps
  const bodyJson = await res.json();
  assertEquals(bodyJson.error, "photo_mismatch");
  assert(
    capturedSystem.includes(REMINDER_MARKER),
    "le rappel anti-refus doit être injecté dans le message system du chemin vision mix",
  );
  assert(
    capturedSystem.includes("PAS à juger les photos"),
    "le rappel doit neutraliser explicitement le CONTEXTE BRANDING comme motif de refus",
  );
  // Verrous v2 (retest live 17/08 : le refus se coulait dans l'exception en lisant
  // « mon univers » comme une promesse de montrer l'univers de marque).
  assert(
    capturedSystem.includes("Un sujet identitaire ou abstrait"),
    "le rappel doit interdire le refus sur les sujets identitaires/abstraits",
  );
  assert(
    capturedSystem.includes("ne justifie JAMAIS un refus global"),
    "le rappel doit imposer d'écarter une photo plutôt que de tout refuser",
  );
  assertEquals(logUsageCalled, false);
});

Deno.test("structure_proposal : rappel anti-refus présent avec photos, absent sans photos", async () => {
  resetDeps();

  const capturedSystems: string[] = [];
  // deno-lint-ignore no-explicit-any
  _deps.callAnthropic = (async (params: any) => {
    capturedSystems.push(String(params?.system ?? ""));
    return JSON.stringify({
      strategic_rationale: "ok",
      narrative_thread: "récit de test",
      slides: [{ slide_number: 1, role: "hook", title_suggestion: "Titre", strategic_note: "note" }],
      total_slides: 1,
      carousel_type: "mix",
    });
    // deno-lint-ignore no-explicit-any
  }) as any;

  const makeStructureRequest = (withPhotos: boolean) =>
    new Request("http://localhost/carousel-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "structure_proposal",
        carousel_type: "mix",
        subject: "Sujet de test",
        workspace_id: TEST_WORKSPACE_ID,
        ...(withPhotos ? { photos: [{ base64: "aGVsbG8=", mimeType: "image/jpeg" }] } : {}),
      }),
    });

  const resWith = await handleRequest(makeStructureRequest(true));
  assertEquals(resWith.status, 200);
  assertExists((await resWith.json()).result);

  const resWithout = await handleRequest(makeStructureRequest(false));
  assertEquals(resWithout.status, 200);
  assertExists((await resWithout.json()).result);

  assertEquals(capturedSystems.length, 2);
  assert(capturedSystems[0].includes(REMINDER_MARKER), "avec photos : rappel attendu dans le system");
  assert(!capturedSystems[1].includes(REMINDER_MARKER), "sans photos : pas de rappel (aucune photo à juger)");
});
