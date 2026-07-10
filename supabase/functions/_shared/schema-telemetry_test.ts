import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkSchemaFidelity, collectSchemaStrings } from "./schema-telemetry.ts";

const SCHEMA = {
  type: "quote_big",
  quote: "« Je croyais que mon problème c'était l'algorithme. »",
  attribution: "— Une cliente céramiste, après 3 mois d'accompagnement",
  context: "Ce qu'on me dit presque à chaque premier rendez-vous :",
};

Deno.test("collectSchemaStrings : strings affichables seulement", () => {
  const strings = collectSchemaStrings({
    type: "checklist",
    title: "Ton post est prêt si…",
    items: [{ text: "Le CTA est clair", checked: true }],
    accent: "#FB3D80",
  });
  assertEquals(strings, ["Ton post est prêt si…", "Le CTA est clair"]);
});

Deno.test("rendu fidèle → aucun manquant", () => {
  const html = `<div><p>CE QU'ON ME DIT PRESQUE À CHAQUE PREMIER RENDEZ-VOUS :</p>
    <p>« Je croyais que mon problème c&rsquo;était l'algorithme. »</p>
    <p>&#8212; Une cliente céramiste, après 3 mois d'accompagnement</p></div>`;
  // la casse diffère sur le context → il compte manquant ; quote et attribution passent
  const r = checkSchemaFidelity(html, SCHEMA);
  assertEquals(r.checked, 3);
  assertEquals(r.missing, ["Ce qu'on me dit presque à chaque premier rendez-vous :"]);
});

Deno.test("attribution omise → détectée", () => {
  const html = `<div><p>Ce qu'on me dit presque à chaque premier rendez-vous :</p>
    <p>« Je croyais que mon problème c'était l'algorithme. »</p></div>`;
  const r = checkSchemaFidelity(html, SCHEMA);
  assertEquals(r.missing, ["— Une cliente céramiste, après 3 mois d'accompagnement"]);
});

Deno.test("tiret réécrit en virgule → compte comme manquant (réécriture)", () => {
  const html = `<p>2019, Les débuts euphoriques</p>`;
  const r = checkSchemaFidelity(html, { type: "timeline", steps: [{ label: "2019 — Les débuts euphoriques" }] });
  assertEquals(r.missing.length, 1);
});

Deno.test("strings découpées par des spans internes → trouvées quand contiguës", () => {
  const html = `<p>Le CTA est <span style="color:#FB3D80">clair</span></p>`;
  const r = checkSchemaFidelity(html, { type: "checklist", items: [{ text: "Le CTA est clair", checked: true }] });
  assertEquals(r.missing, []);
});

Deno.test("schéma vide ou nul → zéro vérifié, zéro manquant", () => {
  assertEquals(checkSchemaFidelity("<p>x</p>", null), { missing: [], checked: 0 });
  assertEquals(checkSchemaFidelity("<p>x</p>", {}), { missing: [], checked: 0 });
});
