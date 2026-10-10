import { describe, it, expect } from "vitest";
import { splitCarouselWarnings } from "@/lib/carousel-warnings";

// Passe compte neuf du 10/10 : la note brute du juge s'affichait sous
// « à compléter avant de le publier », à côté d'un 100/100.
const RAW = "slide 7 : La formulation « je trouve que les fleurs n'ont pas à voyager… » généralise une cause de marque au secteur entier. Reformuler pour rester fidèle à la cause réellement formulée en fiche de marque sans l'étendre au secteur entier.";
const receipt = {
  execution_status: "completed",
  verdict: "acceptable",
  issues: [RAW],
  report: {
    verdict: "acceptable",
    trajectory: { kind: "developed_idea" },
    boundaries: [],
    defects: [{ slide_ids: ["slides.6"], type: "unsupported", severity: "minor", excerpt: "je trouve que les fleurs n'ont pas à voyager", reason: "x", repair: "y" }],
  },
};

describe("Avertissements carrousel : manques vs pistes de relecture", () => {
  it("la note du juge devient une suggestion courte, pas un manque", () => {
    const out = splitCarouselWarnings({ structure_warnings: [RAW], progression_review: receipt });
    expect(out.blocking).toEqual([]);
    expect(out.suggestions).toEqual(["Slide 7 : à relire, la phrase généralise ou affirme un peu trop (« je trouve que les fleurs n'ont pas à voyager »)."]);
    expect(out.suggestions.join(" ")).not.toMatch(/fiche de marque/);
  });

  it("les vrais manques restent bloquants", () => {
    const out = splitCarouselWarnings({ structure_warnings: ["La dernière slide est vide : complète la conclusion.", "Slide 2 : image à choisir. x", RAW], progression_review: receipt });
    expect(out.blocking).toEqual(["La dernière slide est vide : complète la conclusion.", "Slide 2 : image à choisir. x"]);
    expect(out.suggestions).toHaveLength(1);
  });

  it("contrôle non abouti, texte modifié et photo répétée = suggestions", () => {
    const out = splitCarouselWarnings({ structure_warnings: [
      "Le contrôle final du fil n’a pas abouti. Relis l’enchaînement des slides avant de publier.",
      "Le texte a changé depuis sa relecture. Vérifie le fil avant de publier.",
      "La photo 3 revient sur 4 slides : tu peux en changer quelques-unes.",
    ] });
    expect(out.blocking).toEqual([]);
    expect(out.suggestions).toHaveLength(3);
  });

  it("ruptures et extrait long : libellés courts", () => {
    const long = "a".repeat(100);
    const out = splitCarouselWarnings({ structure_warnings: ["i1"], progression_review: { execution_status: "completed", issues: ["i1"], report: {
      verdict: "needs_repair", trajectory: { kind: "developed_idea" },
      defects: [{ slide_ids: ["slides.1", "slides.2"], type: "repetition", excerpt: long }],
      boundaries: [{ kind: "rupture", from: "slides.3", to: "slides.4" }],
    } } });
    expect(out.suggestions[0]).toMatch(/^Slides 2 et 3 : à relire, redit/);
    expect(out.suggestions[0].length).toBeLessThan(140);
    expect(out.suggestions[1]).toBe("Slides 4 → 5 : à relire, le passage de l’une à l’autre est un peu brusque.");
  });

  it("reçu sans rapport : repli générique, jamais la note brute", () => {
    const out = splitCarouselWarnings({ structure_warnings: [RAW], progression_review: { execution_status: "completed", issues: [RAW] } });
    expect(out.suggestions).toEqual(["Quelques passages méritent une relecture avant de publier."]);
  });

  it("rien → rien", () => {
    expect(splitCarouselWarnings({})).toEqual({ blocking: [], suggestions: [] });
  });
});
