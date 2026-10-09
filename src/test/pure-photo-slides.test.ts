import { describe, it, expect } from "vitest";
import { purePhotoRawOrNull } from "@/lib/pure-photo-slides";
import { invalidateProgressionReceipt, progressionMaterial } from "../../supabase/functions/_shared/carousel-editorial-snapshot";

// Visite du 05/10 : l'effet « Photos brutes » de CreerUnifie re-nettoyait son
// propre résultat à l'infini (nouvel objet à chaque tour) → la pré-génération
// des visuels s'abandonnait à chaque changement et carousel-visual ne partait jamais.
describe("Photos brutes : nettoyage des slides", () => {
  const raw = {
    carousel_type: "photo",
    slides: [
      { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: "Accroche", kicker: "Moi" },
      { slide_number: 2, role: "body", slide_type: "photo_full", overlay_text: "Suite" },
      { slide_number: 3, role: "cta", slide_type: "photo_full", overlay_text: "Fin" },
    ],
    caption: { body: "Légende" },
  };

  it("1 photo = 1 slide sans texte, légende gardée", () => {
    const next = purePhotoRawOrNull(raw, 2)!;
    expect(next.slides).toEqual([
      { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: null, title: "", body: "", photo_index: 1 },
      { slide_number: 2, role: "body", slide_type: "photo_full", overlay_text: null, title: "", body: "", photo_index: 2 },
    ]);
    expect(next.no_overlay).toBe(true);
    expect(next.caption).toEqual(raw.caption);
  });

  it("s'arrête : un raw déjà nettoyé n'est plus réécrit (sinon boucle infinie)", () => {
    let current: any = raw;
    let writes = 0;
    for (let i = 0; i < 5; i++) {
      const next = purePhotoRawOrNull(current, 2);
      if (!next) break;
      current = next;
      writes++;
    }
    expect(writes).toBe(1);
  });

  it("s'arrête aussi quand l'éditeur renvoie ses slides avec leur identifiant (boucle du 08/10)", () => {
    // L'éditeur renvoie chaque slide avec `editor_id` (documentOutput). Le nettoyage
    // retirait ce champ → l'éditeur croyait recevoir une nouvelle liste → relecture,
    // renvoi avec l'identifiant → re-nettoyage, à l'infini.
    const editorEcho = (r: any) => ({ ...r, slides: r.slides.map((s: any, i: number) => ({ ...s, editor_id: s.editor_id || `slide-${i}` })) });
    let current: any = raw;
    let cleanings = 0;
    for (let i = 0; i < 6; i++) {
      const next = purePhotoRawOrNull(current, 2);
      if (next) { current = next; cleanings++; }
      current = editorEcho(current);
    }
    expect(cleanings).toBe(1);
    expect(current.slides.map((s: any) => s.editor_id)).toEqual(["slide-0", "slide-1"]);
    // Le texte ne revient jamais pour autant.
    const withText = { ...current, slides: current.slides.map((s: any) => ({ ...s, kicker: "texte" })) };
    expect(purePhotoRawOrNull(withText, 2)!.slides.every((s: any) => !("kicker" in s) && s.editor_id)).toBe(true);
  });

  it("complète avec des slides photo si l'IA en a écrit moins que de photos", () => {
    expect(purePhotoRawOrNull({ ...raw, slides: raw.slides.slice(0, 1) }, 3)!.slides.map((s: any) => s.photo_index)).toEqual([1, 2, 3]);
  });

  it("rien à faire sans slides ou sans photo", () => {
    expect(purePhotoRawOrNull({ slides: [] }, 2)).toBeNull();
    expect(purePhotoRawOrNull(raw, 0)).toBeNull();
  });
});

// Visite du 08/10 : un carrousel « Photos brutes » (aucun texte sur les slides)
// affichait « Le contrôle final du fil n'a pas abouti » et « Le texte a changé
// depuis sa relecture » — des avertissements sur un texte effacé par le nettoyage.
describe("Photos brutes : pas d'avertissement de fil sur un carrousel sans texte", () => {
  const FAIL = "Le contrôle final du fil n’a pas abouti. Relis l’enchaînement des slides avant de publier.";
  const STALE = "Le texte a changé depuis sa relecture. Vérifie le fil avant de publier.";
  const KEEP = "Légende : ajoute un appel à l’action.";
  const photoDoc = (status: string, issues: string[] = []) => ({
    carousel_type: "photo",
    slides: [
      { slide_number: 1, role: "hook", slide_type: "photo_full", overlay_text: "Accroche", photo_index: 1 },
      { slide_number: 2, role: "body", slide_type: "photo_full", overlay_text: "Suite", photo_index: 2 },
    ],
    caption: { body: "Légende" },
    progression_review: { execution_status: status, issues, reviewed_material: "relu-avant-nettoyage" },
    structure_warnings: [KEEP, ...(status === "completed" ? issues : [FAIL])],
  });

  it("pure_photo : ni « n'a pas abouti », ni « le texte a changé », ni constats du juge", () => {
    for (const doc of [photoDoc("unavailable"), photoDoc("completed", ["slide 2 : rupture. Relier."])]) {
      const shown = invalidateProgressionReceipt(purePhotoRawOrNull(doc, 2)!);
      expect(shown.structure_warnings).toEqual([KEEP]);
      expect(shown.progression_review.execution_status).toBe("not_applicable");
    }
  });

  it("pure_photo : un avertissement photo reste affiché", () => {
    const doc: any = { ...photoDoc("unavailable"), photo_review: { execution_status: "completed", issues: ["Slide 2 : image à choisir."], reviewed_material: "x" } };
    doc.structure_warnings = [...doc.structure_warnings, "Slide 2 : image à choisir."];
    const shown = invalidateProgressionReceipt(purePhotoRawOrNull(doc, 2)!);
    expect(shown.structure_warnings).toEqual([KEEP, "Slide 2 : image à choisir."]);
  });

  it("mode photo normal (texte gardé) : l'avertissement de fil reste", () => {
    const doc = photoDoc("unavailable");
    expect(invalidateProgressionReceipt({ ...doc, progression_review: { ...doc.progression_review, reviewed_material: progressionMaterial(doc) } }).structure_warnings).toContain(FAIL);
    expect(invalidateProgressionReceipt(doc).structure_warnings).toContain(STALE);
  });
});
