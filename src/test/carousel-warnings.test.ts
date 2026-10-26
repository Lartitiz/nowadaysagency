import { describe, it, expect } from "vitest";
import { isCarouselPublishable, splitCarouselWarnings } from "@/lib/carousel-warnings";

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

  it("un fait trouvé sur le web (avec son lien) est une piste de relecture, pas un manque", () => {
    const web = "Fait trouvé sur le web (slide 6) : « Ademe, 2025 ». Vérifie le chiffre sur la page avant de publier : https://www.ademe.fr/x";
    const out = splitCarouselWarnings({ structure_warnings: [web] });
    expect(out.blocking).toEqual([]);
    expect(out.suggestions).toEqual([web]);
  });

  it("les vrais manques restent bloquants", () => {
    const out = splitCarouselWarnings({ structure_warnings: ["La dernière slide est vide : complète la conclusion.", "Slide 2 : image à choisir. x", RAW], progression_review: receipt });
    expect(out.blocking).toEqual(["La dernière slide est vide : complète la conclusion.", "Slide 2 : image à choisir. x"]);
    expect(out.suggestions).toHaveLength(1);
  });

  it("texte modifié et photo répétée = suggestions ; contrôle non abouti = rien (panne de notre côté)", () => {
    const out = splitCarouselWarnings({ structure_warnings: [
      "Le contrôle final du fil n’a pas abouti. Relis l’enchaînement des slides avant de publier.",
      "Le texte a changé depuis sa relecture. Vérifie le fil avant de publier.",
      "La photo 3 revient sur 4 slides : tu peux en changer quelques-unes.",
    ] });
    expect(out.blocking).toEqual([]);
    expect(out.suggestions).toHaveLength(2);
    expect(out.suggestions.join(" ")).not.toMatch(/pas pu être relu|n’a pas abouti/);
  });

  // 12/10/2026 : en photo et mixte, les constats du juge portaient sur les
  // photos ou sur des faits de la fiche de marque. Le juge répare en coulisses.
  it("photo et mixte : constats du juge non affichés, photo répétée et retouches gardées", () => {
    for (const mode of ["photo", "mix"]) {
      const out = splitCarouselWarnings({ structure_warnings: [RAW, "La photo 3 revient sur 4 slides : tu peux en changer quelques-unes."], progression_review: receipt }, mode);
      expect(out).toEqual({ blocking: [], suggestions: ["La photo 3 revient sur 4 slides : tu peux en changer quelques-unes."] });
    }
    // Sans sous-mode (carrousel rouvert) : le type enregistré décide.
    expect(splitCarouselWarnings({ carousel_type: "photo", structure_warnings: [RAW], progression_review: receipt }).suggestions).toEqual([]);
    // Texte : le constat reste.
    expect(splitCarouselWarnings({ carousel_type: "analyse argumentée", structure_warnings: [RAW], progression_review: receipt }, "text").suggestions).toHaveLength(1);
  });

  it("texte : libellés qui disent quoi faire (chiffre à vérifier, rapprochement plaqué)", () => {
    const report = (defects: any[]) => ({ structure_warnings: ["i1"], progression_review: { execution_status: "completed", issues: ["i1"],
      report: { verdict: "needs_repair", trajectory: { kind: "developed_idea" }, boundaries: [], defects } } });
    const out = splitCarouselWarnings(report([
      { slide_ids: ["slides.3"], type: "unsupported", excerpt: "5 à 10 fois plus d'enregistrements", reason: "Deux affirmations chiffrées décisives, source datée 2026 invérifiable.", repair: "Retirer ou sourcer." },
      { slide_ids: ["slides.5"], type: "juxtaposition", excerpt: "Comme mes savons", reason: "Analogie décorative plaquée sur la démonstration.", repair: "Relier." },
      { slide_ids: ["slides.6"], type: "unsupported", excerpt: "Une étude Buffer", reason: "L'étude Buffer est présentée sans source.", repair: "Sourcer." },
    ]), "text");
    expect(out.suggestions).toEqual([
      "Slide 4 : à relire, vérifie ce chiffre ou cette étude, sa source n’est pas confirmée (« 5 à 10 fois plus d'enregistrements »).",
      "Slide 6 : à relire, le rapprochement paraît plaqué, montre en quoi il éclaire ton propos (« Comme mes savons »).",
      "Slide 7 : à relire, vérifie ce chiffre ou cette étude, sa source n’est pas confirmée (« Une étude Buffer »).",
    ]);
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

  it("rupture signalée deux fois (constat + frontière) : une seule ligne", () => {
    const out = splitCarouselWarnings({ structure_warnings: ["i1"], progression_review: { execution_status: "completed", issues: ["i1"], report: {
      verdict: "needs_repair", trajectory: { kind: "developed_idea" },
      defects: [{ slide_ids: ["slides.10", "slides.11"], type: "rupture", excerpt: "Toute la frontière tient donc à une question" }],
      boundaries: [{ kind: "rupture", from: "slides.10", to: "slides.11" }, { kind: "rupture", from: "slides.3", to: "slides.4" }],
    } } });
    expect(out.suggestions).toEqual([
      "Slides 11 et 12 : à relire, le passage depuis la slide d’avant est un peu brusque (« Toute la frontière tient donc à une question »).",
      "Slides 4 → 5 : à relire, le passage de l’une à l’autre est un peu brusque.",
    ]);
  });

  it("reçu sans rapport : repli générique, jamais la note brute", () => {
    const out = splitCarouselWarnings({ structure_warnings: [RAW], progression_review: { execution_status: "completed", issues: [RAW] } });
    expect(out.suggestions).toEqual(["Quelques passages méritent une relecture avant de publier."]);
  });

  it("rien → rien", () => {
    expect(splitCarouselWarnings({})).toEqual({ blocking: [], suggestions: [] });
  });
});

describe("isCarouselPublishable", () => {
  it("publiable seulement sans manque bloquant ni erreur du contrôle des slides", () => {
    expect(isCarouselPublishable([], [])).toBe(true);
    expect(isCarouselPublishable([], [{ severity: "warning" }])).toBe(true);
    expect(isCarouselPublishable([], [{ severity: "warning" }, { severity: "error" }])).toBe(false);
    expect(isCarouselPublishable(["Il manque une photo."], [])).toBe(false);
  });
});
