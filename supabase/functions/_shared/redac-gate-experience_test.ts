// Vécu personnel inventé (04/10/2026) : après #1300 et #1310, un post LinkedIn
// sans réponse aux questions ouvrait encore sur « J'ai essayé. Résultat : moins
// de vues qu'avant. Je pensais que c'était moi… ». Le code mesure désormais le
// vécu au passé en première personne absent des sources.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import {
  analyzeTextRedac,
  buildTextFixInstructions,
  enforceNoInventedTestimonials,
  findInventedExperiences,
  runTextRedacGate,
  textRedacRawCount,
} from "./redac-gate.ts";
import { EDITORIAL_ANGLES_REFERENCE } from "./copywriting-prompts.ts";

setTestEnv();

const BRIEF = "Pourquoi publier plus souvent sur LinkedIn ne fait pas décoller ta portée";
const SEEN =
  "Doubler sa fréquence de publication sans voir sa portée bouger, c'est courant. J'ai essayé. Résultat : moins de vues qu'avant. Je pensais que c'était moi… En fait non.";
const CLEAN =
  "Publier plus souvent ne fait pas décoller ta portée, et je trouve qu'on le répète trop peu. " +
  "Doubler sa fréquence sans voir sa portée bouger, c'est courant : le réseau montre d'abord ton post à une petite partie de tes contacts. " +
  "Je pense que la vraie question est ailleurs : qu'est-ce qui donne envie de s'arrêter sur ce que tu écris ?";

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 100 } },
});

Deno.test("vécu : l'ouverture vue en test réel est détectée sans source, en un passage groupé", () => {
  const found = findInventedExperiences(`${SEEN}\n\n${CLEAN}`, BRIEF);
  assertEquals(found.length, 1);
  assertEquals(found[0].includes("J'ai essayé. Résultat : moins de vues"), true);
  assertEquals(found[0].includes("Je pensais que c'était moi"), true);
  assertEquals(found[0].includes("c'est courant"), false);
  assertEquals(findInventedExperiences(CLEAN, BRIEF), []);
});

Deno.test("vécu : variantes au passé en première personne", () => {
  for (
    const t of [
      "J'ai testé pendant un mois de publier chaque jour.",
      "J'ai longtemps cru qu'il fallait poster tous les jours.",
      "Je l'ai fait pendant six mois.",
      "J'ai doublé ma fréquence en janvier.",
      "Je croyais que l'algorithme me punissait.",
      "Je me suis rendu compte que personne ne lisait.",
      "J'étais convaincue que la régularité suffisait.",
      "Nous avons testé trois rythmes de publication.",
      "J’ai remarqué que mes posts du mardi marchaient mieux.",
      "J'ai tout essayé : carrousels, vidéos, sondages.",
    ]
  ) {
    assertEquals(findInventedExperiences(t, BRIEF).length, 1, t);
  }
});

Deno.test("vécu : pas de faux positif sur une opinion au présent, une hypothèse ou la voix du lecteur", () => {
  for (
    const t of [
      "Je pense que publier plus ne règle rien.",
      "J'ai l'impression qu'on confond régularité et volume.",
      "J'ai envie qu'on arrête de compter les posts.",
      "Tu te dis peut-être : j'ai tout essayé, rien ne marche.",
      "Tu as sûrement entendu « j'ai testé, ça ne marche pas ».",
      "Si je pensais que la fréquence suffisait, je posterais tous les jours.",
      "Comme je l'ai dit plus haut, la portée dépend des premières réactions.",
      "Résultat : ta portée stagne.",
      CLEAN,
    ]
  ) {
    assertEquals(findInventedExperiences(t, BRIEF), [], t);
  }
});

Deno.test("vécu : fourni par les réponses -> accepté ; source inconnue -> non mesuré", () => {
  const answers = `${BRIEF}\n${JSON.stringify(["J'ai publié tous les jours pendant un mois et ma portée a baissé"])}`;
  assertEquals(findInventedExperiences(SEEN, answers), []);
  assertEquals(findInventedExperiences(SEEN, `${BRIEF}\nMon test de 30 jours à publier chaque matin`), []);
  assertEquals(findInventedExperiences(SEEN, undefined), []);
  assertEquals(analyzeTextRedac(SEEN).inventedExperiences, []);
});

Deno.test("vécu : compté et transformé en instruction ciblée", () => {
  const a = analyzeTextRedac(`${SEEN}\n\n${CLEAN}`, undefined, undefined, undefined, undefined, BRIEF);
  assertEquals(a.inventedExperiences?.length, 1);
  assertEquals(textRedacRawCount(a), 1);
  const fix = buildTextFixInstructions(a);
  assertEquals(fix.includes("VÉCU PERSONNEL INVENTÉ"), true);
  assertEquals(fix.includes("J'ai essayé"), true);
});

Deno.test("gate texte : une correction qui INTRODUIT un vécu au passé est rejetée", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicText(`${SEEN}\n\n${CLEAN}`) });
  try {
    const gate = await runTextRedacGate(CLEAN, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5" },
      testimonySource: BRIEF,
    });
    assertEquals(gate.content, CLEAN);
    assertEquals(gate.reverted, true);
  } finally {
    mock.restore();
  }
});

Deno.test("passe dédiée : gardée si le vécu disparaît, rejetée s'il reste", async () => {
  const analyze = (t: string) => analyzeTextRedac(t, undefined, undefined, undefined, undefined, BRIEF);
  const withExperience = `${SEEN}\n\n${CLEAN}`;
  let prompt = "";
  let mock = installFetchMock({
    anthropic: () =>
      anthropicText(
        `Doubler sa fréquence de publication sans voir sa portée bouger, c'est courant. Souvent, la portée baisse même. Je pense que le problème n'est pas toi.\n\n${CLEAN}`,
      ),
  });
  const mocked = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((input: any, init?: any) => {
    prompt += String(init?.body ?? "");
    return mocked(input, init);
  }) as typeof fetch;
  try {
    const out = await enforceNoInventedTestimonials(withExperience, analyze, {});
    assertEquals(out.applied, true);
    assertEquals(out.content.includes("J'ai essayé"), false);
    assertEquals(prompt.includes("VÉCUS AU PASSÉ À RÉÉCRIRE"), true);
  } finally {
    mock.restore();
  }
  mock = installFetchMock({ anthropic: () => anthropicText(`J'ai testé moi aussi. Résultat : rien.\n\n${CLEAN}`) });
  try {
    const out = await enforceNoInventedTestimonials(withExperience, analyze, {});
    assertEquals(out.applied, false);
    assertEquals(out.content, withExperience);
  } finally {
    mock.restore();
  }
});

Deno.test("prompts : les modèles « j'ai testé / j'ai remarqué » exigent un vécu fourni", () => {
  assertEquals(EDITORIAL_ANGLES_REFERENCE.includes("n'est écrit que si le brief, les réponses ou l'actu fournissent ce vécu"), true);
  assertEquals(EDITORIAL_ANGLES_REFERENCE.includes("sans test fourni, aucun « j'ai testé / j'ai essayé / résultat : » inventé"), true);
});
