// Snapshots de ce que le Studio envoie à Claude (lot 0 de la fiche 5,
// docs/robustesse/gros-fichiers.md), posés AVANT tout découpage de index.ts.
//
// Pour 6 tours types, on fige chaque appel à Claude : modèle, réglages,
// système, outil, historique, ordre des images et JSON de la demande. Les
// textes complets du système et des outils sont figés une fois, dans le test
// « systèmes et outils » ; chaque tour dit lequel il envoie et ce qui s'y
// ajoute.
//
// Les références ont été générées sur le code AVANT le découpage. Un test
// rouge après un déplacement de code = régression : corrige le code, ne
// régénère pas. Dérive VOULUE d'un prompt : régénère et relis le diff du .snap.
//   deno test --no-check --no-lock --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/visual-studio/prompts_snapshot_test.ts -- --update
//
// Lancer (flags de la CI, script npm test:edges) :
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/visual-studio/prompts_snapshot_test.ts

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { id, PROPOSAL, stable, studioFixture, type StudioFixture } from "./contract_harness.ts";
import { conversationTool, intentTool, studioSystem } from "./contract.ts";
import { CONVERSATION_SYSTEM } from "./conversation.ts";
import { COMPETENCIES } from "./competencies.ts";
import { selectSoulStyles, soulStyles } from "./soul-direction.ts";

const ACTOR = id(21);
const base = { studio_version: 4, session_id: id(3), workspace_id: id(2), action: "message", revision: 0 };

// Listes fixes jointes à chaque demande : figées une fois dans « systèmes et outils ».
const SOUL_PRESETS = selectSoulStyles(await soulStyles());

// deno-lint-ignore no-explicit-any
type Part = { type: string; text?: string; source?: { media_type: string; data: string }; [k: string]: any };

function systemLabel(text: string) {
  for (const [name, value] of [["studioSystem", studioSystem], ["CONVERSATION_SYSTEM", CONVERSATION_SYSTEM]] as const) {
    if (text.startsWith(value)) {
      const rest = text.slice(value.length);
      return rest ? `${name} + ajout :\n${rest}` : name;
    }
  }
  return `TEXTE PROPRE À CET APPEL :\n${text}`;
}
function toolLabel(tools: unknown) {
  const sent = JSON.stringify(tools);
  if (sent === JSON.stringify([intentTool])) return "intentTool (prepare_photo_request)";
  if (sent === JSON.stringify([conversationTool])) return `conversationTool (${conversationTool.name})`;
  return `OUTIL PROPRE À CET APPEL :\n${JSON.stringify(tools, null, 1)}`;
}
function part(p: Part) {
  if (p.type === "image") return `[image ${p.source?.media_type}, ${p.source?.data.length} caractères base64]`;
  if (p.type !== "text") return JSON.stringify(p);
  try {
    const parsed = JSON.parse(p.text!);
    if (parsed && JSON.stringify(parsed.presets_soul_disponibles) === JSON.stringify(SOUL_PRESETS)) {
      parsed.presets_soul_disponibles = "(les presets Soul figés dans « systèmes et outils »)";
    }
    if (parsed && JSON.stringify(parsed.competences_disponibles) === JSON.stringify(COMPETENCIES)) {
      parsed.competences_disponibles = "(COMPETENCIES, figées dans « systèmes et outils »)";
    }
    if (parsed && typeof parsed === "object") return `[texte JSON]\n${JSON.stringify(parsed, null, 1)}`;
  } catch { /* texte libre */ }
  return `[texte] ${p.text}`;
}
// deno-lint-ignore no-explicit-any
function payloadDoc(payload: Record<string, any>, index: number) {
  const { model, messages, system, tools, ...settings } = payload;
  const lines = [
    `══ APPEL ${index + 1} — ${model}`,
    `réglages : ${JSON.stringify(settings)}`,
    `système : ${systemLabel(system?.map((s: Part) => s.text).join("\n") ?? "(aucun)")}`,
    `système (cache) : ${JSON.stringify(system?.map(({ text: _t, ...rest }: Part) => rest))}`,
    `outil : ${toolLabel(tools)}`,
  ];
  for (const [i, message] of (messages as { role: string; content: string | Part[] }[]).entries()) {
    lines.push(`── message ${i + 1} (${message.role})`);
    if (typeof message.content === "string") lines.push(`[texte] ${message.content}`);
    else lines.push(...message.content.map(part));
  }
  return lines.join("\n");
}
function turnDoc(f: StudioFixture, status: number, data: Record<string, unknown>) {
  // deno-lint-ignore no-explicit-any
  const last = (data.session as any)?.messages?.at(-1);
  return stable([
    `STATUT ${status} — opération finale : ${last?.operation ?? "(aucune)"} — ${f.payloads.length} appel(s) à Claude`,
    ...f.payloads.map(payloadDoc),
  ].join("\n\n"));
}

Deno.test("prompts Studio — systèmes et outils envoyés tels quels", async (t) => {
  await assertSnapshot(t, [
    `══ studioSystem\n${studioSystem}`,
    `══ CONVERSATION_SYSTEM\n${CONVERSATION_SYSTEM}`,
    `══ intentTool\n${JSON.stringify(intentTool, null, 1)}`,
    `══ conversationTool\n${JSON.stringify(conversationTool, null, 1)}`,
    `══ presets Soul proposés (hors conseil)\n${JSON.stringify(SOUL_PRESETS, null, 1)}`,
    `══ COMPETENCIES\n${JSON.stringify(COMPETENCIES, null, 1)}`,
  ].join("\n\n"));
});

Deno.test("prompts Studio — conseil simple (Haiku, sans image)", async (t) => {
  const f = studioFixture({ actor: ACTOR });
  f.session.proposal = null; // pas de proposition en attente : « proposition_a_corriger » reste vide
  try {
    f.session.source_photo_id = null;
    f.session.source_path = null;
    f.session.messages.push({ role: "assistant", text: "Quelle image aimerais-tu créer ?" });
    f.memories.push({ id: id(30), kind: "preference", name: "Lumière naturelle", note: "Éviter l'effet plastique", revision: 1, references: [] });
    f.setIntents({ operation: "advise", reply: "Un fond clair met ton bol en valeur.", summary: "" });
    const { status, data } = await f.send({ ...base, request_id: id(31), reference_ids: [],
      message: "Qu'en penses-tu : fond clair ou fond sombre pour mon bol ?" });
    assertEquals(status, 200);
    assertEquals(f.payloads[0].model, "claude-haiku-4-5");
    await assertSnapshot(t, turnDoc(f, status, data));
  } finally { f.restore(); }
});

Deno.test("prompts Studio — nouvelle photo, scène Soul préparée avant le produit", async (t) => {
  const f = studioFixture({ actor: ACTOR });
  f.session.proposal = null; // pas de proposition en attente : « proposition_a_corriger » reste vide
  try {
    const product = { id: id(40), photo_id: id(41), path: "original-plate", role: "product", name: "Assiette" };
    f.session.references = [product];
    f.setIntents({ operation: "create", visual_kind: "photo", summary: "Scène vue de haut, à 75°, sans assiette pour la valider d'abord.",
      scene_workflow: { phase: "scene", camera_match: "75° pour respecter la vue de l'assiette" },
      image_prompt: "Summer table, high angle at 75 degrees, clear space for a plate, no plate or text.", reference_use: [] });
    const { status, data } = await f.send({ ...base, request_id: id(42), reference_ids: [product.id],
      message: "Prépare une scène de déjeuner d'été pour mon assiette" });
    assertEquals(status, 200);
    // deno-lint-ignore no-explicit-any
    assertEquals((data.session as any).proposal.provider, "higgsfield");
    await assertSnapshot(t, turnDoc(f, status, data));
  } finally { f.restore(); }
});

Deno.test("prompts Studio — intégration du produit dans une scène validée", async (t) => {
  const f = studioFixture({ actor: ACTOR });
  f.session.proposal = null; // pas de proposition en attente : « proposition_a_corriger » reste vide
  try {
    const product = { id: id(50), photo_id: id(51), path: "original-plate", role: "product", name: "Assiette" };
    f.version.status = "ready";
    Object.assign(f.version.proposal, { operation: "create", provider: "higgsfield", summary: "Scène d'été vue de haut",
      image_prompt: "Summer table, high angle", scene_workflow: { phase: "scene", camera_match: "Vue de haut" },
      planning_references: [product], reference_snapshot: [] });
    f.session.references = [product];
    f.setIntents({ operation: "product", visual_kind: "photo", uses_selected_version: true,
      scene_workflow: { phase: "integration", camera_match: "Conserver la vue de haut" },
      summary: "Insérer l'assiette à plat dans la scène sélectionnée, conserver le reste.", product_placement: "À plat sur le bois, centre libre.",
      image_prompt: "Insert only the original plate, flat on the table, preserve approved scene.", reference_use: [{ id: product.id, role: "product" }] });
    const { status, data } = await f.send({ ...base, request_id: id(52), reference_ids: [], viewed_version_id: PROPOSAL,
      message: "La scène me plaît, ajoute mon assiette" });
    assertEquals(status, 200);
    // deno-lint-ignore no-explicit-any
    assertEquals((data.session as any).proposal.scene_workflow.phase, "integration");
    await assertSnapshot(t, turnDoc(f, status, data));
  } finally { f.restore(); }
});

Deno.test("prompts Studio — retouche d'une version générée", async (t) => {
  const f = studioFixture({ actor: ACTOR });
  f.session.proposal = null; // pas de proposition en attente : « proposition_a_corriger » reste vide
  try {
    f.version.status = "ready";
    Object.assign(f.version.proposal, { operation: "create", summary: "Bol bleu sur une table en bois", image_prompt: "Blue bowl on a wooden table",
      format: "portrait", brief: "Bol bleu, ambiance douce", preserve: ["Bol bleu cobalt"], reference_snapshot: [] });
    f.session.messages.push({ role: "user", text: "Un bol bleu sur une table" }, { role: "assistant", text: "Voici la proposition." });
    f.setIntents({ operation: "edit", visual_kind: "graphic", uses_selected_version: true, summary: "Adoucir seulement la lumière de la version sélectionnée.",
      image_prompt: "Soften only the light of the selected image; keep the bowl unchanged.", reference_use: [] });
    const { status, data } = await f.send({ ...base, request_id: id(60), reference_ids: [], viewed_version_id: PROPOSAL,
      message: "Lumière plus douce sur cette version" });
    assertEquals(status, 200);
    // deno-lint-ignore no-explicit-any
    assertEquals((data.session as any).proposal.operation, "edit");
    await assertSnapshot(t, turnDoc(f, status, data));
  } finally { f.restore(); }
});

Deno.test("prompts Studio — affiche avec texte exact", async (t) => {
  const f = studioFixture({ actor: ACTOR });
  f.session.proposal = null; // pas de proposition en attente : « proposition_a_corriger » reste vide
  try {
    const product = { id: id(70), photo_id: id(71), path: "product", role: "style", name: "Bol" };
    const ambience = { id: id(72), photo_id: id(73), path: "ambience", role: "product", name: "Atelier" };
    f.session.references = [product, ambience];
    f.setIntents({ operation: "product",
      summary: "Affiche portrait du bol dans l'atelier, avec le titre Atelier Céramique et la date 12 décembre.",
      product_placement: "Le bol repose sur son fond, ouverture vers le haut, sur la table de l'atelier.",
      image_prompt: "Scene: portrait poster of the bowl resting base-down on the workshop table. Text: Atelier Céramique, 12 décembre.",
      exact_text: ["Atelier Céramique", "12 décembre"],
      reference_use: [{ id: product.id, role: "product" }, { id: ambience.id, role: "style" }], requires_real_subject: true });
    const { status, data } = await f.send({ ...base, request_id: id(74), reference_ids: [product.id, ambience.id],
      message: "Une affiche avec mon bol et l'atelier, titre Atelier Céramique, date 12 décembre" });
    assertEquals(status, 200);
    // deno-lint-ignore no-explicit-any
    assertEquals((data.session as any).proposal.exact_text, ["Atelier Céramique", "12 décembre"]);
    await assertSnapshot(t, turnDoc(f, status, data));
  } finally { f.restore(); }
});

Deno.test("prompts Studio — mannequin de la mémoire (seconde passe de vision)", async (t) => {
  const f = studioFixture({ actor: ACTOR });
  f.session.proposal = null; // pas de proposition en attente : « proposition_a_corriger » reste vide
  try {
    f.memories.push(
      { id: id(80), kind: "casting", name: "Nora", note: "Identité Nora, bague gauche", revision: 1, references: [{ id: id(81), path: "nora.jpg", role: "casting" }] },
      { id: id(82), kind: "casting", name: "Iris", note: "Autre personne", revision: 1, references: [{ id: id(83), path: "iris.jpg", role: "casting" }] },
    );
    const person = { mode: "scene", name: "Nora fictive", stable_traits: "42 ans, peau brune, boucles courtes, bague argent à l'index gauche",
      variable_details: "Veste rouge, bibliothèque, lumière du jour", views: [], memory_ids: [id(80)], uses_existing_identity: true };
    f.setIntents({ operation: "create", summary: "Nora fictive en veste rouge dans la bibliothèque", image_prompt: "Nora scene", person_reference: person });
    const { status, data } = await f.send({ ...base, request_id: id(84), reference_ids: [],
      message: "Nora en veste rouge dans la bibliothèque" });
    assertEquals(status, 200);
    assertEquals(f.payloads.length, 2);
    await assertSnapshot(t, turnDoc(f, status, data));
  } finally { f.restore(); }
});
