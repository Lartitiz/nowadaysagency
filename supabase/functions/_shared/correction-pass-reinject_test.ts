// reinjectCarouselTexts en direct, AVANT le découpage de correction-pass.ts
// (docs/robustesse/gros-fichiers.md, fiche 9, lot 0, point 4). Jusqu'ici, la
// fonction n'était testée qu'à travers redac-gate et hook-echoes.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/correction-pass-reinject_test.ts

import { assertEquals, assertNotStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractCarouselTexts, reinjectCarouselTexts } from "./correction-pass.ts";

Deno.test("reinjectCarouselTexts : titre de slide, repli title → hook → accroche → title", () => {
  const parsed = {
    slides: [
      { hook: "Accroche d'origine" },
      { title: "Titre d'origine", hook: "jamais touché" },
      { accroche: "Accroche d'origine 3" },
      { body: "Une slide sans titre" },
    ],
  };
  const out = reinjectCarouselTexts(parsed, [
    "[SLIDE 1 - HOOK] Nouvelle accroche",
    "[SLIDE 2 - TITLE] Nouveau titre",
    "[SLIDE 3 - TITLE] Nouvelle accroche 3",
    "[SLIDE 4 - TITLE] Titre ajouté",
  ].join("\n"));
  assertEquals(out.slides[0], { hook: "Nouvelle accroche" });
  assertEquals(out.slides[1], { title: "Nouveau titre", hook: "jamais touché" });
  assertEquals(out.slides[2], { accroche: "Nouvelle accroche 3" });
  assertEquals(out.slides[3], { body: "Une slide sans titre", title: "Titre ajouté" });
});

Deno.test("reinjectCarouselTexts : corps, repli body → text → content → body, puis punchline et overlay", () => {
  const parsed = {
    slides: [
      { title: "A", body: "corps" },
      { title: "B", text: "texte" },
      { title: "C", content: "contenu", punchline: "chute", overlay_text: "sur la photo" },
      { title: "D" },
    ],
  };
  const out = reinjectCarouselTexts(parsed, [
    "[SLIDE 1 - BODY] corps corrigé",
    "[SLIDE 2 - BODY] texte corrigé",
    "[SLIDE 3 - BODY] contenu corrigé",
    "[SLIDE 3 - PUNCHLINE] chute corrigée",
    "[SLIDE 3 - OVERLAY] photo corrigée",
    "[SLIDE 4 - BODY] corps ajouté",
  ].join("\n"));
  assertEquals(out.slides[0].body, "corps corrigé");
  assertEquals(out.slides[1], { title: "B", text: "texte corrigé" });
  assertEquals(out.slides[2], { title: "C", content: "contenu corrigé", punchline: "chute corrigée", overlay_text: "photo corrigée" });
  assertEquals(out.slides[3], { title: "D", body: "corps ajouté" });
});

Deno.test("reinjectCarouselTexts : légende objet, hashtags jamais touchés", () => {
  const parsed = { slides: [], caption: { hook: "h", body: "b", cta: "c", hashtags: ["#un", "#deux"] } };
  const out = reinjectCarouselTexts(parsed, "[CAPTION - HOOK] h2\n[CAPTION - BODY] b2\n[CAPTION - CTA] c2\n[CAPTION] ignoré");
  assertEquals(out.caption, { hook: "h2", body: "b2", cta: "c2", hashtags: ["#un", "#deux"] });
});

Deno.test("reinjectCarouselTexts : légende chaîne, et instagram_caption quand caption est absente", () => {
  assertEquals(reinjectCarouselTexts({ slides: [], caption: "ancienne" }, "[CAPTION] nouvelle").caption, "nouvelle");
  const ig = reinjectCarouselTexts({ slides: [], instagram_caption: "ancienne" }, "[CAPTION] nouvelle");
  assertEquals(ig, { slides: [], instagram_caption: "nouvelle" });
  // caption présente (même vide) : c'est elle qui est visée, instagram_caption reste.
  const both = reinjectCarouselTexts({ slides: [], caption: "", instagram_caption: "ig" }, "[CAPTION] nouvelle");
  assertEquals(both, { slides: [], caption: "nouvelle", instagram_caption: "ig" });
});

Deno.test("reinjectCarouselTexts : slides sous carousel.slides, original jamais muté", () => {
  const parsed = { carousel: { slides: [{ hook: "a" }, { title: "b", body: "c" }] } };
  const before = JSON.stringify(parsed);
  const out = reinjectCarouselTexts(parsed, "[SLIDE 1 - HOOK] a2\n[SLIDE 2 - BODY] c2");
  assertEquals(out.carousel.slides, [{ hook: "a2" }, { title: "b", body: "c2" }]);
  assertEquals(JSON.stringify(parsed), before);
  assertNotStrictEquals(out, parsed);
});

Deno.test("reinjectCarouselTexts : une « correction » qui ne change que des espaces garde l'original", () => {
  const parsed = { slides: [{ hook: "je l'ai trouvé comme ça" }], caption: { hook: "mon atelier", body: "x", cta: "y" } };
  const out = reinjectCarouselTexts(parsed, "[SLIDE 1 - HOOK] je l'aitrouvé commeça\n[CAPTION - HOOK] monatelier");
  assertEquals(out.slides[0].hook, "je l'ai trouvé comme ça");
  assertEquals(out.caption.hook, "mon atelier");
});

Deno.test("reinjectCarouselTexts : un marqueur absent laisse le champ tel quel ; aller-retour sans changement", () => {
  const parsed = {
    slides: [{ hook: "a" }, { title: "b", body: "c", punchline: "d" }, { overlay_text: "e" }],
    caption: { hook: "f", body: "g", cta: "h", hashtags: ["#i"] },
  };
  assertEquals(reinjectCarouselTexts(parsed, "[SLIDE 2 - BODY] c2").slides[1], { title: "b", body: "c2", punchline: "d" });
  assertEquals(reinjectCarouselTexts(parsed, extractCarouselTexts(parsed)), parsed);
});
