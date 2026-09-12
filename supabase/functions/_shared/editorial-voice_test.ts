import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeTextRedac, analyzeCarouselRedac, dropUserSourcedReversals, textRedacViolations, buildTextFixInstructions, runTextRedacGate } from "./redac-gate.ts";
import { authoredContentSource } from "./editorial-voice.ts";
import { claritySourceBlock } from "./content-clarity.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";

setTestEnv();

Deno.test("X. Pas Y. : première occurrence mesurée, ponctuation et lignes comprises", () => {
  for (const text of [
    "Des gens. Pas des statistiques.",
    "Du sens.\n\nPas du bruit.",
    "Une conversation. Pas une stratégie.",
    "Des échanges. Pas de l’engagement.",
  ]) {
    const analysis = analyzeTextRedac(text);
    assertEquals(analysis.reversals.length, 1, text);
    assertEquals(textRedacViolations(analysis), 1, text);
    assertStringIncludes(buildTextFixInstructions(analysis), "chaque passage");
  }
  const carousel = analyzeCarouselRedac({ slides: [{ title: "Des gens.", body: "Pas des statistiques." }], caption: {} });
  assertEquals(carousel.reversals.length, 1);
});

Deno.test("les négations d’information, les disponibilités et les limites restent intactes", () => {
  for (const text of [
    "Le savon n’est pas parfumé. Il contient de l’huile d’olive.",
    "La boutique ouvre samedi. Pas dimanche.",
    "Les commandes partent lundi. Pas de stock en boutique.",
    "Ce produit ne remplace pas un traitement.",
    "Je ne promets pas de résultat. Chaque peau réagit différemment.",
  ]) assertEquals(analyzeTextRedac(text).reversals, [], text);
});

Deno.test("une phrase personnelle entière est protégée, une simple ressemblance ne suffit pas", () => {
  const analysis = analyzeTextRedac("Des gens. Pas des statistiques.");
  assertEquals(dropUserSourcedReversals(analysis, "Garder : « Des gens. Pas des statistiques. »").reversals, []);
  assertEquals(dropUserSourcedReversals(analysis, "Des gens viennent découvrir mon métier.").reversals.length, 1);
  const source = authoredContentSource({ preGenAnswers: { conviction: "Ma phrase" }, branding: "slogan général", previousContent: "ancien post" });
  assertStringIncludes(source, "Ma phrase");
  assertEquals(source.includes("slogan général"), false);
  assertEquals(source.includes("ancien post"), false);
  assertStringIncludes(claritySourceBlock(undefined, source), "FORMULATIONS FOURNIES");
});

const response = (text: string) => ({ status: 200, body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } } });

Deno.test("un tic dans un texte court passe en correction ciblée sans imposer une longueur de 200 caractères", async () => {
  const original = "Des gens. Pas des statistiques.";
  const corrected = "Je prends le temps de répondre à chaque personne.";
  const mock = installFetchMock({ anthropic: () => response(corrected) });
  try {
    const result = await runTextRedacGate(original, { format: "instagram_caption", correction: {} });
    assertEquals(mock.anthropicCallCount, 1);
    assertEquals(result.content, corrected);
    assertEquals(result.violations, 0);
  } finally { mock.restore(); }
});

Deno.test("un verbatim court fourni est conservé et ne déclenche pas de correction", async () => {
  const original = "Des gens. Pas des statistiques.";
  const mock = installFetchMock({ anthropic: () => response("Ne devrait pas être appelé") });
  try {
    const result = await runTextRedacGate(original, { format: "instagram_caption", correction: { authoredText: original } });
    assertEquals(result.content, original);
    assertEquals(result.violations, 0);
    assertEquals(mock.anthropicCallCount, 0);
  } finally { mock.restore(); }
});

Deno.test("une correction qui introduit X. Pas Y. est rejetée", async () => {
  const original = "Je réponds aux messages après avoir rangé l’atelier. Les questions sur les dimensions me permettent de préciser les fiches produit, puis je prépare les photos qui montrent les pièces à côté d’une main pour donner une idée de leur taille.";
  const mock = installFetchMock({ anthropic: () => response(original + " Des gens. Pas des statistiques.") });
  try {
    const result = await runTextRedacGate(original, { format: "linkedin", correction: {} });
    assertEquals(result.content, original);
    assertEquals(result.reverted, true);
  } finally { mock.restore(); }
});
