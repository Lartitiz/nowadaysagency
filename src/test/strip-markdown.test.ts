import { describe, it, expect } from "vitest";
import { stripInlineMarkdown } from "@/lib/strip-markdown";

// Le markdown résiduel des newsletters doit devenir du texte brut
// (bug audit 09/07 : « **Première chose : observe AVANT de choisir.** »
// affiché avec les astérisques et copié tel quel).
describe("stripInlineMarkdown", () => {
  it("supprime le gras ** (cas de l'audit 09/07)", () => {
    expect(stripInlineMarkdown("**Première chose : observe AVANT de choisir.**")).toBe(
      "Première chose : observe AVANT de choisir.",
    );
  });

  it("supprime l'italique * et _", () => {
    expect(stripInlineMarkdown("Un aparté *entre nous* et un autre _plus discret_ ici.")).toBe(
      "Un aparté entre nous et un autre plus discret ici.",
    );
  });

  it("supprime les titres markdown en début de ligne", () => {
    expect(stripInlineMarkdown("## Le point clé\nLe reste # du texte garde son dièse.")).toBe(
      "Le point clé\nLe reste # du texte garde son dièse.",
    );
  });

  it("convertit [texte](url) en texte (url)", () => {
    expect(stripInlineMarkdown("Va voir [mon site](https://example.com) pour la suite.")).toBe(
      "Va voir mon site (https://example.com) pour la suite.",
    );
  });

  it("épargne snake_case, calculs et astérisques isolés", () => {
    expect(stripInlineMarkdown("la variable user_id reste intacte")).toBe("la variable user_id reste intacte");
    expect(stripInlineMarkdown("2 * 3 = 6, et une note*")).toBe("2 * 3 = 6, et une note*");
  });

  it("gère le multi-paragraphes sans déborder des lignes", () => {
    expect(
      stripInlineMarkdown("**Titre gras**\n\nParagraphe avec *emphase* au milieu.\n\n- une liste\n- reste une liste"),
    ).toBe("Titre gras\n\nParagraphe avec emphase au milieu.\n\n- une liste\n- reste une liste");
  });

  it("laisse les valeurs vides intactes", () => {
    expect(stripInlineMarkdown("")).toBe("");
  });
});
