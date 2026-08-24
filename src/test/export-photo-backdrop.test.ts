import { describe, it, expect } from "vitest";
import { zoneCoversRect, zoneOverlapsRect } from "@/lib/export-carousel-hybrid-pptx";

/**
 * Géométrie du « trou » percé dans le raster de l'export hybride (24/08).
 *
 * Le raster est posé PAR-DESSUS la photo native : tout fond opaque peint sous la
 * photo doit être retiré du raster. Deux verdicts, deux traitements :
 *   zoneCoversRect   → la photo remplace ce fond pixel pour pixel : effacer suffit.
 *   zoneOverlapsRect → le fond DÉBORDE de la photo : effacer le troue ailleurs,
 *                      il faut le repeindre en shape natif SOUS la photo.
 *
 * Les rectangles ci-dessous sont ceux des gabarits du prompt carousel-visual,
 * dans le repère iframe 1080×1350.
 */
const RACINE = { x: 0, y: 0, w: 1080, h: 1350 };

describe("photo PLEIN CADRE (photo_full) — cas historique, inchangé", () => {
  it("la photo recouvre la racine : effacer suffit", () => {
    const photo = { x: 0, y: 0, w: 1080, h: 1350 };
    expect(zoneCoversRect(photo, RACINE)).toBe(true);
  });

  it("tolère le demi-pixel de getBoundingClientRect", () => {
    const photo = { x: 0.4, y: 0.4, w: 1079.3, h: 1349.3 };
    expect(zoneCoversRect(photo, RACINE)).toBe(true);
  });
});

describe("photo en ENCART (photo_integrated) — le défaut du 24/08", () => {
  // Chaque entrée : le rect de la photo tel que le gabarit la pose.
  const GABARITS: [string, { x: number; y: number; w: number; h: number }][] = [
    ["top_photo — photo 1080×740 en haut", { x: 0, y: 0, w: 1080, h: 740 }],
    ["left_photo — photo 432×1350 à gauche", { x: 0, y: 0, w: 432, h: 1350 }],
    ["right_photo — photo 432×1350 à droite", { x: 648, y: 0, w: 432, h: 1350 }],
    ["card_photo — photo 920×660 dans la carte", { x: 80, y: 80, w: 920, h: 660 }],
    ["banner_photo — bandeau 1080×380", { x: 0, y: 0, w: 1080, h: 380 }],
  ];

  for (const [nom, photo] of GABARITS) {
    it(`${nom} : la racine opaque déborde → à repeindre en natif`, () => {
      expect(zoneCoversRect(photo, RACINE)).toBe(false);
      expect(zoneOverlapsRect(photo, RACINE)).toBe(true);
    });
  }

  it("card_photo : la carte blanche intermédiaire déborde aussi", () => {
    const photo = { x: 80, y: 80, w: 920, h: 660 };
    const carte = { x: 80, y: 80, w: 920, h: 1190 };
    expect(zoneCoversRect(photo, carte)).toBe(false);
    expect(zoneOverlapsRect(photo, carte)).toBe(true);
  });
});

describe("fonds à NE PAS toucher", () => {
  it("un fond qui ne croise pas la photo n'est pas neutralisé", () => {
    const photo = { x: 0, y: 0, w: 1080, h: 380 };
    const blocBas = { x: 0, y: 400, w: 1080, h: 950 };
    expect(zoneOverlapsRect(photo, blocBas)).toBe(false);
  });

  it("un simple contact de bord (≤ 4 px) ne peint rien sous la photo", () => {
    const photo = { x: 0, y: 0, w: 1080, h: 400 };
    const voisin = { x: 0, y: 398, w: 1080, h: 952 };
    expect(zoneOverlapsRect(photo, voisin)).toBe(false);
  });
});
