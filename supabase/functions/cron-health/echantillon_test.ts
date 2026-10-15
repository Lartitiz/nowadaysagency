// Échantillon du juge du lundi (fiche 18, lot T) : l'ordre des trois sources.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { construireEchantillon } from "./echantillon.ts";

const evt = (hook: string, extra: Record<string, unknown> = {}) => ({
  format: "carousel",
  redac_score: 70,
  content_preview: { hook, sujet: "Sujet", caption: "  Légende   sur\nplusieurs lignes ", apercu_slides: ["a", "b", "c", "d", "e"] },
  ...extra,
});
const jamais = () => false;

Deno.test("échantillon : les events des clientes passent en premier", () => {
  const r = construireEchantillon({
    clientEvents: [evt("Hook cliente"), { format: "carousel", redac_score: 50, content_preview: { editorial_usage: {} } }],
    internalEvents: [evt("Hook interne")],
    carrouselsGardes: [{ carousel_type: "tips", subject: "Brouillon" }],
    estRetravaille: jamais,
  });
  assertEquals(r.echantillon_source, "events");
  assertEquals(r.echantillon, [{
    ref: "c1",
    format: "carousel",
    sujet: "Sujet",
    hook: "Hook cliente",
    caption: "Légende sur plusieurs lignes",
    apercu_slides: ["a", "b", "c", "d"],
    quality_score: 70,
  }]);
});

Deno.test("échantillon : sans event cliente lisible, les carrousels gardés des clientes", () => {
  const r = construireEchantillon({
    clientEvents: [{ format: "carousel", redac_score: 50, content_preview: null }],
    internalEvents: [evt("Hook interne")],
    carrouselsGardes: [{
      carousel_type: "tips",
      subject: "Brouillon",
      hook_text: "Accroche",
      caption: null,
      slides: [{ title: "Titre 1" }, "texte brut", { autre: 1 }],
      quality_score: null,
      calendar_post_id: "p1",
    }],
    estRetravaille: () => true,
  });
  assertEquals(r.echantillon_source, "brouillons");
  assertEquals(r.echantillon, [{
    ref: "c1",
    format: "tips",
    sujet: "Brouillon",
    hook: "Accroche",
    caption: "",
    apercu_slides: ["Titre 1", "texte brut", '{"autre":1}'],
    quality_score: null,
    retravaille: true,
    au_calendrier: true,
  }]);
});

Deno.test("échantillon : semaine sans cliente → comptes internes, étiquetés à part", () => {
  const r = construireEchantillon({
    clientEvents: [],
    internalEvents: [evt("Hook interne", { redac_score: null })],
    carrouselsGardes: [],
    estRetravaille: jamais,
  });
  assertEquals(r.echantillon_source, "comptes_internes");
  assertEquals(r.echantillon.length, 1);
  assertEquals(r.echantillon[0].hook, "Hook interne");
  assertEquals(r.echantillon[0].quality_score, null);
});

Deno.test("échantillon : semaine calme, rien à juger", () => {
  const r = construireEchantillon({ clientEvents: [], internalEvents: [], carrouselsGardes: [], estRetravaille: jamais });
  assertEquals(r, { echantillon_source: "brouillons", echantillon: [] });
});

Deno.test("échantillon : 15 contenus au plus", () => {
  const r = construireEchantillon({
    clientEvents: Array.from({ length: 20 }, (_, i) => evt(`Hook ${i}`)),
    internalEvents: [],
    carrouselsGardes: [],
    estRetravaille: jamais,
  });
  assertEquals(r.echantillon.length, 15);
  assertEquals(r.echantillon[14].ref, "c15");
});
