import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { completedSlides, draftSlidesTracker, draftSlideView } from "./carousel-draft-stream.ts";

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
