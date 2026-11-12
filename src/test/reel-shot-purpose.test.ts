import { describe, it, expect } from "vitest";
import { readableShotPurpose, shotTypeLabel, reelSectionName } from "@/lib/reel-shot-purpose";

// Plan de tournage : les identifiants internes du script s'affichaient tels
// quels (« section explication_1 », QA reel du 12/11/2026).
describe("readableShotPurpose", () => {
  it.each([
    ["hook", "l'accroche"],
    ["section probleme", "problème"],
    ["section contexte", "contexte"],
    ["section explication_1", "explication 1"],
    ["section explication_3 + cta", "explication 3 + la fin"],
    ["plan de coupe section body 1", "plan de coupe passage 1"],
    ["hook + body (la voix off se pose dessus)", "l'accroche + le développement (la voix off se pose dessus)"],
    ["hook + tous les segments body + cta", "l'accroche + le développement + la fin"],
    ["le plan d'ouverture", "le plan d'ouverture"],
  ])("%s → %s", (raw, expected) => {
    expect(readableShotPurpose(raw)).toBe(expected);
  });

  it("nomme les types de plan sans anglicisme", () => {
    expect([shotTypeLabel("face_cam"), shotTypeLabel("insert"), shotTypeLabel("b_roll")])
      .toEqual(["🎤 Face caméra", "🔍 Gros plan", "🎬 Plan d'illustration"]);
  });
});

// Fiche d'une idée et contenu du calendrier : « HOOK », « BODY », « CTA »
// s'affichaient tels quels (essai de reprise du 12/11/2026).
describe("reelSectionName", () => {
  it.each([
    [{ section: "hook" }, "Accroche"],
    [{ section: "body" }, "Développement"],
    [{ section: "body_2" }, "Passage 2"],
    [{ section: "cta" }, "Fin"],
    [{ section: "explication_1" }, "Explication 1"],
    [{ section: "hook", label: "Le déclic" }, "Le déclic"],
    [{}, ""],
  ])("%j → %s", (section, expected) => {
    expect(reelSectionName(section)).toBe(expected);
  });
});
