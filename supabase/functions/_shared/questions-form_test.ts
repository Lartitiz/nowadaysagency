import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { questionTropLongue, questionsTropLongues } from "./questions-form.ts";
import { relancerQuestionsSiBesoin } from "../carousel-ai/questions-address.ts";

// Vraie question du 12/11/2026, jugée illisible par Laetitia.
const LOURDE = "Ce carrousel doit-il rester sur l'idée générale (le lot bloquant fixe la durée de portage) ou t'appuyer sur une opération réelle que tu as menée, avec ses chiffres anonymisés ?";
const json = (...qs: string[]) => JSON.stringify({ questions: qs.map((question) => ({ question, placeholder: "Ex. : oui" })) });

Deno.test("questions-form : la question du 12/11 est trop longue, la version courte passe", () => {
  assert(questionTropLongue(LOURDE));
  assert(!questionTropLongue("Tu as un cas réel à raconter pour illustrer ça ?"));
  assert(questionTropLongue("Tu as un cas (réel) ?"));
  assert(questionsTropLongues(json("Quel chiffre montrer d'abord ?", LOURDE)));
  assert(!questionsTropLongues(json("Quel chiffre montrer d'abord ?")));
  assert(!questionsTropLongues("pas du json"));
});

Deno.test("relance : une seule, gardée seulement si elle règle le défaut", async () => {
  let appels = 0;
  const courte = json("Tu as un cas réel à raconter ?");
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async (c) => { appels++; assert(c.includes("20 mots")); return courte; }), courte);
  assertEquals(appels, 1);
  // Rien à corriger : aucun appel.
  assertEquals(await relancerQuestionsSiBesoin(courte, async () => { throw new Error("ne doit pas relancer"); }), courte);
  // Relance encore trop longue ou en échec : on garde la première version.
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async () => json(LOURDE + " encore")), json(LOURDE));
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async () => { throw new Error("réseau"); }), json(LOURDE));
  // Vouvoiement et longueur : une seule consigne qui demande les deux.
  await relancerQuestionsSiBesoin(json("Votre " + LOURDE), async (c) => { assert(c.includes("tutoyant") && c.includes("20 mots")); return courte; });
});
