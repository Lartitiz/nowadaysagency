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

  it("slide sans titre, étiquette « titre » sur un texte qui n'est pas celui du corps : le corps s'affiche, la slide n'est pas vidée", () => {
    const slide = open({ title: "", body: "Un autre texte" }, "title", "Ancien titre");
    expect(getEditorElements(slide.html).filter((e) => e.kind === "text").map((t) => [t.field, t.text])).toEqual([["body", "Un autre texte"]]);
    expect(slide.data.body).toBe("Un autre texte");
  });

  // Cas réel du re-test en ligne (24/11) : slide « citation », seule la
  // citation (un morceau du corps) étiquetée « titre », la source en dessous.
  it("morceau du corps étiqueté « titre » (citation + source) : le corps entier s'affiche, rien n'est vidé", () => {
    const corps = "Buffer le résume comme ça : « Publier 10 fois avec du contenu médiocre aura moins d'impact que 3 posts excellents. »";
    const citation = `<div style="width:1080px;height:1350px"><p data-slide-text="title" data-pptx-editable="title" style="font-size:50px">« Publier 10 fois avec du contenu médiocre aura moins d'impact que 3 posts excellents. »</p><p style="font-size:32px">— Buffer</p></div>`;
    const slide = readCarouselDocument({ slides: [{ slide_number: 1, title: "", body: corps }], caption: {} }, [{ slide_number: 1, html: citation }]).slides[0];
    expect(slide.data.body).toBe(corps);
    expect(getEditorElements(slide.html).find((e) => e.field === "body" && e.text === corps)).toBeTruthy();
    expect(slide.html).not.toContain('data-slide-text="title"');
  });

  it("corps déjà affiché en entier ailleurs sur la slide : pas de doublon, l'étiquette reste", () => {
    const html2 = `<div style="width:1080px;height:1350px"><h1 data-slide-text="title">Surtitre inventé</h1><p>Un autre texte</p></div>`;
    const slide = readCarouselDocument({ slides: [{ slide_number: 1, title: "", body: "Un autre texte" }], caption: {} }, [{ slide_number: 1, html: html2 }]).slides[0];
    expect(slide.html).toContain('data-slide-text="title"');
    expect(slide.data.body).toBe("Un autre texte");
  });
});
