// Nouvelles mises en page (20/11/2026) : charte gardée, texte jamais coupé.
import { describe, expect, it } from "vitest";
import { composeLayout, extractStyleTokens, LAYOUTS, prepareSlideHtml } from "@/lib/carousel-editor";
import { contrast, fitText } from "@/lib/carousel-layouts";

const dom = (html: string) => new DOMParser().parseFromString(html, "text/html");
const BRAND = prepareSlideHtml(
  `<div style="width:1080px;height:1350px;background:#ffecf0;font-family:'Libre Baskerville',serif"><h1 data-slide-text="title" style="font-family:'IBM Plex Mono',monospace;font-size:100px;color:#1a050d">Mon titre</h1><p data-slide-text="body" style="font-size:48px;color:#1c1c20">Un texte avec <span style="color:#91014b;font-weight:600">un mot fort</span> dedans.</p></div>`,
);
const DATA = { title: "Mon titre", body: "Un texte avec un mot fort dedans." };

describe("mises en page : la charte de la slide est gardée", () => {
  it("une police rendue avec des guillemets doubles ne coupe plus le style du titre", () => {
    // Le navigateur rend `"IBM Plex Mono", monospace` : le guillemet fermait l'attribut style.
    const tokens = { ...extractStyleTokens(BRAND), titleFont: '"IBM Plex Mono", monospace', bodyFont: '"Libre Baskerville", serif' };
    for (const { variant, photo } of LAYOUTS) {
      const s = composeLayout(DATA, variant, photo ? "https://example.com/p.jpg" : "", tokens);
      const title = dom(s.html).querySelector<HTMLElement>('[data-slide-text="title"]')!;
      expect(title.style.fontFamily, variant).toContain("IBM Plex Mono");
      expect(title.style.color, variant).not.toBe("");
      expect(title.style.lineHeight, variant).not.toBe("");
      // Citation : un texte court sert de source, dans la police du titre.
      expect(dom(s.html).querySelector<HTMLElement>('[data-slide-text="body"]')!.style.fontFamily, variant).toContain(variant === "citation" ? "IBM Plex Mono" : "Libre Baskerville");
    }
  });
  it("le mot mis en couleur reste, sauf sur un fond de couleur ou une photo", () => {
    const tokens = extractStyleTokens(BRAND);
    const span = (variant: Parameters<typeof composeLayout>[1]) =>
      dom(composeLayout(DATA, variant, "https://example.com/p.jpg", tokens).html).querySelector('[data-slide-text="body"] span');
    expect(span("texte")?.textContent).toBe("un mot fort");
    expect(span("photo-cadre")?.textContent).toBe("un mot fort");
    expect(span("texte-centre")).toBeNull();
    expect(span("photo-plein")).toBeNull();
  });
  it("« Grand titre » puis « Éditorial » : on retrouve le fond et les couleurs d'origine", () => {
    const big = composeLayout(DATA, "texte-centre", "", extractStyleTokens(BRAND));
    const bigRoot = dom(big.html).body.firstElementChild as HTMLElement;
    expect(bigRoot.style.background || bigRoot.style.backgroundColor).toMatch(/145, 1, 75|#91014b/i);
    const back = composeLayout(big.data, "texte", "", extractStyleTokens(big.html));
    const root = dom(back.html).body.firstElementChild as HTMLElement;
    expect(root.style.background || root.style.backgroundColor).toMatch(/255, 236, 240|#ffecf0/i);
    expect(dom(back.html).querySelector<HTMLElement>('[data-slide-text="title"]')!.style.color).toMatch(/26, 5, 13|#1a050d/i);
  });
  it("le texte reste lisible sur chaque fond (contraste d'au moins 3)", () => {
    const tokens = extractStyleTokens(BRAND);
    for (const variant of ["texte", "texte-centre", "citation", "carte"] as const) {
      const d = dom(composeLayout(DATA, variant, "", tokens).html);
      const root = d.body.firstElementChild as HTMLElement;
      const card = d.querySelector<HTMLElement>('[data-pptx-shape="card"]');
      const bg = card?.style.backgroundColor || root.style.backgroundColor || root.style.background;
      for (const el of d.querySelectorAll<HTMLElement>("[data-slide-text]")) expect(contrast(el.style.color, bg), `${variant} ${el.dataset.slideText}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("une ancienne slide « photo à gauche » reste recomposable", () => {
    expect(composeLayout(DATA, "photo-gauche", "https://example.com/p.jpg").data.layout_variant).toBe("photo-haut");
    expect(composeLayout(DATA, "photo-arche", "").data.layout_variant).toBe("texte");
  });
});

describe("mises en page : le texte long tient dans la slide", () => {
  const base = { extras: [], width: 900, height: 1010, titleFont: "'IBM Plex Mono'", bodyFont: "serif", titleMax: 100 };
  it("un texte court garde les grandes tailles", () => {
    expect(fitText({ ...base, title: "Poster moins", body: "Mais mieux." })).toMatchObject({ title: 100, body: 44 });
  });
  it("un texte long réduit le titre puis le texte, sans passer sous les planchers", () => {
    const long = fitText({ ...base, title: "Ce rythme a un coût, et il est très largement documenté par les études", body: "Selon Metricool. ".repeat(60) });
    expect(long.title).toBeLessThan(100);
    expect(long.title).toBeGreaterThanOrEqual(48);
    expect(long.body).toBe(38);
  });
  it("un mot très long ne dépasse pas la largeur", () => {
    expect(fitText({ ...base, title: "Anticonstitutionnellement", body: "" }).title).toBeLessThanOrEqual(Math.floor(900 / (25 * 0.62)));
  });
});
