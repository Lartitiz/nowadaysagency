// Tests de la garde de fidélité de la passe de correction (audit photo 22/07).
// Le round-trip extraction → réécriture Haiku → réinjection pouvait recoller des
// mots (« je l'aitrouvé commeça ») : keepUnlessRealEdit rejette toute
// « correction » qui ne diffère de l'original que par des espaces.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { keepUnlessRealEdit } from "./correction-pass.ts";

Deno.test("keepUnlessRealEdit : espaces avalés → original conservé", () => {
  const original = "je l'ai trouvé comme ça";
  const corrupted = "je l'aitrouvé commeça";
  assertEquals(keepUnlessRealEdit(original, corrupted), original);
});

Deno.test("keepUnlessRealEdit : espaces ajoutés/doublés seulement → original conservé", () => {
  const original = "une phrase normale";
  assertEquals(keepUnlessRealEdit(original, "une  phrase  normale"), original);
});

Deno.test("keepUnlessRealEdit : vraie correction (mots changés) → correction gardée", () => {
  const original = "Le bruit du silence invisible";
  const corrected = "Le vacarme de l'atelier au petit matin";
  assertEquals(keepUnlessRealEdit(original, corrected), corrected);
});

Deno.test("keepUnlessRealEdit : original absent → correction gardée", () => {
  assertEquals(keepUnlessRealEdit(undefined, "texte corrigé"), "texte corrigé");
  assertEquals(keepUnlessRealEdit("", "texte corrigé"), "texte corrigé");
});

Deno.test("keepUnlessRealEdit : correction identique → inchangé", () => {
  assertEquals(keepUnlessRealEdit("pareil", "pareil"), "pareil");
});

// ═══ Stories : extraction annotée + réinjection story par story (audit stories 07/09/2026) ═══
import { extractStoriesTexts, reinjectStoriesTexts } from "./correction-pass.ts";

const STORIES_FIXTURE = [
  { number: 1, text: "Un truc qui me fatigue dans le savon fait main : personne ne parle du vrai prix.", visual: { gabarit: "photo_pills", title_pill: "UN TRUC QUI ME FATIGUE", body_pill: "Dans le savon fait main, personne ne parle du vrai prix.", list_pills: null, quote: null } },
  { number: 2, text: "Le vrai coût, c'est les huiles choisies pour leur douceur.", visual: { gabarit: "liste", title_pill: "CE QUE PERSONNE NE CALCULE", body_pill: null, list_pills: ["Des huiles choisies pour la douceur", "Des semaines de séchage"], quote: null } },
  { number: 3, text: "Paroles face cam, pas de visuel.", visual: null, face_cam: true },
];

Deno.test("extractStoriesTexts : texte + pastilles annotés, une ligne par champ, face cam sans visuel = texte seul", () => {
  const block = extractStoriesTexts(STORIES_FIXTURE);
  const lines = block.split("\n");
  assertEquals(lines[0], "[STORY 1 - TEXT] Un truc qui me fatigue dans le savon fait main : personne ne parle du vrai prix.");
  assertEquals(lines[1], "[STORY 1 - TITLE] UN TRUC QUI ME FATIGUE");
  assertEquals(lines[2], "[STORY 1 - BODY] Dans le savon fait main, personne ne parle du vrai prix.");
  assertEquals(lines.includes("[STORY 2 - ITEM 1] Des huiles choisies pour la douceur"), true);
  assertEquals(lines.includes("[STORY 2 - ITEM 2] Des semaines de séchage"), true);
  assertEquals(lines[lines.length - 1], "[STORY 3 - TEXT] Paroles face cam, pas de visuel.");
  assertEquals(lines.length, 8);
});

Deno.test("reinjectStoriesTexts : les champs corrigés sont remplacés, les absents gardés, l'original jamais muté", () => {
  const corrected = [
    "[STORY 1 - TEXT] Vingt-quatre euros les trois savons, et personne ne dit ce qu'il y a derrière ce prix.",
    "[STORY 1 - TITLE] LE PRIX QU'ON NE DIT PAS",
    "[STORY 2 - ITEM 2] Six semaines de séchage sans rien produire",
  ].join("\n");
  const { stories, changed } = reinjectStoriesTexts(STORIES_FIXTURE, corrected);
  assertEquals(changed, 3);
  assertEquals(stories[0].text.startsWith("Vingt-quatre euros"), true);
  assertEquals(stories[0].visual.title_pill, "LE PRIX QU'ON NE DIT PAS");
  assertEquals(stories[0].visual.body_pill, STORIES_FIXTURE[0].visual!.body_pill); // absent du bloc → gardé
  assertEquals(stories[1].visual.list_pills[0], "Des huiles choisies pour la douceur");
  assertEquals(stories[1].visual.list_pills[1], "Six semaines de séchage sans rien produire");
  assertEquals(stories[2].text, "Paroles face cam, pas de visuel.");
  // Original intact
  assertEquals(STORIES_FIXTURE[0].visual!.title_pill, "UN TRUC QUI ME FATIGUE");
});

Deno.test("reinjectStoriesTexts : une pastille hors gabarit (titre trop long, body > 140 car.) garde l'original", () => {
  const corrected = [
    "[STORY 1 - TITLE] Un titre beaucoup trop long pour une pastille de story Instagram affichée en capitales",
    `[STORY 1 - BODY] ${"x".repeat(160)}`,
    "[STORY 2 - ITEM 1] un item de liste vraiment beaucoup trop long pour tenir dans une pastille lisible",
  ].join("\n");
  const { stories, changed } = reinjectStoriesTexts(STORIES_FIXTURE, corrected);
  assertEquals(changed, 0);
  assertEquals(stories[0].visual.title_pill, "UN TRUC QUI ME FATIGUE");
  assertEquals(stories[1].visual.list_pills[0], "Des huiles choisies pour la douceur");
});

Deno.test("reinjectStoriesTexts : bloc sans marqueur ou espaces seulement changés → 0 changement", () => {
  assertEquals(reinjectStoriesTexts(STORIES_FIXTURE, "Version totalement réécrite sans marqueurs.").changed, 0);
  const spaces = "[STORY 1 - TEXT] Un truc qui me fatigue dans le savon fait main : personne ne parle du vrai  prix.";
  assertEquals(reinjectStoriesTexts(STORIES_FIXTURE, spaces).changed, 0);
});
