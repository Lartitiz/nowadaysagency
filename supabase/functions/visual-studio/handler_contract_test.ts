// Contrat du HANDLER du Studio (lot 0 de la fiche 5,
// docs/robustesse/gros-fichiers.md), posé AVANT tout découpage de index.ts,
// sur le modèle du lot 3 de creative-flow (docs/creation-contenu/CARTE.md).
//
// Pour chacune des 16 actions, une vraie requête passe dans
// handleStudioRequest (Supabase, Claude et les fournisseurs d'images
// simulés par contract_harness.ts). On fige :
//   - le statut et les clés de la réponse ;
//   - la liste ORDONNÉE des requêtes (tables lues ou écrites, fonctions SQL,
//     stockage, fournisseurs) et les arguments des fonctions SQL ;
//   - la session telle qu'enregistrée en base après l'action.
// Les identifiants aléatoires deviennent <uuid-N> et les dates <date>.
//
// Les références ont été générées sur le code AVANT le découpage. Après un
// déplacement de code, un snapshot qui change = régression : corrige le code,
// ne régénère pas. Changement VOULU : régénère et relis le diff du .snap.
//   deno test --no-check --no-lock --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/visual-studio/handler_contract_test.ts -- --update
//
// Les tests sans snapshot en fin de fichier figent trois règles précises :
// la traduction des erreurs, les rôles modifiés EN PLACE sur les références,
// et l'ordre du quota dans `generate` (aucun claim ni appel fournisseur sur un
// refus). Rappel : les crédits du Studio passent volontairement par les
// fonctions SQL studio_confirm_generation / studio_complete_generation, pas
// par logUsage.

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { id, PROPOSAL, SESSION, SPACE, stable, studioFixture, type StudioFixture } from "./contract_harness.ts";

const ACTOR = id(11);
const base = { studio_version: 4, session_id: SESSION, workspace_id: SPACE };
const OLD = "2026-01-01T00:00:00.000Z"; // assez ancien pour le rattrapage (> 20 min)

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

function contractDoc(f: StudioFixture, status: number, data: Row) {
  const lines = [`── STATUT ${status}`, `── RÉPONSE : clés ${JSON.stringify(Object.keys(data))}`];
  if (data.session) lines.push(`session : clés ${JSON.stringify(Object.keys(data.session))}`);
  if (data.error) lines.push(`erreur : ${data.error}${data.code ? ` (code ${data.code})` : ""}`);
  if (data.versions) lines.push(`versions : ${JSON.stringify(data.versions.map((v: Row) => [v.id, v.status, v.url]))}`);
  for (const key of ["photo_id", "composition", "quota", "generative_allowed", "writable", "charter_references", "suggested_photos", "composition_history", "version_names", "current_names"]) {
    if (key in data) lines.push(`${key} : ${JSON.stringify(data[key])}`);
  }
  if (data.styles) lines.push(`styles : ${data.styles.length} presets (${data.styles.map((s: Row) => s.name).join(", ")})`);
  lines.push(`── REQUÊTES (${f.requests.length})`, ...f.requests);
  const rpc = Object.entries(f.rpcBodies).filter(([name]) => name !== "has_role");
  lines.push(`── FONCTIONS SQL (hors has_role)`, ...(rpc.length ? rpc.map(([name, calls]) => `${name} : ${JSON.stringify(calls)}`) : ["(aucune)"]));
  lines.push(`── APPELS À CLAUDE : ${f.payloads.length}${f.payloads.length ? ` (${f.payloads.map((p) => p.model).join(", ")})` : ""}`);
  lines.push(`── VERSIONS EN BASE`, JSON.stringify(f.versions.map((v) => ({ id: v.id, status: v.status, error_message: v.error_message })), null, 1));
  lines.push(`── SESSION ENREGISTRÉE`, JSON.stringify(f.session, null, 1));
  return stable(lines.join("\n"));
}

type Case = { name: string; setup?: (f: StudioFixture) => void; body: Row; fixture?: Partial<Parameters<typeof studioFixture>[0]> };
const photo = { id: id(5), name: "Bol bleu", kind: "product", description: "Bol en céramique bleu cobalt", storage_path: `${ACTOR}/bol.jpg`, status: "ready" };
const plate = { id: id(40), photo_id: id(41), path: `${SPACE}/${SESSION}/reference-plate`, role: "product", role_source: "user", name: "Assiette" };
const mood = { id: id(42), photo_id: id(43), path: `${SPACE}/${SESSION}/reference-mood`, role: "auto", role_source: "library", name: "Ambiance" };

const CASES: Case[] = [
  { name: "create — nouvelle session depuis une photo (copie de l'original)", fixture: { noSession: true, missing: [`${SPACE}/${SESSION}/original`] },
    setup: (f) => f.photos.push(photo), body: { action: "create", photo_id: photo.id } },
  { name: "styles — presets Soul", body: { action: "styles" } },
  { name: "read — lecture simple", setup: (f) => { f.session.references = [plate]; }, body: { action: "read" } },
  // Rattrapage dans `read` d'images bloquées depuis plus de 20 min. Version au
  // résultat stocké : terminée (studio_complete_generation). Version au résultat
  // perdu : « uncertain », sans crédit décompté (storage-errors.ts lit la réponse
  // d'origine, que supabase-js 2.95.3 ne décode pas au téléchargement).
  { name: "read — rattrapage des versions bloquées (résultat stocké / perdu)", fixture: { missing: [`${SPACE}/${SESSION}/lost`] },
    setup: (f) => {
      Object.assign(f.version, { status: "processing", created_at: OLD });
      f.versions.push({ ...f.version, id: id(9), status: "processing", result_path: `${SPACE}/${SESSION}/lost`, created_at: OLD });
    }, body: { action: "read" } },
  { name: "message — conseil sans image", setup: (f) => { f.session.proposal = null; f.setIntents({ operation: "advise", reply: "Un fond clair.", summary: "" }); },
    body: { action: "message", revision: 0, request_id: id(30), reference_ids: [], message: "Qu'en penses-tu : fond clair ou sombre ?" } },
  { name: "message — proposition d'affiche avec texte exact",
    setup: (f) => {
      f.session.references = [plate, mood];
      f.setIntents({ operation: "product", summary: "Affiche de l'assiette, titre Marché de Noël.", product_placement: "À plat sur la table.",
        image_prompt: "Poster of the plate lying flat. Text: Marché de Noël.", exact_text: ["Marché de Noël"],
        reference_use: [{ id: plate.id, role: "product" }, { id: mood.id, role: "style" }], requires_real_subject: true });
    }, body: { action: "message", revision: 0, request_id: id(31), reference_ids: [plate.id, mood.id], message: "Une affiche avec mon assiette, titre Marché de Noël" } },
  { name: "generate — fond Photoroom confirmé (claim, génération, stockage, fin)",
    body: { action: "generate", proposal_id: PROPOSAL } , setup: (f) => { f.versions.splice(0); } },
  { name: "save — version enregistrée dans la bibliothèque (propriétaire)",
    setup: (f) => Object.assign(f.version.proposal, { original_path: `${SPACE}/${SESSION}/original` }), body: { action: "save", version_id: PROPOSAL } },
  { name: "reference — ajout d'une photo de la bibliothèque", setup: (f) => f.photos.push(photo),
    body: { action: "reference", revision: 0, photo_id: photo.id, reference_role: "product" } },
  { name: "reference — changement de rôle d'une référence jointe", setup: (f) => { f.session.references = [plate, mood]; },
    body: { action: "reference", revision: 0, reference_id: mood.id, reference_role: "style" } },
  { name: "reference — retrait", setup: (f) => { f.session.references = [plate, mood]; },
    body: { action: "reference", revision: 0, reference_id: mood.id, remove: true } },
  { name: "reference — image de la charte", fixture: { moodboard: [{ path: `${ACTOR}/charte.jpg`, name: "Charte terracotta" }] },
    body: { action: "reference", revision: 0, charter_index: 0 } },
  { name: "selection — nouvelle demande", setup: (f) => { f.session.references = [plate, mood]; f.session.messages.push({ role: "user", text: "Avant" }); },
    body: { action: "selection", revision: 0, reference_ids: [mood.id], new_request: true, viewed_version_id: PROPOSAL } },
  { name: "memory_save — nouvelle préférence de marque",
    body: { action: "memory_save", memory_id: id(60), memory_revision: 0, memory_kind: "preference", memory_name: "Lumière naturelle", memory_note: "Jamais d'effet plastique" } },
  { name: "memory_apply — mannequin joint à la session",
    setup: (f) => { f.session.references = [plate]; f.memories.push({ id: id(61), kind: "casting", name: "Nora", note: "Identité Nora", revision: 1, archived_at: null, references: [{ id: id(62), path: "nora.jpg", role: "casting", name: "Nora" }] }); },
    body: { action: "memory_apply", revision: 0, memory_id: id(61) } },
  { name: "pilot — première image d'une série",
    setup: (f) => Object.assign(f.session.proposal, { operation: "create", cost: 2, image_prompt: "Profil", change: ["Profil", "Face"], shots: [{ id: id(70), image_prompt: "Face", summary: "Face" }] }),
    body: { action: "pilot", revision: 0, proposal_id: PROPOSAL } },
  { name: "retry — nouvelle proposition depuis une version en échec",
    setup: (f) => Object.assign(f.version, { status: "failed", proposal: { id: PROPOSAL, operation: "edit", summary: "Lumière douce", image_prompt: "Soft light", input_path: "in", shots: [{ id: id(71) }], cost: 2 } }),
    body: { action: "retry", revision: 0, version_id: PROPOSAL } },
  { name: "composition_save — affiche posée sur la version affichée",
    body: { action: "composition_save", revision: 0, viewed_version_id: PROPOSAL, composition: { title: "Marché de Noël", body: "Samedi", footer: "10 h–18 h",
      format: "portrait", background: "#ffffff", foreground: "#000000", accent: "#fb3d80", font: "sans-serif", align: "left" } } },
  { name: "composition_read — composition enregistrée",
    setup: (f) => f.compositions.push({ id: id(80), session_id: SESSION, workspace_id: SPACE, design: { title: "Affiche" }, title: "Affiche", background_path: "fond.jpg", created_at: OLD }),
    body: { action: "composition_read", composition_history_id: id(80) } },
  { name: "archive", body: { action: "archive", revision: 0 } },
  { name: "restore", setup: (f) => { f.session.archived_at = OLD; }, body: { action: "restore", revision: 0 } },
];

for (const c of CASES) {
  Deno.test(`contrat Studio — ${c.name}`, async (t) => {
    const f = studioFixture({ actor: ACTOR, ...c.fixture });
    try {
      c.setup?.(f);
      const { status, data } = await f.send({ ...base, ...c.body });
      await assertSnapshot(t, contractDoc(f, status, data));
    } finally { f.restore(); }
  });
}

Deno.test("contrat Studio — les 16 actions du schéma sont couvertes", () => {
  const covered = new Set(CASES.map((c) => c.body.action));
  assertEquals([...covered].sort(), ["archive", "composition_read", "composition_save", "create", "generate", "memory_apply", "memory_save",
    "message", "pilot", "read", "reference", "restore", "retry", "save", "selection", "styles"]);
});

// ── 3. Traduction des erreurs ────────────────────────────────────────────────
// Les erreurs internes sont reconnues par SOUS-CHAÎNE du message : un module
// déplacé doit lancer exactement les mêmes chaînes, sinon 409 devient 503.
const KNOWN: [string, string][] = [
  ["studio_soul_style_unavailable", "Ce preset Soul n’est plus disponible. Modifie ta demande ou choisis sans preset."],
  ["studio_soul_prompt_missing", "La consigne photographique est incomplète. Modifie ta demande avant de générer."],
  ["studio_integration_sources", "Chaque personne et produit doit être associé à ses originaux. Reprécise les références avant l’intégration."],
  ["studio_reference_limit", "Garde jusqu’à huit références. Retire une référence avant d’ajouter cette direction."],
  ["studio_image_too_large", "Cette photo dépasse 5 Mo. Ajoute une version plus légère pour que le Studio puisse l’examiner."],
  ["studio_interpretation_limit", "Tu as envoyé beaucoup de demandes. Réessaie un peu plus tard."],
  ["studio_memory_limit", "La marque conserve déjà 100 éléments. Retire une ancienne préférence pour en ajouter une."],
  ["studio_casting_source", "Choisis une image de mannequin fictif. Une photo de personne réelle ne devient pas un mannequin fictif."],
  ["studio_busy", "Une image est déjà en cours dans cet espace. Reprends sa session."],
  ["studio_quota", "Le quota a changé. Recharge la session."],
  ["studio_proposal_changed", "Cette proposition a changé. Vérifie la dernière demande."],
  ["studio_conflict", "La session a changé. Recharge-la."],
  ["studio_archived", "Cette session est archivée. Restaure-la pour continuer."],
];
const UNAVAILABLE = "Le Studio est momentanément indisponible. Ta demande reste conservée ; réessaie.";

Deno.test("erreurs Studio — code interne → statut + message", async () => {
  const cases: [string, number, string][] = [
    ...KNOWN.map(([code, message]) => [code, 409, message] as [string, number, string]),
    // Reconnu au milieu d'un message plus long (erreur PostgreSQL relayée).
    ["P0001: studio_conflict (revision 3)", 409, "La session a changé. Recharge-la."],
    ["Intégration à préciser : quelle photo montre le produit ?", 503, "Intégration à préciser : quelle photo montre le produit ?"],
    ["connection reset by peer", 503, UNAVAILABLE],
  ];
  for (const [code, status, message] of cases) {
    const f = studioFixture({ actor: id(12) });
    try {
      f.failRpc("studio_set_session_archived", code);
      const res = await f.send({ ...base, action: "archive", revision: 0 });
      assertEquals([res.status, res.data.error], [status, message], code);
    } finally { f.restore(); }
  }
});

Deno.test("erreurs Studio — conflits levés par le handler lui-même", async () => {
  const f = studioFixture({ actor: id(12) });
  try {
    // Révision absente : studio_conflict lancé avant tout appel SQL d'archivage.
    let res = await f.send({ ...base, action: "archive" });
    assertEquals([res.status, res.data.error], [409, "La session a changé. Recharge-la."]);
    assertEquals(f.rpcBodies.studio_set_session_archived, undefined);
    // Session archivée : toute écriture répond studio_archived, la lecture reste possible.
    f.session.archived_at = OLD;
    res = await f.send({ ...base, action: "selection", revision: 0, reference_ids: [] });
    assertEquals([res.status, res.data.error], [409, "Cette session est archivée. Restaure-la pour continuer."]);
    assertEquals((await f.send({ ...base, action: "read" })).status, 200);
  } finally { f.restore(); }
});

// ── 4. Rôles modifiés EN PLACE ───────────────────────────────────────────────
// `ref.role = stated` modifie les objets de requestReferences, qui sont LES
// MÊMES objets que `references`. Ici la seconde photo, déclarée « mon
// produit » dans le message, est ensuite écartée de l'intégration (le produit
// exact retenu est l'assiette) : seule la modification en place la fait
// ressortir avec son rôle déclaré. Une copie des objets ({...}, structuredClone)
// au moment d'un découpage casse ce test.
Deno.test("rôles déclarés dans le message : références modifiées en place (role_source conversation)", async () => {
  const f = studioFixture({ actor: id(13) });
  try {
    const cup = { id: id(44), photo_id: id(45), path: `${SPACE}/${SESSION}/reference-cup`, role: "auto", role_source: "library", name: "Tasse" };
    // Photo de produit seul (kind « produit ») : c'est elle qui fait foi pour l'intégration.
    const scenePlate = { ...plate, kind: "produit" };
    Object.assign(f.version.proposal, { operation: "create", provider: "higgsfield", summary: "Scène d'été", image_prompt: "Summer table",
      scene_workflow: { phase: "scene", camera_match: "Vue de haut" }, planning_references: [scenePlate], reference_snapshot: [] });
    f.session.proposal = null;
    f.session.references = [scenePlate, cup];
    f.setIntents({ operation: "product", visual_kind: "photo", uses_selected_version: true,
      scene_workflow: { phase: "integration", camera_match: "Conserver la vue", targets: [{ role: "product", reference_ids: [plate.id],
        location: "Au centre de la table", instruction: "Poser l'assiette à plat" }] }, product_placement: "À plat au centre.",
      summary: "Intégrer l'assiette dans la scène.", image_prompt: "Insert the original plate.", reference_use: [{ id: plate.id, role: "product" }] });
    const { status, data } = await f.send({ ...base, action: "message", revision: 0, request_id: id(46), viewed_version_id: PROPOSAL,
      reference_ids: [plate.id, cup.id], message: "Intègre mon assiette dans cette scène ; image 2 est mon produit aussi" });
    assertEquals(status, 200);
    const saved = (f.session.references as Row[]).find((ref) => ref.id === cup.id)!;
    assertEquals([saved.role, saved.role_source, saved.role_explicit], ["product", "conversation", true]);
    // La tasse n'est pas partie à la génération : elle ne doit son rôle qu'à la modification en place.
    assertEquals((data.session.proposal?.references ?? []).some((ref: Row) => ref.id === cup.id), false);
    assertEquals(f.session.messages.at(-2).reference_snapshot.some((ref: Row) => ref.id === cup.id), false);
  } finally { f.restore(); }
});

// ── 5. Ordre du quota dans `generate` ────────────────────────────────────────
// checkQuota → contrôle Premium → prompt trop long → studio_confirm_generation.
// Un refus ne déclenche ni claim ni appel fournisseur.
const PROVIDERS = /image-api\.photoroom\.com|api\.openai\.com|higgsfield/;
const editProposal = { id: PROPOSAL, operation: "edit", visual_kind: "graphic", provider: "default", model: "gpt-image-2.5-sunburst",
  summary: "Lumière douce", image_prompt: "Soft light", input_path: `${SPACE}/${SESSION}/version`, references: [], cost: 1 };

Deno.test("quota generate — refus Premium (plan gratuit, création) : ni claim ni fournisseur", async () => {
  const f = studioFixture({ actor: id(14), plan: "free" });
  try {
    f.session.proposal = { ...editProposal };
    f.versions.splice(0);
    const res = await f.send({ ...base, action: "generate", proposal_id: PROPOSAL });
    assertEquals([res.status, res.data.error], [403, "Cette création est disponible en Premium. Rien n’a été décompté."]);
    assertEquals(f.rpcBodies.studio_confirm_generation, undefined);
    assertEquals(f.requests.some((r) => PROVIDERS.test(r)), false);
    assert(f.requests.includes("POST /rest/v1/rpc/has_role"), "le quota est bien lu");
  } finally { f.restore(); }
});

Deno.test("quota generate — images épuisées (gratuit 5/5, Premium 30/30) : ni claim ni fournisseur", async () => {
  for (const [plan, imagesUsed, proposal] of [["free", 5, null], ["outil", 30, editProposal]] as const) {
    const f = studioFixture({ actor: id(15), plan, imagesUsed });
    try {
      if (proposal) f.session.proposal = { ...proposal };
      f.versions.splice(0);
      const res = await f.send({ ...base, action: "generate", proposal_id: PROPOSAL });
      assertEquals(res.status, 429, plan);
      assertEquals([res.data.error, res.data.category], ["limit_reached", "category"], plan);
      assertEquals(f.rpcBodies.studio_confirm_generation, undefined);
      assertEquals(f.requests.some((r) => PROVIDERS.test(r)), false);
    } finally { f.restore(); }
  }
});

Deno.test("quota generate — succès : un seul claim, avant l'appel fournisseur", async () => {
  const f = studioFixture({ actor: id(16) });
  try {
    f.versions.splice(0);
    const res = await f.send({ ...base, action: "generate", proposal_id: PROPOSAL });
    assertEquals(res.status, 200);
    assertEquals(f.rpcBodies.studio_confirm_generation?.length, 1);
    const claim = f.requests.indexOf("POST /rest/v1/rpc/studio_confirm_generation");
    const quota = f.requests.indexOf("POST /rest/v1/rpc/has_role");
    const provider = f.requests.findIndex((r) => PROVIDERS.test(r));
    assert(quota >= 0 && quota < claim && claim < provider, f.requests.join("\n"));
    assertEquals(f.rpcBodies.studio_complete_generation?.length, 1);
    // Rejouer la même confirmation ne refait ni claim ni appel fournisseur.
    const before = f.requests.length;
    assertEquals((await f.send({ ...base, action: "generate", proposal_id: PROPOSAL })).status, 200);
    assertEquals(f.rpcBodies.studio_confirm_generation.length, 1);
    assertEquals(f.requests.slice(before).some((r) => PROVIDERS.test(r)), false);
  } finally { f.restore(); }
});

// ── 4 bis. Ajouts EN PLACE à requestReferences (lot 8) ──────────────────────
// Le mannequin repris de la mémoire est AJOUTÉ au tableau requestReferences
// par les règles du tour (turn/guardrails.ts), puis ce même tableau donne les
// reference_ids du message et du contexte enregistrés (turn/proposal.ts). Une
// copie du tableau entre les deux ferait disparaître le mannequin de ces
// listes sans changer la proposition : ce test le fige.
Deno.test("mannequin de la mémoire : ajouté aux références de la demande enregistrées", async () => {
  const f = studioFixture({ actor: id(17) });
  try {
    f.session.proposal = null;
    f.memories.push({ id: id(90), kind: "casting", name: "Nora", note: "Identité Nora", revision: 1, references: [{ id: id(91), path: "nora.jpg", role: "casting" }] });
    f.setIntents({ operation: "create", summary: "Nora en veste rouge", image_prompt: "Nora scene",
      person_reference: { mode: "scene", name: "Nora", stable_traits: "Boucles courtes", variable_details: "Veste rouge", views: [], memory_ids: [id(90)], uses_existing_identity: true } });
    const { status } = await f.send({ ...base, action: "message", revision: 0, request_id: id(92), reference_ids: [], message: "Nora en veste rouge" });
    assertEquals(status, 200);
    assertEquals(f.session.messages.at(-2).reference_ids, [id(91)]);
    assertEquals(f.session.source_metadata.studio_context.reference_ids, [id(91)]);
    assertEquals(f.session.references.map((ref: Row) => ref.id), [id(91)]);
  } finally { f.restore(); }
});
