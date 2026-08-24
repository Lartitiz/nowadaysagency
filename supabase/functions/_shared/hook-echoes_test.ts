import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeTextRedac, findHookEchoes, textHook, textRedacViolations } from "./redac-gate.ts";
import { subjectKey } from "./previous-hooks.ts";

// Le sujet réel de la semaine du 24/08 : une transcription de note vocale.
const SUJET =
  "Je voudrais. Euh. J'ai fait une série sur ça m'énerve, donc j'ai mis ça m'énerve. Les pensions qui maltraitent les chevaux.";

// Les trois accroches RÉELLES, notées 100/100 chacune par le gate d'alors.
const HOOK_1 = "En 2026, on utilise encore l'immersion sur les chevaux. Et franchement, ça m'énerve.";
const HOOK_2 =
  "En 2026, on désensibilise encore un cheval en secouant un drapeau devant lui jusqu'à ce qu'il arrête de bouger.";
const HOOK_3 =
  "On est en 2026 et il y a encore des pros qui secouent un drapeau devant un cheval jusqu'à ce qu'il arrête de bouger. Ça a un nom : l'immersion.";

Deno.test("findHookEchoes : les 3 accroches jumelles du 24/08 sont vues comme des redites", () => {
  // 2e génération : elle redit la 1re (« en 2026 … encore »).
  assertEquals(findHookEchoes(HOOK_2, [HOOK_1], SUJET).length, 1);
  // 3e génération : elle redit les deux précédentes, malgré une tournure
  // différente (« On est en 2026 et il y a encore… »).
  assertEquals(findHookEchoes(HOOK_3, [HOOK_1, HOOK_2], SUJET).length, 2);
});

Deno.test("findHookEchoes : le VOCABULAIRE DU SUJET ne déclenche jamais à lui seul", () => {
  // Le piège central. Ces deux accroches du même sujet partagent « le rond de
  // longe » — c'est le sujet, pas une redite de formulation. Elles ouvrent bien
  // différemment (question de connivence vs hypothèse à contre-courant).
  const sujet = "Le rond de longe et la relation au cheval";
  const a = "Le rond de longe, on en parle ?";
  const b = "Et si le rond de longe, cet outil que tout le monde utilise pour créer du lien, faisait en fait l'inverse ?";
  assertEquals(findHookEchoes(b, [a], sujet), []);
});

Deno.test("findHookEchoes : deux angles vraiment différents passent", () => {
  const sujet = "L'immersion et la désensibilisation des chevaux";
  const a = "En 2026, on utilise encore l'immersion sur les chevaux.";
  const b = "Mardi dernier, une cavalière m'a écrit : « il vient enfin vers moi ».";
  assertEquals(findHookEchoes(b, [a], sujet), []);
});

Deno.test("findHookEchoes : un mot outil partagé ne suffit pas", () => {
  // « on en » / « c'est » : sans mot distinctif, aucune redite.
  assertEquals(findHookEchoes("On en fait trop.", ["On en parle demain."], "sujet quelconque"), []);
});

Deno.test("findHookEchoes : sans historique, comportement strictement inchangé", () => {
  assertEquals(findHookEchoes(HOOK_1, undefined, SUJET), []);
  assertEquals(findHookEchoes(HOOK_1, [], SUJET), []);
  assertEquals(findHookEchoes("", [HOOK_1], SUJET), []);
});

Deno.test("analyzeTextRedac : l'écho compte comme UNE violation, pas plus", () => {
  const texte = `${HOOK_3}\n\nLe mécanisme est simple : on pousse le cheval dans sa zone rouge.`;
  const sans = analyzeTextRedac(texte, undefined, undefined);
  assertEquals(sans.hookEchoes, []);
  assertEquals(textRedacViolations(sans), 0);

  const avec = analyzeTextRedac(texte, undefined, undefined, {
    previousHooks: [HOOK_1, HOOK_2],
    subject: SUJET,
  });
  assertEquals(avec.hookEchoes.length, 2);
  // Deux accroches en écho = UNE accroche à réécrire.
  assertEquals(textRedacViolations(avec), 1);
});

Deno.test("textHook : l'accroche d'un texte libre est sa 1re phrase", () => {
  assertEquals(
    textHook("En 2026, on désensibilise encore un cheval. Et ça m'énerve.\n\nSuite du post."),
    "En 2026, on désensibilise encore un cheval.",
  );
  assertEquals(textHook(""), "");
});

Deno.test("subjectKey : rapproche les mêmes sujets, sépare les autres", () => {
  assertEquals(subjectKey("  Les Pensions qui maltraitent les chevaux.  "), subjectKey("les pensions qui maltraitent les chevaux"));
  assertEquals(subjectKey("un sujet") === subjectKey("un autre sujet"), false);
  // Trop court pour être un sujet : le garde-fou de fetchPreviousHooks s'appuie dessus.
  assertEquals(subjectKey("oui").length < 8, true);
});
