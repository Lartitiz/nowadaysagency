import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
Deno.env.set("INTERNAL_GMAIL_BOXES", "boiterecette, boiterecettetest");
import { isInternalEmail, isTestAccountEmail, maskEmail } from "./internal-accounts.ts";

Deno.test("comptes internes : admin, Camille et toute adresse du domaine de l'agence", () => {
  for (const e of [
    "laetitia@nowadaysagency.com",
    "laetitiatest@nowadaysagency.com",
    "laetitia+qaneuf0407@nowadaysagency.com",
    "laetitia+cs1759650000@nowadaysagency.com",
    "laetitia+membres-desktop@nowadaysagency.com",
    "Laetitia+Immo1707@NowadaysAgency.com",
    " laetitiatest@nowadaysagency.com ",
    "laetitia.dupont@nowadaysagency.com", // 09/11/2026 : tout le domaine de l'agence est interne
    "contact@nowadaysagency.com",
    "xlaetitia+x@nowadaysagency.com",
    "boiterecette@gmail.com",
    "Boite.Recette@gmail.com",
    "boiterecette+recette3009@gmail.com",
    "boite.recette+x@googlemail.com",
    "boiterecettetest@gmail.com", // 2e compte de recette, inscrit le 30/09
    "boite.recette.test@gmail.com",
    "qa-premiere-mun4mvu8@example.com", // spec de recette, domaine réservé
    "qa@demo.test",
    "x@example.org",
  ]) assertEquals(isInternalEmail(e), true, e);
});

Deno.test("jamais une cliente : autres domaines, homonymes, sous-domaines", () => {
  for (const e of [
    "homonyme@gmail.com",
    "homonyme+pro@gmail.com",
    "camille@atelier.fr",
    "laetitia+x@nowadaysagency.com.evil.fr",
    "x@sous.nowadaysagency.com",
    "x@nowadaysagency.co",
    "boiterecette2@gmail.com",
    "boiterecette@gmail.com.fr",
    "boiterecette@outlook.com",
    "cliente.gmail@gmail.com",
    "boiterecettetest2@gmail.com",
    "camille@example.com.fr",
    "camille@monexample.com",
    "camille@test.fr",
    "",
    null,
    undefined,
  ]) assertEquals(isInternalEmail(e), false, String(e));
});

Deno.test("comptes de test = internes SAUF l'admin (scope daily de cron-health)", () => {
  assertEquals(isTestAccountEmail("laetitia@nowadaysagency.com"), false);
  assertEquals(isTestAccountEmail("LAETITIA@nowadaysagency.com"), false);
  assertEquals(isTestAccountEmail("laetitiatest@nowadaysagency.com"), true);
  assertEquals(isTestAccountEmail("laetitia+qaneuf0907@nowadaysagency.com"), true);
  assertEquals(isTestAccountEmail("cliente@exemple.fr"), false);
  assertEquals(isTestAccountEmail("boiterecette@gmail.com"), true);
});

Deno.test("maskEmail ne laisse jamais passer l'adresse complète", () => {
  assertEquals(maskEmail("laetitia@nowadaysagency.com"), "la***@nowadaysagency.com");
  assertEquals(maskEmail("a@b.fr"), "a***@b.fr");
  assertEquals(maskEmail("Camille.Martin@Gmail.com"), "ca***@gmail.com");
  assertEquals(maskEmail(null), "***");
  assertEquals(maskEmail("sans-arobase"), "***");
});

Deno.test("secret absent ou vide : aucune adresse Gmail n'est traitée comme interne", () => {
  const avant = Deno.env.get("INTERNAL_GMAIL_BOXES")!;
  try {
    Deno.env.delete("INTERNAL_GMAIL_BOXES");
    assertEquals(isInternalEmail("boiterecette@gmail.com"), false);
    assertEquals(isInternalEmail("laetitia@nowadaysagency.com"), true);
  } finally {
    Deno.env.set("INTERNAL_GMAIL_BOXES", avant);
  }
});
