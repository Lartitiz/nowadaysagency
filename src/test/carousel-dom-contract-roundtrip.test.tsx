import { describe, expect, it } from "vitest";
import { documentOutput, getEditorElements, patchElement, prepareSlideHtml, readCarouselDocument, type EditorSlide } from "@/lib/carousel-editor";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";
import { buildCarouselDesignPlan, composeEditorialSlide } from "../../supabase/functions/_shared/carousel-design-plan";
import { composeMixSlide } from "../../supabase/functions/_shared/mix-slide-layouts";
import { ensureAnchor, ensurePptxEditable } from "../../supabase/functions/_shared/verbatim-guard";

// Contrat serveur → éditeur → export, sur du VRAI HTML produit par le serveur
// (lot E1, 14/10/2026). Pour chaque famille de slide (texte éditorial, photo,
// photo « verre », mixte, slide texte écrite par l'IA puis ancrée) :
//   1. l'éditeur retrouve le texte source dans le bon champ ;
//   2. une retouche réécrit le HTML ET les données ;
//   3. après la retouche, les étiquettes lues par l'export PPTX sont toujours là.
// Complète src/test/carousel-dom-contract.test.ts (qui vérifie les NOMS).

const PHOTO = "https://example.com/photo.jpg";
const withPhotos = (html: string) => html.replace(/\{\{PHOTO_\d+\}\}/g, PHOTO);
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
const editorCharter = { color_background: "#FFF4F8", color_text: "#1A1A1A", color_secondary: "#91014B", color_primary: "#91014B", color_accent: "#FB3D80", font_title: "Georgia", font_body: "Arial" };
const mixCharter = { color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8", color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Fraunces", font_body: "Work Sans", border_radius: "rounded" };

interface Case {
  name: string;
  data: Record<string, any>;
  html: () => string;
  field: "title" | "body" | "overlay";
  dataKey: "title" | "body" | "overlay_text";
}

const CASES: Case[] = [
  {
    name: "slide texte éditoriale (plan de design)",
    data: { slide_number: 2, title: "Une autre façon de communiquer", body: "La sobriété peut être un choix esthétique.", role: "point", slide_type: "text_only" },
    html() { return composeEditorialSlide(this.data as never, buildCarouselDesignPlan([this.data as never]).sequence[0], editorCharter as never)!.html; },
    field: "title", dataKey: "title",
  },
  {
    name: "slide photo (texte sur photo)",
    data: { slide_number: 2, photo_index: 1, overlay_text: "Choisir peu demande de choisir juste.", overlay_position: "bottom_left" },
    html() { return composePhotoSlide(this.data as never, editorCharter as never, { isFirst: false, isLast: false }).html; },
    field: "overlay", dataKey: "overlay_text",
  },
  {
    name: "slide photo style « verre »",
    data: {
      slide_number: 3, photo_index: 1, overlay_text: "Le geste compte plus que l'outil.", overlay_position: "top_left", photo_style: "verre",
      art_direction: { treatment: "editorial", position: "top_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" },
    },
    html() { return composePhotoSlide(this.data as never, editorCharter as never, { isFirst: false, isLast: false }).html; },
    field: "overlay", dataKey: "overlay_text",
  },
  {
    name: "slide mixte (texte + photo)",
    data: { slide_number: 4, slide_type: "photo_integrated", photo_index: 3, title: "L'émail", body: "Le même bleu coule différemment selon sa place dans le four." },
    html() { return composeMixSlide(this.data as never, mixCharter as never, { isFirst: false, isLast: false, previous: null, photoCount: 5 } as never)!.html; },
    field: "body", dataKey: "body",
  },
  {
    name: "slide texte écrite par l'IA puis ancrée par le serveur",
    data: { slide_number: 5, title: "200 bols ratés", body: "C'est ça, la méthode." },
    html() {
      // Forme typique d'une réponse de carousel-visual en mode texte, avant ses garde-fous.
      let html = `<div style="width:1080px;height:1350px;background:#FFF4F8"><h2 style="font-size:72px">200 bols ratés</h2><p style="font-size:40px">C'est ça, la méthode.</p></div>`;
      html = ensureAnchor(html, "title", this.data.title).html;
      html = ensureAnchor(html, "body", this.data.body).html;
      return ensurePptxEditable(ensurePptxEditable(html, "title"), "body");
    },
    field: "title", dataKey: "title",
  },
];

describe("contrat serveur → éditeur → export, sur le HTML réel du serveur", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      const make = (): EditorSlide => ({ id: "s", data: { ...c.data }, html: prepareSlideHtml(withPhotos(c.html())) });

      it("le serveur pose l'ancre du texte source", () => {
        expect(dom(c.html()).querySelector(`[data-slide-text="${c.field}"]`), `pas d'élément data-slide-text="${c.field}"`).not.toBeNull();
      });

      it("l'éditeur retrouve le texte source dans le bon champ", () => {
        const el = getEditorElements(make().html).find((e) => e.kind === "text" && e.field === c.field);
        expect(el, `l'éditeur ne trouve pas le champ ${c.field}`).toBeTruthy();
        expect(el!.text.replace(/\s+/g, " ").trim()).toBe(String(c.data[c.dataKey]));
      });

      it("une retouche réécrit le HTML et les données, et garde les étiquettes d'export", () => {
        const slide = make();
        const el = getEditorElements(slide.html).find((e) => e.kind === "text" && e.field === c.field)!;
        const edited = patchElement(slide, el.id, { text: "Texte retouché dans l'éditeur" });
        expect(edited.data[c.dataKey]).toBe("Texte retouché dans l'éditeur");
        const doc = dom(edited.html);
        const anchored = doc.querySelector(`[data-slide-text="${c.field}"]`);
        expect(anchored?.textContent).toContain("Texte retouché dans l'éditeur");
        // L'export PPTX lit ces étiquettes : elles doivent survivre à la retouche.
        const before = dom(slide.html);
        for (const sel of ["[data-pptx-editable]", "[data-pptx-photo]", "[data-pptx-shape]"]) {
          expect(doc.querySelectorAll(sel).length, `${sel} perdu après la retouche`).toBe(before.querySelectorAll(sel).length);
        }
      });

      it("l'aller-retour sauvegarde → réouverture garde le texte et les étiquettes", () => {
        const slide = make();
        const el = getEditorElements(slide.html).find((e) => e.kind === "text" && e.field === c.field)!;
        const edited = patchElement(slide, el.id, { text: "Version enregistrée" });
        const out = documentOutput({ caption: {}, slides: [edited] }, { slides: [c.data] });
        const reopened = readCarouselDocument(out.raw, out.visualSlides);
        expect(reopened.slides[0].data[c.dataKey]).toBe("Version enregistrée");
        const doc = dom(reopened.slides[0].html);
        expect(doc.querySelector(`[data-slide-text="${c.field}"]`)?.textContent).toContain("Version enregistrée");
        expect(doc.querySelectorAll("[data-pptx-editable]").length).toBe(dom(edited.html).querySelectorAll("[data-pptx-editable]").length);
      });
    });
  }
});
