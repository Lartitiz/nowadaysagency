// Pourcentage inventé (re-test réel LinkedIn 04/10/2026) : « augmenté leur
// fréquence hebdomadaire de 21% » passait parce qu'un « 21 » existait ailleurs
// dans le contexte (autre unité). Un pourcentage exige la même valeur EN pourcentage.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeTextRedac, numbersIn } from "./redac-gate.ts";

const POST = "Des comptes ont doublé leur nombre de publications et augmenté leur fréquence hebdomadaire de 21%, et leur portée a quand même baissé.";

Deno.test("pourcentage : « 21 ans » du contexte n'autorise pas « 21% »", () => {
  const a = analyzeTextRedac(POST, numbersIn("Céramiste depuis 21 ans, atelier à Lyon."));
  assertEquals(a.fabricatedNumbers.length, 1, JSON.stringify(a.fabricatedNumbers));
  assertEquals(a.fabricatedNumbers[0].startsWith("21"), true);
});

Deno.test("pourcentage : la même valeur en pourcentage dans les sources reste autorisée", () => {
  for (const src of ["Mes ventes ont progressé de 21 % cette année.", "une hausse de 21% en un an", "21 pour cent de mes clientes"]) {
    assertEquals(analyzeTextRedac(POST, numbersIn(src)).fabricatedNumbers, [], src);
  }
});

Deno.test("pourcentage : un nombre sans % garde la règle par valeur", () => {
  assertEquals(analyzeTextRedac("J'ai ouvert l'atelier il y a 21 ans.", numbersIn("Céramiste depuis 21 ans")).fabricatedNumbers, []);
  assertEquals(analyzeTextRedac("Ça fait 21 pièces cette semaine.", numbersIn("21 %")).fabricatedNumbers, []);
});
