import { describe, it, expect } from "vitest";
import { isEmptyVal, fillOnlyEmpty } from "@/lib/fill-only-empty";

describe("isEmptyVal", () => {
  it("traite null/undefined/chaîne blanche/tableau vide comme vides", () => {
    expect(isEmptyVal(null)).toBe(true);
    expect(isEmptyVal(undefined)).toBe(true);
    expect(isEmptyVal("")).toBe(true);
    expect(isEmptyVal("   ")).toBe(true);
    expect(isEmptyVal([])).toBe(true);
  });
  it("traite une valeur réelle comme non vide", () => {
    expect(isEmptyVal("Camille")).toBe(false);
    expect(isEmptyVal(["frustration"])).toBe(false);
    expect(isEmptyVal(0)).toBe(false);
    expect(isEmptyVal(false)).toBe(false);
  });
});

describe("fillOnlyEmpty", () => {
  it("ne réécrit jamais un champ existant déjà rempli (protège la saisie utilisatrice)", () => {
    const fields = { description: "analyse", step_1_frustrations: "analyse" };
    const existing = { description: "ce que j'ai écrit", step_1_frustrations: "" };
    expect(fillOnlyEmpty(fields, existing)).toEqual({ step_1_frustrations: "analyse" });
  });

  it("complète bien la cliente idéale quand l'existant n'a qu'une description (cœur du bug)", () => {
    const fields = {
      portrait_prenom: "Camille",
      description: "analyse desc",
      step_1_frustrations: "ses frustrations",
      step_2_transformation: "sa transformation",
    };
    // L'espace n'avait qu'une description auto-générée → tout le reste doit se remplir.
    const existing = {
      portrait_prenom: null,
      description: "desc auto-générée",
      step_1_frustrations: "",
      step_2_transformation: null,
    };
    expect(fillOnlyEmpty(fields, existing)).toEqual({
      portrait_prenom: "Camille",
      step_1_frustrations: "ses frustrations",
      step_2_transformation: "sa transformation",
    });
  });

  it("écrit tout quand il n'y a aucune ligne existante", () => {
    const fields = { a: "1", b: "2" };
    expect(fillOnlyEmpty(fields, null)).toEqual({ a: "1", b: "2" });
    expect(fillOnlyEmpty(fields, undefined)).toEqual({ a: "1", b: "2" });
  });

  it("ne renvoie rien quand tous les champs sont déjà remplis", () => {
    const fields = { a: "x", b: "y" };
    const existing = { a: "déjà", b: "déjà" };
    expect(fillOnlyEmpty(fields, existing)).toEqual({});
  });

  // ── Reprise d'onboarding confirmée ────────────────────────────────────────
  // C'est LE cas qui gelait une vieille identité : tant que « ne remplir que
  // les trous » s'appliquait aussi au clic « Valider », relire et valider une
  // fiche corrigée ne changeait rien tant que l'ancienne valeur existait.
  describe("overwrite = true (« oui, remplacer » confirmé à l'écran)", () => {
    it("écrase une valeur existante non vide", () => {
      const fields = { positioning: "nouveau positionnement" };
      const existing = { positioning: "studio boudoir intime à Marseille" };
      expect(fillOnlyEmpty(fields, existing, true)).toEqual({
        positioning: "nouveau positionnement",
      });
    });

    it("écrase aussi les tableaux déjà remplis", () => {
      const fields = { tone_keywords: ["direct", "chaleureux"] };
      const existing = { tone_keywords: ["sensuel", "intimiste"] };
      expect(fillOnlyEmpty(fields, existing, true)).toEqual({
        tone_keywords: ["direct", "chaleureux"],
      });
    });

    it("laisse le comportement protecteur intact quand overwrite est absent ou false", () => {
      const fields = { positioning: "nouveau" };
      const existing = { positioning: "écrit à la main" };
      expect(fillOnlyEmpty(fields, existing)).toEqual({});
      expect(fillOnlyEmpty(fields, existing, false)).toEqual({});
    });
  });
});
