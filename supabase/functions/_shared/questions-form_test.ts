import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aUnInterrogatif, couperListeOptions, couperListesDesQuestions, deuxQuestionsEnUne, garderQuestionsSaines, questionFermee, questionTropLongue, questionsTropLongues } from "./questions-form.ts";
import { relancerQuestionsSiBesoin } from "../carousel-ai/questions-address.ts";

// Vraie question du 12/11/2026, jugée illisible par Laetitia.
const LOURDE = "Ce carrousel doit-il rester sur l'idée générale (le lot bloquant fixe la durée de portage) ou t'appuyer sur une opération réelle que tu as menée, avec ses chiffres anonymisés ?";
const json = (...qs: string[]) => JSON.stringify({ questions: qs.map((question) => ({ question, placeholder: "Ex. : oui" })) });

Deno.test("questions-form : la question du 12/11 est trop longue, la version courte passe", () => {
  assert(questionTropLongue(LOURDE));
  assert(!questionTropLongue("Tu as un cas réel à raconter pour illustrer ça ?"));
  assert(questionTropLongue("Tu as un cas (réel) ?"));
  // 14/11 : deux phrases courtes et précises passent (la précision prime).
  assert(!questionTropLongue("Pense à ta dernière opération bloquée par un lot : qu'est-ce qui a fini par débloquer la revente ?"));
  // Vu en ligne le 14/11 : deux questions en une, relancée.
  assert(questionTropLongue("Comment tu remplaces le parfum de synthèse ? Et qu'est-ce que ça change à l'odeur ?"));
  assert(questionsTropLongues(json("Quel chiffre montrer d'abord ?", LOURDE)));
  assert(!questionsTropLongues(json("Quel chiffre montrer d'abord ?")));
  assert(!questionsTropLongues("pas du json"));
});

Deno.test("questions-form : la règle demande de la matière concrète et interdit le oui/non", async () => {
  const { QUESTIONS_FORM_RULES, QUESTIONS_COURTES_RETRY } = await import("./questions-form.ts");
  assert(QUESTIONS_FORM_RULES.includes("jamais plus de 30"));
  assert(QUESTIONS_FORM_RULES.includes("Un seul point d'interrogation"));
  assert(QUESTIONS_FORM_RULES.includes("oui ou non"));
  assert(QUESTIONS_FORM_RULES.includes("vocabulaire de son métier"));
  // L'ancien exemple passe-partout n'est plus donné comme modèle à suivre.
  assert(QUESTIONS_FORM_RULES.includes("Trop vague : « Tu as un cas réel"));
  assert(QUESTIONS_COURTES_RETRY.includes("raccourcis la forme, pas le fond"));
});

Deno.test("relance : une seule, gardée seulement si elle règle le défaut", async () => {
  let appels = 0;
  const courte = json("Tu as un cas réel à raconter ?");
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async (c) => { appels++; assert(c.includes("jamais plus de 30")); return courte; }), courte);
  assertEquals(appels, 1);
  // Rien à corriger : aucun appel.
  assertEquals(await relancerQuestionsSiBesoin(courte, async () => { throw new Error("ne doit pas relancer"); }), courte);
  // Relance encore trop longue ou en échec : on garde la première version.
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async () => json(LOURDE + " encore")), json(LOURDE));
  assertEquals(await relancerQuestionsSiBesoin(json(LOURDE), async () => { throw new Error("réseau"); }), json(LOURDE));
  // Vouvoiement et longueur : une seule consigne qui demande les deux.
  await relancerQuestionsSiBesoin(json("Votre " + LOURDE), async (c) => { assert(c.includes("tutoyant") && c.includes("jamais plus de 30")); return courte; });
});

Deno.test("questions-form : la liste de choix en fin de question est coupée (sonde ❓ du 15/11)", () => {
  assertEquals(
    couperListeOptions("Quand tu as décidé de ne plus utiliser de parfum de synthèse dans tes savons, qu'est-ce qui t'a fait basculer : une réaction cutanée, une cliente qui te l'a dit, ou une lecture sur les ingrédients ?"),
    "Quand tu as décidé de ne plus utiliser de parfum de synthèse dans tes savons, qu'est-ce qui t'a fait basculer ?",
  );
  // Pas une liste : on ne touche à rien.
  const ouverte = "Pense à ta dernière opération bloquée : qu'est-ce qui a fini par débloquer la revente ?";
  assertEquals(couperListeOptions(ouverte), ouverte);
  const sansVirgule = "Quand un client hésite, que fais-tu : tu rappelles ou tu attends ?";
  assertEquals(couperListeOptions(sansVirgule), sansVirgule);
  // Dans une réponse JSON : seule la question change, le placeholder reste.
  const json = JSON.stringify({ questions: [{ question: "Sur tes marchés, qu'est-ce qui fait revenir une cliente : un geste, une phrase, ou un échantillon glissé dans le sac ?", placeholder: "Par exemple : un échantillon" }] });
  const out = JSON.parse(couperListesDesQuestions(json));
  assertEquals(out.questions[0].question, "Sur tes marchés, qu'est-ce qui fait revenir une cliente ?");
  assertEquals(out.questions[0].placeholder, "Par exemple : un échantillon");
  assertEquals(couperListesDesQuestions("pas du json"), "pas du json");
});

Deno.test("questions-form : questions fermées repérées, invitations et questions ouvertes non (sonde ❓ du 15/11)", async () => {
  assert(questionFermee("Y a-t-il une question précise de tes clientes sur la peau sensible qui revient souvent ?"));
  assert(questionFermee("Pour les deux autres erreurs du carrousel, tu as un exemple concret à donner ?"));
  assert(questionFermee("As-tu déjà entendu une cliente comparer tes savons à un savon du supermarché ?"));
  assert(!questionFermee("Peux-tu raconter une situation précise où une cliente a remarqué une différence ?"));
  assert(!questionFermee("Quand un savon tourne, à quelle étape de ta méthode t'en rends-tu compte, et à quoi le reconnais-tu ?"));
  // Une question fermée déclenche une relance, gardée si elle est ouverte.
  const fermee = JSON.stringify({ questions: [{ question: "Y a-t-il une question de tes clientes qui revient souvent ?", placeholder: "x" }] });
  const ouverte = JSON.stringify({ questions: [{ question: "Quelle question de tes clientes revient le plus souvent au stand ?", placeholder: "x" }] });
  let appels = 0;
  const out = await relancerQuestionsSiBesoin(fermee, async (consigne) => { appels++; assert(consigne.includes("oui ou non")); return ouverte; });
  assertEquals(appels, 1);
  assertEquals(out, ouverte);
});

// Répétition du rendez-vous du 27/11 (25/11/2026, compte du parcours immobilier).
Deno.test("questions-form : la liste coupée ne laisse jamais une phrase qui n'interroge plus", () => {
  // Avant : « Pense à ta toute première opération de marchand de biens ? ».
  const q = "Pense à ta toute première opération de marchand de biens : qu'est-ce qui t'a le plus surprise, le prix, le délai ou le notaire ?";
  assertEquals(couperListeOptions(q), q);
  assert(aUnInterrogatif("Sur tes marchés, qu'est-ce qui fait revenir une cliente"));
  assert(aUnInterrogatif("Quand un client hésite, que fais-tu"));
  assert(!aUnInterrogatif("Pense à ta toute première opération de marchand de biens"));
});

Deno.test("questions-form : deux questions en une, même sous un seul « ? », déclenchent la relance", () => {
  assert(deuxQuestionsEnUne("Comment tu remplaces le parfum de synthèse ? Et qu'est-ce que ça change à l'odeur ?"));
  assert(deuxQuestionsEnUne("Quelle étape de ta méthode surprend le plus tes acheteurs, et veux-tu la montrer avec un chiffre ?"));
  assert(questionTropLongue("Quelle étape de ta méthode surprend le plus tes acheteurs, et veux-tu la montrer avec un chiffre ?"));
  assert(!deuxQuestionsEnUne("Quelle étape de ta méthode surprend le plus tes acheteurs et tes notaires ?"));
  assert(!deuxQuestionsEnUne("Pense à ta dernière opération bloquée par un lot : qu'est-ce qui a fini par débloquer la revente ?"));
  assert(!deuxQuestionsEnUne("Raconte ta dernière visite et dis-moi comment tu as chiffré les travaux."));
});

Deno.test("filet : une question qui dit « votre » et « veux-tu » ne sort jamais", async () => {
  const melange = { question: "Dans votre méthode, quelle étape veux-tu montrer en premier ?", placeholder: "Ex. : le chiffrage des travaux" };
  const saine = { question: "Quel chiffre de ta dernière opération surprend le plus tes acheteurs ?", placeholder: "Ex. : 4 mois de portage" };
  const corrigee = { question: "Dans ta méthode, quelle étape veux-tu montrer en premier ?", placeholder: "Ex. : le chiffrage des travaux" };
  const doc = (...questions: unknown[]) => JSON.stringify({ questions });
  // La relance échoue : la question fautive est retirée, la saine reste.
  assertEquals(JSON.parse(await relancerQuestionsSiBesoin(doc(melange, saine), async () => { throw new Error("réseau"); })).questions, [saine]);
  // La relance corrige cette question mais en allonge une autre : on prend la correction, question par question.
  const longue = { question: saine.question.replace(" ?", " (hors frais) ?"), placeholder: saine.placeholder };
  assertEquals(JSON.parse(await relancerQuestionsSiBesoin(doc(melange, longue), async () => doc(corrigee, longue))).questions, [corrigee, longue]);
  // Toutes fautives et relance en échec : on garde tout plutôt qu'un écran vide.
  assertEquals(garderQuestionsSaines(doc(melange)), doc(melange));
  // Suivi de creative-flow : même filet sur follow_up_questions.
  assertEquals(JSON.parse(garderQuestionsSaines(JSON.stringify({ follow_up_questions: [melange, saine] }))).follow_up_questions, [saine]);
  // Rien de fautif : texte rendu tel quel.
  assertEquals(garderQuestionsSaines(doc(saine)), doc(saine));
});
