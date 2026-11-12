// deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/investment-solicitation_test.ts
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { INVESTMENT_SOLICITATION_RULE, investmentSolicitationBlock, isInvestmentSolicitation } from "./investment-solicitation.ts";

Deno.test("appel à investir : demandes reconnues, tous métiers", () => {
  for (const brief of [
    "je cherche 2 ou 3 investisseurs pour cofinancer un immeuble de 4 lots, ticket à partir de 50 k€",
    "Je lance une levée de fonds pour ma marque de cosmétiques",
    "campagne de financement participatif pour ouvrir mon atelier de céramique",
    "J'ouvre le capital de ma boulangerie à deux associées",
    "Envie d'investir avec moi dans ce projet de gîte ?",
    "Lever des fonds pour mon studio de yoga",
    "crowdfunding pour mon premier album",
  ]) assert(isInvestmentSolicitation(brief), brief);
});

Deno.test("appel à investir : la réponse aux questions suffit", () => {
  assert(isInvestmentSolicitation("Bilan de mon opération", [{ question: "Pour qui ?", answer: "pour les futurs investisseurs" }]));
});

Deno.test("appel à investir : contenus ordinaires sans le bloc", () => {
  for (const brief of [
    "bilan de mon opé : 62 m2 acheté 210 k€, revendu 330 k€ en 7 mois",
    "je cherche un plombier chauffagiste fiable sur Lyon",
    "Pourquoi j'investis du temps dans ma newsletter",
    "Mes 3 conseils pour une photo de profil LinkedIn",
    null,
  ]) assertEquals(investmentSolicitationBlock(brief), "", String(brief));
});

Deno.test("règle : pas de gain promis, passé ≠ argument, risque dit, échange privé", () => {
  for (const part of ["Aucune promesse ni suggestion de gain", "résultat passé", "risque de perte", "échange privé", "Aucun calcul"]) {
    assertStringIncludes(INVESTMENT_SOLICITATION_RULE, part);
  }
});
