import { describe, it, expect, vi } from "vitest";
import {
  clearOpaqueBackdropsBehindZone,
  extractPhotoZones,
  findOverlayElement,
  stripDataUrlsFromBackground,
} from "@/lib/export-carousel-hybrid-pptx";

/**
 * Zones photo de l'export hybride (fiche 15 de docs/robustesse/gros-fichiers.md,
 * lot T, 15/10/2026) : quelle photo d'origine va où, et quels fonds opaques
 * effacer du raster pour ne pas cacher la photo (défauts du 21/07 et du 24/08).
 *
 * jsdom ne calcule aucune mise en page : dans le cadre de test, getBoundingClientRect
 * est remplacé par une lecture de l'attribut `data-r="x,y,w,h"` posé sur chaque élément.
 */

function lireRect(this: Element) {
  const [x, y, w, h] = (this.getAttribute("data-r") || "0,0,0,0").split(",").map(Number);
  return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
}

// Un cadre comme dans l'export : son document a une fenêtre (defaultView), sans
// laquelle les fonctions testées rendent une liste vide.
function doc(html: string): Document {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const win = iframe.contentWindow as unknown as typeof globalThis;
  win.Element.prototype.getBoundingClientRect = lireRect;
  const d = iframe.contentDocument!;
  d.body.innerHTML = html;
  return d;
}

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("stripDataUrlsFromBackground", () => {
  it("garde les dégradés, retire les images en data:", () => {
    expect(stripDataUrlsFromBackground(`linear-gradient(0deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0)), url("${PNG}")`))
      .toBe("linear-gradient(0deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0))");
  });

  it("ne coupe pas sur les virgules à l'intérieur des parenthèses", () => {
    const g = "radial-gradient(circle at 10% 20%, rgb(255, 0, 0), rgb(0, 0, 255))";
    expect(stripDataUrlsFromBackground(`${g}, url(${PNG}), url(https://exemple.fr/a.png)`))
      .toBe(`${g}, url(https://exemple.fr/a.png)`);
  });

  it("tout retiré → none", () => {
    expect(stripDataUrlsFromBackground(`url('${PNG}')`)).toBe("none");
  });
});

describe("findOverlayElement", () => {
  it("rend le PLUS PETIT élément qui contient le texte (sans casse)", () => {
    const d = doc(`<div id="racine"><div id="bloc"><p id="cible">Ose ta lumière</p><p>autre</p></div></div>`);
    expect(findOverlayElement(d, "ose ta LUMIÈRE")?.id).toBe("cible");
  });

  it("texte trop court ou introuvable → null", () => {
    const d = doc(`<p>Bonjour</p>`);
    expect(findOverlayElement(d, "ab")).toBeNull();
    expect(findOverlayElement(d, "absent du html")).toBeNull();
  });
});

describe("extractPhotoZones", () => {
  it("annotations data-pptx-photo : index lu, index invalide ignoré, doublon signalé", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = doc(`
      <img id="a" data-pptx-photo="2" src="${PNG}" data-r="0,0,1080,700">
      <div id="b" data-pptx-photo="zéro" data-r="0,700,1080,650"></div>
      <div id="c" data-pptx-photo="2" data-r="100,800,300,300"></div>
      <div id="minuscule" data-pptx-photo="3" data-r="0,0,5,5"></div>
    `);
    const zones = extractPhotoZones(d, 7);
    expect(zones.map((z) => [z.el.id, z.photoIndex, z.type])).toEqual([
      ["a", 2, "img"],
      ["c", 2, "background"],
    ]);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringContaining("data-pptx-photo invalide"),
      expect.stringContaining("photoIndex 2 annoté 2 fois"),
    ]);
    warn.mockRestore();
  });

  it("sans annotation : la slide 3 reçoit la photo 3, pas la 1 (correctif « même photo partout »)", () => {
    const d = doc(`
      <img id="photo" src="${PNG}" data-r="0,0,1080,1350">
      <div id="fond" style="background-image: url(${PNG})" data-r="0,0,1080,400"></div>
      <img id="lien" src="https://exemple.fr/a.png" data-r="0,0,200,200">
    `);
    const zones = extractPhotoZones(d, 3);
    expect(zones.map((z) => [z.el.id, z.photoIndex, z.type])).toEqual([
      ["photo", 3, "img"],
      ["fond", 4, "background"],
    ]);
  });

  it("sans index de repli valide : on part de 1 ; zones hors slide ignorées", () => {
    const d = doc(`
      <img id="dedans" src="${PNG}" data-r="10,10,500,500">
      <img id="dessous" src="${PNG}" data-r="0,1400,500,500">
    `);
    expect(extractPhotoZones(d, 0).map((z) => [z.el.id, z.photoIndex])).toEqual([["dedans", 1]]);
  });
});

describe("clearOpaqueBackdropsBehindZone", () => {
  const zoneDe = (d: Document, id: string) => extractPhotoZones(d).find((z) => z.el.id === id)!;

  it("photo PLEIN CADRE sur une racine opaque : effacer suffit (pas de repeint)", () => {
    const d = doc(`
      <div id="racine" style="background-color: rgb(26, 24, 21)" data-r="0,0,1080,1350">
        <img id="photo" data-pptx-photo="1" src="${PNG}" data-r="0,0,1080,1350">
      </div>`);
    const out = clearOpaqueBackdropsBehindZone(zoneDe(d, "photo"), d);
    expect(out.map((b) => [b.el.id, b.color, b.needsRepaint])).toEqual([["racine", "1A1815", false]]);
    expect((d.getElementById("racine") as HTMLElement).style.getPropertyValue("background-color")).toBe("transparent");
  });

  it("photo en ENCART dans une racine opaque : à repeindre sous la photo (défaut du 24/08)", () => {
    const d = doc(`
      <div id="racine" style="background-color: rgb(255, 244, 248); border-radius: 20px" data-r="0,0,1080,1350">
        <div id="photo" data-pptx-photo="1" data-r="0,0,1080,740"></div>
      </div>`);
    const out = clearOpaqueBackdropsBehindZone(zoneDe(d, "photo"), d);
    expect(out.map((b) => [b.el.id, b.color, b.borderRadiusPx, b.needsRepaint])).toEqual([["racine", "FFF4F8", 20, true]]);
  });

  it("fond à texture (image de fond) : laissé tel quel, avec un avertissement s'il déborde", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = doc(`
      <div id="racine" style="background-color: rgb(0, 0, 0); background-image: url(https://exemple.fr/texture.png)" data-r="0,0,1080,1350">
        <div id="photo" data-pptx-photo="1" data-r="0,0,1080,740"></div>
      </div>`);
    expect(clearOpaqueBackdropsBehindZone(zoneDe(d, "photo"), d)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("voile semi-transparent et ancêtre sans chevauchement : laissés", () => {
    const d = doc(`
      <div id="voisin" style="background-color: rgb(0, 0, 0)" data-r="0,1000,1080,350"></div>
      <div id="voile" style="background-color: rgba(0, 0, 0, 0.4)" data-r="0,0,1080,1350">
        <div id="photo" data-pptx-photo="1" data-r="0,0,1080,740"></div>
      </div>`);
    expect(clearOpaqueBackdropsBehindZone(zoneDe(d, "photo"), d)).toEqual([]);
  });
});
