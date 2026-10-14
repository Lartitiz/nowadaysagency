// Contrat du HANDLER de carousel-ai (lot 8 « séparation écriture / design »,
// 14/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// prompts_snapshot_test.ts fige les consignes de rédaction ; ce fichier fige le
// CÂBLAGE de bout en bout pour une vraie requête par parcours : tous les appels
// envoyés à Claude (rédaction, relectures, juges, ET étapes de mise en forme :
// schémas, gabarits photo), le carrousel renvoyé au front et les crédits
// débités. Supabase et Claude sont simulés ; Claude répond toujours la même
// chose pour une même question.
//
// Les références ont été générées sur le code AVANT le déplacement des étapes
// de mise en forme dans carousel-ai/layout.ts, puis vérifiées sur le code
// déplacé : le déplacement n'a rien changé à ce que voit Claude ni à ce que
// reçoit le front.
//
// Dérive VOULUE : régénère et relis le diff du .snap.
//   deno test --no-check --no-lock --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/carousel-ai/handler_contract_test.ts -- --update

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import { handleRequest, _deps } from "./index.ts";
import { callAnthropic } from "../_shared/anthropic.ts";
import { callCarouselWriter } from "./writer.ts";
import { reviewCarouselProgression } from "../_shared/carousel-progression.ts";
import { createContinuousNarrative } from "./continuous-narrative.ts";
import { applyAudienceAddressPass } from "../_shared/audience-address-pass.ts";
import { TEST_SUPABASE_URL } from "../_shared/test-edge-harness.ts";

const USER_ID = "contract-user";
const WORKSPACE_ID = "22222222-2222-2222-2222-222222222222";

// ── Réponses fixes de Claude ──

const TEXT_DOC = {
  slides: [
    { slide_number: 1, role: "hook", title: "J'ai arrêté les remises", body: "Il y a un an, une cliente m'a demandé dix pour cent de moins sur un service de bols." },
    { slide_number: 2, role: "context", title: "Ce que coûte un bol", body: "Chaque bol passe trois fois entre mes mains : tournage, tournassage, émaillage." },
    { slide_number: 3, role: "proof", title: "Le temps compté", body: "En notant mes heures pendant un mois, j'ai vu que 40 % de mon temps partait dans des pièces vendues à perte." },
    { slide_number: 4, role: "turn", title: "La réponse", body: "J'ai expliqué ce temps à la cliente, simplement. Elle a signé quand même." },
    { slide_number: 5, role: "cta", title: "Et toi ?", body: "Tu affiches tes prix ou tu les négocies ? Enregistre ce post pour y repenser." },
  ],
  caption: { hook: "J'ai arrêté les remises.", body: "Et la cliente a signé quand même.", cta: "Dis-moi en commentaire comment tu fixes tes prix.", hashtags: ["ceramique"] },
};

const PHOTO_DOC = {
  fil: { arrivee: "Un prix juste se montre dans le geste.", etapes: ["matin", "tour", "four"] },
  slides: [
    { slide_number: 1, role: "hook", photo_index: 1, slide_type: "photo_full", overlay_text: "Ce que tu paies dans un bol", overlay_position: "bottom_center", overlay_style: "sensoriel", kicker: null, detail: null, cta_label: null },
    { slide_number: 2, role: "context", photo_index: 2, slide_type: "photo_full", overlay_text: "Trois passages entre mes mains : tournage, tournassage, émaillage.", overlay_style: "minimal", kicker: "Le geste", detail: null, cta_label: null },
    { slide_number: 3, role: "proof", photo_index: 3, slide_type: "photo_full", overlay_text: "40 % de mon temps partait dans des pièces vendues à perte.", overlay_style: "technique", kicker: null, detail: null, cta_label: null },
    { slide_number: 4, role: "cta", photo_index: 1, slide_type: "photo_full", overlay_text: "Mes prix sont publics. Enregistre ce post.", overlay_style: "sensoriel", kicker: null, detail: null, cta_label: "Enregistre ce post" },
  ],
  caption: { hook: "Un bol, trois passages.", body: "Voilà pourquoi je n'ai plus de remises.", cta: "Tu affiches tes prix ?", hashtags: ["ceramique"] },
};

const MIX_DOC = {
  fil: { arrivee: "Trois gestes changent un premier bol.", etapes: ["centrer", "ouvrir", "monter"] },
  slides: [
    { slide_number: 1, slide_type: "photo_full", photo_index: 1, role: "hook", overlay_text: "Trois gestes pour ton premier bol", photo_layout: "photo_top", overlay_position: "top_left", overlay_style: "technique" },
    { slide_number: 2, slide_type: "photo_integrated", photo_index: 2, role: "step", title: "Centrer la terre", body: "Les coudes calés sur les cuisses, tu pousses la terre vers le centre jusqu'à ce qu'elle ne bouge plus." },
    { slide_number: 3, slide_type: "text_only", photo_index: null, role: "step", title: "Ouvrir sans percer", body: "Le pouce descend jusqu'à un centimètre du fond, pas plus : 1 cm suffit pour un fond solide." },
    { slide_number: 4, slide_type: "photo_integrated", photo_index: 3, role: "step", title: "Monter la paroi", body: "Une main dedans, une main dehors, tu remontes lentement en trois passes." },
    { slide_number: 5, slide_type: "text_only", photo_index: null, role: "cta", title: "À toi", body: "Lequel de ces gestes te pose le plus de mal ? Enregistre ce post pour ta prochaine séance." },
  ],
  caption: { hook: "Trois gestes.", body: "Le premier bol tient à ça.", cta: "Dis-moi lequel te résiste.", hashtags: ["poterie"] },
};

const TOOL_INPUTS: Record<string, unknown> = {
  plan_envisage: { titles: TEXT_DOC.slides.map((s) => s.title) },
  livrer_carrousel_photo: PHOTO_DOC,
  livrer_carrousel_mixte: MIX_DOC,
  proposer_schemas: {
    reperage: [{ slide_number: 3, relation: "chiffres" }],
    schemas: [{ slide_number: 3, reason: "Le chiffre écrit devient lisible d'un coup d'œil.", visual_schema: { type: "stats", items: [{ number: "40 %", label: "de mon temps à perte" }] } }],
  },
  poser_les_gabarits: { slides: [
    { slide_number: 1, template: "couverture" },
    { slide_number: 2, template: "profonde" },
    { slide_number: 3, template: "chiffre", big_number: "40 %" },
    { slide_number: 4, template: "finale", cta_label: "Enregistre ce post" },
  ] },
};

// deno-lint-ignore no-explicit-any
function toolInput(req: any): unknown {
  const tool = req?.tool_choice?.name ?? (req?.tools?.length === 1 ? req.tools[0].name : null);
  if (!tool) return undefined;
  if (tool === "review_carousel_fields") {
    // Relecture éditoriale : garde chaque champ tel quel.
    const message = String(req.messages?.[0]?.content ?? "");
    const marker = "CHAMPS ÉDITABLES DANS L'ORDRE DU CARROUSEL :\n";
    let fields: { field_id: string }[] = [];
    try { fields = JSON.parse(message.split(marker)[1] ?? "[]"); } catch { fields = []; }
    return { reviews: fields.map((f) => ({ field_id: f.field_id, decision: "keep", reason: "le passage sert le propos", edits: [] })) };
  }
  return TOOL_INPUTS[tool] ?? {};
}

// deno-lint-ignore no-explicit-any
function sse(events: any[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

// deno-lint-ignore no-explicit-any
function streamBody(req: any, text: string): string {
  const input = toolInput(req);
  const start = { type: "message_start", message: { id: "msg_test", model: req?.model, usage: { input_tokens: 100, output_tokens: 0 } } };
  const end = [
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: input !== undefined ? "tool_use" : "end_turn" }, usage: { output_tokens: 50 } },
    { type: "message_stop" },
  ];
  if (input !== undefined) {
    return sse([start, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: req.tool_choice?.name ?? req.tools[0].name, input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }, ...end]);
  }
  return sse([start, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, ...end]);
}

// deno-lint-ignore no-explicit-any
function reply(req: any, text: string): unknown {
  const input = toolInput(req);
  const usage = { input_tokens: 100, output_tokens: 50 };
  if (input !== undefined) {
    return { model: req?.model, content: [{ type: "tool_use", id: "tu_1", name: req.tool_choice?.name ?? req.tools[0].name, input }], stop_reason: "tool_use", usage };
  }
  return { model: req?.model, content: [{ type: "text", text }], stop_reason: "end_turn", usage };
}

/** Valeurs qui changent d'un lancement à l'autre (durées, dates, identifiants). */
function stable(text: string): string {
  return text
    .replace(/("[a-z_]*(?:_ms|duration|elapsed|remaining)[a-z_]*"\s*:\s*)-?\d+/gi, "$10")
    .replace(/(\\"[a-z_]*(?:_ms|duration|elapsed|remaining)[a-z_]*\\"\s*:\s*)-?\d+/gi, "$10")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "<date>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
}

// deno-lint-ignore no-explicit-any
function requestDoc(req: any): string {
  return JSON.stringify(req ?? null, null, 1);
}

function setDeps(credits: { category: string; action: string }[]) {
  _deps.runPipeline = (async () => ({ ok: true, userId: USER_ID, supabase: fakeSupabase(), corsHeaders: {}, quota: null })) as any;
  _deps.checkQuota = (async () => ({ allowed: true, plan: "premium" })) as any;
  _deps.logUsage = (async (_u: string, category: string, action: string) => { credits.push({ category, action }); }) as any;
  _deps.callAnthropic = callAnthropic;
  _deps.callCarouselWriter = callCarouselWriter;
  _deps.reviewThread = reviewCarouselProgression;
  _deps.prepareNarrative = createContinuousNarrative;
  _deps.audienceAddressPass = applyAudienceAddressPass;
  // Réseau hors Claude coupé : derniers contenus, recherche, photos, journal du plan.
  _deps.fetchRecentTexts = async () => [];
  _deps.fetchDepthMaterial = async () => "";
  _deps.matchPhotos = async (doc) => doc;
  _deps.stockAmbient = async (doc: any) => doc;
  _deps.logPlan = async () => {};
}

function fakeSupabase() {
  // deno-lint-ignore no-explicit-any
  const builder = (table?: string): any => {
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    const filters: Record<string, unknown> = {};
    for (const k of ["select", "neq", "gte", "lte", "contains", "order", "limit", "in", "is", "update", "delete", "or", "not", "ilike"]) b[k] = () => b;
    b.eq = (column: string, value: unknown) => { filters[column] = value; return b; };
    b.single = () => Promise.resolve({ data: null, error: null });
    b.maybeSingle = () => {
      const owner = { workspace_id: WORKSPACE_ID, user_id: USER_ID, role: "owner" };
      const ok = table === "workspace_members" && Object.entries(filters).every(([k, v]) => owner[k as keyof typeof owner] === v);
      return Promise.resolve({ data: ok ? owner : null, error: null });
    };
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return b;
  };
  return { from: builder, rpc: () => Promise.resolve({ data: null, error: null }), auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }) } };
}

async function run(body: Record<string, unknown>, text: string) {
  Deno.env.set("SUPABASE_URL", TEST_SUPABASE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  Deno.env.set("ANTHROPIC_API_KEY", "test-anthropic-key");
  const credits: { category: string; action: string }[] = [];
  setDeps(credits);
  // deno-lint-ignore no-explicit-any
  const requests: any[] = [];
  const previousFetch = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      const req = init?.body ? JSON.parse(init.body as string) : null;
      requests.push(req);
      if (req?.stream) return new Response(streamBody(req, text), { status: 200, headers: { "Content-Type": "text/event-stream" } });
      return new Response(JSON.stringify(reply(req, text)), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    // Supabase (journal qualité, etc.) : réponse vide générique, jamais le vrai réseau.
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const res = await handleRequest(new Request("http://localhost/carousel-ai", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: WORKSPACE_ID, ...body }),
    }));
    const raw = await res.text();
    let out = raw;
    try {
      const json = JSON.parse(raw);
      // Le carrousel voyage en chaîne JSON : déplié pour un diff lisible.
      if (typeof json?.content === "string") { try { json.content = JSON.parse(json.content); } catch { /* texte brut */ } }
      out = JSON.stringify(json, null, 1);
    } catch { /* réponse non JSON */ }
    return stable([
      `── STATUT ${res.status}`,
      `── RÉPONSE AU FRONT\n${out}`,
      `── CRÉDITS\n${JSON.stringify(credits)}`,
      // Plusieurs étapes partent en parallèle : appels triés pour une référence stable.
      `── APPELS À CLAUDE (${requests.length})\n${requests.map(requestDoc).sort().join("\n\n")}`,
    ].join("\n\n"));
  } finally {
    globalThis.fetch = previousFetch;
  }
}

const SUBJECT = "Pourquoi je ne fais plus de remises sur mes créations";
const ANSWERS = { "La dernière fois qu'on t'a demandé une remise ?": "J'ai dit non, et la cliente a signé quand même." };
const PHOTO_CONTEXTS = [{ context: "Le tour au matin" }, { context: "Les mains dans la terre" }, { context: "Le four ouvert" }];
const PHOTO_STRUCTURE = [1, 2, 3, 4].map((n) => ({
  slide_number: n, role: n === 1 ? "hook" : n === 4 ? "cta" : "body", title_suggestion: `Étape ${n}`, strategic_note: `Rôle ${n}`,
  slide_type: "photo_full", photo_index: n === 4 ? 1 : n,
}));
const MIX_STRUCTURE = MIX_DOC.slides.map((s) => ({
  slide_number: s.slide_number, role: s.role, title_suggestion: s.title ?? s.overlay_text ?? "", strategic_note: "Rôle validé",
  slide_type: s.slide_type, ...(s.photo_index ? { photo_index: s.photo_index } : {}),
}));

const CASES: { name: string; body: Record<string, unknown>; text: string }[] = [
  { name: "express_full — texte Instagram (schéma proposé après l'écriture)", text: JSON.stringify(TEXT_DOC),
    body: { type: "express_full", carousel_type: "prise_de_position", subject: SUBJECT, objective: "confiance", deepening_answers: ANSWERS } },
  { name: "express_full — texte LinkedIn, longueur imposée (aucun schéma)", text: JSON.stringify(TEXT_DOC),
    body: { type: "express_full", carousel_type: "prise_de_position", channel: "linkedin", subject: SUBJECT, objective: "confiance", slide_count: 5, deepening_answers: ANSWERS } },
  { name: "slides — texte", text: JSON.stringify(TEXT_DOC),
    body: { type: "slides", carousel_type: "storytelling", subject: SUBJECT, objective: "engagement", chosen_hook: "J'ai arrêté les remises" } },
  { name: "hooks — texte", text: JSON.stringify({ hooks: [{ text: "J'ai arrêté les remises.", type: "contre_intuition" }] }),
    body: { type: "hooks", carousel_type: "storytelling", subject: SUBJECT, objective: "engagement" } },
  { name: "express_full — mixte, structure validée (disposition et schémas hors rédaction)", text: JSON.stringify(MIX_DOC),
    body: { type: "express_full", carousel_type: "mix", subject: "Les trois gestes qui changent un premier bol", objective: "confiance",
      scenario_origin: "user_validated", confirmed_structure: MIX_STRUCTURE, photo_contexts: PHOTO_CONTEXTS, photo_description: "1. Le tour ; 2. Les mains ; 3. Le four" } },
  { name: "express_full — mixte texte d'abord", text: JSON.stringify(MIX_DOC),
    body: { type: "express_full", carousel_type: "mix", subject: "Les trois gestes qui changent un premier bol", objective: "confiance", text_first: true,
      photo_catalog: [{ index: 1, description: "Le tour au matin" }, { index: 2, description: "Les mains dans la terre" }] } },
  { name: "express_full — photo, structure validée (gabarits posés sur le texte final)", text: JSON.stringify(PHOTO_DOC),
    body: { type: "express_full", carousel_type: "photo", subject: "Une journée d'atelier, du premier café à la cuisson", objective: "visibilite",
      scenario_origin: "user_validated", confirmed_structure: PHOTO_STRUCTURE, photo_contexts: PHOTO_CONTEXTS } },
  { name: "express_full — photos brutes (légende seule)", text: JSON.stringify(PHOTO_DOC),
    body: { type: "express_full", carousel_type: "photo", subject: "Une journée d'atelier", objective: "visibilite", photos_only: true, slide_count: 4 } },
  { name: "assign_templates — « Mes slides » (gabarits seuls, sans crédit)", text: "",
    body: { type: "assign_templates", carousel_type: "photo", slides: PHOTO_DOC.slides.map(({ slide_number, overlay_text, photo_index }) => ({ slide_number, overlay_text, photo_index })) } },
];

for (const c of CASES) {
  Deno.test(`handler carousel-ai — ${c.name}`, async (t) => {
    await assertSnapshot(t, await run(c.body, c.text));
  });
}
