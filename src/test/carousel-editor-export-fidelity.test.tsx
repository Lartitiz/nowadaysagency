// Lot E2 (14/10/2026) : on fige le comportement de l'éditeur avant son découpage.
// Après une retouche, le HTML produit par l'éditeur garde les étiquettes lues par
// l'export : data-pptx-editable (zones de texte PowerPoint), data-pptx-photo
// (emplacement et numéro de photo), data-pptx-shape (formes natives) et
// data-slide-text (texte source). Mêmes slides serveur que
// carousel-dom-contract-roundtrip.test.tsx (lot E1), mais une batterie de
// retouches de l'éditeur, pas seulement une modification de texte.
import { describe, expect, it } from "vitest";
import {
  applyTheme,
  applyToAllSlides,
  carouselThemes,
  composeLayout,
  documentOutput,
  duplicateElement,
  ensureFontLink,
  getEditorElements,
  LAYOUTS,
  moveLayer,
  patchElement,
  prepareSlideHtml,
  readCarouselDocument,
  renumberDocument,
  replacePhoto,
  restyleSlide,
  setLayerHidden,
  setLayerLocked,
  slideExtraTexts,
  slidePhotoSource,
  extractStyleTokens,
  type EditorElement,
  type EditorSlide,
} from "@/lib/carousel-editor";
import { restyleAllTexts } from "@/components/creer/CarouselEditorParts/AllSlidesPanel";
import { blockFromElement } from "@/lib/export-carousel-hybrid/text-blocks";
import { mapFontToPptx } from "@/lib/pptx-font-mapping";
import { composePhotoSlide } from "../../supabase/functions/_shared/photo-overlay-templates";
import { buildCarouselDesignPlan, composeEditorialSlide } from "../../supabase/functions/_shared/carousel-design-plan";
import { composeMixSlide } from "../../supabase/functions/_shared/mix-slide-layouts";
import { ensureAnchor, ensurePptxEditable } from "../../supabase/functions/_shared/verbatim-guard";

const PHOTO = "https://example.com/photo.jpg";
const withPhotos = (html: string) => html.replace(/\{\{PHOTO_\d+\}\}/g, PHOTO);
const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
const editorCharter = { color_background: "#FFF4F8", color_text: "#1A1A1A", color_secondary: "#91014B", color_primary: "#91014B", color_accent: "#FB3D80", font_title: "Georgia", font_body: "Arial" };
const mixCharter = { color_primary: "#23395B", color_secondary: "#23395B", color_background: "#F4EFE8", color_text: "#1E2A3A", color_accent: "#B5781A", font_title: "Fraunces", font_body: "Work Sans", border_radius: "rounded" };

const editorialData = { slide_number: 2, title: "Une autre façon de communiquer", body: "La sobriété peut être un choix esthétique.", role: "point", slide_type: "text_only" };
const photoData = { slide_number: 2, photo_index: 1, overlay_text: "Choisir peu demande de choisir juste.", overlay_position: "bottom_left" };
const glassData = {
  slide_number: 3, photo_index: 1, overlay_text: "Le geste compte plus que l'outil.", overlay_position: "top_left", photo_style: "verre",
  art_direction: { treatment: "editorial", position: "top_left", emphasis: null, reason: "t", surface: "veil", alignment: "left" },
};
const mixData = { slide_number: 4, slide_type: "photo_integrated", photo_index: 3, title: "L'émail", body: "Le même bleu coule différemment selon sa place dans le four." };
const anchoredData = { slide_number: 5, title: "200 bols ratés", body: "C'est ça, la méthode." };

const SLIDES: { name: string; data: Record<string, any>; html: () => string }[] = [
  { name: "slide texte éditoriale", data: editorialData, html: () => composeEditorialSlide(editorialData as never, buildCarouselDesignPlan([editorialData as never]).sequence[0], editorCharter as never)!.html },
  { name: "slide photo", data: photoData, html: () => composePhotoSlide(photoData as never, editorCharter as never, { isFirst: false, isLast: false }).html },
  { name: "slide photo « verre »", data: glassData, html: () => composePhotoSlide(glassData as never, editorCharter as never, { isFirst: false, isLast: false }).html },
  { name: "slide mixte", data: mixData, html: () => composeMixSlide(mixData as never, mixCharter as never, { isFirst: false, isLast: false, previous: null, photoCount: 5 } as never)!.html },
  {
    name: "slide texte de l'IA ancrée",
    data: anchoredData,
    html: () => {
      let html = `<div style="width:1080px;height:1350px;background:#FFF4F8"><h2 style="font-size:72px">200 bols ratés</h2><p style="font-size:40px">C'est ça, la méthode.</p></div>`;
      html = ensureAnchor(html, "title", anchoredData.title).html;
      html = ensureAnchor(html, "body", anchoredData.body).html;
      return ensurePptxEditable(ensurePptxEditable(html, "title"), "body");
    },
  },
];

const EXPORT_ATTRS = ["data-pptx-editable", "data-pptx-photo", "data-pptx-shape", "data-slide-text"] as const;
/** Étiquettes d'export de la slide, rattachées à l'élément qui les porte (par son identifiant d'éditeur). */
function exportLabels(html: string): string[] {
  const out: string[] = [];
  dom(html).querySelectorAll<HTMLElement>(EXPORT_ATTRS.map((a) => `[${a}]`).join(",")).forEach((el) => {
    for (const a of EXPORT_ATTRS) if (el.hasAttribute(a)) out.push(`${el.getAttribute("data-editor-id") || el.tagName}:${a}=${el.getAttribute(a)}`);
  });
  return out.sort();
}
const firstText = (s: EditorSlide) => getEditorElements(s.html).find((e) => e.kind === "text" && !!e.field)!;
const pick = (s: EditorSlide, f: (e: EditorElement) => boolean) => getEditorElements(s.html).find(f);

/** Retouches qui ne doivent RIEN changer aux étiquettes d'export. */
const NEUTRAL: { name: string; run: (s: EditorSlide) => EditorSlide }[] = [
  { name: "texte modifié", run: (s) => patchElement(s, firstText(s).id, { text: "Texte retouché dans l'éditeur" }) },
  { name: "couleur, police et taille", run: (s) => patchElement(s, firstText(s).id, { styles: { color: "#fb3d80", "font-family": "'Playfair Display', serif", "font-size": "88px" } }) },
  { name: "déplacé", run: (s) => patchElement(s, firstText(s).id, { styles: { position: "absolute", left: "140px", top: "260px" } }) },
  { name: "redimensionné (poignée)", run: (s) => patchElement(s, firstText(s).id, { styles: { width: "700px", "max-width": "none" } }) },
  { name: "tourné", run: (s) => patchElement(s, firstText(s).id, { styles: { "--editor-rotate": "12deg", "--editor-base-transform": "", transform: "rotate(12deg)" } }) },
  { name: "ombre portée et ombre du texte", run: (s) => patchElement(s, firstText(s).id, { styles: { "box-shadow": "0 8px 24px rgba(0,0,0,0.18)", "text-shadow": "0 2px 10px rgba(0,0,0,0.45)" } }) },
  {
    name: "filtre photo (noir et blanc)",
    run: (s) => {
      const photo = pick(s, (e) => e.kind === "photo");
      return photo ? patchElement(s, photo.id, { styles: { filter: "brightness(1) contrast(1) saturate(0)" } }) : s;
    },
  },
  { name: "fond de slide", run: (s) => restyleSlide(s, { "background-color": "#ffe561" }) },
  { name: "police Google ajoutée", run: (s) => ensureFontLink(s, "Playfair Display") },
  { name: "élément verrouillé", run: (s) => setLayerLocked(s, firstText(s).id, true) },
  { name: "élément passé devant", run: (s) => moveLayer(s, firstText(s).id, "up") },
];

describe("l'export reste fidèle aux étiquettes après une retouche", () => {
  for (const c of SLIDES) {
    describe(c.name, () => {
      const make = (): EditorSlide => ({ id: "s", data: { ...c.data }, html: prepareSlideHtml(withPhotos(c.html())) });
      it("la slide de départ porte bien des étiquettes d'export", () => {
        expect(exportLabels(make().html).some((l) => l.includes("data-pptx-editable"))).toBe(true);
        expect(exportLabels(make().html).some((l) => l.includes("data-slide-text"))).toBe(true);
        if (c.data.photo_index) expect(exportLabels(make().html).some((l) => l.includes(`data-pptx-photo=${c.data.photo_index}`))).toBe(true);
      });
      for (const r of NEUTRAL) {
        it(`${r.name} : mêmes étiquettes, sur les mêmes éléments`, () => {
          const slide = make();
          const edited = r.run(slide);
          expect(exportLabels(edited.html)).toEqual(exportLabels(slide.html));
        });
      }
      it("toutes les retouches à la suite, puis enregistrement et réouverture : mêmes étiquettes", () => {
        const slide = make();
        const edited = NEUTRAL.reduce((s, r) => r.run(s), slide);
        expect(exportLabels(edited.html)).toEqual(exportLabels(slide.html));
        const out = documentOutput({ caption: {}, slides: [edited] }, { slides: [c.data] });
        const reopened = readCarouselDocument(out.raw, out.visualSlides);
        expect(exportLabels(reopened.slides[0].html)).toEqual(exportLabels(slide.html));
        expect(dom(out.visualSlides[0].html).querySelector("[data-slide-text]")).not.toBeNull();
      });
      it("calque masqué : ses étiquettes restent (il réapparaît intact)", () => {
        const slide = make();
        const id = firstText(slide).id;
        const hidden = setLayerHidden(slide, id, true);
        expect(exportLabels(hidden.html)).toEqual(exportLabels(slide.html));
        expect(exportLabels(setLayerHidden(hidden, id, false).html)).toEqual(exportLabels(slide.html));
      });
      it("dupliquer un texte : la copie n'est PAS un texte source (pas de second data-slide-text)", () => {
        const slide = make();
        const out = duplicateElement(slide, firstText(slide).id);
        expect(out.id).not.toBeNull();
        const count = (html: string, field: string) => dom(html).querySelectorAll(`[data-slide-text="${field}"]`).length;
        const field = String(firstText(slide).field === "overlay" ? "overlay" : firstText(slide).field);
        expect(count(out.slide.html, field)).toBe(count(slide.html, field));
        // Les étiquettes d'origine sont toutes encore là.
        const after = exportLabels(out.slide.html);
        for (const l of exportLabels(slide.html)) expect(after).toContain(l);
      });
      it("remplacer la photo : même emplacement, nouveau numéro de photo", () => {
        const slide = make();
        const photo = pick(slide, (e) => e.kind === "photo");
        if (!photo) return;
        const next = replacePhoto(slide, photo.id, "data:image/jpeg;base64,NEW", 4);
        const expected = exportLabels(slide.html).map((l) => (l.startsWith(`${photo.id}:data-pptx-photo=`) ? `${photo.id}:data-pptx-photo=4` : l)).sort();
        expect(exportLabels(next.html)).toEqual(expected);
      });
    });
  }
});

describe("opérations lourdes : les étiquettes d'export sont reconstruites", () => {
  it("chaque mise en page garde titre et corps comme textes source ET zones PowerPoint", () => {
    const tokens = extractStyleTokens(prepareSlideHtml(withPhotos(SLIDES[0].html())));
    for (const { variant, photo } of LAYOUTS) {
      const s = composeLayout({ title: "Mon titre", body: "Mon texte", photo_index: 2 }, variant, photo ? PHOTO : "", tokens);
      const d = dom(s.html);
      expect(d.querySelector('[data-slide-text="title"]')?.getAttribute("data-pptx-editable"), variant).toBe("title");
      expect(d.querySelector('[data-slide-text="body"]')?.getAttribute("data-pptx-editable"), variant).toBe("body");
      if (photo) expect(d.querySelector("[data-pptx-photo]")?.getAttribute("data-pptx-photo"), variant).toBe("2");
    }
  });
  it("mise en page appliquée à une vraie slide mixte : la photo garde son numéro", () => {
    const slide: EditorSlide = { id: "s", data: { ...mixData }, html: prepareSlideHtml(withPhotos(SLIDES[3].html())) };
    const src = slidePhotoSource(slide.html);
    expect(src).toBe(PHOTO);
    const next = composeLayout(slide.data, "photo-haut", src, extractStyleTokens(slide.html), slideExtraTexts(slide));
    expect(dom(next.html).querySelector("[data-pptx-photo]")?.getAttribute("data-pptx-photo")).toBe("3");
    expect(dom(next.html).querySelector('[data-slide-text="body"]')?.textContent).toBe(mixData.body);
  });
  it("thème du carrousel et report sur toutes les slides : étiquettes inchangées", () => {
    const doc = renumberDocument({
      caption: {},
      slides: [SLIDES[0], SLIDES[4], SLIDES[1]].map((c, i) => ({ id: `s${i}`, data: { ...c.data }, html: prepareSlideHtml(withPhotos(c.html())) })),
    });
    const before = doc.slides.map((s) => exportLabels(s.html));
    const themed = applyTheme(doc, carouselThemes("#91014b").find((t) => t.id === "sombre")!).document;
    expect(themed.slides.map((s) => exportLabels(s.html))).toEqual(before);
    const title = pick(themed.slides[0], (e) => e.field === "title")!;
    const styled = patchElement(themed.slides[0], title.id, { styles: { "font-size": "90px", color: "#fb3d80" } });
    const all = applyToAllSlides({ ...themed, slides: [styled, ...themed.slides.slice(1)] }, styled.id, title.id, { style: true, position: true }).document;
    expect(all.slides.map((s) => exportLabels(s.html))).toEqual(before);
  });
  // Chantier V (18/10/2026) : « Mettre cette police partout » (mode simple) et « Police et
  // couleur sur toutes les slides » : la police reportée est celle que lit l'export PowerPoint
  // (style calculé de chaque zone de texte), les étiquettes ne bougent pas, la slide verrouillée non plus.
  it("police reportée sur toutes les slides : elle arrive dans chaque zone de texte du PowerPoint", () => {
    const doc = renumberDocument({
      caption: {},
      slides: [SLIDES[0], SLIDES[4], SLIDES[3], SLIDES[1]].map((c, i) => ({ id: `s${i}`, data: { ...c.data }, html: prepareSlideHtml(withPhotos(c.html())), locked: i === 3 })),
    });
    const before = doc.slides.map((s) => exportLabels(s.html));
    const all = restyleAllTexts(doc, { "font-family": "'Playfair Display', serif" });
    expect(all.slides.map((s) => exportLabels(s.html))).toEqual(before);
    expect(all.slides[3].html).toBe(doc.slides[3].html);
    for (const slide of all.slides.slice(0, 3)) {
      expect(slide.html).toMatch(/Playfair\+Display/);
      // L'export lit le style calculé : la slide est posée dans une vraie page.
      const page = window.document;
      page.body.innerHTML = dom(slide.html).body.innerHTML;
      const zones = [...page.querySelectorAll<HTMLElement>("[data-pptx-editable]")];
      expect(zones.length).toBeGreaterThan(0);
      for (const el of zones) {
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 80, right: 400, bottom: 80, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
        const block = blockFromElement(el, page, "body")!;
        expect(mapFontToPptx(block.style.fontFamily)).toBe("Playfair Display");
      }
    }
  });
});
