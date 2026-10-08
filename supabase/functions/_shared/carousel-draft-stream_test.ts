import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { completedNarrative, completedSlides, draftNarrativeTracker, draftSlidesTracker, draftSlideView } from "./carousel-draft-stream.ts";

const full = JSON.stringify({
  slides: [
    { slide_number: 1, title: "Ce qui rend mon travail unique", body: "" },
    { slide_number: 2, title: "La réponse \"trop rapide\" {piège}", body: "Je réponds [souvent] trop vite.", points: ["un", "deux"] },
    { slide_number: 3, title: "Trois essais", body: "Chaque pièce passe par trois essais." },
  ],
  caption: { body: "Légende" },
});

Deno.test("slides en flux : seules les slides fermées sortent, à chaque coupure possible", () => {
  let previous = 0;
  for (let cut = 0; cut <= full.length; cut++) {
    const got = completedSlides("```json\n" + full.slice(0, cut));
    // Jamais de recul ni de slide inventée, quel que soit l'endroit de la coupure.
    if (got.length < previous) throw new Error(`recul à ${cut}`);
    previous = got.length;
    for (const [i, s] of got.entries()) assertEquals(s.slide_number, i + 1);
  }
  assertEquals(previous, 3);
  assertEquals(completedSlides(full)[1].title, 'La réponse "trop rapide" {piège}');
});

Deno.test("slides en flux : texte sans tableau de slides → rien", () => {
  assertEquals(completedSlides('{"caption": {"body": "x"}'), []);
  assertEquals(completedSlides(""), []);
});

Deno.test("vue brouillon : titre, texte, puces, balises retirées, texte borné", () => {
  assertEquals(draftSlideView({ title: "<b>Titre</b>", body: "Corps", points: ["a"] }, 1), { n: 2, title: "Titre", text: "Corps • a" });
  assertEquals(draftSlideView({ overlay_text: "Sur photo" }, 0), { n: 1, title: "Sur photo", text: "" });
  assertEquals(draftSlideView({ title: "T", body: "x".repeat(500) }, 0).text.length, 320);
});

Deno.test("suivi : un envoi par nouvelle slide terminée, liste complète", () => {
  const sent: number[] = [];
  const track = draftSlidesTracker((slides) => sent.push(slides.length));
  for (let cut = 0; cut <= full.length; cut += 7) track(full.slice(0, cut));
  track(full);
  assertEquals(sent, [1, 2, 3]);
});

// 08/10/2026 : récit continu (photo, mixte) → accroche puis paragraphes.
const narrative = JSON.stringify({
  idea: "Une idée",
  hook: "Ce que \"la main\" laisse",
  caption: { hook: "Pas la couverture", body: "x", cta: "", hashtags: [] },
  paragraphs: ["Premier [paragraphe], avec {accolades}.", "Deuxième \"cité\".", "Troisième."],
});

Deno.test("récit en flux : accroche de premier niveau et paragraphes fermés seulement, sans recul", () => {
  let previous = 0;
  for (let cut = 0; cut <= narrative.length; cut++) {
    const got = completedNarrative(narrative.slice(0, cut));
    if (got.paragraphs.length < previous) throw new Error(`recul à ${cut}`);
    previous = got.paragraphs.length;
    if (got.hook) assertEquals(got.hook, 'Ce que "la main" laisse');
  }
  assertEquals(completedNarrative(narrative).paragraphs, ["Premier [paragraphe], avec {accolades}.", 'Deuxième "cité".', "Troisième."]);
  // La légende (imbriquée) a aussi une « hook » : jamais prise pour l'accroche.
  assertEquals(completedNarrative('{"caption":{"hook":"Légende"},"paragraphs":["A"]').hook, "");
  assertEquals(completedNarrative('{"hook":"Ce que la ma'), { hook: "", paragraphs: [] });
});

Deno.test("récit en flux : couverture d'abord, une carte par paragraphe, envoi seulement quand ça avance", () => {
  const sent: any[] = [];
  const track = draftNarrativeTracker((slides) => sent.push(slides));
  for (let cut = 0; cut <= narrative.length; cut++) track(narrative.slice(0, cut));
  assertEquals(sent.map((s) => s.length), [1, 2, 3, 4]);
  assertEquals(sent[3][0], { n: 1, title: 'Ce que "la main" laisse', text: "" });
  assertEquals(sent[3][2], { n: 3, title: "", text: 'Deuxième "cité".' });
  // Paragraphes écrits avant l'accroche : rien tant que la couverture manque.
  const early: any[] = [];
  const t2 = draftNarrativeTracker((slides) => early.push(slides));
  t2('{"paragraphs":["A","B"],"hook":"Plus');
  assertEquals(early, []);
  t2('{"paragraphs":["A","B"],"hook":"Plus tard"}');
  assertEquals(early[0].map((s: any) => s.n), [1, 2, 3]);
});

Deno.test("vue brouillon : photo prévue transmise seulement si c'est un numéro valide", () => {
  assertEquals(draftSlideView({ overlay_text: "Texte", photo_index: 2 }, 0).photo, 2);
  assertEquals("photo" in draftSlideView({ overlay_text: "Texte", photo_index: null }, 0), false);
  assertEquals("photo" in draftSlideView({ overlay_text: "Texte", photo_index: 0 }, 0), false);
});
