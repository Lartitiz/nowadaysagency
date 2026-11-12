// « Tes photos en fond » : texte court et un seul narrateur (test LinkedIn
// d'Auriana du 12/11/2026 : 40 à 50 mots sur les slides 2 à 4, « nous » en
// slide 2 puis « je » en slide 3).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-ai/photo-narrative_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  narratorCounts, narratorFromBrand, PHOTO_OVERLAY_LENGTH, PHOTO_OVERLAY_RECIT_LENGTH, photoNarratorCheck, photoNarratorIssues,
  photoNarratorRule, photoOverlayIssues, photoOverlayLongPassages,
} from "./photo-narrative.ts";
import { createContinuousNarrative } from "./continuous-narrative.ts";
import { buildMixCarouselPrompt, buildPhotoCarouselPrompt } from "./prompts.ts";

const PHOTO = { carousel_type: "photo", channel: "linkedin" };
const words = (n: number) => Array.from({ length: n }, () => "mot").join(" ");

Deno.test("photo : plafond de 30 mots dans les deux prompts, absent du mixte et des photos brutes", () => {
  assert(buildPhotoCarouselPrompt(PHOTO, true).includes(PHOTO_OVERLAY_LENGTH));
  assert(buildPhotoCarouselPrompt({ carousel_type: "photo" }, false).includes(PHOTO_OVERLAY_LENGTH), "Instagram aussi : la promesse de l'écran ne dépend pas du canal");
  assert(!buildPhotoCarouselPrompt({ ...PHOTO, photos_only: true }, true).includes(PHOTO_OVERLAY_LENGTH));
  assert(!buildMixCarouselPrompt({ carousel_type: "mix", channel: "linkedin" }, true).includes("TES PHOTOS EN FOND"));
});

Deno.test("photo : mesure des passages et des slides trop longs (couverture exclue), rien hors photo", () => {
  assertEquals(photoOverlayLongPassages([words(40), words(41), ""], PHOTO), [2]);
  assertEquals(photoOverlayLongPassages([words(41)], { carousel_type: "mix", channel: "linkedin" }), []);
  assertEquals(photoOverlayLongPassages([words(41)], { ...PHOTO, photos_only: true }), []);
  const slides = [{ slide_number: 1, overlay_text: words(60) }, { slide_number: 2, overlay_text: words(30), kicker: words(5), detail: words(6) }, { slide_number: 3, overlay_text: words(20) }];
  const issues = photoOverlayIssues({ slides }, PHOTO);
  assertEquals(issues.length, 1);
  assert(issues[0].startsWith("La slide 2 porte trop de texte sur sa photo (41 mots, 30 au plus)"));
  assert(!/est trop longue/.test(issues[0]), "pas de découpe en deux slides");
});

Deno.test("narrateur : je / nous comptés hors citations", () => {
  assertEquals(narratorCounts("J'ai rénové mon salon. « Nous adorons », dit la cliente."), { je: 2, nous: 0 });
  assertEquals(narratorCounts("Chez nous, notre équipe et nos clients."), { je: 0, nous: 3 });
  assertEquals(narratorCounts("Vous choisissez votre style."), { je: 0, nous: 0 });
});

Deno.test("narrateur : la fiche de marque décide quand elle est nette, sinon la 1re slide", () => {
  assertEquals(narratorFromBrand("Je rénove des appartements. J'aime la lumière. Je travaille seule. Mon atelier."), "je");
  assertEquals(narratorFromBrand("Nous rénovons. Notre équipe. Nos chantiers."), "nous");
  assertEquals(narratorFromBrand("Je rénove. Nous livrons."), null);
  const passages = ["Rénover un T3", "Nous avons repris la cuisine.", "J'ai choisi un bois clair."];
  assertEquals(photoNarratorCheck(passages, PHOTO), { target: "nous", offenders: [3] });
  assertEquals(photoNarratorCheck(passages, PHOTO, "Je rénove. J'aime. Je travaille. Mon atelier."), { target: "je", offenders: [2] });
  assertEquals(photoNarratorCheck(["Je rénove.", "Je choisis."], PHOTO), null);
  assertEquals(photoNarratorCheck(passages, { carousel_type: "mix" }), null);
  const issues = photoNarratorIssues({ slides: passages.map((overlay_text, i) => ({ slide_number: i + 1, overlay_text })) }, PHOTO);
  assertEquals(issues, ["Narrateur incohérent (slides 3). Une seule personne pour la marque : « nous » (et « notre », « nos ») du début à la fin, sans changer le sens."]);
});

Deno.test("narrateur : consigne posée en photo (celle de la fiche si nette), rien en mixte", () => {
  assert(photoNarratorRule(PHOTO).startsWith("NARRATEUR : choisis UNE personne"));
  assert(photoNarratorRule(PHOTO, "Nous rénovons. Notre équipe. Nos chantiers.").includes("« nous » (et « notre », « nos »), comme dans sa fiche"));
  assertEquals(photoNarratorRule({ carousel_type: "mix" }), "");
});

const original = {
  idea: "Un T3 rénové sans exploser le budget",
  hook: "Rénover un T3 sans tout casser",
  paragraphs: ["Nous avons gardé les murs porteurs.", "Nous avons ouvert la cuisine sur le salon.", "Nous avons choisi un bois clair pour la lumière."],
  caption: { hook: "", body: "", cta: "", hashtags: [] },
};
const base = {
  body: { carousel_type: "photo", channel: "linkedin", scenario_origin: "automatic", slide_count: 4, photo_contexts: [{ context: "Salon rénové" }] },
  brandingContext: "Rénovation d'appartements.",
  photoContext: "Salon rénové",
  newsContext: "",
  authoredText: "",
  startedAt: Date.now(),
  usage: {},
  emitStatus: () => {},
};

Deno.test("récit continu photo : consignes de longueur et de narrateur dans le système", async () => {
  let system = "";
  await createContinuousNarrative({ ...base, write: async (o) => { system ||= o.system || ""; return JSON.stringify(original); } });
  assert(system.includes(PHOTO_OVERLAY_RECIT_LENGTH));
  assert(system.includes("NARRATEUR : choisis UNE personne"));
});

Deno.test("récit continu photo : trop long et « nous » puis « je » → UNE réécriture, gardée si elle fait mieux", async () => {
  const bad = { ...original, paragraphs: [`Nous avons gardé les murs porteurs, ${words(40)}.`, "J'ai ouvert la cuisine sur le salon.", original.paragraphs[2]] };
  const feedbacks: string[] = [];
  let writes = 0;
  const result = await createContinuousNarrative({
    ...base,
    write: async (o) => {
      writes++;
      const sent = JSON.parse((o.messages[0].content as any)[0].text);
      if (sent.feedback) feedbacks.push(sent.feedback);
      return JSON.stringify(writes === 1 ? bad : original);
    },
  });
  assertEquals(writes, 2);
  assert(feedbacks[0].includes("Paragraphes trop longs pour être posés sur une photo : 1."), feedbacks[0]);
  assert(feedbacks[0].includes("Narrateur incohérent (passages 3"), feedbacks[0]);
  assert(feedbacks[0].includes("« nous »"), feedbacks[0]);
  const texts = result!.doc.slides.map((s: any) => s.overlay_text || "").join(" ");
  assert(!/J'ai/.test(texts));
});

Deno.test("récit continu photo : réécriture qui aggrave → texte d'origine gardé", async () => {
  const bad = { ...original, paragraphs: ["Nous avons gardé les murs porteurs.", "J'ai ouvert la cuisine sur le salon.", original.paragraphs[2]] };
  const worse = { ...bad, paragraphs: ["J'ai gardé les murs.", "J'ai ouvert la cuisine.", `Nous avons choisi un bois clair, ${words(45)}.`] };
  let writes = 0;
  const result = await createContinuousNarrative({ ...base, write: async () => JSON.stringify(++writes === 1 ? bad : worse) });
  assertEquals(writes, 2);
  assert(result!.doc.slides.some((s: any) => (s.overlay_text || "").includes("J'ai ouvert la cuisine sur le salon.")));
});

Deno.test("récit continu photo : texte court et un seul narrateur → aucune réécriture", async () => {
  let writes = 0;
  await createContinuousNarrative({ ...base, write: async () => { writes++; return JSON.stringify(original); } });
  assertEquals(writes, 1);
});
