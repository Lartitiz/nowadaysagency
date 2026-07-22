// Scan déterministe carouselNeedsPolish (audit photo 22/07) : décide si la passe
// de correction Haiku doit tourner. Direction sûre : au doute → true.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { carouselNeedsPolish } from "./correction-pass.ts";

const json = (o: unknown) => JSON.stringify(o);

Deno.test("carrousel photo propre (overlays courts, pas de tic) → SKIP", () => {
  const clean = json({
    slides: [
      { slide_number: 1, overlay_text: "Ce jour-là, devant les étudiants, j'avais les mains moites." },
      { slide_number: 2, overlay_text: "On m'avait invitée à parler de mon métier de céramiste." },
      { slide_number: 3, overlay_text: "Le trac prépare le corps à donner le meilleur de lui-même." },
    ],
    caption: { hook: "J'ai longtemps cru que le trac me trahissait.", body: "En vrai, il me préparait à être juste.", cta: "Tu ressens quoi juste avant de parler en public ?" },
  });
  assertEquals(carouselNeedsPolish(clean), false);
});

Deno.test("slogan manufacturé dans un overlay → POLISH", () => {
  const slop = json({ slides: [{ slide_number: 1, overlay_text: "Quand la magie opère, tout devient simple." }] });
  assertEquals(carouselNeedsPolish(slop), true);
});

Deno.test("numérotation de conseils → POLISH", () => {
  const num = json({ slides: [{ slide_number: 1, title: "Conseil 3 : publie tous les jours", body: "Un vrai paragraphe qui développe l'idée avec un exemple concret et vécu." }] });
  assertEquals(carouselNeedsPolish(num), true);
});

Deno.test("CTA générique → POLISH", () => {
  const cta = json({ slides: [{ slide_number: 1, overlay_text: "Voilà mon histoire." }], caption: { hook: "x", body: "y", cta: "Et toi, qu'en penses-tu ?" } });
  assertEquals(carouselNeedsPolish(cta), true);
});

Deno.test("anaphores (3 phrases même 1er mot) dans un body → POLISH", () => {
  const ana = json({ slides: [{ slide_number: 1, body: "Tu sautes des étapes. Tu parles en raccourcis. Tu crées pour toi. Sans t'en rendre compte." }] });
  assertEquals(carouselNeedsPolish(ana), true);
});

Deno.test("rafales de phrases courtes dans un body → POLISH", () => {
  const raf = json({ slides: [{ slide_number: 1, body: "Le bruit. Le silence. Puis plus rien du tout autour de moi." }] });
  assertEquals(carouselNeedsPolish(raf), true);
});

Deno.test("overlays photo courts SANS tic → SKIP (la brièveté n'est pas un défaut)", () => {
  const shortOk = json({ slides: [
    { slide_number: 1, overlay_text: "Trois mots." },
    { slide_number: 2, overlay_text: "Puis quatre autres mots ici." },
  ] });
  assertEquals(carouselNeedsPolish(shortOk), false);
});

Deno.test("slide TEXTE trop courte (hors slide 1) → POLISH ; overlay photo court → SKIP", () => {
  const shortText = json({ slides: [
    { slide_number: 1, title: "Le hook qui accroche fort" },
    { slide_number: 2, title: "Trois idées clés" },
  ] });
  assertEquals(carouselNeedsPolish(shortText), true);
  // Les mêmes textes courts mais en OVERLAY photo ne déclenchent pas.
  const shortOverlay = json({ slides: [
    { slide_number: 1, overlay_text: "Le hook qui accroche fort" },
    { slide_number: 2, overlay_text: "Trois idées clés" },
  ] });
  assertEquals(carouselNeedsPolish(shortOverlay), false);
});

Deno.test("JSON illisible ou vide → POLISH (comportement historique conservé)", () => {
  assertEquals(carouselNeedsPolish("pas du json"), true);
  assertEquals(carouselNeedsPolish(json({ slides: [] })), true);
});
