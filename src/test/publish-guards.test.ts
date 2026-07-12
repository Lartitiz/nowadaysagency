import { describe, it, expect } from "vitest";
import {
  findPublishableImageUrl,
  extractInstagramCaption,
  extractLinkedInText,
  instagramPublishDisabledReason,
  linkedInPublishDisabledReason,
} from "@/features/creer/publish-guards";

describe("findPublishableImageUrl", () => {
  it("retourne null sans résultat", () => {
    expect(findPublishableImageUrl(null)).toBeNull();
    expect(findPublishableImageUrl({})).toBeNull();
  });

  it("prend la première URL https valide dans l'ordre des candidats", () => {
    expect(findPublishableImageUrl({ image_url: "https://a.com/x.jpg", cover_url: "https://b.com/y.jpg" }))
      .toBe("https://a.com/x.jpg");
    expect(findPublishableImageUrl({ photo: { url: "https://p.com/p.jpg" } })).toBe("https://p.com/p.jpg");
    expect(findPublishableImageUrl({ slides: [{ image_url: "https://s.com/s1.jpg" }] })).toBe("https://s.com/s1.jpg");
  });

  it("refuse blob:, data: et http non sécurisé", () => {
    expect(findPublishableImageUrl({ image_url: "blob:https://x" })).toBeNull();
    expect(findPublishableImageUrl({ image_url: "data:image/png;base64,xxx" })).toBeNull();
    expect(findPublishableImageUrl({ image_url: "http://insecure.com/a.jpg" })).toBeNull();
  });

  it("retombe sur la preview de photo uploadée si elle est https", () => {
    expect(findPublishableImageUrl({}, "https://cdn.com/up.jpg")).toBe("https://cdn.com/up.jpg");
    expect(findPublishableImageUrl({}, "blob:local")).toBeNull();
  });
});

describe("extractInstagramCaption / extractLinkedInText", () => {
  it("priorise edited_text puis full_text puis content", () => {
    expect(extractInstagramCaption({ edited_text: "E", full_text: "F" })).toBe("E");
    expect(extractLinkedInText({ full_text: "F", content: "C" })).toBe("F");
  });

  it("Instagram lit le champ caption (string ou objet), LinkedIn non (chaîne historique)", () => {
    expect(extractInstagramCaption({ caption: "Cap" })).toBe("Cap");
    expect(extractInstagramCaption({ caption: { text: "CapText" } })).toBe("CapText");
    expect(extractLinkedInText({ caption: "Cap", hook: "H" })).toBe("H");
  });

  it("assemble hook/body/cta en dernier recours", () => {
    expect(extractInstagramCaption({ hook: "H", body: "B", cta: "C" })).toBe("H\n\nB\n\nC");
    expect(extractLinkedInText({ hook: "H", cta: "C" })).toBe("H\n\nC");
    expect(extractInstagramCaption({})).toBe("");
  });

  it("caption structurée {hook, body, cta} du carrousel : assemble le texte", () => {
    // Avant : caption objet sans text/full → "" (légende jamais publiée).
    expect(extractInstagramCaption({ caption: { hook: "H", body: "B", cta: "C" } })).toBe("H\n\nB\n\nC");
  });

  it("caption structurée : les hashtags édités partent bien dans la légende publiée", () => {
    expect(
      extractInstagramCaption({ caption: { hook: "H", body: "B", cta: "C", hashtags: ["artisanat", "#savonnerie", "made in france"] } }),
    ).toBe("H\n\nB\n\nC\n\n#artisanat #savonnerie #madeinfrance");
    // Hashtags seuls (hook/body/cta vides) : la ligne de hashtags reste publiable.
    expect(extractInstagramCaption({ caption: { hashtags: ["a", "b"] } })).toBe("#a #b");
  });

  it("caption structurée : text/full historique gardent la priorité", () => {
    expect(extractInstagramCaption({ caption: { text: "T", hook: "H", hashtags: ["x"] } })).toBe("T");
  });
});

describe("instagramPublishDisabledReason", () => {
  const base = { selectedFormat: "post", isCarousel: false, visualSlidesCount: 0, publishableImageUrl: "https://a.com/i.jpg" };

  it("bloque les formats non-Instagram", () => {
    for (const f of ["pinterest_epingle", "linkedin", "newsletter"]) {
      expect(instagramPublishDisabledReason({ ...base, selectedFormat: f })).toMatch(/formats Instagram/);
    }
  });

  it("story : bloqué même avec une image publiable (l'edge ne fait pas media_type=STORIES)", () => {
    expect(instagramPublishDisabledReason({ ...base, selectedFormat: "story" })).toMatch(/stories arrive bientôt/);
    expect(instagramPublishDisabledReason({ ...base, selectedFormat: "story", publishableImageUrl: null })).toMatch(/stories arrive bientôt/);
  });

  it("carrousel : exige au moins 2 visuels", () => {
    expect(instagramPublishDisabledReason({ ...base, isCarousel: true, visualSlidesCount: 1 })).toMatch(/visuels du carrousel/);
    expect(instagramPublishDisabledReason({ ...base, isCarousel: true, visualSlidesCount: 2 })).toBeNull();
  });

  it("image simple : exige une URL publique", () => {
    expect(instagramPublishDisabledReason({ ...base, publishableImageUrl: null })).toMatch(/image publique/);
    expect(instagramPublishDisabledReason(base)).toBeNull();
  });
});

describe("linkedInPublishDisabledReason", () => {
  it("null quand le bouton n'est pas affiché (pas un post texte LinkedIn)", () => {
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: false, raw: {} })).toBeNull();
  });

  it("exige un texte généré", () => {
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: true, raw: {} })).toMatch(/Génère ton post/);
    expect(linkedInPublishDisabledReason({ isLinkedInTextPost: true, raw: { content: "Un post" } })).toBeNull();
  });
});
