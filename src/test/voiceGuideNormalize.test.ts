// Régression du crash « tone_keywords.map is not a function » (17/08/2026) :
// l'IA peut renvoyer une chaîne "a, b, c" là où le front attend un tableau,
// et des lignes voice_guides antérieures au fix edge peuvent en contenir.
import { describe, it, expect } from "vitest";
import { normalizeVoiceGuide } from "@/lib/voice-guide-normalize";

describe("normalizeVoiceGuide", () => {
  it("laisse intact un guide déjà bien formé", () => {
    const guide = {
      brand_name: "Test",
      tone_keywords: ["chaleureux", "direct"],
      do_say: ["On y va"],
      dont_say: ["Synergie"],
      words_to_use: ["ensemble"],
      words_to_avoid: ["ROI"],
      emotions_to_create: ["confiance"],
      rhythm: "court",
    };
    expect(normalizeVoiceGuide(guide)).toEqual(guide);
  });

  it("découpe une chaîne à virgules en tableau (le cas du crash prod)", () => {
    const guide = normalizeVoiceGuide({
      tone_keywords: "chaleureux, direct, engagé" as unknown as string[],
    });
    expect(guide.tone_keywords).toEqual(["chaleureux", "direct", "engagé"]);
  });

  it("découpe aussi sur retours à la ligne et puces", () => {
    const guide = normalizeVoiceGuide({
      do_say: "On y va ensemble\n• Chaque pas compte" as unknown as string[],
    });
    expect(guide.do_say).toEqual(["On y va ensemble", "Chaque pas compte"]);
  });

  it("remplace un champ liste manquant par un tableau vide (pas de crash .map)", () => {
    const guide = normalizeVoiceGuide<Record<string, unknown>>({ brand_name: "Test" });
    expect(guide.emotions_to_create).toEqual([]);
    expect(guide.words_to_avoid).toEqual([]);
  });

  it("convertit les éléments non-string d'un tableau en string", () => {
    const guide = normalizeVoiceGuide({
      words_to_use: ["ensemble", 42] as unknown as string[],
    });
    expect(guide.words_to_use).toEqual(["ensemble", "42"]);
  });

  it("ne touche pas aux champs texte", () => {
    const guide = normalizeVoiceGuide({ rhythm: "phrases courtes, style oral" });
    expect(guide.rhythm).toBe("phrases courtes, style oral");
  });
});
