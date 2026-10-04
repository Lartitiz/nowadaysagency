import { matchFinalPhotos } from "./final-photo-match.ts";
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
import { progressionReceipt } from "../_shared/carousel-progression.ts";
import { handleRequest, _deps, normalizeSlideType, writerTimeoutMs } from "./index.ts";
import { createContinuousNarrative } from "./continuous-narrative.ts";

Deno.test("prose continue : photos directes observées et refus photo conservé sans débit",async()=>{
  resetDeps();_deps.prepareNarrative=createContinuousNarrative;
  let debits=0;_deps.logUsage=(async()=>{debits++;}) as any;
  _deps.callCarouselWriter=async(o)=>{
    const blocks=o.messages[0].content as any[];
    assert(blocks.some(b=>b.type==="image"&&b.source.data==="aGVsbG8="));
    return JSON.stringify({photo_mismatch:{reason:"Le sujet promet un meuble absent des photos."}});
  };
  const oldFetch=globalThis.fetch;
  globalThis.fetch=(()=>Promise.resolve(new Response("{}",{status:503}))) as typeof fetch;
  try{
    const response=await handleRequest(makeHooksRequest({type:"express_full",carousel_type:"photo",slide_count:4,scenario_origin:"automatic",photos:[{base64:"aGVsbG8="}],deepening_answers:{fait:"Mon meuble"}}));
    assertEquals((await response.json()).error,"photo_mismatch");assertEquals(debits,0);
  }finally{globalThis.fetch=oldFetch;resetDeps();}
});

// SUPABASE_URL / SERVICE_ROLE_KEY ne sont jamais lus (checkQuota/logUsage/runPipeline
// sont TOUJOURS mockés via _deps dans ces tests), mais on pose des valeurs factices
// par prudence — même patron que plan-limiter_test.ts.
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");

const TEST_USER_ID = "test-user-1";
async function verdict(doc:any, issues:string[]=[]){return {...await progressionReceipt(doc,"completed"),verdict:issues.length?"needs_repair" as const:"acceptable" as const,issues};}
// Exercise the actual three handlers; only external services are faked.
for (const qualityMax of [false, true]) for (const variant of ["text", "mix", "photo"]) for (const news of [undefined, "ACTUALITÉ_TEST : annonce fournie sans résultat mesuré."]) Deno.test(`révision contextuelle branchée de bout en bout : ${variant}, actu=${!!news}, Max=${qualityMax}`, async () => {
  resetDeps();
  let researched = "";
  _deps.fetchDepthMaterial = (async (o: any) => { researched = o.subject; return "MATIÈRE_RECHERCHE_TEST : un mécanisme documenté du sujet, avec un fait sourcé (Source, 2025), assez long pour être gardé."; }) as any;
  const draft = { slides: [
    { slide_number: 1, slide_type: "text_only", title: "Les retours sur la maquette", body: "Une réponse commune permet de choisir entre les demandes." },
    { slide_number: 2, slide_type: "text_only", title: "Quand les retours se contredisent", body: "Les demandes se contredisent. C'est un signal, pas un accident." },
    { slide_number: 3, slide_type: "text_only", title: "Avant de reprendre le fichier", body: "Je te demande de choisir entre les demandes." },
    { slide_number: 4, slide_type: "text_only", title: "La réponse commune", body: "J'attends votre réponse avant de modifier la maquette." },
  ], caption: { body: "Les retours arrivent par e-mail.", hashtags: [] } };
  _deps.callAnthropic = (async (options: any, sink: any) => {
    assertEquals(options.model, qualityMax ? "claude-fable-5-1" : "claude-opus-5-5");
    Object.assign(sink, { model: options.model, total_tokens: 30 });
    const prompt = options.system + JSON.stringify(options.messages) + JSON.stringify(options.tool);
    for (const contradiction of ["ARC NARRATIF OBLIGATOIRE", "MÉCANISME INVISIBLE", "CROYANCE SOUS-JACENTE", "AU MOINS 1 analogie", "30-50 mots MINIMUM", "le retournement FORMULÉ", "finale=dernière slide uniquement (question ouverte)", "Mieux vaut une généralisation honnête", "ce que ce mouvement révèle", "cf. DEPTH_LAYER_DUAL"]) {
      assert(!prompt.includes(contradiction), `Contradiction dans le prompt réellement envoyé : ${contradiction}`);
    }
    assert(prompt.includes("Une explication descriptive et une liste utile sont légitimes"));
    assert(prompt.includes("Construis d'abord le propos entier"));
    assert(prompt.includes("ce qu'elle reprend de la précédente"));
    assert(prompt.includes("Retours par e-mail"));
    assert(prompt.includes("MATIÈRE_RECHERCHE_TEST"), "la recherche nourrit aussi la rédaction avec une actu");
    if (news) { assert(researched.includes("ACTUALITÉ_TEST")); assert(prompt.includes("ACTUALITÉ_TEST")); assert(prompt.includes("L'angle choisi (accroche et développement) est la thèse du carrousel")); }
    return JSON.stringify(draft);
  }) as any;
  const previousFetch = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-no-network");
  let reviews = 0;
  let finalJudged=false;
  _deps.reviewThread=async(doc:any)=>{assertEquals(doc.slides[1].body,"Les demandes se contredisent.");finalJudged=true;return verdict(doc);};
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const request = init?.body ? JSON.parse(String(init.body)) : {};
    let text = "{}";
    const isReview = request.tools?.[0]?.name === "review_carousel_fields";
    if (isReview) {
      assert(String(request.system?.[0]?.text).includes("révision éditoriale de ce carrousel"));
      assertEquals(_url, "https://api.anthropic.com/v1/messages");
      assertEquals(request.model, "claude-opus-5-5");
      reviews++;
      const message = request.messages[0].content;
      assert(message.includes("BRIEF ACTUEL PRIORITAIRE"));
      assert(message.includes("CONTEXTE_PHOTO_CONSERVÉ"));
      assert(message.includes("Attendre une réponse commune"));
      assert(message.includes("FIL CONFIRMÉ À PRÉSERVER : FIL_VALIDÉ"));
      assert(message.includes("STRUCTURE CHOISIE À PRÉSERVER : PLAN_VALIDÉ"));
      assert(request.system[0].text.includes("RELECTURE DE L'ENSEMBLE AVANT LES CHAMPS"));
      const sequence = JSON.parse(message.split("SÉQUENCE DES SLIDES (repères de lecture uniquement, non modifiables) :\n")[1].split("\nCHAMPS ÉDITABLES")[0]);
      assertEquals(sequence.length, 4);
      assertEquals(sequence[1].field_ids, ["slides.1.title", "slides.1.body"]);
      const fields = JSON.parse(message.split("CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n")[1]);
      text = JSON.stringify({ reviews: fields.map((f: any) => {
        const before = " C'est un signal, pas un accident.";
        return { field_id: f.field_id, decision: f.text.includes(before) ? "edit" : "keep", reason: "analyse du rôle du passage", edits: f.text.includes(before) ? [{ before, after: "" }] : [] };
      }) });
    }
    if (isReview) return Promise.resolve(new Response(JSON.stringify({ model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", name: "review_carousel_fields", input: JSON.parse(text) }], usage: { input_tokens: 1, output_tokens: 1 } })));
    return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  try {
    const res = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: variant, quality_max: qualityMax, news_context: news, photo_contexts: [{ context: "CONTEXTE_PHOTO_CONSERVÉ : trois demandes reçues par e-mail." }], slide_count: 4, narrative_thread: "FIL_VALIDÉ", content_structure: "PLAN_VALIDÉ", deepening_answers: { faits: "Retours par e-mail. Attendre une réponse commune avant la modification de la maquette." } }));
    assertEquals(res.status, 200);
    const output = await res.json();
    assertEquals(output.writer, { version: "opus55-fable51-medium-v2", model: qualityMax ? "claude-fable-5-1" : "claude-opus-5-5", effort: "medium" });
    assertEquals(typeof output.content, "string");
    const parsed = JSON.parse(output.content.match(/\{[\s\S]*\}/)[0]);
    assertEquals(parsed.slides[1].body, "Les demandes se contredisent.");
    assertEquals(parsed.slides.length, 4);
    assertEquals(parsed.editorial_review.status, "reviewed");
    // Une seule relecture : ses retouches ne sont plus revérifiées par une 2e passe (30/09).
    assertEquals(parsed.editorial_review.pass, 1);
    assertEquals(parsed.editorial_review.model, "claude-opus-5-5");
    assertEquals(parsed.editorial_review.version, "connected-sequence-opus55-medium-v8");
    assertEquals(parsed.editorial_review.total_usage.total_tokens, 2);
    assertEquals(reviews, 1);
    assert(finalJudged,"le juge lit après les retouches finales");
  } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", key);
  }
});
const TEST_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

for(const qualityMax of [false, true]) Deno.test(`writer quota and usage, hooks/slides, Max=${qualityMax}`, async () => {
  for(const type of ["hooks", "slides"]) {
    resetDeps();
    const order: string[] = [];
    let category = "", logged: any[] = [];
    const checked: string[] = [];
    _deps.checkQuota = (async (_id: string, cat: string) => { category = cat; checked.push(cat); if (cat !== "quality_max") order.push("quota"); return { allowed: true, plan: "outil" }; }) as any;
    _deps.callCarouselWriter = (async (options: any, sink: any) => {
      order.push("writer");
      assertEquals(options.model, qualityMax ? "claude-fable-5-1" : "claude-opus-5-5");
      Object.assign(sink, { model: options.model, total_tokens: 123 });
      return JSON.stringify(type === "hooks" ? { hooks: [] } : { slides: [], caption: {} });
    }) as any;
    _deps.logUsage = (async (...args: any[]) => { order.push("usage"); logged = args; }) as any;
    const res = await handleRequest(makeHooksRequest({ type, quality_max: qualityMax }));
    await res.text();
    assertEquals(res.status, 200);
    assertEquals(order, ["quota", "writer", "usage"]);
    // Grille 01/10/2026 : un carrousel rédigé (slides) = 1 unité `carousel`,
    // Qualité Max compris ; les accroches restent en `content`. Qualité Max
    // ajoute seulement un contrôle d'accès `quality_max` AVANT le quota.
    const expected = type === "slides" ? "carousel" : "content";
    assertEquals(category, expected);
    assertEquals(checked, qualityMax ? ["quality_max", expected] : [expected]);
    assertEquals(logged[1], expected);
    assertEquals(logged[3], 123);
    assertEquals(logged[4], qualityMax ? "claude-fable-5-1" : "claude-opus-5-5");
    assertEquals(logged[5], TEST_WORKSPACE_ID);
  }
});
for (const [userId, expected] of [[TEST_USER_ID, "claude-opus-5-5"], ["52e6c03c-a7de-4c20-9b4a-276751f976e8", "claude-opus-5"]] as const) Deno.test(`writer_bench (back to Opus 5) honoured only for the QA account (${expected})`, async () => {
  resetDeps();
  _deps.runPipeline = (async () => ({ ok: true, userId, supabase: makeFakeSupabase(userId) as any, corsHeaders: {}, quota: null })) as any;
  let model = "";
  _deps.callCarouselWriter = (async (options: any, sink: any) => {
    model = options.model;
    Object.assign(sink, { model: options.model, total_tokens: 1 });
    return JSON.stringify({ hooks: [] });
  }) as any;
  const res = await handleRequest(makeHooksRequest({ type: "hooks", writer_bench: "claude-opus-5" }));
  await res.text();
  assertEquals(res.status, 200);
  assertEquals(model, expected);
});
// 04/10/2026 : 3 rédactions sur 8 coupées à 120 s fixes en prod. La rédaction
// texte suit désormais le budget global : fin au plus tard 240 s après le début
// de la requête, jamais moins de 120 s ; les réparations gardent leur plafond.
Deno.test("délai de rédaction calé sur le budget global de la requête", () => {
  assertEquals(writerTimeoutMs(0, 0), 240_000);
  assertEquals(writerTimeoutMs(0, 30_000), 210_000);
  assertEquals(writerTimeoutMs(0, 150_000), 120_000);
});
for (const type of ["express_full", "slides", "hooks"]) Deno.test(`rédaction ${type} : plus de coupure à 120 s, réparation inchangée`, async () => {
  resetDeps();
  const timeouts: number[] = [];
  _deps.callCarouselWriter = (async (options: any, sink: any) => {
    timeouts.push(options.abortTimeoutMs);
    Object.assign(sink, { model: options.model, total_tokens: 1 });
    // Toute relance éventuelle (réparation) garde son propre plafond de 120 s.
    return JSON.stringify(type === "hooks" ? { hooks: [] } : { slides: [{ slide_number: 1, slide_type: "text_only", title: "Une seule", body: "Une seule slide." }], caption: {} });
  }) as any;
  _deps.callAnthropic = (async (_o: any, sink: any) => { Object.assign(sink, { total_tokens: 0 }); return "{}"; }) as any;
  const res = await handleRequest(makeHooksRequest({ type, carousel_type: "storytelling", slide_count: 6 }));
  await res.text();
  assertEquals(res.status, 200);
  assert(timeouts[0] > 200_000 && timeouts[0] <= 240_000, `rédaction : ${timeouts[0]}`);
  for (const t of timeouts.slice(1)) assert(t <= 120_000, `réparation : ${t}`);
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
function makeFakeSupabase(ownerId: string = TEST_USER_ID) {
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
      const owner = { workspace_id: TEST_WORKSPACE_ID, user_id: ownerId, role: "owner" };
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
  _deps.matchPhotos = async (doc) => doc;
  _deps.prepareNarrative = async () => null;
  // Recherche « creuser le sujet » coupée par défaut (aucun réseau).
  _deps.fetchDepthMaterial = async () => "";
  _deps.callCarouselWriter = ((options: any, sink: any) => _deps.callAnthropic(options, sink)) as any;
  // Juge du fil neutralisé par défaut (aucun réseau) ; les tests du fil le remplacent.
  _deps.reviewThread = (async (doc:any) => verdict(doc)) as any;
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
  const oldFetch = globalThis.fetch, key = Deno.env.get('ANTHROPIC_API_KEY');
  Deno.env.set('ANTHROPIC_API_KEY', 'synthetic-no-network');
  let reviews = 0, writes = 0, logged: any[] = [];
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body || '{}'));
    if (req.tools?.[0]?.name === 'review_carousel_fields') {
      reviews++;
      const fields = JSON.parse(req.messages[0].content.split("CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n")[1]);
      const text = JSON.stringify({reviews: fields.map((f: any) => ({field_id:f.field_id,decision:'keep',reason:'Texte situé et utile',edits:[]}))});
      return Promise.resolve(new Response(JSON.stringify({model:'claude-opus-5-5',stop_reason:'tool_use',content:[{type:'tool_use',name:'review_carousel_fields',input:JSON.parse(text)}],usage:{input_tokens:1,output_tokens:1}})));
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
    // 60 = deux passes de rédaction ; +2 = l'étage de schémas après l'écriture (03/10/2026).
    assertEquals(writes,2); assertEquals(logged[3],62); assert(reviews>0);
    assertEquals(parsed.slides.length,repair==='success'?10:7);
    assertEquals(parsed.structure_warnings.length===0,repair==='success');
    assertEquals(parsed.slides[1].body,full.slides[1].body);
  } finally { globalThis.fetch=oldFetch; if(key===undefined)Deno.env.delete('ANTHROPIC_API_KEY');else Deno.env.set('ANTHROPIC_API_KEY',key); }
});

// Final progression: all variants, bounded repair, unavailable status, deadlines and invariants.
for(const variant of ["text","photo","mix"]) for(const outcome of ["acceptable","repair","same","reordered","unavailable","invalid","time-budget","late-repair","too-late-repair"]) Deno.test(`progression finale ${variant} / ${outcome}`,async()=>{
  resetDeps();
  const oldFetch=globalThis.fetch,now=Date.now;let offset=0;
  Date.now=()=>now()+offset;
  globalThis.fetch=(()=>Promise.resolve(new Response("{}",{status:503}))) as typeof fetch;
  const draft={slides:[
    {slide_number:1,slide_type:"photo_full",photo_index:1,role:"hook",overlay_text:"Les retours demandent une direction commune."},
    {slide_number:2,slide_type:"photo_full",photo_index:2,role:"body",overlay_text:"Les remarques contradictoires restent à départager."},
    {slide_number:3,slide_type:"photo_full",photo_index:3,role:"conclusion",overlay_text:"Le choix validé guide les corrections."},
  ],caption:{body:"Un choix commun précède les modifications.",hashtags:[]}};
  const fixed=structuredClone(draft);fixed.slides[1].overlay_text="Les remarques contradictoires doivent donc être départagées avant de modifier la maquette.";
  let writes=0,judges=0,lastJudgedDoc:any;
  _deps.callCarouselWriter=(async(o:any,sink:any)=>{
    writes++;Object.assign(sink,{model:o.model,total_tokens:10});
    if(outcome==="time-budget")offset=300_000;
    if (writes === 2 && outcome === "late-repair") {
      assert(o.abortTimeoutMs > 50_000 && o.abortTimeoutMs <= 55_000);
    }
    if(writes===1 || outcome==="same")return JSON.stringify(draft);
    assert(JSON.stringify(o.messages[0].content).includes("DÉFAUTS DE FIL"));
    if(outcome==="reordered")fixed.slides.reverse();
    return JSON.stringify({...lastJudgedDoc,slides:fixed.slides.map((s,i)=>({...lastJudgedDoc.slides[i],...s}))});
  }) as any;
  _deps.reviewThread=async(doc:any, options:any)=>{
    assert(options.sources.find((s:any)=>s.id==="request").text.includes("Demandes contradictoires."));
    assert(options.abortTimeoutMs <= 45_000);
    if (judges === 0 && outcome === "late-repair") offset = 160_000;
    if (judges === 0 && outcome === "too-late-repair") offset = 200_000;
    judges++;lastJudgedDoc=structuredClone(doc);
    if(outcome==="unavailable"||outcome==="invalid")return progressionReceipt(doc,outcome);
    return verdict(doc,outcome==="acceptable" || (judges===2&&["repair","late-repair"].includes(outcome))?[]:["La conclusion est insuffisamment préparée."]);
  };
  try {
    const res=await handleRequest(makeHooksRequest({type:"express_full",carousel_type:variant,subject:"Choisir une direction avant de modifier",slide_count:3,deepening_answers:{faits:"Demandes contradictoires. Le client choisit une direction commune, puis les corrections commencent."},...(variant!=="text"?{photos:[{base64:"aGVsbG8=",mimeType:"image/jpeg"},{base64:"aGVsbG8=",mimeType:"image/jpeg"},{base64:"aGVsbG8=",mimeType:"image/jpeg"}]}:{})}));
    assertEquals(res.status,200);const data=await res.json(),doc=JSON.parse(data.content);
    assertEquals(doc.slides.map((x:any)=>x.photo_index),[1,2,3]);
    assertEquals(doc.slides.length,3);
    assert(doc.generation_receipt.writing_version);
    assertEquals(doc.progression_review.reviewed_text_hash.length,64);
    if(outcome==="repair"||outcome==="late-repair") {assertEquals(writes,2);assertEquals(judges,2);assertEquals(doc.slides[1].overlay_text,fixed.slides[1].overlay_text);assertEquals(doc.progression_review.verdict,"acceptable");}
    else if(outcome==="too-late-repair") {assertEquals(writes,1);assertEquals(judges,1);assertEquals(doc.progression_review.verdict,"needs_repair");}
    else if(outcome==="same"||outcome==="reordered") {assertEquals(writes,2);assertEquals(doc.slides[1].overlay_text,draft.slides[1].overlay_text);assertEquals(doc.progression_review.verdict,"needs_repair");}
    else {assertEquals(writes,1);assertEquals(doc.progression_review.execution_status,outcome==="time-budget"?"skipped":outcome==="acceptable"?"completed":outcome);}
    if(outcome!=="acceptable"&&outcome!=="repair"&&outcome!=="late-repair")assert(doc.structure_warnings.length>0);
    if(outcome==="time-budget")assertEquals(judges,0);
  }finally {globalThis.fetch=oldFetch;Date.now=now;}
});

Deno.test("texte utilisateur : pas de certification ni de réécriture globale automatique",async()=>{
  resetDeps();let judged=0;_deps.reviewThread=async(doc:any)=>{judged++;return verdict(doc);};
  _deps.callCarouselWriter=(async()=>JSON.stringify({slides:[{slide_number:1,title:"Mon titre",body:"Mon passage."}],caption:{}})) as any;
  const oldFetch=globalThis.fetch;globalThis.fetch=(()=>Promise.resolve(new Response("{}",{status:503}))) as typeof fetch;
  try{const res=await handleRequest(makeHooksRequest({type:"slides",slide_count:1,user_slides:[{title:"Mon titre",body:"Mon passage."}]}));const d=JSON.parse((await res.json()).content);assertEquals(judged,0);assertEquals(d.progression_review.execution_status,"skipped");assertEquals(d.progression_review.reason,"user-authored");}finally{globalThis.fetch=oldFetch;}
});

for (const kind of ["photo", "mix"]) Deno.test(`structure ${kind} : deux photos n'imposent ni avant/après ni longueur`, async () => {
  resetDeps();
  let prompt = "";
  _deps.callAnthropic = (async (o: any) => {
    prompt = o.system + JSON.stringify(o.messages);
    return JSON.stringify({ slides: [{ slide_number: 1, role: "hook", title_suggestion: "Titre", strategic_note: "note", overlay_position: "top_left" }], total_slides: 1 });
  }) as any;
  const res = await handleRequest(makeHooksRequest({ type: "structure_proposal", carousel_type: kind, slide_count: 3, photos: [
    { base64: "aGVsbG8=", context: "Deux étapes du service", libraryContext: "Portrait observé" }, { base64: "aGVsbG8=" },
  ] }));
  assertEquals(res.status, 200); await res.text();
  assert(prompt.includes("exactement 3 slides"));
  assert(prompt.includes("Deux photos ne prouvent pas un avant/après"));
  assert(prompt.includes("Deux étapes du service"));
  assert(prompt.includes("indications de bibliothèque, potentiellement déduites"));
  for (const stale of ["3 à 4", "5 à 7", "7 à 9", "slide pivot", "Utiliser CHAQUE"]) assert(!prompt.includes(stale), stale);
});
Deno.test("premier carrousel produit : le plan attribue des photos différentes", async () => {
  resetDeps();
  let prompt = "";
  _deps.callAnthropic = (async (options: any) => {
    prompt = options.system + JSON.stringify(options.messages);
    return JSON.stringify({ total_slides: 3, slides: [
      { slide_number: 1, role: "hook", photo_index: 1, photo_observation: "Photo 1" },
      { slide_number: 2, role: "body", photo_index: 1, photo_observation: "Photo 1" },
      { slide_number: 3, role: "conclusion", photo_index: 2, photo_observation: "Photo 2" },
    ] });
  }) as any;
  const res = await handleRequest(makeHooksRequest({ type: "structure_proposal", carousel_type: "photo", slide_count: 3,
    prefer_distinct_photos: true, photos: [1, 2, 3].map(() => ({ base64: "aGVsbG8=" })) }));
  assertEquals(res.status, 200);
  const { result } = await res.json();
  assertEquals(result.slides.map((slide: any) => slide.photo_index), [1, 3, 2]);
  assertEquals(result.slides[1].photo_observation, undefined);
  assert(prompt.includes("chaque photo_index doit être unique"));
});

for (const carousel_type of ["photo", "mix"]) for (const withPixels of [false, true]) Deno.test(`questions ${carousel_type} avec pixels=${withPixels} : précisions essentielles facultatives`, async () => {
  resetDeps(); let prompt = "";
  _deps.callAnthropic = (async (o: any) => {
    prompt = JSON.stringify(o.messages);
    assertEquals(o.tool.input_schema.properties.questions.maxItems, 2);
    assert(!o.tool.description.includes("3 questions"));
    return JSON.stringify({ questions: [] });
  }) as any;
  const res = await handleRequest(makeHooksRequest({ type: "deepening_questions", carousel_type, subject: "Les étapes de mon diagnostic", photo_description: "Un portrait accompagne le récit", deepening_answers: { fait: "FAIT_DÉJÀ_FOURNI" }, ...(withPixels ? { photos: [{ base64: "aGVsbG8=", context: "Étape déjà expliquée" }] } : {}) }));
  assertEquals(res.status, 200);
  assertEquals(JSON.parse((await res.json()).content).questions, []);
  assert(prompt.includes("FAIT_DÉJÀ_FOURNI"));
  assert(prompt.includes("zéro, une ou deux questions"));
  assert(!prompt.includes("exactement 3 questions"));
  assert(prompt.includes("Ne redemande pas ce qui est déjà fourni"));
  assert(!prompt.includes("POURQUOI PROFOND"));
  assert(!prompt.includes("ÉMOTION/SCÈNE VÉCUE"));
});

for (const subject of ["Découverte des céramiques après onboarding", "Histoire de marque illustrée par des portraits", "Expliquer un choix de conseil", "Transformation documentée d’un espace"]) Deno.test(`photo narrative : contrat et preuves traversent le vrai handler : ${subject}`, async () => {
  resetDeps(); let writerPrompt=""; let judged=0;
  const plan=Array.from({length:4},(_,i)=>({slide_number:i+1,role:i===0?"hook":"explication",title_suggestion:`Titre ${i}`,strategic_note:"Apport au récit",photo_index:1,slide_type:"photo_full",story_beat:"Progression fournie",photo_observation:"Fleur peinte, aucun bouquet visible",image_relation:"Accompagne l’histoire de marque sans scène littérale",factual_basis:"Raison fournie dans le brief"}));
  const slides=plan.map(s=>({...s,overlay_text:"Texte suffisamment développé pour comprendre le choix exposé et son lien avec la suite du récit."}));
  _deps.callCarouselWriter=(async(o:any,sink:any)=>{writerPrompt=o.system+JSON.stringify(o.messages);Object.assign(sink,{total_tokens:1,model:o.model});return JSON.stringify({slides,caption:{body:""}});}) as any;
  _deps.reviewThread=(async(_doc:any,options:any)=>{judged++;assert(options.preserveStructure);assert(options.sourceContext.includes("Fleur peinte"));return verdict(_doc);}) as any;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=(()=>Promise.resolve(new Response(JSON.stringify({content:[{type:"text",text:"{}"}],stop_reason:"end_turn",usage:{input_tokens:1,output_tokens:1}})))) as typeof fetch;
  try {
    const res=await handleRequest(makeHooksRequest({type:"express_full",carousel_type:"photo",subject,confirmed_structure:plan,narrative_thread:"Intention puis découverte, choix, aboutissement"}));
    assertEquals(res.status,200);const out=await res.json();const doc=JSON.parse(out.content);
    assertEquals(doc.slides.map((s:any)=>s.photo_index),[1,1,1,1]);
    assert(writerPrompt.includes("PHOTOS ET RÉCIT DE MARQUE"));assert(writerPrompt.includes("Fleur peinte, aucun bouquet visible"));
    assert(writerPrompt.includes("sans illustrer chaque phrase"));assert(writerPrompt.includes("Sources à vérifier contre le brief et la marque"));
    assertEquals(judged,1);
  }finally{globalThis.fetch=oldFetch;}
});

for (const subject of ["", "Carrousel basé sur les photos uploadées"]) Deno.test(`photos seules : aucun objectif demandé (${subject || "vide"})`, async () => {
  resetDeps();
  _deps.callAnthropic = (async () => { throw new Error("Aucune clarification IA nécessaire"); }) as any;
  const res = await handleRequest(makeHooksRequest({ type: "deepening_questions", carousel_type: "photo", subject, objective: undefined, photos: [{ base64: "aGVsbG8=" }] }));
  assertEquals(res.status, 200);
  assertEquals(JSON.parse((await res.json()).content).questions, []);
});

for (const kind of ["photo", "mix"]) Deno.test(`plan ${kind} : positions IA hors enum puis reprise du plan`, async () => {
  resetDeps();
  const positions = ["bottom_right", "top_right", "top_left", "top_center", "bottom_left", "bottom_center", "center"];
  const plan = positions.map((overlay_position, i) => ({ slide_number: i + 1, role: i ? "body" : "hook", title_suggestion: `Titre ${i}`, strategic_note: `Note ${i}`, photo_index: i + 1, slide_type: "photo_full", story_beat: `Lien ${i}`, overlay_position }));
  _deps.callAnthropic = (async () => JSON.stringify({ slides: plan, total_slides: plan.length })) as any;
  const res = await handleRequest(makeHooksRequest({ type: "structure_proposal", carousel_type: kind, photos: plan.map(() => ({ base64: "aGVsbG8=" })) }));
  assertEquals(res.status, 200);
  const { result } = await res.json();
  const expected = plan.map((s, i) => ({ ...s, overlay_position: ["bottom_center", "top_center", ...positions.slice(2)][i] }));
  assertEquals(result.slides, expected);
  // Le même plan déjà conservé dans le navigateur doit pouvoir être repris.
  let writes = 0;
  _deps.callCarouselWriter = (async (_o: any, sink: any) => {
    writes++; Object.assign(sink, { total_tokens: 1, model: "claude-opus-5-5" });
    return JSON.stringify({ slides: plan.map(s => ({ ...s, overlay_text: `Passage conservé ${s.slide_number}` })), caption: {} });
  }) as any;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 503 }))) as typeof fetch;
  try {
    for (const confirmed_structure of [result.slides, plan]) {
      const next = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: kind, slide_count: plan.length, confirmed_structure, photos: plan.map(() => ({ base64: "aGVsbG8=" })) }));
      assertEquals(next.status, 200);
      const doc = JSON.parse((await next.json()).content);
      assertEquals(doc.slides.map((s: any) => s.photo_index), plan.map(s => s.photo_index));
      assertEquals(doc.slides.map((s: any) => s.overlay_text), plan.map(s => `Passage conservé ${s.slide_number}`));
      assertEquals(doc.slides.map((s: any) => s.overlay_position), expected.map(s => s.overlay_position));
    }
    assertEquals(writes, 2);
  } finally { globalThis.fetch = oldFetch; }
  const invalid = await handleRequest(makeHooksRequest({ type: "express_full", confirmed_structure: [{ ...plan[0], overlay_position: "unknown" }] }));
  assertEquals(invalid.status, 400); await invalid.text();
});

Deno.test("plan IA : champs optionnels null au retour et à la reprise, sans perdre texte ni photos valides", async () => {
  resetDeps();
  const plan = [1, 2, 3].map((n) => ({ slide_number: n, role: n === 1 ? "hook" : "body", title_suggestion: `Titre ${n}`, strategic_note: `Note ${n}`, photo_index: n === 2 ? null : n, slide_type: "photo_full", story_beat: null, photo_observation: null, image_relation: null, factual_basis: null, visual_anchor: null, overlay_position: null }));
  _deps.callAnthropic = (async () => JSON.stringify({ slides: plan, total_slides: 3 })) as any;
  const res = await handleRequest(makeHooksRequest({ type: "structure_proposal", carousel_type: "photo", photos: plan.map(() => ({ base64: "aGVsbG8=" })) }));
  const { result } = await res.json();
  assertEquals(result.slides.map((s: any) => s.photo_index), [1, undefined, 3]);
  assertEquals(result.slides.map((s: any) => s.title_suggestion), plan.map(s => s.title_suggestion));
  assert(result.slides.every((s: any) => !("story_beat" in s) && !("overlay_position" in s)));
  let writes = 0;
  _deps.callCarouselWriter = (async (_o: any, sink: any) => {
    writes++; Object.assign(sink, { total_tokens: 1, model: "claude-opus-5-5" });
    return JSON.stringify({ slides: plan.map((s, i) => ({ slide_number: i + 1, slide_type: "photo_full", photo_index: i + 1, overlay_text: s.title_suggestion })), caption: {} });
  }) as any;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 503 }))) as typeof fetch;
  try {
    const next = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: "photo", slide_count: 3, scenario_origin: "automatic", confirmed_structure: plan, photos: plan.map(() => ({ base64: "aGVsbG8=" })) }));
    assertEquals(next.status, 200);
    const doc = JSON.parse((await next.json()).content);
    assertEquals(writes, 1);
    assertEquals(doc.slides.map((s: any) => s.photo_index), [1, 2, 3]);
    assertEquals(doc.slides.map((s: any) => s.overlay_text), plan.map(s => s.title_suggestion));
  } finally { globalThis.fetch = oldFetch; }
});

for (const variant of ["photo", "mix"]) for (const outcome of ["improved", "same", "unavailable", "style-only"]) Deno.test(`défaut mineur de fil ${variant} / ${outcome} : une reprise seulement si utile`, async () => {
  resetDeps();
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 503 }))) as typeof fetch;
  const draft = { slides: [1, 2, 3].map((n) => ({ slide_number: n, role: n === 3 ? "conclusion" : n === 1 ? "hook" : "body", slide_type: "photo_full", photo_index: n, overlay_text: ["La forme choisie précède le décor.", "Le décor rappelle la vaisselle ancienne.", "Ces objets sont faits pour servir au quotidien."][n - 1] })), caption: {} };
  let writes = 0, reviews = 0, latest: any;
  _deps.callCarouselWriter = (async (o: any, sink: any) => {
    writes++; Object.assign(sink, { total_tokens: 1, model: o.model });
    if (writes === 1) return JSON.stringify(draft);
    assert(JSON.stringify(o.messages).includes("DÉFAUTS DE FIL"));
    const fixed = structuredClone(latest); fixed.slides[1].overlay_text = "Ce geste à main levée rend chaque dessin unique, même quand les motifs se ressemblent.";
    return JSON.stringify(fixed);
  }) as any;
  _deps.reviewThread = async (doc: any) => {
    reviews++; latest = structuredClone(doc);
    if (reviews === 2 && outcome === "unavailable") return progressionReceipt(doc, "unavailable");
    return { ...await verdict(doc, ["La seconde slide doit expliquer ce que le geste change."]), verdict: "acceptable", report: { defects: reviews === 2 && outcome === "improved" ? [] : [{ severity: "minor", type: outcome === "style-only" ? "voice" : "repetition" }] } };
  };
  try {
    const res = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: variant, slide_count: 3, scenario_origin: "automatic", subject: "La main levée rend chaque dessin unique même si les motifs se ressemblent.", photos: [1, 2, 3].map(() => ({ base64: "aGVsbG8=" })) }));
    assertEquals(res.status, 200); const doc = JSON.parse((await res.json()).content);
    assertEquals(writes, outcome === "style-only" ? 1 : 2);
    assertEquals(reviews, outcome === "style-only" ? 1 : 2);
    assertEquals(doc.slides.map((s: any) => s.photo_index), [1, 2, 3]);
    assertEquals(doc.slides[1].overlay_text, outcome === "improved" ? "Ce geste à main levée rend chaque dessin unique, même quand les motifs se ressemblent." : draft.slides[1].overlay_text);
    if (outcome !== "style-only") {
      const {attempted,accepted,trigger,reason}=doc.progression_review.repair;
      assertEquals({attempted,accepted,trigger}, { attempted: true, accepted: outcome === "improved", trigger: "minor_continuity" });
      assertEquals(reason,outcome === "improved" ? "accepted" : outcome === "unavailable" ? "review-unavailable" : "candidate-not-acceptable-or-not-improved");
    }
    else assertEquals(doc.progression_review.repair, undefined);
  } finally { globalThis.fetch = oldFetch; }
});

for (const variant of ["photo", "mix"]) for (const quality_max of [false, true]) Deno.test(`rédacteur historique : propos automatique remplaçable ${variant} / Max=${quality_max}`, async () => {
  resetDeps();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 503 }))) as typeof fetch;
  const plan = [1,2,3].map(n => ({slide_number:n,role:"description",title_suggestion:`Objet ${n}`,strategic_note:"Décrire",photo_index:n,slide_type:"photo_full"}));
  let writes = 0;
  _deps.callCarouselWriter = (async (o: any, sink: any) => {
    writes++;
    const prompt = o.system + JSON.stringify(o.messages);
    assert(prompt.includes("PLAN AUTOMATIQUE — RÉPARTITION À CONSERVER"));
    assert(prompt.includes("réécris librement le fil, les rôles, les titres"));
    assert(!prompt.includes("STRUCTURE IMPOSÉE PAR L'UTILISATEUR"));
    assert(!prompt.includes("FIL CONFIRMÉ À PRÉSERVER"));
    assertEquals(o.model, quality_max ? "claude-fable-5-1" : "claude-opus-5-5");
    Object.assign(sink,{model:o.model,total_tokens:1});
    return JSON.stringify({slides:plan.map(s => ({slide_number:s.slide_number,role:"argument",photo_index:s.photo_index,slide_type:"photo_full",overlay_text:`Propos développé ${s.slide_number}`})),caption:{}});
  }) as any;
  try {
    const res = await handleRequest(makeHooksRequest({type:"express_full",carousel_type:variant,quality_max,scenario_origin:"automatic",confirmed_structure:plan,narrative_thread:"Une visite descriptive",photo_contexts:plan.map(()=>({context:"Objet visible"}))}));
    assertEquals(res.status,200);
    const doc = JSON.parse((await res.json()).content);
    assertEquals(writes,1);
    assertEquals(doc.slides.map((s:any)=>s.role),["argument","argument","argument"]);
    assertEquals(doc.slides.map((s:any)=>s.photo_index),[1,2,3]);
  } finally { globalThis.fetch = originalFetch; }
});

for(const carousel_type of ["photo","mix"])for(const quality_max of [false,true])Deno.test(`nouveau parcours complet : prose relue puis distribuée ${carousel_type}, Max=${quality_max}`,async()=>{
  resetDeps();_deps.prepareNarrative=createContinuousNarrative;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=(()=>Promise.resolve(new Response("{}",{status:503}))) as typeof fetch;
  const paragraphs=["Un objet peut rester utile même quand une pièce s'use.","Si cette pièce peut être remplacée, l'objet retrouve son usage.","La possibilité de réparer devient donc un critère de choix dès l'achat."];
  let writes=0,reviews=0;
  _deps.callCarouselWriter=async(o,s)=>{
    writes++;assertEquals(o.tool?.name,"ecrire_texte_suivi");
    assertEquals(o.model,quality_max?"claude-fable-5-1":"claude-opus-5-5");
    assert(!JSON.stringify(o.messages).includes("Titre automatique à oublier"));
    if(s)Object.assign(s,{model:o.model,total_tokens:10});
    return JSON.stringify({idea:"Réparer prolonge l'usage",hook:"Choisir un objet qui peut rester",paragraphs,caption:{}});
  };
  _deps.reviewThread=async(doc)=>{reviews++;return verdict(doc);};
  const plan=[1,2,3,4].map(i=>({slide_number:i,role:"description",title_suggestion:"Titre automatique à oublier",strategic_note:"Photo",photo_index:i,slide_type:"photo_full",contribution:"Relation transmise",inherits:"Point précédent",develops:"Conséquence",source_ids:["brand"],image_role:"Ambiance"}));
  try{
    const response=await handleRequest(makeHooksRequest({type:"express_full",carousel_type,quality_max,scenario_origin:"automatic",confirmed_structure:plan,photo_contexts:plan.map(()=>({context:"Objet réparable"})),subject:"Développer ce que permet la réparation",deepening_answers:{fait:"Les pièces peuvent être remplacées."}}));
    assertEquals(response.status,200);const doc=JSON.parse((await response.json()).content);
    assertEquals(writes,1);assertEquals(reviews,2);
    assertEquals(doc.slides.slice(1).map((s:any)=>s.overlay_text),paragraphs);
    assertEquals(doc.slides.map((s:any)=>s.photo_index),[1,2,3,4]);
    assertEquals(doc.narrative_draft.version,"continuous-prose-v3-photo-concise");
    assertEquals(doc.generation_receipt.writing_version,"fil-v11-couverture-accroche");
    assertEquals(doc.progression_review.verdict,"acceptable");
  }finally{globalThis.fetch=oldFetch;resetDeps();}
});

for (const carousel_type of ["photo", "mix"]) for (const improved of [false, true]) Deno.test(`continuous final review repairs the whole prose ${carousel_type}, improved=${improved}`, async () => {
  resetDeps(); _deps.prepareNarrative = createContinuousNarrative;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 503 }))) as typeof fetch;
  const initial = ["Le geste rend chaque dessin unique.", "Les formes restent utiles au quotidien.", "Quelques objets suffisent pour la table."];
  const fixed = ["Le geste rend chaque dessin unique, meme sur des formes simples.", "Cette singularite accompagne donc un objet dont on se sert.", "L'usage quotidien rend cette singularite familiere."];
  let writes = 0, reviews = 0;
  _deps.callCarouselWriter = async (o, sink) => {
    writes++;
    assertEquals(o.tool?.name, "ecrire_texte_suivi");
    if (writes === 2) assert(JSON.stringify(o.messages).includes("FACETTES_SANS_PROGRESSION"));
    if (sink) Object.assign(sink, { model: o.model, total_tokens: 7 });
    return JSON.stringify({ idea: "Une singularite utile", hook: "Une piece unique pour le quotidien", paragraphs: writes === 1 ? initial : fixed, caption: {} });
  };
  _deps.reviewThread = async (doc) => {
    reviews++;
    const defect = reviews === 2 || (reviews === 3 && !improved);
    return { ...await verdict(doc), issues: defect ? ["FACETTES_SANS_PROGRESSION"] : [], report: { defects: defect ? [{ severity: "minor", type: "unclear_idea" }] : [] } };
  };
  try {
    const response = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type, scenario_origin: "automatic", slide_count: 4, subject: "Une piece peinte a la main reste utile", photos: [1, 2].map(() => ({ base64: "aGVsbG8=" })) }));
    assertEquals(response.status, 200);
    const doc = JSON.parse((await response.json()).content);
    assertEquals(writes, 2); assertEquals(reviews, 3);
    assertEquals(doc.slides.slice(1).map((s: any) => s.overlay_text || s.body), improved ? fixed : initial);
    assertEquals(doc.slides.map((s: any) => s.photo_index), carousel_type === "photo" ? [1, 2, 1, 2] : [1, 2, 1, null]);
    assertEquals(doc.progression_review.repair.accepted, improved);
    assertEquals(doc.narrative_draft.paragraphs, improved ? fixed : initial);
    if (improved) {
      assertEquals(doc.narrative_draft.repair.reason, "accepted-by-final-review");
      assertEquals(doc.narrative_draft.review.reviewed_text_hash, doc.progression_review.reviewed_text_hash);
    }
  } finally { globalThis.fetch = oldFetch; resetDeps(); }
});

for (const carousel_type of ["photo", "mix"]) Deno.test(`photos suivent la dernière réécriture et non le plan : ${carousel_type}`, async () => {
  resetDeps(); _deps.prepareNarrative = createContinuousNarrative; _deps.matchPhotos = matchFinalPhotos;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("{}", { status: 503 }))) as typeof fetch;
  let writes = 0, reviews = 0, matches = 0; const visualInputs: any[] = [];
  const initial = ["Un pot rose accompagne les fleurs.", "Sa forme prend place dans un intérieur.", "Les objets nous accompagnent."];
  const final = ["Les cerises peintes sur les bols rendent chaque repas familier.", "Cette présence quotidienne change notre regard sur les objets.", "L'usage rend ces objets familiers."];
  _deps.callCarouselWriter = async () => JSON.stringify({idea:"La familiarité vient de l'usage",hook:"Ce qui devient familier",paragraphs:++writes === 1 ? initial : final,caption:{}});
  _deps.reviewThread = async doc => ({...await verdict(doc),issues:++reviews === 2 ? ["Développer la progression"] : [],report:{defects:reviews === 2 ? [{severity:"minor",type:"juxtaposition"}] : []}});
  _deps.callAnthropic = async o => {
    matches++;
    const payload = JSON.stringify(o.messages);
    visualInputs.push({writes,reviews,payload});
    const rows = [1,2,3,...(carousel_type === "photo" ? [4] : [])].map(slide => ({slide,photo:slide === 2 ? 2 : 1,relation:slide === 2 ? "literal" : "ambient",reason:"Photo cohérente avec ce passage",directive:"Image pour le passage",accepted:true}));
    return JSON.stringify({assignments:rows});
  };
  try {
    const response=await handleRequest(makeHooksRequest({type:"express_full",carousel_type,scenario_origin:"automatic",slide_count:4,subject:"Pourquoi les objets deviennent familiers",photos:[{base64:"cG90"},{base64:"Ym9scw=="}]}));
    assertEquals(response.status,200); const doc=JSON.parse((await response.json()).content);
    assertEquals(matches,2); assertEquals(doc.slides[1].photo_index,2);
    assertEquals(doc.progression_review.repair.reason,"accepted");
    assertEquals(visualInputs.map(v => [v.writes,v.reviews]),[[2,3],[2,3]]);
    assert(visualInputs.every(v => v.payload.includes(final[0]) && !v.payload.includes(initial[0])));
    assertEquals(doc.slides.slice(1).map((s:any)=>s.overlay_text||s.body),final);
    assertEquals(doc.photo_review.verdict,"acceptable");
    assertEquals(doc.progression_review.repair.accepted,true);
  } finally { globalThis.fetch=oldFetch; resetDeps(); }
});

Deno.test("type de slide : variantes du modèle de structure normalisées (vu en live : « text » faisait échouer la génération)", async () => {
  assertEquals(["text", "Texte", "photo", "text_only", "photo-integrated", "carte"].map(normalizeSlideType), ["text_only", "text_only", "photo_full", "text_only", "photo_integrated", undefined]);
  // Carrousel photo : la proposition ressort en photo_full partout, même si le modèle écrit « text ».
  resetDeps();
  _deps.callAnthropic = (async () => JSON.stringify({ total_slides: 3, slides: [
    { slide_number: 1, role: "hook", photo_index: 1, slide_type: "photo" },
    { slide_number: 2, role: "body", photo_index: 2, slide_type: "text" },
    { slide_number: 3, role: "conclusion", photo_index: 3, slide_type: "text" },
  ] })) as any;
  const res = await handleRequest(makeHooksRequest({ type: "structure_proposal", carousel_type: "photo", slide_count: 3, photos: [1, 2, 3].map(() => ({ base64: "aGVsbG8=" })) }));
  const { result } = await res.json();
  assertEquals(result.slides.map((s: any) => s.slide_type), ["photo_full", "photo_full", "photo_full"]);
});

Deno.test("structure confirmée renvoyée avec « text » : acceptée (plus de « Données invalides »)", async () => {
  resetDeps();
  _deps.callAnthropic = (async () => JSON.stringify({ total_slides: 2, slides: [{ slide_number: 1, role: "hook", photo_index: 1 }, { slide_number: 2, role: "body", photo_index: 1 }] })) as any;
  const res = await handleRequest(makeHooksRequest({ type: "structure_proposal", carousel_type: "photo", slide_count: 2, photos: [{ base64: "aGVsbG8=" }],
    confirmed_structure: [{ slide_number: 1, role: "hook", title_suggestion: "a", strategic_note: "b", slide_type: "photo" }, { slide_number: 2, role: "body", title_suggestion: "c", strategic_note: "d", slide_type: "text" }] }));
  assertEquals(res.status, 200);
});


// ── Photo : la mise en page lit le texte FINAL (04/10/2026) ──
// Avant : les gabarits (gros chiffre, liste, attribution) étaient posés AVANT
// la relecture éditoriale ; la relecture corrigeait ensuite l'overlay et l'item
// mis en valeur n'existait plus dans le texte livré. Le vrai handler photo est
// exercé ; seuls le rédacteur, la relecture et la passe gabarits sont simulés.
Deno.test("photo : relecture qui corrige un overlay mis en valeur → l'extrait suit le texte final, aucun mot perdu, reçu à jour", async () => {
  resetDeps();
  const { invalidateProgressionReceipt } = await import("../_shared/carousel-editorial-snapshot.ts");
  const draft = { slides: [
    { slide_number: 1, slide_type: "photo_full", photo_index: 1, overlay_text: "Ce salon, je l'ai trouvé comme ça, encombré et sombre." },
    { slide_number: 2, slide_type: "photo_full", photo_index: 1, overlay_text: "Trois gestes ont suffi : vider le plan de travail, ouvrir les volets, poser un bouquet sur la table.",
      // Mise en page écrite par le rédacteur : doit être ignorée (champ dérivé).
      template: "liste", points: ["Un rangement", "La lumière"] },
    { slide_number: 3, slide_type: "photo_full", photo_index: 1, overlay_text: "La propriétaire m'a dit : on respire enfin dans cette pièce." },
    { slide_number: 4, slide_type: "photo_full", photo_index: 1, overlay_text: "Une pièce à vivre se range avant de se décorer." },
  ], caption: { body: "Un salon remis en ordre avant la vente.", hashtags: [] } };
  _deps.callAnthropic = (async (options: any, sink: any) => { Object.assign(sink, { model: options.model, total_tokens: 30 }); return JSON.stringify(draft); }) as any;
  const order: string[] = [];
  let reviewedIds: string[] = [];
  const previousFetch = globalThis.fetch, key = Deno.env.get("ANTHROPIC_API_KEY");
  Deno.env.set("ANTHROPIC_API_KEY", "test-no-network");
  const toolReply = (name: string, input: unknown) => Promise.resolve(new Response(JSON.stringify({ model: "claude-opus-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", name, input }], usage: { input_tokens: 1, output_tokens: 1 } })));
  globalThis.fetch = ((_url: unknown, init?: RequestInit) => {
    const request = init?.body ? JSON.parse(String(init.body)) : {};
    const tool = request.tools?.[0]?.name;
    if (tool === "review_carousel_fields") {
      order.push("relecture");
      const fields = JSON.parse(request.messages[0].content.split("CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n")[1]);
      reviewedIds = fields.map((f: any) => f.field_id);
      const before = "poser un bouquet sur la table";
      return toolReply(tool, { reviews: fields.map((f: any) => f.text.includes(before)
        ? { field_id: f.field_id, decision: "edit", reason: "fait non fourni", edits: [{ before, after: "laisser entrer la lumière du soir" }] }
        : { field_id: f.field_id, decision: "keep", reason: "utile", edits: [] }) });
    }
    if (tool === "poser_les_gabarits") {
      order.push("gabarits");
      // Passe gabarits « naïve » : propose toujours les trois items du brouillon.
      return toolReply(tool, { slides: [
        { slide_number: 1, template: "couverture" },
        { slide_number: 2, template: "liste", points: ["vider le plan de travail", "ouvrir les volets", "poser un bouquet sur la table"] },
        { slide_number: 3, template: "citation", attribution: "La propriétaire" },
        { slide_number: 4, template: "finale" },
      ] });
    }
    return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  try {
    const res = await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: "photo", slide_count: 4, subject: "Remettre un salon en ordre avant une vente" }));
    assertEquals(res.status, 200);
    const doc = JSON.parse((await res.json()).content);
    // La mise en page est posée APRÈS la relecture, qui n'a vu aucun champ dérivé.
    assertEquals(order, ["relecture", "gabarits"]);
    assert(!reviewedIds.some((id) => /\.(points|big_number|attribution)(\.|$)/.test(id)), `champs de mise en page relus : ${reviewedIds}`);
    // Texte final = texte relu, entier.
    assertEquals(doc.slides[1].overlay_text, "Trois gestes ont suffi : vider le plan de travail, ouvrir les volets, laisser entrer la lumière du soir.");
    assertEquals(doc.slides[2].overlay_text, draft.slides[2].overlay_text);
    // Chaque extrait mis en valeur figure dans le texte final de sa slide.
    for (const s of doc.slides) {
      for (const p of s.points || []) assert(s.overlay_text.includes(p), `item hors du texte final : « ${p} »`);
      if (s.big_number) assert(s.overlay_text.includes(s.big_number));
      if (s.attribution) assert(s.overlay_text.includes(s.attribution));
    }
    assertEquals(doc.slides[1].template, "liste");
    assertEquals(doc.slides[1].points, ["vider le plan de travail", "ouvrir les volets"]);
    assertEquals(doc.slides[2].attribution, "La propriétaire");
    // Le reçu de relecture correspond au contenu livré : pas de « Le texte a changé ».
    const checked = invalidateProgressionReceipt(doc);
    assert(checked.progression_review.execution_status !== "stale");
    assert(!(checked.structure_warnings || []).some((w: string) => w.includes("a changé")));
  } finally {
    globalThis.fetch = previousFetch;
    if (key === undefined) Deno.env.delete("ANTHROPIC_API_KEY"); else Deno.env.set("ANTHROPIC_API_KEY", key);
  }
});

// « Ton cas d'abord » (04/10/2026) : avec un cas personnel fourni, la recherche
// passe en mode appui et la rédaction reçoit son cas comme preuve centrale ;
// sans cas, la recherche de profondeur et la lecture sociale restent (#1292).
for (const lived of [true, false]) Deno.test(`ton cas d'abord : recherche et rédaction, cas fourni=${lived}`, async () => {
  resetDeps();
  // deno-lint-ignore no-explicit-any
  let research: any = null, system = "", user = "";
  // deno-lint-ignore no-explicit-any
  _deps.fetchDepthMaterial = (async (o: any) => { research = o; return "« 2 100 € TTC » : un site vitrine coûte dès 1 000 € en agence (La Fabrique du Net, 2026), assez long pour être gardé."; }) as any;
  // deno-lint-ignore no-explicit-any
  _deps.callAnthropic = (async (options: any) => { system = options.system; user = JSON.stringify(options.messages); throw new Error("arrêt du test après capture"); }) as any;
  const deepening_answers = lived
    ? { "Qu'est-ce que l'IA a changé ?": "Avant je ne faisais que la stratégie. Aujourd'hui je livre stratégie, site et e-mails pour 2 100 € TTC." }
    : undefined;
  await handleRequest(makeHooksRequest({ type: "express_full", carousel_type: "prise_de_position", subject: "Oui, j'utilise l'IA générative", deepening_answers }));
  assertEquals(research.mode, lived ? "support" : "depth");
  if (lived) {
    assert(String(research.livedCase).includes("2 100 € TTC"));
    assert(system.includes("TON CAS D'ABORD"));
    assert(system.includes("MATIÈRE D'APPUI"));
    assert(!system.includes("un « on » ou « nous » collectif peut porter cette lecture"));
    assert(user.includes("SON CAS PERSONNEL"));
  } else {
    assert(system.includes("un « on » ou « nous » collectif peut porter cette lecture"));
    assert(system.includes("MATIÈRE DE PROFONDEUR"));
    assert(!system.includes("TON CAS D'ABORD"));
  }
});
