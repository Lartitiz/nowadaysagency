// Contraste « pas X. Y » au même verbe (re-test réel LinkedIn 04/10/2026) :
// « Je ne cherche pas à produire plus de pièces. Je cherche les quelques-unes… »
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeTextRedac } from "./redac-gate.ts";

const REAL =
  "C'est exactement ce que je fais dans mon atelier. Je ne cherche pas à produire plus de pièces. Je cherche les quelques-unes qui ont une vraie identité. Le reste, c'est du bruit, même en faïence.";

Deno.test("contraste même verbe : le passage réel est compté une fois", () => {
  const a = analyzeTextRedac(REAL);
  assertEquals(a.reversals.length, 1, JSON.stringify(a.reversals));
  assertEquals(a.reversals[0].includes("Je ne cherche pas à produire plus de pièces. Je cherche"), true);
});

Deno.test("contraste même verbe : variantes détectées", () => {
  for (
    const s of [
      "On n'achète pas un objet. On achète une histoire.",
      "Je n'écris pas pour l'algorithme. J'écris pour les gens qui me lisent.",
      "Tu ne vends pas un bol. Tu vends un moment.",
      "Elle ne publie pas plus. Elle publie mieux.",
      "Vous ne cherchez pas la visibilité. Mais vous cherchez la confiance.",
    ]
  ) {
    assertEquals(analyzeTextRedac(s).reversals.length, 1, `non détecté : ${s}`);
  }
});

Deno.test("contraste même verbe : pas de faux positif", () => {
  for (
    const s of [
      "Je ne publie pas le week-end. Je prépare mes pièces le samedi.",
      "On ne voit pas tout de suite l'effet. On le mesure au bout d'un mois.",
      "Je ne cherche pas à plaire à tout le monde, et je l'assume.",
      "Je cherche des pièces qui ont une identité.",
      "Tu ne publies pas assez ? Ce n'est pas grave.",
    ]
  ) {
    assertEquals(analyzeTextRedac(s).reversals, [], `faux positif : ${s}`);
  }
});
