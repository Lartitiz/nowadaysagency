// Carrousel texte (lot 8b, 14/10/2026) : à l'arrivée des visuels, le libellé
// du bouton d'appel à l'action est rangé dans la slide (cta_label), sans
// changer le HTML ni ce qui part à carousel-visual. Aucun appel réseau.
import { describe, it, expect } from "vitest";
import { withVisualCtaLabels } from "@/lib/carousel-cta-label";
import { visualSlidePayload } from "@/lib/visual-slide-payload";

const button = (label: string) => `<div><h1 data-slide-text="title">Et toi ?</h1><div data-slide-cta="1"><span data-slide-text="cta">${label}</span></div></div>`;
const plain = (title: string) => `<div><h1 data-slide-text="title">${title}</h1></div>`;
const raw = () => ({
  slides: [
    { slide_number: 1, title: "J'ai arrêté les remises", body: "" },
    { slide_number: 2, title: "Et toi ?", body: "Tu affiches tes prix ?" },
  ],
  caption: { hook: "", body: "", cta: "", hashtags: [] },
});

describe("withVisualCtaLabels — libellé du bouton rangé à l'arrivée des visuels", () => {
  it("range le libellé du bouton dessiné dans la slide qui le porte", () => {
    const out = withVisualCtaLabels(raw(), [{ slide_number: 1, html: plain("J'ai arrêté les remises") }, { slide_number: 2, html: button("Enregistre ce post") }]);
    expect(out.slides[1]).toMatchObject({ cta_label: "Enregistre ce post" });
    expect(out.slides[0]).not.toHaveProperty("cta_label");
  });

  it("ne change rien (même objet) si le libellé est déjà rangé ou s'il n'y a aucun bouton", () => {
    const r = raw();
    const visuals = [{ slide_number: 1, html: plain("x") }, { slide_number: 2, html: plain("y") }];
    expect(withVisualCtaLabels(r, visuals)).toBe(r);
    const withLabel = { ...r, slides: [r.slides[0], { ...r.slides[1], cta_label: "Enregistre ce post" }] };
    expect(withVisualCtaLabels(withLabel, [{ slide_number: 2, html: button("Enregistre ce post") }])).toBe(withLabel);
  });

  it("un nouveau rendu sans bouton marque le libellé précédent comme retiré", () => {
    const r = raw();
    const withLabel = { ...r, slides: [r.slides[0], { ...r.slides[1], cta_label: "Enregistre ce post" }] };
    expect(withVisualCtaLabels(withLabel, [{ slide_number: 2, html: plain("Et toi ?") }]).slides[1].cta_label).toBe("");
  });

  it("un nouveau rendu avec un autre bouton reprend le libellé affiché", () => {
    const r = raw();
    const removed = { ...r, slides: [r.slides[0], { ...r.slides[1], cta_label: "" }] };
    expect(withVisualCtaLabels(removed, [{ slide_number: 2, html: button("Dis-le-moi en commentaire") }]).slides[1].cta_label).toBe("Dis-le-moi en commentaire");
  });

  it("une slide texte n'envoie toujours pas cta_label à carousel-visual (rendu inchangé)", () => {
    const out = withVisualCtaLabels(raw(), [{ slide_number: 2, html: button("Enregistre ce post") }]);
    expect(visualSlidePayload(out.slides[1], "text_only", undefined)).not.toHaveProperty("cta_label");
  });

  it("entrées vides ou incomplètes : rendu tel quel", () => {
    const r = raw();
    expect(withVisualCtaLabels(r, [])).toBe(r);
    expect(withVisualCtaLabels({ caption: r.caption } as any, [{ slide_number: 1, html: button("x") }])).toEqual({ caption: r.caption });
  });
});
