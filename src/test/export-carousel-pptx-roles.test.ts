import { describe, expect, it } from "vitest";
import { classifyRole, normalizeRole, roleBadgeLabel } from "../lib/export-carousel-pptx";

// Copie figée de la classification d'avant le 04/10/2026 : pour les rôles déjà
// reconnus, le gabarit PowerPoint choisi ne doit pas changer.
function legacyClassify(role: string, slideIndex: number, totalSlides: number): string {
  const r = (role || "").toLowerCase().trim();
  if (slideIndex === 0 || r.includes("hook") || r.includes("accroche")) return "hook";
  if (slideIndex === totalSlides - 1 || r.includes("cta") || r.includes("appel") || r.includes("action")) return "cta";
  if (r.includes("sépar") || r.includes("separ") || r.includes("transition") || r.includes("rupture")) return "separator";
  if (r.includes("dark") || r.includes("punchline") || r.includes("punch")) return "dark_box";
  if (r.includes("context") || r.includes("story") || r.includes("intro") || r.includes("récit")) return "context";
  if (r.includes("espoir") || r.includes("hope") || r.includes("solution") || r.includes("bonne nouvelle")) return "hope";
  return "tip";
}

const KNOWN = ["hook", "Accroche", "cta", "Appel à l'action", "call to action", "séparateur", "separator", "Transition", "rupture",
  "punchline", "dark box", "Punch", "contexte", "Story", "introduction", "récit", "espoir", "Solution", "bonne nouvelle", "hope",
  "tip", "conseil", "histoire", "anecdote", "bascule", "synthèse", "Synthèse", "étape", "argument", "développement", "conclusion", "nuance", "présentation", "caractéristique", "usage", "", "  "];

describe("export PowerPoint : rôle de slide écrit par l'IA", () => {
  it("rôles déjà reconnus : même gabarit qu'avant, à toutes les positions", () => {
    for (const role of KNOWN) for (const i of [0, 2, 5]) expect(classifyRole(role, i, 6), `${role} @${i}`).toBe(legacyClassify(role, i, 6));
  });
  it("accents, casse et séparateurs ne changent plus le gabarit", () => {
    expect(classifyRole("RÉCIT", 2, 6)).toBe("context");
    expect(classifyRole("Récit", 2, 6)).toBe("context");
    expect(classifyRole("SÉPARATION", 2, 6)).toBe("separator");
    expect(classifyRole("bonne_nouvelle", 2, 6)).toBe("hope");
    expect(classifyRole("Bonne-Nouvelle", 2, 6)).toBe("hope");
    expect(classifyRole("Punch-line", 2, 6)).toBe("dark_box");
  });
  it("aucun synonyme ajouté : « histoire », « anecdote », « bascule » gardent leur gabarit d'avant", () => {
    for (const role of ["histoire", "Anecdote", "bascule", "Histoire de l'atelier"]) for (const i of [0, 2, 5]) {
      expect(classifyRole(role, i, 6), `${role} @${i}`).toBe(legacyClassify(role, i, 6));
    }
    expect(classifyRole("histoire", 2, 6)).toBe("tip");
  });
  it("rôle inconnu ou absent : repli neutre identique (tip)", () => {
    for (const role of [undefined, null, 42, {}, "argument", "xyz"]) expect(classifyRole(role, 2, 6)).toBe("tip");
    expect(normalizeRole(42)).toBe("");
  });
  it("pastille : le rôle tel qu'écrit, sinon le libellé neutre du gabarit", () => {
    expect(roleBadgeLabel("Étape", "CONTENU")).toBe("Étape");
    expect(roleBadgeLabel(" récit ", "CONTENU")).toBe("récit");
    expect(roleBadgeLabel("", "CONTENU")).toBe("CONTENU");
    expect(roleBadgeLabel("   ", "ESPOIR")).toBe("ESPOIR");
    expect(roleBadgeLabel(undefined, "02")).toBe("02");
    expect(roleBadgeLabel(7, "CONTEXTE")).toBe("CONTEXTE");
  });
});
