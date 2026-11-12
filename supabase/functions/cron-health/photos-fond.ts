// Carrousels « Tes photos en fond » trop chargés (12/11/2026) — bilan hebdo, testable.
//
// La PR #1892 plafonne ce rendu à 30 mots par slide (réécriture au-delà de 40)
// et impose un seul narrateur « je » ou « nous » (carousel-ai/photo-narrative.ts).
// On relit les carrousels photo GARDÉS de la semaine (generated_carousels : texte
// complet ; content_quality_events n'a qu'un aperçu tronqué à 120 caractères).
// Seuils de lecture : au moins 3 slides de plus de 40 mots, ou au moins 2
// carrousels qui mélangent « je » et « nous » → alerte. Copie volontaire des
// règles de photo-narrative.ts (cron-health n'importe aucune autre fonction) ;
// photos-fond_test.ts vérifie qu'elles restent identiques.

export const PHOTOS_FOND_LONG_WORDS = 40;
export const PHOTOS_FOND_MIN_SLIDES_ALERTE = 3;
export const PHOTOS_FOND_MIN_NARRATEUR_ALERTE = 2;

export interface PhotosFond {
  carrousels: number;
  slides: number;
  au_dela_40_mots: number;
  max_mots: number | null;
  narrateur_mixte: number;
  alerte: string | null;
}

const outsideQuotes = (text: string) => text.replace(/«[^»]*»/g, " ").replace(/"[^"]*"/g, " ").replace(/“[^”]*”/g, " ");

/** Marques de la 1re personne du singulier et du pluriel, hors citations (comme photo-narrative.ts). */
export function narrateurCompte(text: unknown): { je: number; nous: number } {
  const t = outsideQuotes(String(text || "")).toLowerCase();
  const je = (t.match(/(?<!\p{L})(?:je|moi|mon|ma|mes)(?!\p{L})|(?<!\p{L})[jm]['’](?=\p{L})/gu) || []).length;
  const nous = (t.match(/(?<!\p{L})(?:nous|notre|nos)(?!\p{L})/gu) || []).length;
  return { je, nous };
}

const texteSlide = (s: any) => [s?.overlay_text, s?.kicker, s?.detail, s?.title, s?.body]
  .filter((t) => typeof t === "string" && t.trim()).join(" ");
const mots = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function photosFondStats(
  rows: { carousel_type?: string | null; created_at: string | null; slides?: unknown }[],
  inWindow: (iso: string | null) => boolean,
): PhotosFond {
  let carrousels = 0, slides = 0, long = 0, max: number | null = null, mixte = 0;
  for (const r of rows) {
    if (r.carousel_type !== "photo" || !inWindow(r.created_at) || !Array.isArray(r.slides)) continue;
    const textes = r.slides.map(texteSlide);
    if (!textes.some(Boolean)) continue; // « Photos brutes » : aucun texte posé
    carrousels++;
    textes.forEach((t, i) => {
      if (i === 0 || !t) return; // couverture exclue, comme à la génération
      const n = mots(t);
      slides++;
      if (n > PHOTOS_FOND_LONG_WORDS) long++;
      max = max === null ? n : Math.max(max, n);
    });
    const comptes = textes.map(narrateurCompte);
    if (comptes.some((c) => c.je > 0) && comptes.some((c) => c.nous > 0)) mixte++;
  }
  const raisons = [
    long >= PHOTOS_FOND_MIN_SLIDES_ALERTE ? `${long} slide(s) de plus de ${PHOTOS_FOND_LONG_WORDS} mots` : "",
    mixte >= PHOTOS_FOND_MIN_NARRATEUR_ALERTE ? `${mixte} carrousel(s) qui mélangent « je » et « nous »` : "",
  ].filter(Boolean);
  return {
    carrousels, slides, au_dela_40_mots: long, max_mots: max, narrateur_mixte: mixte,
    alerte: raisons.length ? `« Tes photos en fond » : ${raisons.join(", ")} (carousel-ai/photo-narrative.ts)` : null,
  };
}
