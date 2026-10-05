import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isInternalEmail, isTestAccountEmail, maskEmail } from "./internal-accounts.ts";

Deno.test("comptes internes : admin, Camille et tout alias laetitia+…@ de l'agence", () => {
  for (const e of [
    "laetitia@nowadaysagency.com",
    "laetitiatest@nowadaysagency.com",
    "laetitia+qaneuf0407@nowadaysagency.com",
    "laetitia+cs1759650000@nowadaysagency.com",
    "laetitia+membres-desktop@nowadaysagency.com",
    "Laetitia+Immo1707@NowadaysAgency.com",
    " laetitiatest@nowadaysagency.com ",
  ]) assertEquals(isInternalEmail(e), true, e);
});

Deno.test("boîte Gmail perso de Laetitia : toutes ses variantes (points, +alias) sont internes", () => {
  for (const e of [
    "laetitiamattioli@gmail.com",
    "LaetitiaMattioli@Gmail.com",
    "laetitia.mattioli@gmail.com",
    "laetitiamattioli+recette@gmail.com",
    "l.aetitia.mattioli+qa3009@googlemail.com",
  ]) assertEquals(isInternalEmail(e), true, e);
  // Hors admin, donc visible comme compte de test dans la sonde daily.
  assertEquals(isTestAccountEmail("laetitiamattioli+recette@gmail.com"), true);
});

Deno.test("jamais une cliente : autres domaines, homonymes, sous-domaines", () => {
  for (const e of [
    "laetitia@gmail.com",
    "laetitia+pro@gmail.com",
    "laetitiamattioli@yahoo.fr",
    "laetitiamattioli2@gmail.com",
    "xlaetitiamattioli@gmail.com",
    "laetitiamattioli@gmail.com.evil.fr",
    "laetitia.mattioli.dupont@gmail.com",
    "camille@atelier.fr",
    "laetitia.dupont@nowadaysagency.com",
    "laetitia+x@nowadaysagency.com.evil.fr",
    "xlaetitia+x@nowadaysagency.com",
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
});

Deno.test("maskEmail ne laisse jamais passer l'adresse complète", () => {
  assertEquals(maskEmail("laetitia@nowadaysagency.com"), "la***@nowadaysagency.com");
  assertEquals(maskEmail("a@b.fr"), "a***@b.fr");
  assertEquals(maskEmail("Camille.Martin@Gmail.com"), "ca***@gmail.com");
  assertEquals(maskEmail(null), "***");
  assertEquals(maskEmail("sans-arobase"), "***");
});
