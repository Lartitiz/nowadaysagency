import { describe, expect, it } from "vitest";
import { getEditorElements, readCarouselDocument } from "@/lib/carousel-editor";

// Cas réel du 24/11 (passage « compte neuf ») : slide 7 sans titre, dont le
// dessin a étiqueté le texte « title ». À l'ouverture, l'éditeur remettait le
// titre (vide) dans cet élément : slide livrée vide, texte perdu en base.
const PHRASE = "Un objet ancien mérite mieux que de dormir dans un tiroir, et sa seconde vie a plus de sens quand il garde son histoire.";
const html = (field: string, text: string) =>
  `<style>*{box-sizing:border-box;}</style><div data-pptx-shape="background" style="width:1080px;height:1350px;background:#F6F2EC;display:flex;"><div style="max-width:820px;text-align:center;"><p data-slide-text="${field}" data-pptx-editable="${field}" style="font-family:'Cormorant Garamond',serif;font-size:88px;color:#1C1C20;margin:0;">${text}</p></div></div>`;
const open = (slide: Record<string, unknown>, field: string, text: string, extra: Record<string, unknown> = {}) =>
  readCarouselDocument({ slides: [{ slide_number: 1, ...slide }], caption: {}, ...extra }, [{ slide_number: 1, html: html(field, text) }]).slides[0];

describe("ouverture d'un carrousel : texte étiqueté sur le mauvais champ", () => {
  it("slide sans titre dont le texte est étiqueté « titre » : le texte reste, l'étiquette passe sur « texte »", () => {
    const slide = open({ role: "position", title: "", body: PHRASE }, "title", PHRASE);
    expect(slide.data.body).toBe(PHRASE);
    expect(slide.data.title).toBe("");
    const texts = getEditorElements(slide.html).filter((e) => e.kind === "text");
    expect(texts.map((t) => [t.field, t.text])).toEqual([["body", PHRASE]]);
    expect(slide.html).toContain('data-pptx-editable="body"');
  });

  it("slide avec un titre seul, étiqueté « texte » : même protection dans l'autre sens", () => {
    const slide = open({ title: "Ces lettres gravées", body: "" }, "body", "Ces lettres gravées");
    expect(slide.data.title).toBe("Ces lettres gravées");
    expect(getEditorElements(slide.html).filter((e) => e.kind === "text").map((t) => [t.field, t.text])).toEqual([["title", "Ces lettres gravées"]]);
  });

  it("étiquette juste : le texte source modifié remplace toujours l'ancien aperçu (ancien enregistrement)", () => {
    const slide = open({ title: "Nouveau titre", body: "" }, "title", "Ancien titre");
    expect(getEditorElements(slide.html).find((e) => e.field === "title")?.text).toBe("Nouveau titre");
  });

  it("titre vidé exprès dans un ancien enregistrement (le texte affiché n'est pas celui du corps) : l'aperçu suit", () => {
    const slide = open({ title: "", body: "Un autre texte" }, "title", "Ancien titre");
    expect(getEditorElements(slide.html).find((e) => e.field === "title")?.text || "").toBe("");
    expect(slide.data.body).toBe("Un autre texte");
  });
});
