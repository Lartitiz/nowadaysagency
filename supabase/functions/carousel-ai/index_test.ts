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
// Exercise the actual three handlers; only external services are faked.
for (const variant of ["text", "mix", "photo"]) Deno.test(`révision contextuelle branchée de bout en bout : ${variant}`, async () => {
  resetDeps();
  const draft = { slides: [
    { slide_number: 1, slide_type: "text_only", title: "Les retours sur la maquette", body: "Une réponse commune permet de choisir entre les demandes." },
    { slide_number: 2, slide_type: "text_only", title: "Quand les retours se contredisent", body: "Les demandes se contredisent. C'est un signal, pas un accident." },
    { slide_number: 3, slide_type: "text_only", title: "Avant de reprendre le fichier", body: "Je te demande de choisir entre les demandes." },
    { slide_number: 4, slide_type: "text_only", title: "La réponse commune", body: "J'attends votre réponse avant de modifier la maquette." },
  ], caption: { body: "Les retours arrivent par e-mail.", hashtags: [] } };
  _deps.callAnthropic = (async () => JSON.stringify(draft)) as any;
  const previousFetch = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-no-network");
  let reviews = 0;
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const request = init?.body ? JSON.parse(String(init.body)) : {};
    let text = "{}";
    if (JSON.stringify(request.system).includes("révision éditoriale de ce carrousel")) {
      reviews++;
      const message = request.messages[0].content;
      const fields = JSON.parse(message.split("CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n")[1]);
      text = JSON.stringify({ reviews: fields.map((f: any) => {
        const before = " C'est un signal, pas un accident.";
        return { field_id: f.id, decision: f.text.includes(before) ? "edit" : "keep", reason: "analyse du rôle du passage", edits: f.text.includes(before) ? [{ before, after: "" }] : [] };
      }) });
    }
    const content = request.tool_choice?.name === "review_carousel_fields"
      ? [{ type: "tool_use", id: "test", name: "review_carousel_fields", input: JSON.parse(text) }]
      : [{ type: "text", text }];
    return Promise.resolve(new Response(JSON.stringify({ content, stop_reason: request.tool_choice ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  try {
    const res = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: variant, slide_count: 4, deepening_answers: { faits: "Retours par e-mail. Attendre une réponse commune avant la modification de la maquette." } }));
    assertEquals(res.status, 200);
    const output = await res.json();
    assertEquals(typeof output.content, "string");
    const parsed = JSON.parse(output.content.match(/\{[\s\S]*\}/)[0]);
    assertEquals(parsed.slides[1].body, "Les demandes se contredisent.");
    assertEquals(parsed.slides.length, 4);
    assertEquals(parsed.editorial_review.status, "reviewed");
    assertEquals(parsed.editorial_review.pass, 2);
    assertEquals(reviews, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", key);
  }
});
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
    from: (_table?: string) => builder(),
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

for (const requested of ["linkedin", "instagram", undefined]) {
  for (const hasSpecificPersona of [true, false]) {
    Deno.test(`persona carrousel : ${requested || "défaut"}, spécifique=${hasSpecificPersona}`, async () => {
      resetDeps();
      const sb = makeFakeSupabase();
      const from = sb.from;
      sb.from = (table: string) => {
        const b = from(table);
        if (table === "persona") {
          let chosen: any = null;
          b.contains = (_column: string, channels: string[]) => {
            chosen = hasSpecificPersona ? { step_1_frustrations: `PUBLIC_${channels[0]}` } : null;
            return b;
          };
          b.eq = (column: string) => {
            if (column === "is_primary") chosen = { step_1_frustrations: "PUBLIC_PRINCIPAL" };
            return b;
          };
          b.maybeSingle = () => Promise.resolve({ data: chosen, error: null });
        }
        return b;
      };
      _deps.runPipeline = (async () => ({ ok: true, userId: TEST_USER_ID, supabase: sb, corsHeaders: {}, quota: null })) as any;
      let prompt = "";
      _deps.callAnthropic = (async (options: any) => {
        prompt = options.system;
        return JSON.stringify({ hooks: [{ text: "Accroche fictive" }] });
      }) as any;
      const response = await handleRequest(makeHooksRequest({ channel: requested }));
      await response.text();
      assertEquals(response.status, 200);
      assertEquals(prompt.includes(hasSpecificPersona ? `PUBLIC_${requested || "instagram"}` : "PUBLIC_PRINCIPAL"), true);
    });
  }
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
