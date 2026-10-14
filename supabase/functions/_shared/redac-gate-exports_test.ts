// Surface d'export de _shared/redac-gate.ts, AVANT son découpage
// (docs/robustesse/gros-fichiers.md, fiche 7, lot 0, test 1). Au découpage,
// redac-gate.ts ne contiendra plus que des réexports nommés : ce test attrape
// un export oublié ou ajouté par erreur (43 valeurs + 8 types = 51).
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/redac-gate-exports_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as redacGate from "./redac-gate.ts";

Deno.test("redac-gate : la liste des valeurs exportées est exactement celle attendue (43)", () => {
  assertEquals(Object.keys(redacGate).sort(), [
    "analyzeCarouselRedac",
    "analyzeTextRedac",
    "applyGuardedCarouselCorrection",
    "buildTextFixInstructions",
    "captionEndingViolated",
    "carouselRedacRawCount",
    "countAnaphoraAcrossSlides",
    "countChoppyFragments",
    "countEmptyAdjectives",
    "countResultConclusionOpeners",
    "countStaccatoAcrossSlides",
    "dropUserSourcedReversals",
    "emptiedMarkers",
    "enforceNoInventedTestimonials",
    "enforceResearchNumberCap",
    "enforceResearchNumberSources",
    "findBrandCopyOverlap",
    "findChoppyFragments",
    "findHookEchoes",
    "findInventedExperiences",
    "findInventedTestimonials",
    "findRecentEchoes",
    "findResearchNumbersUsed",
    "findSharedPassages",
    "findUnsourcedResearchNumbers",
    "fixElisionsInFields",
    "fixFrenchElisions",
    "hookEchoesBefore",
    "hookEndingSimilarity",
    "isOpeningRhetoricalQuestion",
    "measureSlopSignals",
    "normalizeCaptionHashtags",
    "numbersIn",
    "protectOrderPrefixes",
    "redacScore",
    "redacViolations",
    "rescoreCaptionOnly",
    "researchNumbers",
    "runRedacGate",
    "runTextRedacGate",
    "textHook",
    "textRedacRawCount",
    "textRedacViolations",
  ]);
});

// Les types ne se voient pas à l'exécution : on les lit dans le texte du
// fichier, qu'ils soient déclarés (« export interface X ») ou réexportés
// (« export type { X } from … », « export { type X } from … »).
Deno.test("redac-gate : les 8 types exportés sont toujours exportés", async () => {
  const src = await Deno.readTextFile(new URL("./redac-gate.ts", import.meta.url));
  const types = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:interface|type)\s+(\w+)/gm)) types.add(m[1]);
  for (const m of src.matchAll(/^export\s+type\s*\{([^}]+)\}/gm)) m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop()!).filter(Boolean).forEach((t) => types.add(t));
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const t = part.trim().match(/^type\s+(\w+)/);
      if (t) types.add(t[1]);
    }
  }
  assertEquals([...types].sort(), [
    "CaptionEndingRule",
    "EchoContext",
    "RedacAnalysis",
    "RedacGateResult",
    "ResearchNumbers",
    "SlopSignals",
    "TextGateResult",
    "TextRedacAnalysis",
  ]);
});
