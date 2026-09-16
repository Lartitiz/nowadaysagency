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
for (const qualityMax of [false, true]) for (const variant of ["text", "mix", "photo"]) for (const news of [undefined, "ACTUALITÉ_TEST : annonce fournie sans résultat mesuré."]) Deno.test(`révision contextuelle branchée de bout en bout : ${variant}, actu=${!!news}, Max=${qualityMax}`, async () => {
  resetDeps();
  const draft = { slides: [
    { slide_number: 1, slide_type: "text_only", title: "Les retours sur la maquette", body: "Une réponse commune permet de choisir entre les demandes." },
    { slide_number: 2, slide_type: "text_only", title: "Quand les retours se contredisent", body: "Les demandes se contredisent. C'est un signal, pas un accident." },
    { slide_number: 3, slide_type: "text_only", title: "Avant de reprendre le fichier", body: "Je te demande de choisir entre les demandes." },
    { slide_number: 4, slide_type: "text_only", title: "La réponse commune", body: "J'attends votre réponse avant de modifier la maquette." },
  ], caption: { body: "Les retours arrivent par e-mail.", hashtags: [] } };
  _deps.callAnthropic = (async (options: any, sink: any) => {
    assertEquals(options.model, qualityMax ? "gpt-6-astra" : "claude-opus-5");
    Object.assign(sink, { model: options.model, total_tokens: 30 });
    const prompt = options.system + JSON.stringify(options.messages) + JSON.stringify(options.tool);
    for (const contradiction of ["ARC NARRATIF OBLIGATOIRE", "MÉCANISME INVISIBLE", "CROYANCE SOUS-JACENTE", "AU MOINS 1 analogie", "30-50 mots MINIMUM", "le retournement FORMULÉ", "finale=dernière slide uniquement (question ouverte)", "Mieux vaut une généralisation honnête", "ce que ce mouvement révèle", "cf. DEPTH_LAYER_DUAL"]) {
      assert(!prompt.includes(contradiction), `Contradiction dans le prompt réellement envoyé : ${contradiction}`);
    }
    assert(prompt.includes("Une explication descriptive et une liste utile sont légitimes"));
    assert(prompt.includes("Construis d'abord le propos entier"));
    assert(prompt.includes("ce qu'elle reprend de la précédente"));
    assert(prompt.includes("Retours par e-mail"));
    if (news) { assert(prompt.includes("ACTUALITÉ_TEST")); assert(prompt.includes("sans désaccord, décalage ni quota d'opinions imposés")); }
    return JSON.stringify(draft);
  }) as any;
  const previousFetch = globalThis.fetch, key = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "test-no-network");
  let reviews = 0;
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const request = init?.body ? JSON.parse(String(init.body)) : {};
    let text = "{}";
    if (String(request.instructions).includes("révision éditoriale de ce carrousel")) {
      assertEquals(_url, "https://api.openai.com/v1/responses");
      assertEquals(request.model, "gpt-6-astra");
      reviews++;
      const message = request.input[0].content;
      assert(message.includes("BRIEF ACTUEL PRIORITAIRE"));
      assert(message.includes("Attendre une réponse commune"));
      assert(message.includes("FIL CONFIRMÉ À PRÉSERVER : FIL_VALIDÉ"));
      assert(message.includes("STRUCTURE CHOISIE À PRÉSERVER : PLAN_VALIDÉ"));
      assert(request.instructions.includes("RELECTURE DE L'ENSEMBLE AVANT LES CHAMPS"));
      const sequence = JSON.parse(message.split("SÉQUENCE DES SLIDES (repères de lecture uniquement, non modifiables) :\n")[1].split("\nCHAMPS ÉDITABLES")[0]);
      assertEquals(sequence.length, 4);
      assertEquals(sequence[1].field_ids, ["slides.1.title", "slides.1.body"]);
      const fields = JSON.parse(message.split("CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n")[1]);
      text = JSON.stringify({ reviews: fields.map((f: any) => {
        const before = " C'est un signal, pas un accident.";
        return { field_id: f.field_id, decision: f.text.includes(before) ? "edit" : "keep", reason: "analyse du rôle du passage", edits: f.text.includes(before) ? [{ before, after: "" }] : [] };
      }) });
    }
    if (request.tool_choice?.name === "review_carousel_fields") return Promise.resolve(new Response(JSON.stringify({ model: "gpt-6-astra", status: "completed", output: [{ type: "function_call", name: "review_carousel_fields", arguments: text }], usage: { input_tokens: 1, output_tokens: 1 } })));
    return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  try {
    const res = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: variant, quality_max: qualityMax, news_context: news, slide_count: 4, narrative_thread: "FIL_VALIDÉ", content_structure: "PLAN_VALIDÉ", deepening_answers: { faits: "Retours par e-mail. Attendre une réponse commune avant la modification de la maquette." } }));
    assertEquals(res.status, 200);
    const output = await res.json();
    assertEquals(output.writer, { version: "opus5-astra-medium-v1", model: qualityMax ? "gpt-6-astra" : "claude-opus-5", effort: "medium" });
    assertEquals(typeof output.content, "string");
    const parsed = JSON.parse(output.content.match(/\{[\s\S]*\}/)[0]);
    assertEquals(parsed.slides[1].body, "Les demandes se contredisent.");
    assertEquals(parsed.slides.length, 4);
    assertEquals(parsed.editorial_review.status, "reviewed");
    assertEquals(parsed.editorial_review.pass, 2);
    assertEquals(parsed.editorial_review.model, "gpt-6-astra");
    assertEquals(parsed.editorial_review.version, "connected-sequence-astra-medium-v6");
    assertEquals(parsed.editorial_review.total_usage.total_tokens, 4);
    assertEquals(reviews, 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("OPENAI_API_KEY"); else Deno.env.set("OPENAI_API_KEY", key);
  }
});
const TEST_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

for(const qualityMax of [false, true]) Deno.test(`writer quota and usage, hooks/slides, Max=${qualityMax}`, async () => {
  for(const type of ["hooks", "slides"]) {
    resetDeps();
    const order: string[] = [];
    let category = "", logged: any[] = [];
    _deps.checkQuota = (async (_id: string, cat: string) => { category = cat; order.push("quota"); return { allowed: true, plan: "outil" }; }) as any;
    _deps.callCarouselWriter = (async (options: any, sink: any) => {
      order.push("writer");
      assertEquals(options.model, qualityMax ? "gpt-6-astra" : "claude-opus-5");
      Object.assign(sink, { model: options.model, total_tokens: 123 });
      return JSON.stringify(type === "hooks" ? { hooks: [] } : { slides: [], caption: {} });
    }) as any;
    _deps.logUsage = (async (...args: any[]) => { order.push("usage"); logged = args; }) as any;
    const res = await handleRequest(makeHooksRequest({ type, quality_max: qualityMax }));
    await res.text();
    assertEquals(res.status, 200);
    assertEquals(order, ["quota", "writer", "usage"]);
    assertEquals(category, qualityMax ? "quality_max" : "content");
    assertEquals(logged[3], 123);
    assertEquals(logged[4], qualityMax ? "gpt-6-astra" : "claude-opus-5");
    assertEquals(logged[5], TEST_WORKSPACE_ID);
  }
});
Deno.test("Max quota denial never calls writer or bills usage", async () => {
  resetDeps();
  _deps.checkQuota = (async (_id: string, category: string) => { assertEquals(category, "quality_max"); return { allowed: false, plan: "free", reason: "quality_max" }; }) as any;
  _deps.callCarouselWriter = (async () => { throw new Error("FORBIDDEN"); }) as any;
  _deps.logUsage = (async () => { throw new Error("FORBIDDEN"); }) as any;
  const res = await handleRequest(makeHooksRequest({ quality_max: true }));
  assertEquals(res.status, 429);
  await res.text();
});
Deno.test("Mes slides never uses new writer, preserves authored text", async () => {
  resetDeps();
  _deps.callCarouselWriter = (async () => { throw new Error("FORBIDDEN"); }) as any;
  _deps.checkQuota = (async () => { throw new Error("FORBIDDEN"); }) as any;
  _deps.logUsage = (async () => { throw new Error("FORBIDDEN"); }) as any;
  const slides = [{ slide_number: 1, slide_type: "text_only", title: "Mon titre", body: "C'est un signal, pas un accident." }];
  const res = await handleRequest(makeHooksRequest({ type: "assign_templates", quality_max: true, slides }));
  assertEquals(res.status, 200);
  const out = await res.json();
  assertEquals(out.result.slides[0].title, slides[0].title);
  assertEquals(out.result.slides[0].body, slides[0].body);
});

/**
 * Client fictif : un propriétaire explicite pour TEST_WORKSPACE_ID et des tables
 * de marque vides. Un contexte autorisé vide reste un scénario de génération valide.
 * Les cas refusés/échoués sont testés séparément, sans repli personnel implicite.
 * Pas de fichier partagé — chaque *_test.ts du repo est autonome par convention.
 */
function makeFakeSupabase() {
  // deno-lint-ignore no-explicit-any
  function builder(table?: string): any {
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    b.select = () => b;
    const filters: Record<string, unknown> = {};
    b.eq = (column: string, value: unknown) => { filters[column] = value; return b; };
    b.neq = () => b;
    b.gte = () => b;
    b.lte = () => b;
    b.contains = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.in = () => b;
    b.is = () => b;
    b.single = () => Promise.resolve({ data: null, error: null });
    b.maybeSingle = () => {
      const owner = { workspace_id: TEST_WORKSPACE_ID, user_id: TEST_USER_ID, role: "owner" };
      const matchesOwner = table === "workspace_members" && Object.entries(filters).every(([key, value]) => owner[key as keyof typeof owner] === value);
      return Promise.resolve({ data: matchesOwner ? owner : null, error: null });
    };
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.update = () => b;
    b.delete = () => b;
    b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return b;
  }
  return {
    from: (table?: string) => builder(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: TEST_USER_ID } }, error: null }) },
  };
}

/** Réinitialise TOUS les champs de `_deps` avant chaque test (état de module partagé). */
function resetDeps() {
  _deps.callCarouselWriter = ((options: any, sink: any) => _deps.callAnthropic(options, sink)) as any;
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
      sb.from = (table?: string) => {
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

// R4: exercise the actual handler after context failure, including usage boundaries.
for (const failedTable of ["workspace_members", "brand_profile"]) Deno.test(`context ${failedTable} failure stops carousel writer and billing`, async () => {
  resetDeps();
  const sb = makeFakeSupabase(), from = sb.from;
  sb.from = (table?: string) => {
    const b = from(table);
    if (table === failedTable) {
      b.maybeSingle = () => Promise.resolve({data: null, error: {message: "PRIVATE R4 diagnostic"}});
    }
    return b;
  };
  _deps.runPipeline = (async () => ({ok: true, userId: TEST_USER_ID, supabase: sb, corsHeaders: {}, quota: null})) as any;
  let writer = 0, usage = 0;
  _deps.callAnthropic = (async () => {writer++; return "{}";}) as any;
  _deps.logUsage = (async () => {usage++;}) as any;
  const response = await handleRequest(makeHooksRequest());
  assertEquals(response.status, 500);
  const body = await response.text();
  assert(!body.includes("PRIVATE R4"));
  assertEquals(writer, 0);
  assertEquals(usage, 0);
});
Deno.test("inaccessible workspace never becomes a personal carousel generation", async () => {
  resetDeps();
  let writer = 0, usage = 0;
  _deps.callAnthropic = (async () => {writer++; return "{}";}) as any;
  _deps.logUsage = (async () => {usage++;}) as any;
  const response = await handleRequest(makeHooksRequest({workspace_id: "22222222-2222-2222-2222-222222222222"}));
  assertEquals(response.status, 500);
  await response.text();
  assertEquals(writer, 0);
  assertEquals(usage, 0);
});

for (const repair of ['success', 'short', 'failure']) Deno.test(`texte incomplet : réparation bornée ${repair}, reçu conservé`, async () => {
  resetDeps();
  const oldFetch = globalThis.fetch, key = Deno.env.get('OPENAI_API_KEY');
  Deno.env.set('OPENAI_API_KEY', 'synthetic-no-network');
  let reviews = 0, writes = 0, logged: any[] = [];
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body || '{}'));
    if (req.tool_choice?.name === 'review_carousel_fields') {
      reviews++;
      const fields = JSON.parse(req.input[0].content.split("CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n")[1]);
      const text = JSON.stringify({reviews: fields.map((f: any) => ({field_id:f.field_id,decision:'keep',reason:'Texte situé et utile',edits:[]}))});
      return Promise.resolve(new Response(JSON.stringify({model:'gpt-6-astra',status:'completed',output:[{type:'function_call',name:'review_carousel_fields',arguments:text}],usage:{input_tokens:1,output_tokens:1}})));
    }
    return Promise.resolve(new Response(JSON.stringify({content:[{type:'text',text:'{}'}],stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1}})));
  }) as typeof fetch;
  const full = {slides:[{slide_number:1,title:'8 erreurs à expliquer',body:'',role:'hook'}, ...Array.from({length:8},(_,i)=>({slide_number:i+2,title:`${i+1}. Une erreur précise`,body:'Une explication située qui aide à choisir le prochain geste.',role:'erreur'})),{slide_number:10,title:'Choisis ton prochain geste',body:'Relis un contenu pour vérifier son objectif.',role:'conclusion'}],caption:{body:'Une légende fidèle au sujet.'}};
  const short = { ...full, slides: full.slides.slice(0,7) };
  _deps.callCarouselWriter = (async (opts: any, sink: any) => {
    writes++; Object.assign(sink,{model:opts.model,input_tokens:10,output_tokens:20,total_tokens:30});
    if (writes===2) { assert(opts.messages[0].content.includes('DÉFAUTS STRUCTURELS')); if(repair==='failure') throw Error('synthetic failure'); }
    return JSON.stringify(writes===2 && repair==='success' ? full : short);
  }) as any;
  _deps.logUsage = (async (...args: any[])=>{logged=args;}) as any;
  try {
    const res = await handleRequest(makeHooksRequest({type:'express_full',carousel_type:'text',subject:'8 erreurs de communication',slide_count:10,deepening_answers:{faits:'Développe chaque erreur distinctement.'}}));
    assertEquals(res.status,200);
    const out = await res.json(), parsed=JSON.parse(out.content);
    assertEquals(writes,2); assertEquals(logged[3],60); assert(reviews>0);
    assertEquals(parsed.slides.length,repair==='success'?10:7);
    assertEquals(parsed.structure_warnings.length===0,repair==='success');
    assertEquals(parsed.slides[1].body,full.slides[1].body);
  } finally { globalThis.fetch=oldFetch; if(key===undefined)Deno.env.delete('OPENAI_API_KEY');else Deno.env.set('OPENAI_API_KEY',key); }
});
