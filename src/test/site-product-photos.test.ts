import { describe, expect, it } from "vitest";
import { extractProductPageUrls, extractProductPrimaryImage } from "../../supabase/functions/_shared/site-photos";

describe("photos de produits du site", () => {
  it("ne suit que les fiches produit du même site et évite les variantes de lien", () => {
    const html = `<a href="/products/savon?ref=home">Savon</a>
      <a href="/products/savon">Savon</a>
      <a href="https://tiers.fr/products/faux">Autre marque</a>
      <a href="/articles/conseils">Article de blog</a>
      <a href="/about">À propos</a>`;
    expect(extractProductPageUrls(html, "https://www.mon-site.fr/")).toEqual([
      "https://www.mon-site.fr/products/savon",
    ]);
  });

  it("préfère la photo déclarée du produit à la bannière sociale", () => {
    const html = `<meta property="og:image" content="/banniere.jpg">
      <script type="application/ld+json">{"@type":"Product","name":"Savon rose","image":"/produits/savon.jpg"}</script>`;
    expect(extractProductPrimaryImage(html, "https://www.mon-site.fr/")).toEqual({
      url: "https://www.mon-site.fr/produits/savon.jpg", alt: "Savon rose",
    });
  });
});
