// Contrat du HANDLER de creative-flow (lot 3 « robustesse création de
// contenu », 13/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// Les snapshots de prompts figent ce que construisent les builders ; ce
// fichier fige le CÂBLAGE : pour une vraie requête par format et par step,
// tous les appels envoyés à Claude (système, messages, outil, streaming), la
// réponse renvoyée au front (JSON ou flux SSE) et les crédits débités.
// Supabase et Claude sont simulés ; Claude répond toujours la même chose.
//
// Les références ont été générées sur le code AVANT le découpage du lot 3
// (index.ts d'un seul tenant), puis vérifiées sur le code découpé : le
// découpage n'a rien changé à ce que voit Claude ni à ce que reçoit le front.
//
// Dérive VOULUE : régénère et relis le diff du .snap.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/creative-flow/handler_contract_test.ts -- --update

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

// Réponses fixes de Claude, par outil demandé.
const TOOL_INPUTS: Record<string, unknown> = {
  poser_questions: { questions: [
    { question: "Qu'est-ce qui t'a fait arrêter les remises ?", placeholder: "Le moment précis" },
    { question: "Qu'a répondu la cliente ?", placeholder: "Ses mots" },
    { question: "Qu'est-ce que ça a changé pour toi ?", placeholder: "Concrètement" },
  ] },
  poser_questions_suivi: { questions: [{ question: "Et après ?", placeholder: "La suite" }] },
  proposer_hooks: { hooks: [1, 2, 3].map((i) => ({
    type: "contre_intuition", type_label: "Contre-intuition", text: `J'ai arrêté les remises, version ${i}.`,
    text_overlay: `REMISES ${i}`, format_recommande: "face_cam_confession", format_label: "Face cam confession", duree_cible: "~30 sec",
  })) },
  rediger_post: { content: "J'ai arrêté les remises il y a un an.\n\nLa cliente a signé quand même.", accroche: "J'ai arrêté les remises il y a un an." },
  rediger_contenu_visuel: { content: "Les mains dans la terre, j'ai compris que mon prix était juste.", accroche: "Les mains dans la terre.", pillar: "coulisses", objectif: "confiance" },
  plan_recyclage: {
    message_central: "Arrêter les remises revalorise le travail.",
    synthese_source: "Une céramiste raconte qu'elle a arrêté les remises et que sa cliente a signé quand même.",
    angles: [
      { format: "Post LinkedIn", sous_idee: "Le refus", angle: "Ce que le refus m'a appris" },
      { format: "Email / Newsletter", sous_idee: "La grille publique", angle: "Pourquoi j'affiche mes prix" },
    ],
  },
};

// Texte libre renvoyé par Claude selon le cas (JSON attendu par le format).
const POST_JSON = JSON.stringify({ content: "J'ai arrêté les remises il y a un an.\n\nLa cliente a signé quand même.", accroche: "J'ai arrêté les remises il y a un an.", format: "post", pillar: "prix", objectif: "confiance" });

// deno-lint-ignore no-explicit-any
function sse(events: any[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

// deno-lint-ignore no-explicit-any
function streamBody(req: any, text: string): string {
  const tool = req?.tool_choice?.name ?? (req?.tools?.length === 1 ? req.tools[0].name : null);
  const start = { type: "message_start", message: { id: "msg_test", usage: { input_tokens: 100, output_tokens: 0 } } };
  const end = [
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 50 } },
    { type: "message_stop" },
  ];
  if (tool && TOOL_INPUTS[tool]) {
    return sse([start, { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: tool, input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(TOOL_INPUTS[tool]) } }, ...end]);
  }
  return sse([start, { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }, ...end]);
}

// deno-lint-ignore no-explicit-any
function reply(req: any, text: string) {
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

async function run(body: Record<string, unknown>, text: string, stream = false) {
  // deno-lint-ignore no-explicit-any
  const requests: any[] = [];
  const mock = installFetchMock({ anthropic: (req) => reply(req, text) });
  const harnessFetch = globalThis.fetch;
  // Requêtes en streaming : flux SSE au format Anthropic (le harnais ne sait renvoyer que du JSON).
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      const req = init?.body ? JSON.parse(init.body as string) : null;
      requests.push(req);
      if (req?.stream) return new Response(streamBody(req, text), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return harnessFetch(input, init);
  }) as typeof fetch;
  try {
    const headers: Record<string, string> = { Authorization: "Bearer test-token", "Content-Type": "application/json" };
    if (stream) headers.Accept = "text/event-stream";
    const res = await handler(new Request(URL_FN, { method: "POST", headers, body: JSON.stringify(body) }));
    const raw = await res.text();
    const out = stream
      ? raw.split("\n\n").filter((chunk: string) => chunk.trim() && !chunk.includes('"heartbeat"')).join("\n\n")
      : raw;
    return {
      doc: [
        `── STATUT ${res.status}`,
        `── RÉPONSE AU FRONT\n${out}`,
        `── CRÉDITS\n${JSON.stringify(mock.aiUsageInserts.map((u) => ({ category: u.category, action_type: u.action_type })))}`,
        // Les formats recyclés partent en parallèle : appels triés pour une référence stable.
        `── APPELS À CLAUDE (${requests.length})\n${requests.map(requestDoc).sort().join("\n\n")}`,
      ].join("\n\n"),
    };
  } finally {
    globalThis.fetch = harnessFetch;
    mock.restore();
  }
}

const CONTEXT = "Pourquoi je ne fais plus de remises sur mes créations";
const ANGLE = { title: "Le mythe du prix cassé", structure: ["constat", "bascule", "position"], tone: "complice", format_livraison: "post" };
const ANSWERS = [{ question: "Qu'a répondu la cliente ?", answer: "Elle a signé quand même." }];
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

const CASES: { name: string; body: Record<string, unknown>; text: string; stream?: boolean }[] = [
  { name: "questions — post Instagram", body: { step: "questions", contentType: "instagram_post", context: CONTEXT, angle: ANGLE }, text: "" },
  { name: "questions — LinkedIn", body: { step: "questions", contentType: "linkedin_post", context: CONTEXT, angle: ANGLE }, text: "" },
  // Sans angle choisi : répondait 500 (angle.title sur undefined) avant le 14/10/2026.
  { name: "questions — sans angle", body: { step: "questions", contentType: "instagram_post", context: CONTEXT }, text: "" },
  { name: "hooks — reel", body: { step: "hooks", contentType: "reel", context: CONTEXT, answers: ANSWERS }, text: "" },
  { name: "generate — reel", body: { step: "generate", contentType: "reel", context: CONTEXT, answers: ANSWERS, face_cam: "oui",
    selected_hook: TOOL_INPUTS.proposer_hooks && (TOOL_INPUTS.proposer_hooks as any).hooks[0] },
    text: JSON.stringify({ format: "reel", hook: "J'ai arrêté les remises.", script: [
      { section: "hook", timing: "0-3 sec", texte_parle: "J'ai arrêté les remises.", texte_overlay: "REMISES" },
      { section: "developpement", timing: "3-20 sec", texte_parle: "La cliente a signé quand même.", texte_overlay: "ELLE A SIGNÉ" },
    ], caption: { text: "Le prix juste.", hashtags: ["ceramique"] } }) },
  { name: "generate — stories", body: { step: "generate", contentType: "stories", context: CONTEXT, answers: ANSWERS, objective: "confiance" },
    text: JSON.stringify({ stories: [
      { text: "J'ai arrêté les remises.", sticker: null, title_pill: null, photo_directive: "Mes mains sur le tour", face_cam: false },
      { text: "Et toi, tu en fais ?", sticker: { type: "sondage", label: "Tu fais des remises ?", options: ["Oui", "Non"] }, title_pill: null, photo_directive: "Atelier", face_cam: false },
    ] }) },
  { name: "generate — post Instagram (sans streaming)", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, angle: ANGLE, answers: ANSWERS }, text: POST_JSON },
  { name: "generate — post LinkedIn (sans streaming)", body: { step: "generate", contentType: "post_linkedin", context: CONTEXT, angle: ANGLE, answers: ANSWERS }, text: POST_JSON },
  { name: "generate — newsletter (sans streaming)", body: { step: "generate", contentType: "post_newsletter", context: CONTEXT, answers: ANSWERS },
    text: JSON.stringify({ subject: "Pourquoi j'affiche mes prix", preheader: "Une décision", content: "J'ai arrêté les remises.", accroche: "J'ai arrêté les remises.", cta_suggestion: "Réponds-moi" }) },
  { name: "generate — Pinterest texte", body: { step: "generate", contentType: "post_pinterest", context: CONTEXT, answers: ANSWERS },
    text: JSON.stringify({ content: "Céramique : pourquoi afficher ses prix", accroche: "Afficher ses prix", format: "pinterest" }) },
  { name: "adjust — post LinkedIn", body: { step: "adjust", contentType: "linkedin_post", context: CONTEXT, adjustment: "Plus court", content: "J'ai arrêté les remises il y a un an. La cliente a signé." }, text: POST_JSON },
  { name: "recycle — LinkedIn + newsletter", body: { step: "recycle", contentType: "recycle", context: "Recyclage de contenu en 2 formats", profile: {}, sourceText: "J'ai arrêté les remises il y a un an : la cliente a signé quand même, et j'affiche maintenant une grille publique sur mon site.", formats: ["linkedin", "newsletter"] },
    text: JSON.stringify({
      results: {
        linkedin: "J'ai arrêté les remises il y a un an. Ce jour-là, une cliente m'a demandé dix pour cent de moins sur un service de bols. J'ai dit non, simplement, en lui expliquant le temps passé au tour. Elle a signé quand même. Depuis, j'affiche une grille publique.",
        newsletter: "Objet : pourquoi j'affiche mes prix\n\nIl y a un an, j'ai arrêté les remises. Une cliente m'en a demandé une, j'ai expliqué mon temps de travail, elle a signé. Depuis, ma grille est publique sur mon site, et je ne négocie plus.",
      },
      topics: { linkedin: "Le refus", newsletter: "La grille publique" },
    }) },
  { name: "photo — questions", body: { step: "questions", contentType: "instagram_post", context: CONTEXT, angle: ANGLE, photo_mode: true, photos: [{ base64: PHOTO }] }, text: "" },
  { name: "photo — generate post", body: { step: "generate", contentType: "instagram_post", context: CONTEXT, answers: ANSWERS, photo_mode: true, photos: [{ base64: PHOTO }] }, text: "" },
  { name: "streaming — post Instagram", body: { step: "generate", contentType: "post_instagram", context: CONTEXT, angle: ANGLE, answers: ANSWERS }, text: POST_JSON, stream: true },
  { name: "streaming — post LinkedIn", body: { step: "generate", contentType: "post_linkedin", context: CONTEXT, angle: ANGLE, answers: ANSWERS }, text: POST_JSON, stream: true },
  { name: "streaming — newsletter", body: { step: "generate", contentType: "post_newsletter", context: CONTEXT, answers: ANSWERS },
    text: JSON.stringify({ subject: "Mes prix", preheader: "Une décision", content: "J'ai arrêté les remises.", accroche: "J'ai arrêté les remises." }), stream: true },
  { name: "streaming — carrousel retiré (410)", body: { step: "generate", contentType: "carrousel", context: CONTEXT }, text: "", stream: true },
];

for (const c of CASES) {
  Deno.test(`handler creative-flow — ${c.name}`, async (t) => {
    const { doc } = await run(c.body, c.text, c.stream);
    await assertSnapshot(t, doc);
  });
}
