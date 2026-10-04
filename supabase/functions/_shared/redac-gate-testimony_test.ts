// Témoignages inventés (04/10/2026) : deux posts LinkedIn successifs, sans
// réponse aux questions, ouvraient sur « Une céramiste me disait récemment… ».
// Le code mesure désormais la parole rapportée absente des sources.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import {
  analyzeTextRedac,
  buildTextFixInstructions,
  enforceNoInventedTestimonials,
  findInventedTestimonials,
  runTextRedacGate,
  textRedacRawCount,
} from "./redac-gate.ts";
import { EMBEDDED_EDUCATION } from "./copywriting-prompts.ts";
import { linkedinBrief } from "./format-briefs.ts";

setTestEnv();

const BRIEF = "Pourquoi publier plus souvent sur LinkedIn ne fait pas décoller ta portée";
const CERAMISTE_1 = "Une céramiste me disait récemment qu'elle avait doublé sa fréquence de publication, et que sa portée n'avait pas bougé.";
const CERAMISTE_2 = "Une céramiste me disait récemment qu'elle postait tous les jours depuis un mois.";
const CLEAN =
  "Publier plus souvent ne fait pas décoller ta portée, et je trouve qu'on le répète trop peu. " +
  "Doubler sa fréquence sans voir sa portée bouger, c'est courant : le réseau montre d'abord ton post à une petite partie de tes contacts. " +
  "Je pense que la vraie question est ailleurs : qu'est-ce qui donne envie de s'arrêter sur ce que tu écris ?";

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 100 } },
});

Deno.test("témoignage : les deux ouvertures vues en test réel sont détectées sans source", () => {
  assertEquals(findInventedTestimonials(`${CERAMISTE_1}\n\n${CLEAN}`, BRIEF).length, 1);
  assertEquals(findInventedTestimonials(`${CERAMISTE_2} ${CLEAN}`, BRIEF).length, 1);
  assertEquals(findInventedTestimonials(CLEAN, BRIEF), []);
});

Deno.test("témoignage : variantes de parole rapportée et de rencontre", () => {
  for (
    const t of [
      "Mes client·es me disent souvent qu'ils n'ont pas le temps.",
      "Une cliente, l'autre jour, m'a dit qu'elle avait tout arrêté.",
      "Un·e photographe m'a confié qu'elle n'osait plus publier.",
      "Une amie qui vend des bijoux m'a écrit hier soir.",
      "La semaine dernière, j'ai discuté avec une créatrice de savons.",
      "Plusieurs indépendantes m'ont raconté la même chose.",
    ]
  ) {
    assertEquals(findInventedTestimonials(t, BRIEF).length, 1, t);
  }
});

Deno.test("témoignage : pas de faux positif sur une opinion ou un sujet qui n'est pas une personne", () => {
  for (
    const t of [
      "Mon instinct me dit que la régularité ne suffit pas.",
      "Mon père m'a fabriqué ces moules l'hiver dernier.",
      "Une étude m'a montré que la portée baisse.",
      "Je pense que publier plus ne règle rien.",
      "On me demande souvent combien de fois publier.",
      CLEAN,
    ]
  ) {
    assertEquals(findInventedTestimonials(t, BRIEF), [], t);
  }
});

Deno.test("témoignage : fourni par les réponses -> accepté ; source inconnue -> non mesuré", () => {
  const answers = `${BRIEF}\n["Une cliente m'a dit qu'elle publiait tous les jours sans résultat"]`;
  assertEquals(findInventedTestimonials("Une cliente me disait qu'elle publiait tous les jours.", answers), []);
  assertEquals(findInventedTestimonials(CERAMISTE_1, undefined), []);
  assertEquals(analyzeTextRedac(CERAMISTE_1).inventedTestimonials, []);
});

Deno.test("témoignage : compté et transformé en instruction ciblée", () => {
  const a = analyzeTextRedac(`${CERAMISTE_1} ${CLEAN}`, undefined, undefined, undefined, undefined, BRIEF);
  assertEquals(a.inventedTestimonials?.length, 1);
  assertEquals(textRedacRawCount(a), 1);
  const fix = buildTextFixInstructions(a);
  assertEquals(fix.includes("TÉMOIGNAGE INVENTÉ"), true);
  assertEquals(fix.includes("Une céramiste me disait"), true);
});

Deno.test("gate texte : une correction qui INTRODUIT un témoignage est rejetée", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicText(`${CERAMISTE_1} ${CLEAN}`) });
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

Deno.test("passe dédiée : gardée si le témoignage disparaît, rejetée s'il reste", async () => {
  const analyze = (t: string) => analyzeTextRedac(t, undefined, undefined, undefined, undefined, BRIEF);
  const withTestimony = `${CERAMISTE_1}\n\n${CLEAN}`;
  let mock = installFetchMock({ anthropic: () => anthropicText(`Doubler sa fréquence de publication sans voir sa portée bouger, c'est courant.\n\n${CLEAN}`) });
  try {
    const out = await enforceNoInventedTestimonials(withTestimony, analyze, {});
    assertEquals(out.applied, true);
    assertEquals(out.content.includes("céramiste"), false);
  } finally {
    mock.restore();
  }
  mock = installFetchMock({ anthropic: () => anthropicText(`${CERAMISTE_2}\n\n${CLEAN}`) });
  try {
    const out = await enforceNoInventedTestimonials(withTestimony, analyze, {});
    assertEquals(out.applied, false);
    assertEquals(out.content, withTestimony);
  } finally {
    mock.restore();
  }
});

Deno.test("prompts : les exemples de cliente ne sont plus une matière à reprendre sans vécu fourni", () => {
  assertEquals(EMBEDDED_EDUCATION.includes("CONDITION DE VÉRITÉ"), true);
  assertEquals(EMBEDDED_EDUCATION.includes("un retour client ou une conversation absents des sources est un témoignage inventé"), true);
  const brief = linkedinBrief(null);
  assertEquals(brief.includes("une céramiste m'a confié"), true);
  assertEquals(brief.includes("Sans vécu fourni, ouvre sur le constat ou sur ta position."), true);
});
