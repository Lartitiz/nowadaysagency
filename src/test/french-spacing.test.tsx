import { describe, expect, it } from "vitest";
import { frenchSpacingSlide, frenchSpacingText } from "@/lib/french-spacing";
import { prepareSlideHtml } from "@/lib/carousel-editor";

const NB = " ";

describe("ponctuation française : espace insécable", () => {
  it("avant : ; ! ? et autour des guillemets, sans changer la longueur", () => {
    const text = "Nouvelle acquisition : je ne vous annonce aucune marge ! Vraiment ? « Oui » ; fin";
    const out = frenchSpacingText(text);
    expect(out).toBe(`Nouvelle acquisition${NB}: je ne vous annonce aucune marge${NB}! Vraiment${NB}? «${NB}Oui${NB}»${NB}; fin`);
    expect(out.length).toBe(text.length);
  });
  it("ne touche ni aux adresses ni aux heures sans espace", () => {
    expect(frenchSpacingText("https://exemple.fr à 14:30")).toBe("https://exemple.fr à 14:30");
  });
  it("s'applique aux slides préparées pour l'éditeur, pas aux styles", () => {
    const html = prepareSlideHtml('<style>a{color:red !important}</style><div><h1 data-slide-text="title">Nouvelle acquisition : zéro marge</h1></div>');
    expect(html).toContain(`acquisition${NB}: zéro`.replace(NB, "&nbsp;"));
    expect(html).toContain("color:red !important");
  });
  it("traverse une mise en forme (espace avant une ponctuation en italique)", () => {
    const slide = frenchSpacingSlide({ html: "<div><p>acquisition <em>: aucune</em></p></div>" });
    expect(slide.html).toContain("acquisition&nbsp;<em>:");
  });
  it("rend la même slide quand il n'y a rien à changer", () => {
    const slide = { html: "<div><p>Rien à changer</p></div>" };
    expect(frenchSpacingSlide(slide)).toBe(slide);
  });
});
