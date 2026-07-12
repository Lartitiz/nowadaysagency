// Restauration DÉTERMINISTE de la structure confirmée sur les carrousels photo/mix.
//
// Audit carrousel photo 12/07/2026 : l'étape structure_proposal assigne finement
// photo_index + slide_type (répétitions de photos voulues, ex 1,1,2,3,3,4,4), puis
// l'écriture (express_full + confirmed_structure) renvoie photo_index null et
// slide_type absent (13/13 slides sur 2 runs — la consigne « le champ photo_index
// doit être présent » est désobéie). Personne ne restaurait : l'edge n'injectait la
// structure que dans le PROMPT, et le front retombait sur une assignation
// séquentielle avec bouclage → le texte écrit pour une photo se retrouvait posé
// sur une autre. Ici on recopie l'intention de la structure EN CODE, par
// slide_number, jamais par obéissance du modèle.
//
// Même patron que verbatim-guard / schema-limit : fonctions pures sur le JSON
// sérialisé, échec silencieux (contenu rendu tel quel si parsing impossible).

type AnySlide = Record<string, unknown>;

function extractJson(content: string): { parsed: any; jsonText: string } | null {
  if (!content) return null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return { parsed: JSON.parse(jsonMatch[0]), jsonText: jsonMatch[0] };
  } catch {
    return null;
  }
}

function isPhotoType(t: unknown): boolean {
  return t === "photo_full" || t === "photo_integrated";
}

/** Nombre de slides du carrousel sérialisé (0 si illisible). */
export function countCarouselSlides(content: string): number {
  const doc = extractJson(content);
  const slides = doc?.parsed?.slides;
  return Array.isArray(slides) ? slides.length : 0;
}

/** Plus grand photo_index déclaré par une structure confirmée (0 si aucun). */
export function maxStructurePhotoIndex(structure: unknown): number {
  if (!Array.isArray(structure)) return 0;
  let max = 0;
  for (const s of structure) {
    const idx = (s as AnySlide)?.photo_index;
    if (Number.isInteger(idx) && (idx as number) > max) max = idx as number;
  }
  return max;
}

/**
 * Recopie photo_index / slide_type / role de la structure confirmée vers les
 * slides générées, appariées par slide_number (fallback : position). Ne touche
 * jamais une valeur déjà valide posée par le modèle — on restaure, on n'écrase pas.
 */
export function mergeConfirmedStructure(content: string, structure: unknown): string {
  if (!Array.isArray(structure) || structure.length === 0) return content;
  const doc = extractJson(content);
  if (!doc) return content;
  const slides = doc.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return content;

  const byNumber = new Map<number, AnySlide>();
  for (const s of structure) {
    const n = (s as AnySlide)?.slide_number;
    if (Number.isInteger(n)) byNumber.set(n as number, s as AnySlide);
  }

  let merged = 0;
  slides.forEach((slide: AnySlide, i: number) => {
    if (!slide || typeof slide !== "object") return;
    const ref = byNumber.get(slide.slide_number as number) ?? (structure[i] as AnySlide | undefined);
    if (!ref) return;

    const refType = ref.slide_type;
    if (typeof refType === "string" && refType && typeof slide.slide_type !== "string") {
      slide.slide_type = refType;
      merged++;
    }
    const effectiveType = typeof slide.slide_type === "string" ? slide.slide_type : refType;

    const refIdx = ref.photo_index;
    const slideIdx = slide.photo_index;
    if (effectiveType === "text_only") {
      // Une slide texte ne porte jamais de photo (null explicite, jamais undefined).
      if (slideIdx !== null) slide.photo_index = null;
    } else if (!Number.isInteger(slideIdx) && Number.isInteger(refIdx)) {
      slide.photo_index = refIdx;
      merged++;
    }

    if (typeof ref.role === "string" && ref.role && typeof slide.role !== "string") {
      slide.role = ref.role;
    }
  });

  if (merged > 0) {
    console.log(`[photo-slide-structure] structure confirmée restaurée sur ${merged} champ(s) (photo_index/slide_type)`);
  }
  return content.replace(doc.jsonText, JSON.stringify(doc.parsed, null, 2));
}

/**
 * Filet photo_index (successeur du normalizePhotoIndexes historique de carousel-ai).
 *
 * Corrige le trou constaté à l'audit 12/07 : en mode photo PUR le modèle omet
 * slide_type (3 runs/3), or l'ancien filet ne reconnaissait une slide photo que
 * par slide_type — il ne se déclenchait donc jamais sur ce chemin. Avec
 * `assumePhotoWhenTypeMissing`, une slide sans slide_type est traitée comme
 * photo_full (c'est ce que le renderer front fait déjà).
 *
 * Réassigne séquentiellement quand l'assignation IA est invalide ou dégénérée
 * (plusieurs photos dispo mais une seule utilisée). Une assignation valide —
 * y compris avec répétitions voulues — est respectée telle quelle.
 */
export function normalizePhotoIndexes(
  content: string,
  photoCount: number,
  opts: { assumePhotoWhenTypeMissing?: boolean } = {},
): string {
  if (!content || photoCount <= 0) return content;
  const doc = extractJson(content);
  if (!doc) return content;
  const slides = doc.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return content;

  const isPhotoSlide = (s: AnySlide) =>
    isPhotoType(s?.slide_type) ||
    (opts.assumePhotoWhenTypeMissing === true && typeof s?.slide_type !== "string");

  const photoSlides = slides.filter((s: AnySlide) => s && isPhotoSlide(s));
  if (photoSlides.length === 0) {
    slides.forEach((s: AnySlide) => {
      if (s && s.slide_type === "text_only") s.photo_index = null;
    });
  } else {
    const aiIndexes = photoSlides.map((s: AnySlide) => s.photo_index);
    const allInRange = aiIndexes.every(
      (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= photoCount,
    );
    const distinctCount = new Set(aiIndexes).size;
    // Dégénéré : plusieurs photos disponibles ET plusieurs slides-photo ET
    // toutes les slides-photo pointent la même photo.
    const degenerate = photoCount > 1 && photoSlides.length > 1 && distinctCount === 1;

    if (!allInRange || degenerate) {
      let photoCursor = 0;
      slides.forEach((s: AnySlide) => {
        if (!s) return;
        if (isPhotoSlide(s)) {
          s.photo_index = Math.min(photoCursor + 1, photoCount);
          photoCursor += 1;
        } else if (s.slide_type === "text_only") {
          s.photo_index = null;
        }
      });
      console.log(
        `[photo-slide-structure] photo_index normalisé : IA=${JSON.stringify(aiIndexes)} → séquentiel (photoCount=${photoCount})`,
      );
    } else {
      slides.forEach((s: AnySlide) => {
        if (s && s.slide_type === "text_only") s.photo_index = null;
      });
    }
  }

  return content.replace(doc.jsonText, JSON.stringify(doc.parsed, null, 2));
}

/**
 * Appariement style/longueur des overlays (audit 12/07, lot E) : « minimal »
 * (pilule/très grand) et « technique » (étiquette) sont conçus pour des phrases
 * courtes — vu en live une phrase narrative de 23 mots rendue en pavé noir
 * d'étiquette. Au-delà de 18 mots, l'overlay bascule en « narratif » (carte
 * opaque lisible). Déterministe, aucune réécriture de texte.
 */
export function normalizeOverlayStyles(content: string): string {
  const doc = extractJson(content);
  if (!doc) return content;
  const slides = doc.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return content;
  let fixes = 0;
  for (const s of slides as AnySlide[]) {
    const text = typeof s?.overlay_text === "string" ? s.overlay_text.trim() : "";
    if (!text) continue;
    const words = text.split(/\s+/).filter(Boolean).length;
    const style = s.overlay_style;
    if (words > 18 && (style === "minimal" || style === "technique")) {
      s.overlay_style = "narratif";
      fixes++;
    }
  }
  if (fixes > 0) {
    console.log(`[photo-slide-structure] ${fixes} overlay_style long(s) rebasculé(s) en narratif (minimal/technique ≤ 18 mots)`);
  }
  return content.replace(doc.jsonText, JSON.stringify(doc.parsed, null, 2));
}

export interface MixCompositionReport {
  total: number;
  photoSlides: number;
  photoRatio: number;
  maxConsecutiveSameType: number;
  violatesRatio: boolean;
  violatesRun: boolean;
}

/**
 * Mesure de composition d'un carrousel MIX (audit 12/07, lot D — télémétrie
 * seule, pas de correction auto) : le prompt exige ≥ 50 % de slides photo et
 * jamais 3 slides de même type d'affilée ; vu en live 33 % photo et 3 text_only
 * consécutives. On mesure et on loggue pour dimensionner un éventuel fix.
 */
export function analyzeMixComposition(content: string): MixCompositionReport | null {
  const doc = extractJson(content);
  const slides = doc?.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return null;
  const types = (slides as AnySlide[]).map((s) =>
    isPhotoType(s?.slide_type) ? "photo" : s?.slide_type === "text_only" ? "text" : "autre",
  );
  const photoSlides = types.filter((t) => t === "photo").length;
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < types.length; i++) {
    run = types[i] === types[i - 1] ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  const photoRatio = photoSlides / types.length;
  return {
    total: types.length,
    photoSlides,
    photoRatio: Math.round(photoRatio * 100) / 100,
    maxConsecutiveSameType: maxRun,
    violatesRatio: photoRatio < 0.4, // 50 % exigé, 40 % toléré
    violatesRun: maxRun >= 3,
  };
}
