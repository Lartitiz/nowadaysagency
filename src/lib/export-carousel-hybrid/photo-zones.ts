// Export hybride (fiche 15, lot 1) : zones photo et fonds opaques à effacer du
// raster, déplacés à l'identique depuis export-carousel-hybrid-pptx.ts. Reste léger :
// ni pptxgenjs ni html2canvas ici.
import { type PhotoZone, SLIDE_H_PX, SLIDE_W_PX } from "./types";
import { normalizeHex } from "../pptx-font-mapping";

/**
 * Retire les `url(data:image/...)` d'un `background-image` CSS tout en conservant
 * les autres couches (gradients linear/radial/conic, autres URLs non-data).
 * Split sur les virgules **top-level** uniquement (les virgules dans les
 * parenthèses des gradients ne séparent pas les couches).
 * Retourne `"none"` si plus aucune couche ne reste.
 */
export function stripDataUrlsFromBackground(bgImage: string): string {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < bgImage.length; i++) {
    const c = bgImage[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      parts.push(bgImage.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(bgImage.slice(start).trim());
  const kept = parts.filter((p) => p && !/^url\(\s*["']?data:image\//i.test(p));
  return kept.length > 0 ? kept.join(", ") : "none";
}

/**
 * Détecte les zones photo dans le HTML d'une slide.
 *
 * Strategy A (priorité) : éléments annotés [data-pptx-photo="N"] par Sonnet.
 * Strategy B (fallback) : détection défensive sur <img src="data:image/..."> et
 *   éléments avec background-image: url(data:image/...). photoIndex = ordre
 *   d'apparition (1-indexé).
 *
 * Ne masque PAS les éléments — c'est à l'appelant de gérer le cycle
 * masquage / capture / unmask en fonction de la disponibilité des
 * originalPhotos correspondants.
 */
export function extractPhotoZones(doc: Document, fallbackPhotoIndex?: number): PhotoZone[] {
  const win = doc.defaultView;
  if (!win) return [];

  const zones: PhotoZone[] = [];
  const seen = new Set<HTMLElement>();

  const pushZone = (el: HTMLElement, photoIndex: number, type: "img" | "background") => {
    if (seen.has(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (r.y > SLIDE_H_PX || r.x > SLIDE_W_PX) return;
    if (r.y + r.height < 0 || r.x + r.width < 0) return;
    seen.add(el);
    zones.push({
      el,
      photoIndex,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      type,
    });
  };

  // Strategy A — annotations explicites Sonnet
  const annotated = Array.from(doc.querySelectorAll<HTMLElement>("[data-pptx-photo]"));
  if (annotated.length > 0) {
    // Garde-fou P3 : warn si même photoIndex apparaît 2× sur la même slide
    const indexCounts = new Map<number, number>();
    for (const el of annotated) {
      const raw = el.getAttribute("data-pptx-photo");
      const idx = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isInteger(idx) || idx < 1) {
        console.warn(`[hybrid] data-pptx-photo invalide: "${raw}", ignoré`);
        continue;
      }
      indexCounts.set(idx, (indexCounts.get(idx) || 0) + 1);
      const isImg = el.tagName === "IMG";
      pushZone(el, idx, isImg ? "img" : "background");
    }
    for (const [idx, count] of indexCounts) {
      if (count > 1) {
        console.warn(
          `[hybrid] photoIndex ${idx} annoté ${count} fois sur la même slide — la photo sera insérée plusieurs fois`,
        );
      }
    }
    return zones;
  }

  // Strategy B (fallback) — détection défensive
  // BUG FIX : on traite UN slide par iframe, donc autoIndex repartait à 1 à chaque
  // slide → toutes les slides récupéraient originalPhotos[0] (même photo partout dans
  // le PPTX alors que l'aperçu était correct). On amorce le compteur sur le photo_index
  // réel de la slide (fourni par slidesData) pour réinjecter la bonne photo native.
  let autoIndex = Number.isInteger(fallbackPhotoIndex) && (fallbackPhotoIndex as number) >= 1
    ? (fallbackPhotoIndex as number)
    : 1;

  // <img> base64
  const imgs = Array.from(doc.querySelectorAll<HTMLImageElement>("img"));
  for (const img of imgs) {
    const src = img.getAttribute("src") || "";
    if (!src.startsWith("data:image/")) continue;
    pushZone(img, autoIndex++, "img");
  }

  // background-image: url(data:image/...)
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("*"));
  for (const el of all) {
    if (seen.has(el)) continue;
    const cs = win.getComputedStyle(el);
    const bg = cs.backgroundImage || "";
    if (!/url\(["']?data:image\//i.test(bg)) continue;
    pushZone(el, autoIndex++, "background");
  }

  return zones;
}

/**
 * Fond opaque neutralisé derrière une zone photo, et ce qu'il faut en refaire.
 *
 * `needsRepaint` distingue les deux situations :
 *  - la photo recouvre ENTIÈREMENT le fond → il suffit de l'effacer du raster,
 *    la photo native le remplace pixel pour pixel (cas historique) ;
 *  - la photo n'est qu'un ENCART dans ce fond → l'effacer troue le raster
 *    AILLEURS que sous la photo : il faut le repeindre en natif, SOUS la photo.
 */
export interface ClearedBackdrop {
  el: HTMLElement;
  rect: { x: number; y: number; w: number; h: number };
  /** Hex 6 chars sans `#`. */
  color: string;
  borderRadiusPx: number;
  needsRepaint: boolean;
}

/** La zone photo recouvre-t-elle ENTIÈREMENT ce rectangle ? (tolérance 1 px) */
export function zoneCoversRect(
  zr: { x: number; y: number; w: number; h: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    zr.x <= r.x + 1 && zr.y <= r.y + 1 &&
    zr.x + zr.w >= r.x + r.w - 1 && zr.y + zr.h >= r.y + r.h - 1
  );
}

/**
 * La zone photo et ce rectangle se chevauchent-ils VRAIMENT ? (≥ 4 px sur les
 * deux axes — un simple contact de bord ne peint rien sous la photo).
 */
export function zoneOverlapsRect(
  zr: { x: number; y: number; w: number; h: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  const ow = Math.min(zr.x + zr.w, r.x + r.w) - Math.max(zr.x, r.x);
  const oh = Math.min(zr.y + zr.h, r.y + r.h) - Math.max(zr.y, r.y);
  return ow >= 4 && oh >= 4;
}

/**
 * Neutralise (pour la capture) les fonds UNIS et OPAQUES peints DERRIÈRE une
 * zone photo masquée : l'élément de zone lui-même et chaque ancêtre qui peint
 * des pixels SOUS la photo.
 *
 * Sans ça, le raster « bouche le trou » : la racine des gabarits photo
 * composés porte `background:#1a1815` SANS annotation data-pptx-shape
 * (contrairement aux slides mix) → une fois la photo masquée, ce charbon est
 * peint OPAQUE dans le PNG posé PAR-DESSUS la photo native → la photo est
 * invisible, toute la slide est un bloc noir (vu en prod le 21/07 dans Canva
 * sur un carrousel photo immo).
 *
 * PHOTO EN ENCART (24/08) : on ne peut PAS se limiter aux ancêtres que la photo
 * recouvre entièrement. Les gabarits `photo_integrated` du prompt (top_photo,
 * left_photo, right_photo, card_photo, banner_photo) posent la photo dans un
 * coin d'une racine 1080×1350 opaque que le prompt interdit justement d'annoter
 * `data-pptx-shape` (« l'élément CONTIENT un descendant data-pptx-photo ») →
 * cette racine restait opaque et occultait la photo une génération sur deux.
 * On neutralise donc AUSSI ces fonds débordants, mais on les marque
 * `needsRepaint` : l'appelant les repeint en shape natif AVANT de poser les
 * photos, donc SOUS elles. Le DOM ne sait pas percer un trou dans un fond CSS :
 * la seule parade est de ne pas le peindre dans le raster et de le refaire en
 * natif dessous.
 *
 * On ne touche NI aux background-image (texture de marque : la retirer la
 * perdrait des deux côtés, cf. #575) NI aux fonds semi-transparents (voiles :
 * leur alpha traverse le PNG et reste fidèle sur la photo native). Les
 * éléments déjà promus en shape natif (data-pptx-shape-hide) sont déjà
 * transparents ici → ignorés naturellement.
 */
export function clearOpaqueBackdropsBehindZone(zone: PhotoZone, doc: Document): ClearedBackdrop[] {
  const win = doc.defaultView;
  if (!win) return [];
  const zr = zone.rect;
  const out: ClearedBackdrop[] = [];
  let el: HTMLElement | null = zone.el;
  while (el && el !== doc.body && el !== doc.documentElement) {
    const b = el.getBoundingClientRect();
    const r = { x: b.left, y: b.top, w: b.width, h: b.height };
    const covered = zoneCoversRect(zr, r);
    if (covered || zoneOverlapsRect(zr, r)) {
      const cs = win.getComputedStyle(el);
      // Pour l'élément de zone lui-même, le background-image (photo, gradients
      // conservés) est géré par le masquage de zone — seul son background-color
      // nous concerne. Pour un ancêtre, une image de fond = on ne touche à rien.
      const bgImage = el === zone.el ? "none" : (cs.backgroundImage || "none");
      const bgColor = cs.backgroundColor || "transparent";
      const alphaM = bgColor.match(/rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i);
      const opaque =
        bgColor !== "transparent" &&
        bgColor !== "rgba(0, 0, 0, 0)" &&
        (!alphaM || parseFloat(alphaM[1]) >= 0.99);
      if (opaque && bgImage !== "none") {
        // Fond opaque MATIÉRÉ (texture de marque) débordant sous la photo : on ne
        // sait ni l'effacer sans le perdre (#575) ni le repeindre en natif
        // (pptxgenjs = aplat seul). Il reste dans le raster — donc la photo reste
        // occultée. Jamais observé sur les gabarits photo ; tracé pour le jour où.
        if (!covered) {
          console.warn(
            "[hybrid] fond opaque À IMAGE débordant sous une photo — non neutralisable, photo potentiellement occultée",
            { bgImage: bgImage.slice(0, 80) },
          );
        }
      } else if (opaque) {
        el.style.setProperty("background-color", "transparent", "important");
        out.push({
          el,
          rect: r,
          color: normalizeHex(bgColor, "FFFFFF"),
          borderRadiusPx: parseFloat(cs.borderTopLeftRadius || cs.borderRadius || "0px") || 0,
          needsRepaint: !covered,
        });
      }
    }
    el = el.parentElement;
  }
  return out;
}
