import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeCarouselRedac, redacScore, runRedacGate } from "./redac-gate.ts";

// Bilan hebdo 05/10/2026 : la même présentation recopiée d'un carrousel à l'autre,
// notée 100/100. Le gate la mesure désormais sur tous les carrousels.
const recentTexts = ["Des pavots peints\nJe travaille surtout la faïence, parfois le grès. Je vis dans la Drôme, entourée d'arbres et de nature."];
const doc = {
  slides: [
    { slide_number: 1, title: "Ce que la table garde de l'atelier" },
    { slide_number: 2, title: "Je travaille surtout la faïence, parfois le grès, pour les gestes du quotidien." },
    { slide_number: 3, title: "Le décor vient sur une forme faite pour servir." },
  ],
  caption: { body: "Des pièces pour la table.", hashtags: [] },
};

Deno.test("gate carrousel : phrase reprise d'un contenu récent comptée, score baissé", () => {
  const clean = analyzeCarouselRedac(doc);
  const echoed = analyzeCarouselRedac(doc, undefined, undefined, { recentTexts });
  assertEquals(clean.recentEchoes, []);
  assertEquals(echoed.recentEchoes, ["Je travaille surtout la faïence, parfois le grès"]);
  assertEquals(redacScore(echoed), redacScore(clean) - 10);
});

Deno.test("gate carrousel : une phrase fournie dans la demande du jour n'est pas une redite", () => {
  const a = analyzeCarouselRedac(doc, undefined, undefined, {
    recentTexts, currentRequest: "Rappelle que je travaille surtout la faïence, parfois le grès",
  });
  assertEquals(a.recentEchoes, []);
});

Deno.test("gate carrousel : quality_check expose recent_echoes (0 sans contenus récents)", async () => {
  for (const [echo, n] of [[{ recentTexts }, 1], [undefined, 0]] as const) {
    const res = await runRedacGate(JSON.stringify(doc), { isLinkedIn: false, echo, correction: { enabled: false } });
    assertEquals(JSON.parse(res.content).quality_check.recent_echoes, n);
    assert(res.score != null);
    assert(res.score <= 100);
  }
});
