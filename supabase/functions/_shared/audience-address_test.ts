import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { audienceAddressRule, checkAudienceAddress, enforceAudienceAddress, parseAudienceAddress } from "./audience-address.ts";

// Tu ou vous (décision de Laetitia, 04/10/2026) : réglage de la fiche de marque,
// règle ferme en tête de rédaction et contrôle par le code après rédaction.
// L'outil avait tutoyé (« je préfère que tu l'apprennes de moi ») un carrousel
// de Nowadays, marque qui vouvoie.

Deno.test("réglage : valeurs de l'écran et texte libre historique", () => {
  assertEquals(parseAudienceAddress("vouvoiement"), "vous");
  assertEquals(parseAudienceAddress("Tutoiement"), "tu");
  assertEquals(parseAudienceAddress("tu"), "tu");
  assertEquals(parseAudienceAddress("Vous"), "vous");
  assertEquals(parseAudienceAddress("Je vouvoie mes clientes"), "vous");
  assertEquals(parseAudienceAddress("vouvoiement, chaleureux"), "vous");
});

Deno.test("réglage : vide, ambigu ou sans tu/vous → aucun réglage (comportement inchangé)", () => {
  for (const v of [null, undefined, "", "  ", "tu/vous", "familier", "soutenu", "direct", "pas de préférence", 3]) {
    assertEquals(parseAudienceAddress(v), null, String(v));
  }
  assertEquals(audienceAddressRule(null), "");
});

Deno.test("règle ferme : nomme la forme attendue et protège la façon dont l'appli parle à l'utilisatrice", () => {
  const vous = audienceAddressRule("vous");
  assert(vous.includes("VOUVOIEMENT") && vous.includes("RÈGLE FERME"));
  assert(vous.includes("ne change pas la façon dont l'appli s'adresse à elle"));
  assert(audienceAddressRule("tu").includes("TUTOIEMENT"));
});

Deno.test("comptage : le carrousel tutoyé de Nowadays est repéré pour une marque qui vouvoie", () => {
  const text = "[SLIDE 2 - BODY] Je préfère que tu l'apprennes de moi. Tu as le droit de savoir.\n[SLIDE 3 - BODY] Ton temps compte, et t'as raison d'y faire attention.";
  const c = checkAudienceAddress(text, "vous");
  assertEquals(c.tu, 4);
  assertEquals(c.wrong, 4);
  assertEquals(c.items, ["Je préfère que tu l'apprennes de moi.", "Tu as le droit de savoir.", "Ton temps compte, et t'as raison d'y faire attention."]);
});

Deno.test("comptage : texte au vous conforme, rien à corriger", () => {
  const c = checkAudienceAddress("Vous avez le droit de savoir. Votre temps compte, et vos clientes aussi.", "vous");
  assertEquals(c.wrong, 0);
  assertEquals(c.vous, 3);
});

Deno.test("faux positifs : citations, parole rapportée, nom « ton », mots contenant tu/te", () => {
  const text = [
    "Une cliente m'a écrit « tu m'as sauvé la mise ».",
    "On se dit : tu n'y arriveras jamais.",
    "Elle m'a dit “ta stratégie est claire”.",
    "Le ton juste compte, il faut savoir changer de ton.",
    "Un texte têtu, une tête de mule, une tenue, la teinture.",
    "Nous avons testé, et nous en parlons.",
    "#tuveuxquoi @tes_comptes",
  ].join(" ");
  assertEquals(checkAudienceAddress(text, "vous").wrong, 0);
});

Deno.test("faux positifs : « tu te dis : » compte (adresse), pas la pensée qui suit", () => {
  const c = checkAudienceAddress("Parfois tu te dis : je ne suis pas légitime.", "vous");
  assertEquals(c.tu, 2);
});

Deno.test("marque qui tutoie : vouvoiement repéré, « vous » de groupe toléré", () => {
  assertEquals(checkAudienceAddress("Vous êtes nombreuses à me le demander. Beaucoup d'entre vous hésitent.", "tu").wrong, 0);
  const c = checkAudienceAddress("Vous avez le droit de savoir. Et tu sais quoi ?", "tu");
  assertEquals(c.wrong, 1);
  assertEquals(c.items, ["Vous avez le droit de savoir."]);
});

Deno.test("sans réglage : jamais de passe, même si le texte mélange tu et vous", async () => {
  let called = false;
  const r = await enforceAudienceAddress("Tu as raison. Vous aussi.", null, { pass: async (t) => { called = true; return t; } });
  assertEquals(r.receipt, null);
  assertEquals(called, false);
});

Deno.test("passe ciblée : gardée quand les adresses fautives baissent et les chiffres restent", async () => {
  const text = "[SLIDE 1 - HOOK] Tu paies 2 100 € ?\n[SLIDE 2 - BODY] Ton budget compte.";
  const r = await enforceAudienceAddress(text, "vous", {
    pass: async (_t, addr, items) => {
      assertEquals(addr, "vous");
      assertEquals(items.length, 2);
      return "[SLIDE 1 - HOOK] Vous payez 2 100 € ?\n[SLIDE 2 - BODY] Votre budget compte.";
    },
  });
  assertEquals(r.receipt?.applied, true);
  assertEquals(r.receipt?.wrong_after, 0);
  assert(r.content.includes("Vous payez"));
});

Deno.test("passe ciblée : refusée si un chiffre disparaît ou si rien ne s'améliore", async () => {
  const text = "Tu paies 2 100 € au lieu de 7 500 €.";
  const lost = await enforceAudienceAddress(text, "vous", { pass: async () => "Vous payez 2 100 €." });
  assertEquals(lost.receipt?.reason, "refus_chiffre");
  assertEquals(lost.content, text);
  const same = await enforceAudienceAddress(text, "vous", { pass: async () => "Toi, tu paies 2 100 € au lieu de 7 500 €." });
  assertEquals(same.receipt?.reason, "refus_compte");
  assertEquals(same.content, text);
});

Deno.test("conforme : aucun appel de correction", async () => {
  let called = false;
  const r = await enforceAudienceAddress("Vous avez le droit de savoir.", "vous", { pass: async (t) => { called = true; return t; } });
  assertEquals(called, false);
  assertEquals(r.receipt?.reason, "conforme");
});
