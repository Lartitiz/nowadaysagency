// Tests du contrat checkQuota → callAnthropic → logUsage pour carousel-visual.
// On injecte de faux clients/fonctions via `_deps` (seam DI ajoutée pour la
// testabilité, cf. index.ts) : aucun réseau, aucune DB, aucun appel IA réel.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/carousel-visual/index_test.ts

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Ces variables ne sont jamais lues pour de vrai dans ces tests (createClient
// est entièrement mocké via _deps), mais plusieurs modules importés lisent
// Deno.env.get(...) au chargement (SONNET_MODEL, cors.ts) → on pose des
// valeurs factices pour éviter toute surprise si un test oublie un override.
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

import { handleRequest, _deps } from "./index.ts";
import { AnthropicError } from "../_shared/anthropic.ts";

/**
 * Faux client Supabase chainable et permissif : couvre les usages de
 * carousel-visual (workspace_members, brand_charter, brand_profile...) en
 * renvoyant systématiquement des données vides/nulles (les fallbacks du code
 * de production prennent le relais — charte neutre, pas de workspace owner).
 */
function makeFakeSupabase(opts: { userId?: string; authError?: boolean } = {}) {
  function builder(): any {
    const b: any = {};
    b.select = () => b; b.eq = () => b; b.neq = () => b; b.gte = () => b; b.lte = () => b;
    b.order = () => b; b.limit = () => b; b.in = () => b; b.is = () => b;
    b.single = () => Promise.resolve({ data: null, error: null });
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.update = () => b;
    b.delete = () => b;
    b.then = (resolve: any) => resolve({ data: [], error: null });
    return b;
  }
  return {
    from: () => builder(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: {
      getUser: () => opts.authError
        ? Promise.resolve({ data: { user: null }, error: { message: "invalid token" } })
        : Promise.resolve({ data: { user: { id: opts.userId ?? "test-user-1" } }, error: null }),
    },
  } as any;
}

/**
 * Requête minimale qui atteint le chemin "single-shot" (un seul appel IA) :
 * moins de 5 slides, carousel_type ni "photo" ni "mix" → isPhotoCarousel et
 * isMixCarousel restent false, composedByCode aussi → branche `else` finale
 * de index.ts (pas de chunking, pas de composition par code).
 */
function makeRequest(body: Record<string, unknown> = {}): Request {
  const defaultBody = {
    slides: [
      { slide_number: 1, title: "Le hook", body: "Corps de la première slide." },
      { slide_number: 2, title: "La suite", body: "Corps de la deuxième slide." },
    ],
  };
  return new Request("http://localhost/carousel-visual", {
    method: "POST",
    headers: {
      Authorization: "Bearer faketoken",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...defaultBody, ...body }),
  });
}

/** Sortie IA minimale valide pour le chemin single-shot (cf. parseSlidesJson). */
const FAKE_AI_SLIDES_JSON = JSON.stringify({
  slides_html: [
    { slide_number: 1, html: "<div style=\"width:1080px;height:1350px\">Slide 1</div>" },
    { slide_number: 2, html: "<div style=\"width:1080px;height:1350px\">Slide 2</div>" },
  ],
  slides_invariants: {
    palette_used: { primary: "#FB3D80", secondary: "#91014b", accent: "#FFE561", bg: "#FFF4F8", text: "#1A1A1A" },
    typography_used: { title_pptx_safe: "Georgia", body_pptx_safe: "Calibri", title_pt: 40, body_pt: 16 },
    layouts_used: ["hook_card", "stack_centered"],
    motif: "test",
  },
});

// ---------- 1. Quota épuisée bloque avant l'appel IA ----------

Deno.test("carousel-visual: quota épuisée → 429 limit_reached, callAnthropic et logUsage jamais appelés", async () => {
  _deps.createClient = (() => makeFakeSupabase()) as any;
  _deps.checkQuota = (async () => ({
    allowed: false,
    plan: "free",
    reason: "total",
    message: "quota épuisé",
  })) as any;
  _deps.callAnthropic = (async () => {
    throw new Error("callAnthropic ne doit jamais être appelé quand le quota est épuisé");
  }) as any;
  let logUsageCalled = false;
  _deps.logUsage = (async () => {
    logUsageCalled = true;
  }) as any;

  const res = await handleRequest(makeRequest());
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error, "limit_reached");
  assertEquals(logUsageCalled, false);
});

// ---------- 2. Quota disponible → IA puis logUsage, contrat de réponse respecté ----------

Deno.test("carousel-visual: quota disponible → appelle l'IA puis logUsage, réponse conforme au contrat front", async () => {
  _deps.createClient = (() => makeFakeSupabase({ userId: "test-user-1" })) as any;
  _deps.checkQuota = (async () => ({
    allowed: true,
    plan: "free",
    remaining: 5,
  })) as any;
  _deps.callAnthropic = (async () => FAKE_AI_SLIDES_JSON) as any;
  let logUsageArgs: any[] | null = null;
  _deps.logUsage = (async (...args: any[]) => {
    logUsageArgs = args;
  }) as any;

  const res = await handleRequest(makeRequest());
  assertEquals(res.status, 200);
  const body = await res.json();

  // Contrat consommé par le front (cf. src/pages/CreerUnifie.tsx : data.result?.slides_html)
  assertExists(body.result);
  assertEquals(Array.isArray(body.result.slides_html), true);
  assertEquals(body.result.slides_html.length, 2);
  assertEquals(typeof body.cover_illustration_applied, "boolean");
  assertEquals(typeof body.remaining, "number");
  assertEquals(body.remaining, 5);

  assertExists(logUsageArgs);
  const args = logUsageArgs as any[];
  assertEquals(args[0], "test-user-1");
  assertEquals(args[1], "content"); // reqBody.quality_max non fourni
  assertEquals(args[2], "carousel_visual");
});

Deno.test("carousel-visual: quality_max=true → logUsage journalise la catégorie quality_max", async () => {
  _deps.createClient = (() => makeFakeSupabase({ userId: "test-user-1" })) as any;
  _deps.checkQuota = (async () => ({
    allowed: true,
    plan: "outil",
    remaining: 19,
  })) as any;
  _deps.callAnthropic = (async () => FAKE_AI_SLIDES_JSON) as any;
  let logUsageArgs: any[] | null = null;
  _deps.logUsage = (async (...args: any[]) => {
    logUsageArgs = args;
  }) as any;

  const res = await handleRequest(makeRequest({ quality_max: true }));
  assertEquals(res.status, 200);

  assertExists(logUsageArgs);
  const args = logUsageArgs as any[];
  assertEquals(args[1], "quality_max");
});

// ---------- 3. Échec de l'appel IA → logUsage n'est jamais appelé ----------

Deno.test("carousel-visual: échec de l'appel IA → réponse d'erreur, logUsage jamais appelé", async () => {
  _deps.createClient = (() => makeFakeSupabase({ userId: "test-user-1" })) as any;
  _deps.checkQuota = (async () => ({
    allowed: true,
    plan: "free",
    remaining: 5,
  })) as any;
  _deps.callAnthropic = (async () => {
    throw new AnthropicError("erreur simulée", 500);
  }) as any;
  let logUsageCalled2 = false;
  _deps.logUsage = (async () => {
    logUsageCalled2 = true;
  }) as any;

  const res = await handleRequest(makeRequest());
  // Catch-all de index.ts : status = err.status || 500, clampé 400-599 sinon 500.
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "Erreur lors de la génération des visuels : erreur simulée");
  assertEquals(body.debug, "erreur simulée");
  assertEquals(logUsageCalled2, false);
});

// ---------- 4. Fix ordering : illustration de couverture (photo_retouch) ----------
//
// Bug trouvé en traçant checkQuota→AI→logUsage dans ce fichier (17/08/2026) :
// le bloc "Illustration de COUVERTURE" (opt-in cover_illustration=true) appelait
// Recraft (coût réel) et journalisait logUsage("photo_retouch") APRÈS succès,
// mais AUCUN checkQuota("photo_retouch") ne gardait l'entrée du bloc — seul le
// checkQuota("content"/"quality_max") du haut de la fonction s'exécutait. Une
// cliente au plafond photo_retouch (free = 5/mois) pouvait donc générer des
// couvertures à l'infini, quota ou pas. Fix : checkQuota("photo_retouch") avant
// l'appel IA/Recraft, avec repli silencieux (comportement déjà en place pour
// RECRAFT_API_TOKEN manquant : carrousel jamais cassé, cover IA d'origine gardée).
Deno.test("carousel-visual: quota photo_retouch épuisé → illustration de couverture bloquée avant l'appel Recraft/IA (fix ordering)", async () => {
  Deno.env.set("RECRAFT_API_TOKEN", "fake-recraft-key");
  _deps.createClient = (() => makeFakeSupabase({ userId: "test-user-1" })) as any;
  _deps.checkQuota = (async (_userId: string, category: string) => {
    if (category === "photo_retouch") {
      return { allowed: false, plan: "free", reason: "category", message: "quota photo_retouch épuisé" };
    }
    return { allowed: true, plan: "free", remaining: 5 };
  }) as any;
  const anthropicModelsCalled: string[] = [];
  _deps.callAnthropic = (async (options: any) => {
    anthropicModelsCalled.push(options.model);
    return FAKE_AI_SLIDES_JSON;
  }) as any;
  let photoRetouchLogged = false;
  _deps.logUsage = (async (_userId: string, category: string) => {
    if (category === "photo_retouch") photoRetouchLogged = true;
  }) as any;

  try {
    const res = await handleRequest(makeRequest({ cover_illustration: true }));
    assertEquals(res.status, 200);
    const body = await res.json();
    // Repli attendu : pas de couverture Recraft, mais le carrousel reste intact.
    assertEquals(body.cover_illustration_applied, false);
    assertExists(body.result);
    // Jamais journalisé pour cette catégorie : le quota a bloqué AVANT tout coût.
    assertEquals(photoRetouchLogged, false);
    // Le concept d'illustration (Haiku) n'a jamais été appelé : le blocage est
    // bien AVANT l'appel IA, pas seulement avant logUsage.
    assertEquals(anthropicModelsCalled.includes("claude-haiku-4-5"), false);
  } finally {
    Deno.env.delete("RECRAFT_API_TOKEN");
  }
});
