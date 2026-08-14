import { describe, it, expect } from "vitest";
import { buildFirstContentUrl } from "@/lib/first-content-url";

/* Règle produit du 14/08 : le 1er contenu est TOUJOURS un carrousel, et il
   part des PHOTOS quand elle vend des produits. Ces tests existent surtout
   pour empêcher le retour silencieux du format « post » — il était encore
   posé en dur dans ce module alors que trois écrans en dépendaient. */

describe("buildFirstContentUrl", () => {
  it("services : carrousel texte, généré directement, jamais un post", () => {
    const url = buildFirstContentUrl({ sellsProducts: false, subject: "Mon sujet" });
    expect(url).toContain("format=carousel");
    expect(url).not.toContain("format=post");
    expect(url).toContain("auto=1");
    expect(url).toContain(encodeURIComponent("Mon sujet"));
  });

  it("services sans idée du diagnostic : sujet générique de repli", () => {
    const url = buildFirstContentUrl({ sellsProducts: false, subject: null });
    expect(url).toContain(encodeURIComponent("3 erreurs fréquentes"));
    expect(url).toContain("format=carousel");
  });

  it("produits : carrousel photo, sans auto (les photos viennent d'abord)", () => {
    const url = buildFirstContentUrl({ sellsProducts: true, subject: "Ma gamme" });
    expect(url).toContain("format=carousel");
    expect(url).toContain("carouselSubMode=photo");
    expect(url).not.toContain("auto=1");
    expect(url).not.toContain("format=post");
  });

  it("produits sans idée : aucun sujet inventé n'est collé dans l'URL", () => {
    const url = buildFirstContentUrl({ sellsProducts: true, subject: null });
    expect(url).not.toContain("sujet=");
    expect(url).toContain("carouselSubMode=photo");
  });

  it("un sujet fait de blancs est traité comme absent", () => {
    expect(buildFirstContentUrl({ sellsProducts: true, subject: "   " })).not.toContain("sujet=");
    expect(buildFirstContentUrl({ sellsProducts: false, subject: "   " })).toContain(
      encodeURIComponent("3 erreurs fréquentes"),
    );
  });

  it("les sujets à caractères spéciaux restent encodés", () => {
    const url = buildFirstContentUrl({ sellsProducts: false, subject: "Savon & thé : 100% naturel" });
    expect(url).toContain(encodeURIComponent("Savon & thé : 100% naturel"));
  });
});
