import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  collectTextSlots,
  enforceAudienceAddressInFields,
  enforceAudienceAddressInJsonText,
  enforceAudienceAddressInText,
  joinTextSlots,
  splitTextSlots,
} from "./audience-address-fields.ts";
import type { AudienceAddressPass } from "./audience-address.ts";
import { storiesAddressLines, storiesBrief } from "./format-briefs.ts";

// Tu ou vous partout (04/10/2026) : le contrôle par le code, déjà branché sur
// le carrousel et un chemin LinkedIn, s'applique aux sorties structurées des
// autres formats (stories, newsletter, épingles, légendes…).

/** Fausse passe « au vous » : remplace des tournures connues, compte ses appels. */
function fakeVousPass(): { pass: AudienceAddressPass; calls: () => number } {
  let n = 0;
  const pass: AudienceAddressPass = async (content) => {
    n++;
    return content
      .replace(/\bTu as\b/g, "Vous avez").replace(/\btu as\b/g, "vous avez")
      .replace(/\bTon\b/g, "Votre").replace(/\bton\b/g, "votre")
      .replace(/\bTa\b/g, "Votre").replace(/\bta\b/g, "votre")
      .replace(/\bTes\b/g, "Vos").replace(/\btes\b/g, "vos")
      .replace(/\bTU AS\b/g, "VOUS AVEZ").replace(/\bTON\b/g, "VOTRE");
  };
  return { pass, calls: () => n };
}

Deno.test("chemins : champ simple, tableaux, clé joker et toutes les chaînes", () => {
  const doc = {
    content: "a",
    caption: { text: "b", hashtags: ["#x"] },
    stories: [{ text: "c", tip: "conseil", visual: { title_pill: "d" } }, { text: "e", visual: null }],
    hooks: ["f", "g"],
    versions: { linkedin: { full_text: "h" }, instagram: { full_text: "i" } },
    pin: [{ title: "j", description: "k" }],
  };
  const read = (paths: string[]) => collectTextSlots(doc, paths).map((s) => s.get());
  assertEquals(read(["content", "caption.text"]), ["a", "b"]);
  assertEquals(read(["stories[].text", "stories[].visual.title_pill"]), ["c", "e", "d"]);
  assertEquals(read(["hooks[]"]), ["f", "g"]);
  assertEquals(read(["versions.*.full_text"]), ["h", "i"]);
  assertEquals(read(["pin.**"]), ["j", "k"]);
  assertEquals(read(["absent", "stories[].absent", "content", "content"]), ["a"]);
});

Deno.test("bloc balisé : aller-retour, marqueur perdu, doublé ou champ vidé → refus", () => {
  const block = joinTextSlots(["Un", "Deux\nlignes", "Trois"]);
  assertEquals(splitTextSlots(block, 3), ["Un", "Deux\nlignes", "Trois"]);
  assertEquals(splitTextSlots(block.replace("[T2]\n", ""), 3), null);
  assertEquals(splitTextSlots(block.replace("[T3]", "[T2]"), 3), null);
  assertEquals(splitTextSlots(block.replace("Trois", ""), 3), null);
  assertEquals(splitTextSlots("préambule\n" + block, 3), null);
});

Deno.test("stories au vous : texte, petit titre et sticker corrigés, le conseil à l'utilisatrice intact", async () => {
  const seq = {
    stories: [
      { text: "Tu as 3 minutes ? Regarde ça.", tip: "Filme-toi en lumière du jour, tu verras.", visual: { title_pill: "Ton rituel du matin" } },
      { text: "Je teste depuis 2 ans.", sticker: { type: "question", label: "Et ta routine ?", options: ["Oui", "Non"] } },
    ],
  };
  const { pass, calls } = fakeVousPass();
  const receipt = await enforceAudienceAddressInFields(seq, ["stories[].text", "stories[].visual.title_pill", "stories[].sticker.label", "stories[].sticker.options[]"], "vous", { pass });
  assertEquals(calls(), 1);
  assertEquals(receipt?.applied, true);
  assertEquals(seq.stories[0].text, "Vous avez 3 minutes ? Regarde ça.");
  assertEquals(seq.stories[0].visual?.title_pill, "Votre rituel du matin");
  assertEquals(seq.stories[1].sticker?.label, "Et votre routine ?");
  assertEquals(seq.stories[1].text, "Je teste depuis 2 ans.");
  // L'appli tutoie l'utilisatrice : ses conseils ne sont pas réécrits.
  assertEquals(seq.stories[0].tip, "Filme-toi en lumière du jour, tu verras.");
});

Deno.test("sans réglage ou texte conforme : aucun appel, rien ne change", async () => {
  const { pass, calls } = fakeVousPass();
  const doc = { content: "Tu as raison." };
  assertEquals(await enforceAudienceAddressInFields(doc, ["content"], null, { pass }), null);
  assertEquals(doc.content, "Tu as raison.");
  const ok = { content: "Vous avez raison, et votre temps compte." };
  const r = await enforceAudienceAddressInFields(ok, ["content"], "vous", { pass });
  assertEquals(r?.reason, "conforme");
  assertEquals(calls(), 0);
});

Deno.test("passe qui perd un marqueur ou touche un chiffre : sortie inchangée", async () => {
  const doc = { subject: "Ton objet", content: "Tu as 12 jours pour agir." };
  const before = JSON.stringify(doc);
  const dropMarker: AudienceAddressPass = async (c) => c.replace("[T2]\n", "").replace(/Ton/g, "Votre").replace("Tu as", "Vous avez");
  await enforceAudienceAddressInFields(doc, ["subject", "content"], "vous", { pass: dropMarker });
  assertEquals(JSON.stringify(doc), before);
  const changeDigit: AudienceAddressPass = async (c) => c.replace(/Ton/g, "Votre").replace("Tu as 12", "Vous avez 15");
  const r = await enforceAudienceAddressInFields(doc, ["subject", "content"], "vous", { pass: changeDigit });
  assertEquals(r?.reason, "refus_chiffre");
  assertEquals(JSON.stringify(doc), before);
});

Deno.test("marque qui tutoie : « vous » corrigé, « vous » de groupe gardé", async () => {
  const doc = { content: "Beaucoup d'entre vous me l'ont demandé. Vous avez le droit de dire non." };
  const pass: AudienceAddressPass = async (c) => c.replace("Vous avez le droit", "Tu as le droit");
  const r = await enforceAudienceAddressInFields(doc, ["content"], "tu", { pass });
  assertEquals(r?.wrong_before, 1);
  assertEquals(doc.content, "Beaucoup d'entre vous me l'ont demandé. Tu as le droit de dire non.");
});

Deno.test("JSON en texte (flux, réponses brutes) : réécrit seulement si un champ change", async () => {
  const { pass } = fakeVousPass();
  const raw = '```json\n{"content":"Tu as tout compris.","accroche":"Tu as tout compris.","format":"post"}\n```';
  const out = await enforceAudienceAddressInJsonText(raw, ["content", "accroche"], "vous", { pass });
  assertEquals(JSON.parse(out!), { content: "Vous avez tout compris.", accroche: "Vous avez tout compris.", format: "post" });
  assertEquals(await enforceAudienceAddressInJsonText('{"content":"Vous avez tout compris."}', ["content"], "vous", { pass }), undefined);
  assertEquals(await enforceAudienceAddressInJsonText("pas du json", ["content"], "vous", { pass }), undefined);
  // Épingles (tableau à la racine) : toutes les chaînes.
  const pins = await enforceAudienceAddressInJsonText('[{"title":"Ton salon bohème","description":"Tes idées déco."}]', ["**"], "vous", { pass });
  assertEquals(JSON.parse(pins!), [{ title: "Votre salon bohème", description: "Vos idées déco." }]);
});

Deno.test("texte brut : espaces de début et de fin conservés", async () => {
  const { pass } = fakeVousPass();
  assertEquals(await enforceAudienceAddressInText("\nTu as raison.\n\n#ceramique", "vous", { pass }), "\nVous avez raison.\n\n#ceramique");
});

Deno.test("stories : sans réglage, consignes d'adresse identiques ; avec réglage, plus de forme imposée", () => {
  const legacy = storiesBrief({});
  assert(legacy.includes(`Le "TU" n'arrive que dans les moments d'interpellation directe`));
  assert(legacy.includes(`Le hook par défaut est en "JE" ou en "VOUS inclusif"`));
  for (const addr of ["tu", "vous"] as const) {
    const brief = storiesBrief({ audienceAddress: addr });
    assert(!brief.includes(`"VOUS" inclusif`), addr);
    assert(!brief.includes(`Le "TU" n'arrive que`), addr);
    assert(!brief.includes(`"VOUS inclusif"`), addr);
    assert(!brief.includes(`le "VOUS/TU" n'intervient`), addr);
    assert(brief.includes(storiesAddressLines(addr).hook), addr);
  }
  assert(storiesBrief({ audienceAddress: "vous" }).includes(`"VOUS" (vouvoiement)`));
  assert(storiesBrief({ audienceAddress: "tu" }).includes(`"TU" (tutoiement)`));
});
