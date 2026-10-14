// Contrat du HANDLER de creative-flow, cas complémentaires AVANT le découpage
// de index.ts (docs/robustesse/gros-fichiers.md, fiche 3, lot T).
//
// handler_contract_test.ts fige 21 parcours avec une base vide : le profil de
// marque, la voix, les offres et plusieurs blocs du prompt n'y apparaissent
// jamais. Ce fichier ajoute, avec le même harnais (Supabase et Claude simulés) :
//   1. une marque remplie (profil, fiche de marque, voix, offres) : fige
//      COMMON_PREFIX, QUESTIONS_PREFIX, le vocabulaire métier et le bloc voix ;
//   2. les blocs encore jamais vus : calendrier (lancement), objectif (4 clés +
//      une valeur libre), éléments personnels, actualité, variation, série ;
//   3. les chemins sans référence : angles, suivi, dictée, étape inconnue,
//      corps invalide, Claude en 529, JSON illisible, recherche web, stories en
//      mode photo, reel sans face cam, LinkedIn « exemple fictif » ;
//   4. la détection du format à partir de contentType (une ligne par valeur).
//
// Dérive VOULUE : régénère et relis le diff du .snap.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/creative-flow/handler_contract_more_test.ts -- --update

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import {
  captureStdServeHandler,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureStdServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/creative-flow`;

// Réponses fixes de Claude, par outil demandé (mêmes que handler_contract_test.ts).
const TOOL_INPUTS: Record<string, unknown> = {
  poser_questions: { questions: [
    { question: "Qu'est-ce qui t'a fait arrêter les remises ?", placeholder: "Le moment précis" },
    { question: "Qu'a répondu la cliente ?", placeholder: "Ses mots" },
    { question: "Qu'est-ce que ça a changé pour toi ?", placeholder: "Concrètement" },
  ] },
  poser_questions_suivi: { questions: [{ question: "Et après ?", placeholder: "La suite" }] },
  // Aucune accroche récupérable : seul le cas « hooks sans accroche » le demande.
  proposer_hooks: { hooks: [] },
  rediger_contenu_visuel: { content: "Les mains dans la terre, j'ai compris que mon prix était juste.", accroche: "Les mains dans la terre.", pillar: "coulisses", objectif: "confiance" },
};

const POST_JSON = JSON.stringify({ content: "J'ai arrêté les remises il y a un an.\n\nLa cliente a signé quand même.", accroche: "J'ai arrêté les remises il y a un an.", format: "post", pillar: "prix", objectif: "confiance" });

/** Base simulée : lignes renvoyées par table (lecture GET). Le reste reste vide. */
type Seed = Record<string, Record<string, unknown>[]>;

// deno-lint-ignore no-explicit-any
function reply(req: any, text: string, status: number) {
  if (status !== 200) return { status, body: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } };
  const tool = req?.tool_choice?.name;
  const usage = { input_tokens: 100, output_tokens: 50 };
  if (tool && TOOL_INPUTS[tool]) {
    return { status: 200, body: { content: [{ type: "tool_use", id: "tu_1", name: tool, input: TOOL_INPUTS[tool] }], stop_reason: "tool_use", usage } };
  }
  return { status: 200, body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage } };
}

// deno-lint-ignore no-explicit-any
function requestDoc(req: any): string {
  const { model: _model, ...rest } = req ?? {};
  return JSON.stringify(rest, null, 1);
}

let nextUser = 0;

async function run(body: unknown, text: string, opts: { seed?: Seed; status?: number } = {}) {
  // deno-lint-ignore no-explicit-any
  const requests: any[] = [];
  const mock = installFetchMock({ anthropic: (req) => reply(req, text, opts.status ?? 200) });
  const harnessFetch = globalThis.fetch;
  // Un compte par cas : aucun cas ne consomme la limite de 20 requêtes/minute d'un autre.
  const userId = `test-user-contrat-${++nextUser}`;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const path = url.split("?")[0];
    if (path === `${TEST_SUPABASE_URL}/auth/v1/user`) {
      return new Response(JSON.stringify({ id: userId, email: "contrat@example.com", aud: "authenticated", role: "authenticated" }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const table = path.startsWith(`${TEST_SUPABASE_URL}/rest/v1/`) ? path.slice(`${TEST_SUPABASE_URL}/rest/v1/`.length) : null;
    if (table && opts.seed?.[table] && (init?.method || "GET").toUpperCase() === "GET") {
      return new Response(JSON.stringify(opts.seed[table]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      requests.push(init?.body ? JSON.parse(init.body as string) : null);
    }
    return harnessFetch(input, init);
  }) as typeof fetch;
  try {
    const res = await handler(new Request(URL_FN, {
      method: "POST",
      headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }));
    return { status: res.status, raw: await res.text(), requests, credits: mock.aiUsageInserts.map((u) => ({ category: u.category, action_type: u.action_type })) };
  } finally {
    globalThis.fetch = harnessFetch;
    mock.restore();
  }
}

function fullDoc(out: Awaited<ReturnType<typeof run>>): string {
  return [
    `── STATUT ${out.status}`,
    `── RÉPONSE AU FRONT\n${out.raw}`,
    `── CRÉDITS\n${JSON.stringify(out.credits)}`,
    `── APPELS À CLAUDE (${out.requests.length})\n${out.requests.map(requestDoc).join("\n\n")}`,
  ].join("\n\n");
}

const CONTEXT = "Pourquoi je ne fais plus de remises sur mes créations";
const ANGLE = { title: "Le mythe du prix cassé", structure: ["constat", "bascule", "position"], tone: "complice", format_livraison: "post" };
const ANSWERS = [{ question: "Qu'a répondu la cliente ?", answer: "Elle a signé quand même." }];
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";
const SERIES_ID = "11111111-2222-4333-8444-555555555555";

// 1. Marque remplie : chaque table lue par getUserContext a une ligne.
const BRAND: Seed = {
  profiles: [{
    prenom: "Camille", activite: "céramiste", type_activite: "artisanat", cible: "les personnes qui aiment les objets faits main",
    probleme_principal: "on lui demande sans cesse des remises", mission: "redonner sa valeur au fait main", offre: "bols et tasses sur commande",
    tons: ["chaleureux", "direct"], expressions_cles: "terre brute, cuisson lente", ce_quon_evite: "le jargon marketing", style_communication: ["tutoiement", "phrases courtes"], piliers: ["coulisses", "prix juste"],
  }],
  brand_profile: [{
    voice_description: "Phrases courtes, tutoiement, humour sec", combat_cause: "le juste prix du travail manuel",
    key_expressions: "terre brute, cuisson lente, fait main", things_to_avoid: "promos permanentes", offer: "Atelier d'initiation au tour",
    mission: "redonner sa valeur au fait main", target_description: "des amatrices d'objets durables",
  }],
  voice_profile: [{
    voice_summary: "Elle raconte une scène d'atelier puis en tire une leçon", signature_expressions: ["la terre décide", "on cuit lentement"],
    banned_expressions: ["game changer", "booster"], tone_patterns: ["complice", "sincère"], structure_patterns: ["anecdote puis leçon"],
  }],
  offers: [{ name: "Atelier initiation", price: 65 }, { name: "Service de bols sur mesure", price: 240 }],
  brand_proposition: [{ version_one_liner: "Des bols tournés à la main, pensés pour durer." }],
};

const CASES: { name: string; body: unknown; text: string; seed?: Seed; status?: number }[] = [
  // ── 1. Marque remplie ──
  { name: "marque remplie — questions post Instagram", body: { step: "questions", contentType: "instagram_post", context: CONTEXT, angle: ANGLE }, text: "", seed: BRAND },
  { name: "marque remplie — suivi", body: { step: "follow-up", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS }, text: "", seed: BRAND },
  { name: "marque remplie — generate post Instagram", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, angle: ANGLE, answers: ANSWERS }, text: POST_JSON, seed: BRAND },

  // ── 2. Blocs jamais vus ──
  { name: "calendrier avec lancement — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS,
    calendarContext: { postDate: "2026-11-03", theme: "Mes prix", notes: "Parler de la grille", angleSuggestion: "Le refus", launchId: "lancement-1",
      contentType: "Coulisses", contentTypeEmoji: "🎬", category: "chauffe", chapter: 2, chapterLabel: "Le déclic", audiencePhase: "curieuse", objective: "confiance" } }, text: POST_JSON },
  ...["visibilite", "engagement", "vente", "credibilite", "Faire connaître l'atelier"].map((objective) => ({
    name: `objectif « ${objective} » — generate post`, body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS, objective }, text: POST_JSON,
  })),
  { name: "éléments personnels fournis — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS,
    pre_gen_answers: { anecdote: "Une cliente m'a demandé 10 % de moins", emotion: "posée", conviction: "Un prix bas ne rassure personne" } }, text: POST_JSON },
  { name: "actualité — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS,
    news_context: "Une enseigne de déco annonce -50 % sur toute la céramique artisanale ce week-end." }, text: POST_JSON },
  { name: "variation d'un contenu précédent — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS,
    variation: true, previousContent: "J'ai arrêté les remises. Point." }, text: POST_JSON },
  { name: "série — generate post (épisode 3)", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS, series_id: SERIES_ID, episode_number: 3 },
    text: POST_JSON, seed: {
      series: [{ id: SERIES_ID, name: "Les coulisses du prix", promise: "Comprendre ce que coûte un bol", format_template: "anecdote + chiffre", signature_description: "Toujours une photo de mains", cadence: "hebdo", channels: ["instagram"], status: "active" }],
      calendar_posts: [
        { episode_number: 2, theme: "Le temps de séchage", accroche: "Un bol sèche 10 jours.", content_draft: "Un bol sèche 10 jours avant cuisson.", date: "2026-10-27" },
        { episode_number: 1, theme: "La terre", accroche: "Ma terre vient de 30 km.", content_draft: "Ma terre vient de 30 km d'ici.", date: "2026-10-20" },
      ],
    } },

  // ── 3. Chemins sans référence ──
  { name: "angles", body: { step: "angles", contentType: "instagram_post", context: CONTEXT, editorialFormatLabel: "Coulisses" }, text: JSON.stringify({ angles: [{ title: "Le refus", structure: ["a"], tone: "complice", format_livraison: "post" }] }) },
  { name: "dictée vers un post LinkedIn", body: { step: "dictation", contentType: "linkedin_post", sourceText: "Alors euh j'ai arrêté les remises, voilà, et la cliente a signé quand même.", targetFormat: "linkedin" }, text: POST_JSON },
  { name: "étape inconnue (400)", body: { step: "inventee", contentType: "instagram_post", context: CONTEXT }, text: "" },
  { name: "corps invalide (400)", body: { step: 42, contentType: "instagram_post" }, text: "" },
  { name: "Claude surchargé en 529 — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS }, text: POST_JSON, status: 529 },
  { name: "JSON illisible — generate post (502, aucun crédit)", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS }, text: "Voici ton post : pas de JSON ici." },
  { name: "recherche web — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS, deepResearch: true }, text: POST_JSON },
  { name: "stories en mode photo — generate", body: { step: "generate", contentType: "stories", context: CONTEXT, answers: ANSWERS, photo_mode: true, photos: [{ base64: PHOTO }] },
    text: JSON.stringify({ stories: [{ text: "Mes mains dans la terre.", sticker: null, title_pill: null, face_cam: false }] }) },
  { name: "reel sans face cam, objectif visibilité — generate", body: { step: "generate", contentType: "reel", context: CONTEXT, answers: ANSWERS, face_cam: "non", objective: "visibilite" },
    text: JSON.stringify({ format: "reel", hook: "J'ai arrêté les remises.", script: [
      { section: "hook", timing: "0-3 sec", texte_parle: "J'ai arrêté les remises.", texte_overlay: "REMISES" },
      { section: "developpement", timing: "3-20 sec", texte_parle: "La cliente a signé quand même.", texte_overlay: "ELLE A SIGNÉ" },
    ], caption: { text: "Le prix juste.", hashtags: ["ceramique"] } }) },
  { name: "hooks sans accroche récupérable — reel (502 renvoyé par le handler, lot E)", body: { step: "hooks", contentType: "reel", context: CONTEXT, answers: ANSWERS }, text: "" },
  { name: "LinkedIn exemple fictif sur les seuls faits du brief — generate", body: { step: "generate", contentType: "post_linkedin",
    context: "Écris un exemple fictif de post LinkedIn, uniquement avec les faits du brief : une céramiste refuse une remise et la cliente signe.", answers: ANSWERS }, text: POST_JSON },
];

for (const c of CASES) {
  Deno.test(`handler creative-flow (complément) — ${c.name}`, async (t) => {
    const out = await run(c.body, c.text, { seed: c.seed, status: c.status });
    await assertSnapshot(t, fullDoc(out));
  });
}

// ── 4. Détection du format à partir de contentType ──
// Pour chaque valeur, l'étape generate non streamée : statut, lignes « FORMAT : »
// du prompt envoyé à Claude et crédits. Une détection qui change de format
// change ces lignes (le découpage prévu doit les laisser identiques).
const CONTENT_TYPES: [string, Record<string, unknown>?][] = [
  ["instagram_post"], ["post_instagram"], ["linkedin_post"], ["post_linkedin"], ["story"], ["stories"], ["reel"], ["script"],
  ["email"], ["post_newsletter"], ["post_pinterest"], ["carrousel"], ["carousel"],
  ["", { title: "Angle sans type", structure: ["a"], tone: "complice", format_livraison: "stories" }],
];

Deno.test("handler creative-flow (complément) — détection du format par contentType", async (t) => {
  for (const [contentType, angle] of CONTENT_TYPES) {
    await t.step(contentType || `vide + angle.format_livraison = ${angle?.format_livraison}`, async (s) => {
      const out = await run({ step: "generate", contentType, context: CONTEXT, answers: ANSWERS, ...(angle ? { angle } : {}) }, POST_JSON);
      // deno-lint-ignore no-explicit-any
      const system = out.requests.map((r: any) => (Array.isArray(r?.system) ? r.system.map((b: any) => b.text).join("\n") : String(r?.system ?? ""))).join("\n");
      const formatLines = [...new Set(system.split("\n").filter((l) => /^FORMAT\s*:/.test(l.trim())).map((l) => l.trim()))];
      await assertSnapshot(s, { statut: out.status, appels: out.requests.length, lignes_format: formatLines, credits: out.credits });
    });
  }
});
