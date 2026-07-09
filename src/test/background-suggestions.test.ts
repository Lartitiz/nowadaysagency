import { describe, it, expect } from "vitest";
import {
  buildBackgroundSuggestions,
  hexToFrenchColorName,
  GENERIC_BACKGROUND_SUGGESTIONS,
} from "@/lib/background-suggestions";

describe("hexToFrenchColorName", () => {
  it("nomme les couleurs usuelles d'une charte", () => {
    expect(hexToFrenchColorName("#ffffff")).toBe("blanc");
    expect(hexToFrenchColorName("#000000")).toBe("noir");
    expect(hexToFrenchColorName("#f5f0e8")).toBe("crème");
    expect(hexToFrenchColorName("#e8dcc8")).toBe("beige");
    expect(hexToFrenchColorName("#c8553d")).toBe("terracotta");
    expect(hexToFrenchColorName("#1e3a5f")).toBe("bleu nuit");
    expect(hexToFrenchColorName("#87ceeb")).toBe("bleu ciel");
    expect(hexToFrenchColorName("#9caf88")).toBe("vert sauge");
    expect(hexToFrenchColorName("#808080")).toBe("gris");
  });

  it("retourne null sur une valeur invalide", () => {
    expect(hexToFrenchColorName(null)).toBeNull();
    expect(hexToFrenchColorName("")).toBeNull();
    expect(hexToFrenchColorName("pas-un-hex")).toBeNull();
    expect(hexToFrenchColorName("#fff")).toBeNull();
  });
});

describe("buildBackgroundSuggestions", () => {
  it("retombe sur les génériques sans charte", () => {
    expect(buildBackgroundSuggestions(null)).toEqual(GENERIC_BACKGROUND_SUGGESTIONS);
    expect(buildBackgroundSuggestions(undefined)).toEqual(GENERIC_BACKGROUND_SUGGESTIONS);
    expect(buildBackgroundSuggestions({})).toEqual(GENERIC_BACKGROUND_SUGGESTIONS);
  });

  it("construit des suggestions depuis les couleurs et l'ambiance de la charte", () => {
    const suggestions = buildBackgroundSuggestions({
      color_primary: "#c8553d",
      color_background: "#e8dcc8",
      mood_keywords: ["Chaleureux", "Authentique"],
      photo_style: "lumineux et naturel",
    });
    expect(suggestions).toHaveLength(5);
    expect(suggestions[0]).toBe("Studio lumière douce, fond uni beige");
    expect(suggestions[1]).toBe("Dégradé doux terracotta et beige, texture mate");
    expect(suggestions[2]).toBe(
      "Ambiance chaleureux et authentique, lumière naturelle, arrière-plan flou",
    );
    expect(suggestions[3]).toBe("Décor lumineux et naturel, arrière-plan épuré");
    // Complété par un générique pour arriver à 5
    expect(GENERIC_BACKGROUND_SUGGESTIONS).toContain(suggestions[4]);
  });

  it("ignore les couleurs en doublon et les mots-clés non-string", () => {
    const suggestions = buildBackgroundSuggestions({
      color_primary: "#ffffff",
      color_secondary: "#ffffff",
      mood_keywords: [42, "  ", "minimaliste"],
    });
    expect(suggestions[0]).toBe("Studio lumière douce, fond uni blanc");
    expect(suggestions[1]).toBe("Ambiance minimaliste, lumière naturelle, arrière-plan flou");
    expect(suggestions.some((s) => s.includes("blanc et blanc"))).toBe(false);
  });

  it("plafonne à 5 suggestions", () => {
    const suggestions = buildBackgroundSuggestions({
      color_primary: "#c8553d",
      color_secondary: "#1e3a5f",
      color_accent: "#9caf88",
      color_background: "#e8dcc8",
      mood_keywords: ["doux", "chic"],
      photo_keywords: ["plantes", "lin", "bois clair"],
      photo_style: "éditorial",
    });
    expect(suggestions).toHaveLength(5);
  });
});
