// Découpage de redac-gate.ts (docs/robustesse/gros-fichiers.md, fiche 7,
// lot 3, 14/10/2026) : code déplacé À L'IDENTIQUE. redac-gate.ts réexporte ce
// qui était public ; le reste n'est exporté que pour les autres sous-modules.
// Types des analyses et formules de score. Sert aussi à casser un cycle : les
// passes dédiées (recherche, témoignages) comptent les AUTRES défauts avec
// textRedacRawCount par défaut, qui appartenait au gate texte.

export interface RedacAnalysis {
  reversals: string[];
  overlongSlides: Array<{ slide: number; words: number }>;
  /** Overlays photo > 28 mots (règle : 5-25, un overlay est une phrase posée SUR la photo). */
  overlongOverlays: Array<{ slide: number; words: number }>;
  ctaDuplicated: boolean;
  moulded: string[];
  hashtagsCount: number;
  fabricatedNumbers: string[];
  /** Chiffres que seule la recherche fournit, repris sans leur source dans la même phrase. */
  unsourcedResearchNumbers?: string[];
  /** Chiffres repris qui viennent de la seule recherche, sourcés ou non (télémétrie + plafond « Ton cas d'abord »). */
  researchNumbersUsed?: string[];
  /** Durées qui se contredisent entre les slides et la caption (même fait, 2 chiffres). */
  durationConflicts: string[];
  /** Passages qui recopient quasi mot pour mot un champ de la fiche de marque. */
  brandCopyOverlap: string[];
  /** Accroches DÉJÀ écrites pour ce sujet que celle-ci redit (cf. findHookEchoes). */
  hookEchoes: string[];
  /** Passages repris mot pour mot d'un contenu récent de la marque (cf. findRecentEchoes). */
  recentEchoes?: string[];
  /** Paroles rapportées ou rencontres qu'aucune source ne fournit (slides + légende). */
  inventedTestimonials?: string[];
  /** Vécu de l'autrice au passé qu'aucune source ne fournit (slides + légende). */
  inventedExperiences?: string[];
}

/** Nombre de violations rédactionnelles — formule partagée avec le quality_check. */
export function redacViolations(a: RedacAnalysis): number {
  return (
    a.reversals.length + // Dès la première formule ajoutée par le modèle.
    (a.ctaDuplicated ? 1 : 0) +
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length) +
    Math.min(3, a.unsourcedResearchNumbers?.length ?? 0) +
    // Plafonné à 1 : une contradiction, c'est UN fait à corriger, même si le
    // croisement slides × caption en remonte plusieurs formulations.
    Math.min(1, a.durationConflicts.length) +
    Math.min(3, a.brandCopyOverlap.length) +
    // Plafonné à 1 : c'est UNE accroche à réécrire, qu'elle fasse écho à un ou
    // à cinq contenus précédents.
    Math.min(1, a.hookEchoes.length) +
    Math.min(2, a.recentEchoes?.length ?? 0) +
    Math.min(3, a.inventedTestimonials?.length ?? 0) +
    Math.min(3, a.inventedExperiences?.length ?? 0)
  );
}

/** Compteurs bruts du carrousel (non plafonnés) : garde anti-régression des passes dédiées. */
export function carouselRedacRawCount(a: RedacAnalysis): number {
  return a.reversals.length + Number(a.ctaDuplicated) + a.moulded.length + a.fabricatedNumbers.length +
    (a.unsourcedResearchNumbers?.length ?? 0) + a.durationConflicts.length + a.brandCopyOverlap.length +
    a.hookEchoes.length + (a.recentEchoes?.length ?? 0) + (a.inventedTestimonials?.length ?? 0) + (a.inventedExperiences?.length ?? 0);
}

/** Score rédactionnel 0-100 (plancher 40), dérivé des violations. */
export function redacScore(a: RedacAnalysis): number {
  return Math.max(40, 100 - 10 * redacViolations(a));
}

export interface TextRedacAnalysis {
  reversals: string[];
  moulded: string[];
  fabricatedNumbers: string[];
  /** Chiffres que seule la recherche fournit, repris sans leur source dans la même phrase. */
  unsourcedResearchNumbers?: string[];
  /** Paroles rapportées ou rencontres qu'aucune source ne fournit (« une cliente me disait… »). */
  inventedTestimonials?: string[];
  /** Vécu de l'autrice au passé qu'aucune source ne fournit (« j'ai essayé. Résultat : »). */
  inventedExperiences?: string[];
  /** Passages qui recopient quasi mot pour mot un champ de la fiche de marque. */
  brandCopyOverlap: string[];
  /** Accroches DÉJÀ écrites pour ce sujet que celle-ci redit (cf. findHookEchoes). */
  hookEchoes: string[];
}

/** Nombre de violations — même formule que redacViolations, pour la variante texte. */
export function textRedacViolations(a: TextRedacAnalysis): number {
  return (
    a.reversals.length +
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length) +
    Math.min(3, a.unsourcedResearchNumbers?.length ?? 0) +
    Math.min(3, a.inventedTestimonials?.length ?? 0) +
    Math.min(3, a.inventedExperiences?.length ?? 0) +
    Math.min(3, a.brandCopyOverlap.length) +
    Math.min(1, a.hookEchoes.length)
  );
}

/** Somme brute des 4 familles mesurées — le comparateur de la garde anti-régression.
 * Compte sans plafonner les catégories : une correction qui ajoute un défaut
 * ne doit pas profiter du plafond de pénalité d’une autre catégorie. */
export function textRedacRawCount(a: TextRedacAnalysis): number {
  return a.reversals.length + a.moulded.length + a.fabricatedNumbers.length + a.brandCopyOverlap.length +
    a.hookEchoes.length + (a.unsourcedResearchNumbers?.length ?? 0) + (a.inventedTestimonials?.length ?? 0) +
    (a.inventedExperiences?.length ?? 0);
}
