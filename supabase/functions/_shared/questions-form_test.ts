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
  // 14/11 : deux phrases courtes et précises passent (la précision prime).
  assert(!questionTropLongue("Pense à ta dernière opération bloquée par un lot. Combien de temps la revente a-t-elle été retardée, et qu'est-ce qui l'a débloquée ?"));
  assert(questionsTropLongues(json("Quel chiffre montrer d'abord ?", LOURDE)));
  assert(!questionsTropLongues(json("Quel chiffre montrer d'abord ?")));
  assert(!questionsTropLongues("pas du json"));
});

Deno.test("questions-form : la règle demande de la matière concrète et interdit le oui/non", async () => {
  const { QUESTIONS_FORM_RULES, QUESTIONS_COURTES_RETRY } = await import("./questions-form.ts");
  assert(QUESTIONS_FORM_RULES.includes("30 mots au plus"));
  assert(QUESTIONS_FORM_RULES.includes("oui ou non"));
  assert(QUESTIONS_FORM_RULES.includes("vocabulaire de son métier"));
  // L'ancien exemple passe-partout n'est plus donné comme modèle à suivre.
  assert(QUESTIONS_FORM_RULES.includes("Trop vague : « Tu as un cas réel"));
  assert(QUESTIONS_COURTES_RETRY.includes("raccourcis la forme, pas le fond"));
});

Deno.test("relance : une seule, gardée seulement si elle règle le défaut", async () => {
  let appels = 0;
  const courte = json("Tu as un cas réel à raconter ?");
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async (c) => { appels++; assert(c.includes("30 mots")); return courte; }), courte);
  assertEquals(appels, 1);
  // Rien à corriger : aucun appel.
  assertEquals(await relancerQuestionsSiBesoin(courte, async () => { throw new Error("ne doit pas relancer"); }), courte);
  // Relance encore trop longue ou en échec : on garde la première version.
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async () => json(LOURDE + " encore")), json(LOURDE));
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async () => { throw new Error("réseau"); }), json(LOURDE));
  // Vouvoiement et longueur : une seule consigne qui demande les deux.
  await relancerQuestionsSiBesoin(json("Votre " + LOURDE), async (c) => { assert(c.includes("tutoyant") && c.includes("30 mots")); return courte; });
});
