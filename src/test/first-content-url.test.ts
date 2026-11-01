import { describe, it, expect } from "vitest";
import { buildFirstContentUrl, chooseFirstContentChannel, firstContentIsCarousel, pickFirstContentIdea } from "@/lib/first-content-url";

/* Règle produit du 14/08 : le 1er contenu est TOUJOURS un carrousel, et il
   part des PHOTOS quand elle vend des produits. Ces tests existent surtout
   pour empêcher le retour silencieux du format « post » — il était encore
   posé en dur dans ce module alors que trois écrans en dépendaient. */

describe("buildFirstContentUrl", () => {
  it("services : carrousel texte, généré directement, jamais un post", () => {
    const url = buildFirstContentUrl({ sellsProducts: false, subject: "Mon sujet" });
    expect(url).toContain("format=carousel");
    expect(url).toContain("carouselSubMode=text");
    expect(url).not.toContain("format=post");
    expect(url).toContain("auto=1");
    expect(url).toContain(encodeURIComponent("Mon sujet"));
  });

  it("services sans idée du diagnostic : sujet générique de repli", () => {
    const url = buildFirstContentUrl({ sellsProducts: false, subject: null });
    expect(url).toContain(encodeURIComponent("3 erreurs fréquentes"));
    expect(url).toContain("format=carousel");
  });

  it("produits : carrousel photo lancé après chargement des photos", () => {
    const url = buildFirstContentUrl({ sellsProducts: true, subject: "Ma gamme" });
    expect(url).toContain("format=carousel");
    expect(url).toContain("carouselSubMode=photo");
    expect(url).toContain("firstProduct=1");
    expect(url).not.toContain("sujet=");
    expect(url).toContain("auto=1");
    expect(url).not.toContain("format=post");
  });

  it("produits : l'idée du diagnostic voyage en repli si aucune photo n'est trouvée", () => {
    const url = buildFirstContentUrl({ sellsProducts: true, subject: "Ma gamme" });
    expect(new URL(url, "https://x.fr").searchParams.get("sujetSansPhoto")).toBe("Ma gamme");
    const generique = buildFirstContentUrl({ sellsProducts: true, subject: null });
    expect(new URL(generique, "https://x.fr").searchParams.get("sujetSansPhoto")).toContain("3 erreurs fréquentes");
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

  it("services : la fiche de l'idée voyage, le carrousel s'enregistre dedans (passe du 16/10)", () => {
    const url = buildFirstContentUrl({ sellsProducts: false, subject: "Mon sujet", ideaId: "abc-1" });
    expect(new URL(url, "https://x.fr").searchParams.get("idea_id")).toBe("abc-1");
  });

  it("produits : la fiche ne voyage qu'avec le repli texte, jamais comme idea_id", () => {
    const params = new URL(buildFirstContentUrl({ sellsProducts: true, subject: "Ma gamme", ideaId: "abc-1" }), "https://x.fr").searchParams;
    expect(params.get("idea_id")).toBeNull();
    expect(params.get("ideaSansPhoto")).toBe("abc-1");
  });

  it("sujet générique : aucune fiche reliée", () => {
    for (const sellsProducts of [true, false]) {
      const url = buildFirstContentUrl({ sellsProducts, subject: null, ideaId: "abc-1" });
      expect(url).not.toContain("abc-1");
    }
  });
});

/* Règle du 01/11 : le 1er contenu part sur un canal qu'elle utilise ou veut
   utiliser. Passe QA : « site + LinkedIn » recevait un carrousel Instagram. */
describe("chooseFirstContentChannel", () => {
  it.each([
    ["site + LinkedIn → LinkedIn", ["site", "linkedin"], "linkedin"],
    ["Instagram déclaré → Instagram", ["instagram", "site"], "instagram"],
    ["l'ordre enregistré décide (déjà utilisés d'abord)", ["linkedin", "instagram"], "linkedin"],
    ["newsletter utilisée + LinkedIn souhaité → le carrousel gagne", ["newsletter", "linkedin"], "linkedin"],
    ["site utilisé + Instagram souhaité → Instagram", ["site", "instagram"], "instagram"],
    ["newsletter seule → newsletter", ["newsletter"], "newsletter"],
    ["Pinterest seul → Pinterest", ["pinterest"], "pinterest"],
    ["site + newsletter → newsletter", ["site", "newsletter"], "newsletter"],
    ["site seul → écran de choix", ["site"], "choix"],
    ["podcast, TikTok → écran de choix", ["podcast", "tiktok"], "choix"],
    ["aucun canal → Instagram", [], "instagram"],
    ["« rien pour l'instant » → Instagram", ["none"], "instagram"],
  ])("%s", (_nom, canaux, attendu) => {
    expect(chooseFirstContentChannel(canaux)).toBe(attendu);
  });

  it("profil illisible : ne plante pas, retombe sur le canal de l'idée puis Instagram", () => {
    for (const illisible of [null, undefined, "linkedin", [null, 3]]) {
      expect(chooseFirstContentChannel(illisible)).toBe("instagram");
      expect(chooseFirstContentChannel(illisible, "linkedin")).toBe("linkedin");
    }
  });

  it("une idée marquée LinkedIn ne contredit pas un canal déclaré", () => {
    expect(chooseFirstContentChannel(["instagram"], "linkedin")).toBe("instagram");
  });
});

describe("pickFirstContentIdea", () => {
  const ideas = [{ id: "a", canal: "instagram" }, { id: "b", canal: "linkedin" }];
  it("prend la première idée écrite pour ce canal", () => {
    expect(pickFirstContentIdea(ideas, "linkedin")?.id).toBe("b");
  });
  it("sans idée de ce canal, garde la première plutôt que rien", () => {
    expect(pickFirstContentIdea(ideas, "newsletter")?.id).toBe("a");
    expect(pickFirstContentIdea(null, "linkedin")).toBeNull();
  });
});

describe("buildFirstContentUrl selon le canal", () => {
  const params = (o: Parameters<typeof buildFirstContentUrl>[0]) => new URL(buildFirstContentUrl(o), "https://x.fr").searchParams;

  it("LinkedIn, services : carrousel texte automatique sur LinkedIn, relié à l'idée", () => {
    const p = params({ sellsProducts: false, subject: "Mon sujet", ideaId: "abc-1", channel: "linkedin" });
    expect(p.get("canal")).toBe("linkedin");
    expect(p.get("format")).toBe("carousel");
    expect(p.get("carouselSubMode")).toBe("text");
    expect(p.get("auto")).toBe("1");
    expect(p.get("idea_id")).toBe("abc-1");
  });

  it("LinkedIn, produits : carrousel photo automatique sur LinkedIn, repli conservé", () => {
    const p = params({ sellsProducts: true, subject: "Ma gamme", channel: "linkedin" });
    expect(p.get("canal")).toBe("linkedin");
    expect(p.get("carouselSubMode")).toBe("photo");
    expect(p.get("firstProduct")).toBe("1");
    expect(p.get("auto")).toBe("1");
    expect(p.get("sujetSansPhoto")).toBe("Ma gamme");
  });

  it("Instagram ou sans canal : l'URL ne change pas", () => {
    for (const sellsProducts of [true, false]) {
      expect(buildFirstContentUrl({ sellsProducts, subject: "S", channel: "instagram" })).toBe(buildFirstContentUrl({ sellsProducts, subject: "S" }));
      expect(buildFirstContentUrl({ sellsProducts, subject: "S" })).not.toContain("canal=");
    }
  });

  it.each([[true], [false]])("newsletter (produits=%s) : écran de choix pré-réglé, rien de généré ni de photo", (sellsProducts) => {
    const p = params({ sellsProducts, subject: "Mon sujet", ideaId: "abc-1", channel: "newsletter" });
    expect(p.get("canal")).toBe("newsletter");
    expect(p.get("sujet")).toBe("Mon sujet");
    expect(p.get("idea_id")).toBe("abc-1");
    for (const absent of ["auto", "format", "firstProduct", "carouselSubMode"]) expect(p.get(absent)).toBeNull();
  });

  it("site seul : écran de choix sans canal imposé, sujet générique si besoin", () => {
    const p = params({ sellsProducts: false, subject: null, channel: "choix" });
    expect(p.get("canal")).toBeNull();
    expect(p.get("auto")).toBeNull();
    expect(p.get("sujet")).toContain("3 erreurs fréquentes");
  });

  it("le carrousel n'existe que sur Instagram et LinkedIn", () => {
    expect(["instagram", "linkedin", "newsletter", "pinterest", "choix"].filter((c) => firstContentIsCarousel(c as any))).toEqual(["instagram", "linkedin"]);
  });
});
