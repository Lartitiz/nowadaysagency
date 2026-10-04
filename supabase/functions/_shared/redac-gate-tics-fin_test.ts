// Tics vus au re-test réel LinkedIn du 04/10/2026 (après #1346) :
// « ont vu leurs résultats baisser, pas augmenter. » et des durées en lettres
// inventées (« J'ai mis trois semaines… »).
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeTextRedac, numbersIn } from "./redac-gate.ts";

Deno.test("« X, pas Y » en fin de phrase : compté", () => {
  for (
    const s of [
      "Pendant ce temps, des comptes qui ont doublé leur fréquence de publication ont vu leurs résultats baisser, pas augmenter.",
      "Ce qui compte, c'est la régularité du lien, pas le volume.",
      "Le partage en message privé pèse, pas le like.",
    ]
  ) {
    assertEquals(analyzeTextRedac(s).reversals.length, 1, `non détecté : ${s}`);
  }
});

Deno.test("« X, pas Y » : tournures figées et vraies phrases permises", () => {
  for (
    const s of [
      "Publie une fois par semaine, pas plus.",
      "Ça marche, pas toujours.",
      "Je ne l'ai pas encore testé.",
      "Tu peux publier le lundi, ou pas.",
      "Ce n'est pas grave, pas besoin de tout refaire.",
      "Garde ton rythme, pas forcément le même que les autres.",
      "Le séchage décide du rythme, pas moi.",
    ]
  ) {
    assertEquals(analyzeTextRedac(s).reversals, [], `faux positif : ${s}`);
  }
});

Deno.test("durées en lettres : inventées → comptées ; fournies → permises", () => {
  const post = "Une série de six assiettes m'a pris trois semaines de travail.";
  const a = analyzeTextRedac(post, numbersIn("Pourquoi publier plus souvent ne fait pas décoller ta portée"));
  assertEquals(a.fabricatedNumbers.length, 1, JSON.stringify(a.fabricatedNumbers));
  assertEquals(a.fabricatedNumbers[0].startsWith("trois semaines"), true);
  assertEquals(analyzeTextRedac(post, numbersIn("Mes séries me prennent 3 semaines")).fabricatedNumbers, []);
  assertEquals(analyzeTextRedac(post, numbersIn("trois semaines par série")).fabricatedNumbers, []);
  // Sans liste blanche (appelant qui ne mesure pas les chiffres) : rien.
  assertEquals(analyzeTextRedac(post).fabricatedNumbers, []);
  // « une semaine », « deux fois » (hors durée) : non concernés.
  assertEquals(analyzeTextRedac("Une semaine suffit. Relis deux fois ton texte.", numbersIn("brief")).fabricatedNumbers, []);
});
