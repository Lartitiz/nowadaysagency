// Contrat de generate-content (lot 2 « robustesse création de contenu »,
// 13/10/2026 ; voir docs/creation-contenu/CARTE.md). Avant ce fichier, aucun
// test serveur ne couvrait cette fonction, qui produit pourtant la bio
// Instagram, les légendes et les brouillons rapides du calendrier.
//
// Pour chaque `type` réellement appelé par le front, on fait passer une vraie
// requête dans le handler déployé (Supabase et Anthropic simulés) et on fige :
//   1. le prompt envoyé à Claude (snapshot) : une modification du prompt d'un
//      type ne doit pas changer celui d'un autre ;
//   2. la forme de la réponse renvoyée au front ;
//   3. le quota : un seul logUsage, dans la bonne catégorie, et AUCUN si
//      l'appel IA échoue (pattern checkQuota → IA → logUsage).
//
// Dérive VOULUE d'un prompt : régénère et relis le diff du .snap.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/generate-content/contract_test.ts -- --update

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicFailure,
  anthropicTextSuccess,
  authedRequest,
  captureStdServeHandler,
  installFetchMock,
  setTestEnv,
  TEST_SUPABASE_URL,
} from "../_shared/test-edge-harness.ts";

setTestEnv();
const handler = await captureStdServeHandler(new URL("./index.ts", import.meta.url).href);
const URL_FN = `${TEST_SUPABASE_URL}/functions/v1/generate-content`;

// `system` part en blocs (cache de prompt) : on recolle leur texte.
// deno-lint-ignore no-explicit-any
function texte(part: any): string {
  if (typeof part === "string") return part;
  if (Array.isArray(part)) return part.map((b) => (typeof b === "string" ? b : b?.text ?? JSON.stringify(b))).join("\n");
  return JSON.stringify(part);
}

// deno-lint-ignore no-explicit-any
function promptDoc(req: any): string {
  return `── SYSTEM PROMPT ──\n${texte(req.system)}\n\n── USER PROMPT ──\n${texte(req.messages?.[0]?.content)}`;
}

// deno-lint-ignore no-explicit-any
async function run(body: Record<string, unknown>, aiText: string) {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(aiText) });
  try {
    const res = await handler(authedRequest(URL_FN, body));
    const json = await res.json();
    return { res, json, mock };
  } finally {
    mock.restore();
  }
}

// Un cas par `type` appelé par le front (voir CARTE.md, section 3) :
// [nom du test, corps de la requête, texte renvoyé par l'IA simulée, catégorie de quota attendue]
const CASES: [string, Record<string, unknown>, string, string][] = [
  ["bio-audit (InstagramBio)", { type: "bio-audit", bioText: "Céramiste à Lyon 🏺\nAteliers tournage débutantes\n👇 Réserve ta place" },
    '{"score":72,"points_forts":["clair"],"axes":["ajouter une preuve"]}', "audit"],
  ["bio-generator (InstagramBio)", {
    type: "bio-generator",
    brandingContext: { positioning: "Céramiste pédagogue", target: "Débutantes", tone: "complice", offer: "Ateliers tournage" },
    differentiation: { type: "methode", text: "Petits groupes de 4" },
    ctaInfo: { type: "rdv" },
    structureChoice: "directe",
  }, '{"bios":[{"label":"A","bio_text":"Céramiste à Lyon","character_count":16}]}', "content"],
  ["caption", { type: "caption", sujet: "Pourquoi je ne fais plus de remises", objectif: "confiance" },
    "Une légende Instagram complète sur les remises.", "content"],
  ["calendar-quick Instagram (CalendarPostDialog)", {
    type: "calendar-quick", theme: "Les coulisses d'une cuisson ratée", objectif: "confiance", angle: "coulisses", format: "post_carrousel", notes: "Montrer le four",
  }, "Slide 1 : La cuisson a raté.\nSlide 2 : Voilà ce que j'en ai appris.", "content"],
  ["calendar-quick LinkedIn", {
    type: "calendar-quick", theme: "Ce que m'a appris une commande annulée", objectif: "credibilite", format: "post_linkedin", canal: "linkedin",
  }, "Une commande annulée m'a appris à cadrer mes devis.", "content"],
  ["express-draft (SuggestedContents)", { type: "express-draft", sujet: "Mon rituel avant un atelier", objectif: "visibilite", format: "reel" },
    '{"accroche":"Mon rituel avant chaque atelier.","content":"0-3 sec : le café."}', "content"],
  ["express-draft LinkedIn", { type: "express-draft", sujet: "Pourquoi j'affiche mes prix", objectif: "credibilite", format: "linkedin" },
    '{"accroche":"J\'affiche mes prix.","content":"J\'affiche mes prix depuis un an."}', "content"],
  ["playground (ContentPlayground)", { type: "playground", playground_prompt: "Écris trois accroches sur la patience au tour." },
    "1. La patience se tourne.", "content"],
  ["instagram-nom (InstagramProfileNom)", { type: "instagram-nom", profile: { activite: "Céramiste", mots_cles: "céramique, atelier" } },
    '{"suggestions":["Lou | Céramique & ateliers"]}', "content"],
  ["launch-ideas (InstagramLaunch)", { type: "launch-ideas", profile: { launch_name: "Atelier d'hiver", launch_promise: "Tourner son premier bol" } },
    '{"ideas":[{"titre":"Le premier bol"}]}', "content"],
  ["instagram-edito-pillars (InstagramProfileEdito)", { type: "instagram-edito-pillars" },
    '{"pillars":[{"name":"Coulisses"}]}', "content"],
  ["instagram-edito-formats (InstagramProfileEdito)", { type: "instagram-edito-formats", profile: { pillars: ["Coulisses", "Pédagogie"] } },
    '{"formats":[{"name":"Avant / après"}]}', "content"],
  ["instagram-rhythm-adapt (InstagramProfileEdito)", { type: "instagram-rhythm-adapt", profile: { time_available: "2h", available_minutes: 120, current_posts: 3 } },
    '{"rhythm":"2 posts + 3 stories"}', "content"],
];

for (const [name, body, aiText, category] of CASES) {
  Deno.test(`generate-content — ${name} : prompt figé, réponse { content }, un seul logUsage « ${category} »`, async (t) => {
    const { res, json, mock } = await run(body, aiText);
    assertEquals(res.status, 200, JSON.stringify(json));
    assertEquals(typeof json.content, "string");
    assert(json.content.length > 0);
    assert(mock.anthropicCallCount >= 1);
    assertEquals(mock.aiUsageInserts.length, 1);
    assertEquals(mock.aiUsageInserts[0].category, category);
    assertEquals(mock.aiUsageInserts[0].action_type, body.type);
    await assertSnapshot(t, promptDoc(mock.anthropicRequests[0]));
  });
}

Deno.test("generate-content — weekly-suggestions : JSON parsé renvoyé dans { suggestions }, un seul logUsage", async (t) => {
  const { res, json, mock } = await run({ type: "weekly-suggestions" }, '[{"titre":"Les coulisses du four","format":"reel","angle":"coulisses"}]');
  assertEquals(res.status, 200, JSON.stringify(json));
  assertEquals(json.type, "weekly-suggestions");
  assertEquals(json.suggestions[0].titre, "Les coulisses du four");
  assertEquals(mock.aiUsageInserts.length, 1);
  assertEquals(mock.aiUsageInserts[0].category, "content");
  await assertSnapshot(t, promptDoc(mock.anthropicRequests[0]));
});

Deno.test("generate-content — weekly-suggestions illisible : 502 et AUCUN crédit débité", async () => {
  const { res, mock } = await run({ type: "weekly-suggestions" }, "pas du JSON");
  assertEquals(res.status, 502);
  assertEquals(mock.aiUsageInserts.length, 0);
});

Deno.test("generate-content — échec de l'appel IA : erreur et AUCUN crédit débité", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicFailure() });
  try {
    const res = await handler(authedRequest(URL_FN, { type: "caption", sujet: "Pourquoi je ne fais plus de remises" }));
    await res.body?.cancel();
    assert(res.status >= 400);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("generate-content — type inconnu : refusé avant tout appel IA", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess("jamais appelé") });
  try {
    const res = await handler(authedRequest(URL_FN, { type: "n-existe-pas" }));
    await res.body?.cancel();
    assertEquals(res.status, 400);
    assertEquals(mock.anthropicCallCount, 0);
    assertEquals(mock.aiUsageInserts.length, 0);
  } finally {
    mock.restore();
  }
});
