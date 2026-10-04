// « Ton cas d'abord » (04/10/2026) : quand la personne a donné son propre cas,
// au plus UN chiffre de la seule recherche. Le code compte ces chiffres et une
// passe courte retire l'excédent ; le code relit la passe.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import {
  analyzeCarouselRedac,
  carouselRedacRawCount,
  emptiedMarkers,
  enforceResearchNumberCap,
  findResearchNumbersUsed,
  numbersIn,
  researchNumbers,
  runRedacGate,
} from "./redac-gate.ts";
import { extractCarouselTexts, reinjectCarouselTexts } from "./correction-pass.ts";

setTestEnv();

const BRIEF = "Oui, j'utilise l'IA générative. Avant je ne faisais que la stratégie. Aujourd'hui je livre stratégie, site et e-mails pour 2 100 € TTC. Sans IA ce serait au moins 7 500 €.";
const RESEARCH = "L'IA consomme 1,5 % de l'électricité mondiale (AIE, 2024). 40 % des TPE utilisent déjà l'IA (Bpifrance, 2025). La consommation des data centers a doublé en 5 ans.";
const research = researchNumbers(numbersIn(BRIEF), RESEARCH, BRIEF)!;

const doc = () => ({
  slides: [
    { slide_number: 1, title: "Oui, j'utilise l'IA générative", body: "" },
    { slide_number: 2, title: "Ce que ça change", body: "Aujourd'hui je livre stratégie, site et e-mails pour 2 100 € TTC. Sans l'IA, ce serait au moins 7 500 €." },
    { slide_number: 3, title: "Le coût caché", body: "L'IA consomme 1,5 % de l'électricité mondiale (AIE, 2024). Et 40 % des TPE l'utilisent déjà (Bpifrance, 2025)." },
    { slide_number: 4, title: "Ce qui me fait douter", body: "La consommation des data centers a doublé en 5 ans. J'ai peur que mon métier disparaisse." },
  ],
  caption: { hook: "Oui, j'utilise l'IA.", body: "Je vous explique pourquoi.", cta: "", hashtags: [] },
});

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 100 } },
});

const analyze = (d: any) => analyzeCarouselRedac(d, numbersIn(`${BRIEF}\n${RESEARCH}`), undefined, undefined, research, BRIEF);

Deno.test("cas personnel : les chiffres de la seule recherche sont comptés, sourcés ou non ; ceux du brief jamais", () => {
  const used = findResearchNumbersUsed(doc().slides.map((s) => `${s.title} ${s.body}`), research);
  assertEquals(used.map((u) => u.split(" (")[0]), ["1,5", "40", "5"]);
  assertEquals(analyze(doc()).researchNumbersUsed?.length, 3);
  // Sans recherche : rien à compter.
  assertEquals(findResearchNumbersUsed(["2 100 € TTC"], undefined), []);
});

Deno.test("cas personnel : quality_check porte le compteur et le plafond, sans appel IA quand la correction est coupée", async () => {
  const mock = installFetchMock({ anthropic: () => { throw new Error("aucun appel attendu"); } });
  try {
    const gate = await runRedacGate(JSON.stringify(doc()), {
      isLinkedIn: false, inputText: `${BRIEF}\n${RESEARCH}`, researchText: RESEARCH, testimonySource: BRIEF,
      researchNumbersCap: 1, correction: { enabled: false },
    });
    const qc = JSON.parse(gate.content).quality_check;
    assertEquals(qc.research_numbers_used, 3);
    assertEquals(qc.research_numbers_cap, 1);
    assertEquals(mock.anthropicCallCount, 0);
  } finally {
    mock.restore();
  }
});

Deno.test("cas personnel : sans cas fourni, pas de plafond (compteur seul)", async () => {
  const gate = await runRedacGate(JSON.stringify(doc()), {
    isLinkedIn: false, inputText: `${BRIEF}\n${RESEARCH}`, researchText: RESEARCH, testimonySource: BRIEF, correction: { enabled: false },
  });
  const qc = JSON.parse(gate.content).quality_check;
  assertEquals(qc.research_numbers_used, 3);
  assertEquals(qc.research_numbers_cap, null);
});

Deno.test("cas personnel : la passe retire l'excédent, garde les chiffres du brief et ne laisse pas de trou", async () => {
  const d = doc();
  const block = extractCarouselTexts(d);
  const trimmed = block
    .replace(" Et 40 % des TPE l'utilisent déjà (Bpifrance, 2025).", "")
    .replace("La consommation des data centers a doublé en 5 ans. ", "");
  const mock = installFetchMock({ anthropic: () => anthropicText(trimmed) });
  try {
    const out = await enforceResearchNumberCap(block, (b) => analyze(reinjectCarouselTexts(d, b)), 1, {
      otherCount: (a) => carouselRedacRawCount(a),
      reject: (c) => emptiedMarkers(block, c).length ? "vide" : null,
    });
    assert(out.applied);
    assertEquals(out.analysis.researchNumbersUsed?.length, 1);
    const final = reinjectCarouselTexts(d, out.content);
    assert(final.slides[1].body.includes("2 100 €"));
    assert(final.slides[1].body.includes("7 500 €"));
    assert(final.slides[3].body.includes("J'ai peur que mon métier disparaisse."));
    // La consigne envoyée nomme les chiffres et le plafond.
    const sent = JSON.stringify(mock.anthropicRequests[0]);
    assert(sent.includes("40 %") && sent.includes("MAXIMUM DE CHIFFRES DE RECHERCHE À GARDER : 1"));
  } finally {
    mock.restore();
  }
});

Deno.test("cas personnel : passe refusée si elle vide un passage ou ne fait pas baisser le compte", async () => {
  const d = doc();
  const block = extractCarouselTexts(d);
  // Vide la slide 3 entière : trou dans le carrousel.
  const emptied = block.replace(/(\[SLIDE 3 - BODY\]) [^\n]*/, "$1 ");
  assertEquals(emptiedMarkers(block, emptied), ["SLIDE 3 - BODY"]);
  let mock = installFetchMock({ anthropic: () => anthropicText(emptied) });
  try {
    const out = await enforceResearchNumberCap(block, (b) => analyze(reinjectCarouselTexts(d, b)), 1, {
      otherCount: (a) => carouselRedacRawCount(a),
      reject: (c) => emptiedMarkers(block, c).length ? "passage vidé" : null,
    });
    assertEquals(out.applied, false);
    assertEquals(out.content, block);
  } finally {
    mock.restore();
  }
  // Réécriture sans effet sur le compte : texte d'origine gardé.
  const reworded = block.replace("Ce que ça change", "Ce que l'IA change");
  mock = installFetchMock({ anthropic: () => anthropicText(reworded) });
  try {
    const out = await enforceResearchNumberCap(block, (b) => analyze(reinjectCarouselTexts(d, b)), 1, {
      otherCount: (a) => carouselRedacRawCount(a),
    });
    assertEquals(out.applied, false);
  } finally {
    mock.restore();
  }
});

Deno.test("cas personnel : sous le plafond, aucune passe", async () => {
  const d = doc();
  d.slides[2].body = "L'IA consomme 1,5 % de l'électricité mondiale (AIE, 2024).";
  d.slides[3].body = "J'ai peur que mon métier disparaisse.";
  const mock = installFetchMock({ anthropic: () => { throw new Error("aucun appel attendu"); } });
  try {
    const out = await enforceResearchNumberCap(extractCarouselTexts(d), (b) => analyze(reinjectCarouselTexts(d, b)), 1, { otherCount: () => 0 });
    assertEquals(out.applied, false);
    assertEquals(mock.anthropicCallCount, 0);
  } finally {
    mock.restore();
  }
});
