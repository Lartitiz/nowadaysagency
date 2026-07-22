import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildContentPreview } from "./content-quality.ts";

Deno.test("carrousel : aperçu depuis { slides, caption }", () => {
  const content = JSON.stringify({
    slides: [{ title: "Le vrai coût d'un logo" }, { title: "Étape 2" }],
    caption: { hook: "On parle argent.", body: "Détail.", cta: "Dis-moi." },
  });
  const p = buildContentPreview(content, "Prix d'un logo");
  assertEquals(p?.sujet, "Prix d'un logo");
  assertEquals(p?.hook, "Le vrai coût d'un logo");
  assertEquals((p?.apercu_slides as string[]).length, 2);
});

Deno.test("stories : aperçu depuis { stories:[{text}] }", () => {
  const content = JSON.stringify({
    stories: [
      { number: 1, text: "Là je prépare mon atelier storytelling." },
      { number: 2, text: "Le truc c'est de raconter POURQUOI." },
      { number: 3, text: "En vrai, ça change tout." },
      { number: 4, text: "Petite question pour toi." },
      { number: 5, text: "Écris-moi si ça te parle." },
    ],
  });
  const p = buildContentPreview(content, "Coulisses de mon atelier");
  assertEquals(p?.sujet, "Coulisses de mon atelier");
  assertEquals(p?.hook, "Là je prépare mon atelier storytelling.");
  // Aperçu plafonné à 4 stories.
  assertEquals((p?.apercu_slides as string[]).length, 4);
  assertEquals(p?.caption, "");
});

Deno.test("stories : hook de repli sur hook_options si text vide", () => {
  const content = JSON.stringify({
    stories: [{ number: 1, text: "", hook_options: { option_a: { text: "Faut qu'on parle." } } }],
  });
  const p = buildContentPreview(content, "Sujet");
  assertEquals(p?.hook, "Faut qu'on parle.");
});

Deno.test("reel : aperçu depuis { script:[{texte_parle}] }", () => {
  const content = JSON.stringify({
    script: [
      { section: "hook", texte_parle: "Mon premier devis faisait 9 pages." },
      { section: "body", texte_parle: "Personne ne l'a lu." },
    ],
  });
  const p = buildContentPreview(content, "Devis trop longs");
  assertEquals(p?.sujet, "Devis trop longs");
  assertEquals(p?.hook, "Mon premier devis faisait 9 pages.");
  assertEquals((p?.apercu_slides as string[]).length, 2);
});

Deno.test("linkedin : aperçu depuis { content } (texte libre)", () => {
  const content = JSON.stringify({ content: "Première ligne accroche.\n\nDeuxième paragraphe.\n\nTroisième." });
  const p = buildContentPreview(content, "Mon sujet LinkedIn");
  assertEquals(p?.sujet, "Mon sujet LinkedIn");
  assertEquals(p?.hook, "Première ligne accroche.");
  assertEquals((p?.apercu_slides as string[]).length, 3);
});

Deno.test("newsletter : hook = subject depuis { subject, content }", () => {
  const content = JSON.stringify({ subject: "Objet accrocheur", content: "Corps de l'email.\n\nSuite." });
  const p = buildContentPreview(content, undefined);
  assertEquals(p?.hook, "Objet accrocheur");
  assertEquals(p?.sujet, "Objet accrocheur");
});

Deno.test("séquence vide + pas de sujet → null (rien à stocker)", () => {
  assertEquals(buildContentPreview(JSON.stringify({ stories: [] }), undefined), null);
  assertEquals(buildContentPreview(JSON.stringify({ script: [] }), undefined), null);
  assertEquals(buildContentPreview("pas du json", undefined), null);
});
