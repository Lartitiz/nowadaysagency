import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { guardCalendarLabel, parseActionLinks, parsePlanPosts } from "./chat-markers.ts";

Deno.test("parseActionLinks : un marqueur seul sur sa ligne disparaît du texte", () => {
  const { cleanText, actions } = parseActionLinks(
    "On y va.\n\n[ACTION_LINK:/creer|Créer le post]",
  );
  assertEquals(cleanText, "On y va.");
  assertEquals(actions.length, 1);
  assertEquals(actions[0].label, "Créer le post");
});

Deno.test("parseActionLinks : un marqueur EN MILIEU de phrase ne laisse plus de trou", () => {
  // Bug vécu le 01/08 : « Une fois générés, direction ton  pour tout caler. »
  const { cleanText, actions } = parseActionLinks(
    "Une fois générés, direction ton [ACTION_LINK:/calendrier|calendrier] pour tout caler.",
  );
  assertEquals(cleanText, "Une fois générés, direction ton calendrier pour tout caler.");
  assertEquals(actions.length, 1);
});

Deno.test("parseActionLinks : un bouton de navigation ne peut plus PROMETTRE un ajout", () => {
  const { actions } = parseActionLinks("[ACTION_LINK:/calendrier|Ajouter au calendrier]");
  assertEquals(actions[0].label, "Ouvrir le calendrier");
});

Deno.test("guardCalendarLabel : ne touche pas aux autres routes", () => {
  assertEquals(guardCalendarLabel("/creer", "Ajouter une photo"), "Ajouter une photo");
  assertEquals(guardCalendarLabel("/calendrier", "Voir mon calendrier"), "Voir mon calendrier");
});

Deno.test("parsePlanPosts : chaque contenu proposé devient une carte", () => {
  const raw = [
    "Voici ta semaine :",
    "[PLAN_POST:Lundi|carrousel|Les 3 erreurs qui plombent ta visibilité|credibilite]",
    "[PLAN_POST:Mercredi|reel|Mes coulisses|confiance]",
    "[PLAN_POST:Vendredi|post|Mon pourquoi|visibilite]",
  ].join("\n");
  const { cleanText, plan } = parsePlanPosts(raw);
  assertEquals(cleanText, "Voici ta semaine :");
  assertEquals(plan.length, 3);
  assertEquals(plan[0].format, "post_carrousel");
  assertEquals(plan[1].format, "reel");
  assertEquals(plan[2].subject, "Mon pourquoi");
  assertEquals(plan[0].kind, "plan");
});

Deno.test("parsePlanPosts : une entrée invalide est ignorée, pas écrite au calendrier", () => {
  const { plan } = parsePlanPosts([
    "[PLAN_POST:Lundimatin|carrousel|Sujet|vente]", // jour inconnu
    "[PLAN_POST:Mardi|podcast|Sujet|vente]", // format inconnu
    "[PLAN_POST:Mercredi|post||vente]", // sujet vide
    "[PLAN_POST:Jeudi|post|Un vrai sujet|vente]",
  ].join("\n"));
  assertEquals(plan.length, 1);
  assertEquals(plan[0].day, "Jeudi");
});

Deno.test("parsePlanPosts : un objectif hors vocabulaire retombe sur visibilite", () => {
  const { plan } = parsePlanPosts("[PLAN_POST:Lundi|post|Sujet|inspirer]");
  assertEquals(plan[0].objective, "visibilite");
});

Deno.test("parsePlanPosts : pas deux fois le même jour + sujet", () => {
  const { plan } = parsePlanPosts([
    "[PLAN_POST:Lundi|post|Même sujet|vente]",
    "[PLAN_POST:Lundi|post|même SUJET|vente]",
  ].join("\n"));
  assertEquals(plan.length, 1);
});

Deno.test("parsePlanPosts : aucun marqueur = aucune carte, texte intact", () => {
  const { cleanText, plan } = parsePlanPosts("Juste un conseil, rien à planifier.");
  assertEquals(plan.length, 0);
  assertEquals(cleanText, "Juste un conseil, rien à planifier.");
});
