// Thème appliqué à une slide texte générée réelle (relevée le 03/10/2026).
import { expect, it } from "vitest";
import { applyTheme, carouselThemes, prepareSlideHtml, type CarouselDocument } from "@/lib/carousel-editor";

const html = `<div style="width:1080px;height:1350px;background:#f8f8f8;display:flex;flex-direction:column;padding:96px 80px;position:relative"><div style="position:absolute;right:80px;top:96px;display:flex;gap:12px"><div style="width:14px;height:140px;background:#5a765c"></div><div style="width:14px;height:140px;background:#c8a97e"></div><div style="width:14px;height:140px;background:#5a765c"></div></div><div style="flex:1 1 0%;display:flex;flex-direction:column;justify-content:center"><h1 data-slide-text="title" style="font-size:84px;color:#5a765c">Trois conseils pour choisir les <span style="color:#c8a97e">couleurs</span> de votre marque</h1><p data-slide-text="body" style="font-size:40px;color:#222">Corps</p></div></div>`;

it("keeps decorative bars visible and the coloured word readable on a dark theme", () => {
  const doc: CarouselDocument = { caption: {}, slides: [{ id: "a", data: {}, html: prepareSlideHtml(html) }] };
  const dark = carouselThemes("#5a765c").find((t) => t.id === "sombre")!;
  const out = applyTheme(doc, dark);
  const d = new DOMParser().parseFromString(out.document.slides[0].html, "text/html");
  const bars = [...d.querySelectorAll<HTMLElement>('[data-editor-shape="decor"]')].map((b) => b.style.backgroundColor);
  expect(bars).toHaveLength(3);
  // Plus jamais la couleur de carte (invisible sur le fond sombre) ; même couleur d'origine = même teinte.
  const card = new DOMParser().parseFromString(`<i style="color:${dark.card}"></i>`, "text/html").querySelector<HTMLElement>("i")!.style.color;
  bars.forEach((c) => expect(c).not.toBe(card));
  expect(bars[0]).toBe(bars[2]);
  expect(bars[0]).not.toBe(bars[1]);
  const word = d.querySelector<HTMLElement>("h1 span")!;
  const text = new DOMParser().parseFromString(`<i style="color:${dark.text}"></i>`, "text/html").querySelector<HTMLElement>("i")!.style.color;
  expect(word.style.color).toBe(text);
});
