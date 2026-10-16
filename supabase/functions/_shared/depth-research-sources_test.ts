// Sources vérifiables (choix de Laetitia, 16/10/2026) : un fait de la recherche
// web n'est gardé que si une page trouvée porte sa source, et son lien le suit.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDepthBlock, joinDepthMaterial, keepVerifiableFacts, pageForSource, pagesFromContent, splitDepthMaterial } from "./depth-research.ts";
import { researchSourceWarnings } from "../carousel-ai/research-sources.ts";

const PAGES = [
  { url: "https://www.ademe.fr/bijoux-metaux", title: "Les métaux des bijoux - ADEME" },
  { url: "https://zoealexandria.com/blog/fast-fashion", title: "Fast fashion jewelry" },
];

Deno.test("pagesFromContent : citations d'abord, puis résultats de recherche, sans doublon", () => {
  const pages = pagesFromContent([
    { type: "web_search_tool_result", content: [{ url: "https://a.fr/x", title: "A" }, { url: "https://b.fr", title: "B" }] },
    { type: "text", text: "x", citations: [{ url: "https://b.fr", title: "B" }] },
    { type: "text", text: "y" },
  ]);
  assertEquals(pages.map((p) => p.url), ["https://b.fr", "https://a.fr/x"]);
});

Deno.test("pageForSource : nom d'organisme ↔ adresse ou titre de la page", () => {
  assertEquals(pageForSource("Ademe", PAGES)?.url, PAGES[0].url);
  assertEquals(pageForSource("Le Monde", PAGES), undefined);
  assertEquals(pageForSource("Fondation Ellen MacArthur", [{ url: "https://ellenmacarthurfoundation.org/fr", title: "" }])?.url, "https://ellenmacarthurfoundation.org/fr");
});

Deno.test("keepVerifiableFacts : fait sans page retiré, mécanisme gardé, lien gardé", () => {
  const raw = [
    "Le placage s'use parce que la couche d'or est très fine.",
    "- Chaque année, des milliards de bijoux sont vendus (Le Monde, 2026).",
    "- 60 % des bijoux fantaisie contiennent du laiton (Ademe, 2025).",
    "- Un bijou sur trois finit à la poubelle en 2 ans.",
  ].join("\n");
  const out = keepVerifiableFacts(raw, PAGES);
  assert(out.text.includes("couche d'or est très fine"));
  assert(out.text.includes("(Ademe, 2025)"));
  assert(!out.text.includes("Le Monde"));
  assert(!out.text.includes("2 ans"), "chiffre sans source retiré");
  assertEquals(out.links, [{ name: "Ademe, 2025", url: PAGES[0].url }]);
  assertEquals(out.dropped.length, 2);
});

Deno.test("keepVerifiableFacts : ses propres chiffres cités « … » restent (mode support)", () => {
  const out = keepVerifiableFacts("« Je livre tout pour 2 100 € TTC ». Une agence facture dès 5 000 € (La Fabrique du Net, 2026).", [{ url: "https://www.lafabriquedunet.fr/prix", title: "Prix d'un site" }]);
  assert(out.text.startsWith("« Je livre tout pour 2 100 € TTC »"));
  assertEquals(out.links.length, 1);
});

Deno.test("keepVerifiableFacts : aucune page → plus aucun fait sourcé", () => {
  const out = keepVerifiableFacts("Des milliards de bijoux (Zoe Alexandria, 2026). Le laiton noircit.", []);
  assertEquals(out.text, "Le laiton noircit.");
  assertEquals(out.links, []);
});

Deno.test("liens : hors du prompt de rédaction, relus pour le juge et la relecture", () => {
  const material = joinDepthMaterial("Le placage s'use vite, la couche d'or est très fine et part au frottement (Ademe, 2025).", [{ name: "Ademe, 2025", url: PAGES[0].url }]);
  const block = buildDepthBlock(material);
  assert(block.includes("(Ademe, 2025)"));
  assert(!block.includes("https://"), "pas d'adresse dans le prompt de rédaction");
  assertEquals(splitDepthMaterial(material).links, [{ name: "Ademe, 2025", url: PAGES[0].url }]);
  assertEquals(splitDepthMaterial("sans liens").links, []);
});

Deno.test("researchSourceWarnings : slide qui reprend la source → piste avec le lien", () => {
  const doc = {
    slides: [{ title: "Petites séries" }, { body: "Selon l'ADEME (2025), 60 % des bijoux fantaisie contiennent du laiton." }],
    caption: "Rien ici.",
  };
  const links = [{ name: "Ademe, 2025", url: PAGES[0].url }, { name: "Insee, 2024", url: "https://insee.fr/x" }];
  assertEquals(researchSourceWarnings(doc, links), [
    `Fait trouvé sur le web (slide 2) : « Ademe, 2025 ». Vérifie le chiffre sur la page avant de publier : ${PAGES[0].url}`,
  ]);
  assertEquals(researchSourceWarnings({ slides: [], caption: { body: "D'après l'Insee, c'est rare." } }, links)[0].includes("(légende)"), true);
  assertEquals(researchSourceWarnings(doc, undefined), []);
});
