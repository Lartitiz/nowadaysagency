/**
 * marronniers — calendrier DÉTERMINISTE des temps forts français pertinents
 * pour l'audience (créatrices, e-commerce, indépendantes).
 *
 * Zéro IA : les dates sont calculées (Pâques par l'algorithme de Meeus, fête
 * des mères = dernier dimanche de mai SAUF Pentecôte → 1er dimanche de juin,
 * Black Friday = lendemain du 4e jeudi de novembre…). Chaque marronnier porte
 * sa fenêtre d'anticipation (la carte du calendrier ne s'affiche que dedans),
 * l'offset de planification du post (J-x) et son prompt de scène Photoroom
 * (DÉCOR SEUL — le produit détouré y est incrusté, jamais re-généré).
 */

export interface Marronnier {
  key: string;
  label: string;
  emoji: string;
  /** Jours avant la date où la carte calendrier apparaît. */
  anticipationDays: number;
  /** Le post planifié est posé à J-offset avant le marronnier. */
  postOffsetDays: number;
  /** Une ligne pour les cartes du dialog. */
  shortScene: string;
  /** Prompt Photoroom du décor (sans produit, sans personne, net). */
  scenePrompt: string;
  /** Occurrence dans l'année donnée. */
  dateFor: (year: number) => Date;
}

/* ── helpers de dates (UTC-safe : on travaille en local à midi) ── */

function d(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day, 12, 0, 0, 0);
}

/** n-ième (1-based) jour de semaine (0=dim … 6=sam) du mois. */
export function nthWeekdayOfMonth(year: number, month1: number, weekday: number, n: number): Date {
  const first = d(year, month1, 1);
  const delta = (weekday - first.getDay() + 7) % 7;
  return d(year, month1, 1 + delta + (n - 1) * 7);
}

/** Dernier jour de semaine donné du mois. */
export function lastWeekdayOfMonth(year: number, month1: number, weekday: number): Date {
  const last = d(year, month1 + 1, 0 + 1); // 1er du mois suivant
  last.setDate(0); // dernier jour du mois
  const back = (last.getDay() - weekday + 7) % 7;
  return d(year, month1, last.getDate() - back);
}

/** Dimanche de Pâques (algorithme de Meeus/Butcher, grégorien). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(year, month, day);
}

/** Fête des mères FR : dernier dimanche de mai, sauf Pentecôte → 1er dimanche de juin. */
export function feteDesMeres(year: number): Date {
  const lastSundayMay = lastWeekdayOfMonth(year, 5, 0);
  const pentecote = new Date(easterSunday(year));
  pentecote.setDate(pentecote.getDate() + 49);
  if (
    pentecote.getMonth() === lastSundayMay.getMonth() &&
    pentecote.getDate() === lastSundayMay.getDate()
  ) {
    return nthWeekdayOfMonth(year, 6, 0, 1);
  }
  return lastSundayMay;
}

/* ── le calendrier ── */

const NO_PEOPLE = " Aucune personne, aucun texte, décor net et réaliste.";

export const MARRONNIERS: Marronnier[] = [
  {
    key: "soldes_hiver",
    label: "Soldes d'hiver",
    emoji: "🏷️",
    anticipationDays: 10,
    postOffsetDays: 3,
    shortScene: "Décor hivernal net, esprit boutique",
    scenePrompt:
      "Décor de boutique hivernale lumineuse, comptoir en bois clair, lumière douce de janvier, ambiance épurée et accueillante." + NO_PEOPLE,
    dateFor: (y) => nthWeekdayOfMonth(y, 1, 3, 2),
  },
  {
    key: "saint_valentin",
    label: "Saint-Valentin",
    emoji: "💝",
    anticipationDays: 21,
    postOffsetDays: 7,
    shortScene: "Ambiance douce et romantique, sans kitsch",
    scenePrompt:
      "Table élégante aux tons doux, quelques pétales et une bougie allumée en arrière-plan flou léger, lumière chaleureuse et intime, esthétique sobre sans cœurs kitsch." + NO_PEOPLE,
    dateFor: (y) => d(y, 2, 14),
  },
  {
    key: "printemps",
    label: "Printemps",
    emoji: "🌸",
    anticipationDays: 10,
    postOffsetDays: 2,
    shortScene: "Fraîcheur végétale, lumière claire",
    scenePrompt:
      "Décor printanier frais : branches en fleurs, lin clair, lumière naturelle vive de matin de printemps, tons pastel doux." + NO_PEOPLE,
    dateFor: (y) => d(y, 3, 20),
  },
  {
    key: "paques",
    label: "Pâques",
    emoji: "🐣",
    anticipationDays: 14,
    postOffsetDays: 5,
    shortScene: "Table de printemps, tons crème et pastel",
    scenePrompt:
      "Table de Pâques épurée : nappe en lin, quelques œufs décorés discrets et branchages fleuris, lumière douce de printemps." + NO_PEOPLE,
    dateFor: (y) => easterSunday(y),
  },
  {
    key: "fete_meres",
    label: "Fête des mères",
    emoji: "💐",
    anticipationDays: 21,
    postOffsetDays: 7,
    shortScene: "Fleurs fraîches, douceur, esprit cadeau",
    scenePrompt:
      "Décor cadeau délicat : bouquet de fleurs fraîches, papier de soie, ruban, lumière douce et chaleureuse, tons tendres." + NO_PEOPLE,
    dateFor: feteDesMeres,
  },
  {
    key: "fete_peres",
    label: "Fête des pères",
    emoji: "👔",
    anticipationDays: 14,
    postOffsetDays: 5,
    shortScene: "Matières brutes, esprit cadeau masculin",
    scenePrompt:
      "Décor cadeau aux matières brutes : bois foncé, cuir, papier kraft et ficelle, lumière chaleureuse tamisée." + NO_PEOPLE,
    dateFor: (y) => nthWeekdayOfMonth(y, 6, 0, 3),
  },
  {
    key: "ete",
    label: "Été",
    emoji: "☀️",
    anticipationDays: 10,
    postOffsetDays: 2,
    shortScene: "Lumière dorée, matières estivales",
    scenePrompt:
      "Décor d'été lumineux : lumière dorée, ombres nettes de plein soleil, matières naturelles (lin, paille, bois clair), fraîcheur méditerranéenne." + NO_PEOPLE,
    dateFor: (y) => d(y, 6, 21),
  },
  {
    key: "soldes_ete",
    label: "Soldes d'été",
    emoji: "🏷️",
    anticipationDays: 10,
    postOffsetDays: 3,
    shortScene: "Boutique estivale claire",
    scenePrompt:
      "Décor de boutique estivale : étagère claire, lumière vive d'été, ambiance légère et aérée." + NO_PEOPLE,
    dateFor: (y) => lastWeekdayOfMonth(y, 6, 3),
  },
  {
    key: "rentree",
    label: "Rentrée",
    emoji: "🍂",
    anticipationDays: 21,
    postOffsetDays: 7,
    shortScene: "Nouveau départ, bureau frais et organisé",
    scenePrompt:
      "Décor de rentrée : bureau en bois clair rangé, carnet neuf, lumière de fin d'été, ambiance de nouveau départ organisée et motivante." + NO_PEOPLE,
    dateFor: (y) => d(y, 9, 1),
  },
  {
    key: "automne",
    label: "Automne",
    emoji: "🍁",
    anticipationDays: 10,
    postOffsetDays: 2,
    shortScene: "Tons chauds, matières cocooning",
    scenePrompt:
      "Décor d'automne cocooning : plaid en laine, tons ocre et terracotta, feuillage sec, lumière chaude et douce." + NO_PEOPLE,
    dateFor: (y) => d(y, 9, 22),
  },
  {
    key: "halloween",
    label: "Halloween",
    emoji: "🎃",
    anticipationDays: 14,
    postOffsetDays: 5,
    shortScene: "Ambiance d'octobre, sobre et chic",
    scenePrompt:
      "Décor d'octobre élégant : petites citrouilles décoratives, bougies, tons ambrés et sombres, ambiance chic et mystérieuse sans déguisements." + NO_PEOPLE,
    dateFor: (y) => d(y, 10, 31),
  },
  {
    key: "black_friday",
    label: "Black Friday",
    emoji: "🛍️",
    anticipationDays: 14,
    postOffsetDays: 4,
    shortScene: "Mise en avant boutique, contraste fort",
    scenePrompt:
      "Décor de mise en avant produit contrasté : fond sombre élégant, éclairage directionnel type vitrine, ambiance premium." + NO_PEOPLE,
    dateFor: (y) => {
      const bf = nthWeekdayOfMonth(y, 11, 4, 4);
      bf.setDate(bf.getDate() + 1);
      return bf;
    },
  },
  {
    key: "noel",
    label: "Noël",
    emoji: "🎄",
    anticipationDays: 35,
    postOffsetDays: 7,
    shortScene: "Table de fêtes chaleureuse, lumières douces",
    scenePrompt:
      "Table de Noël chaleureuse : bois, branches de sapin, guirlande lumineuse en arrière-plan flou léger, bougies, lumière dorée et intime." + NO_PEOPLE,
    dateFor: (y) => d(y, 12, 25),
  },
  {
    key: "nouvel_an",
    label: "Nouvel an",
    emoji: "✨",
    anticipationDays: 8,
    postOffsetDays: 1,
    shortScene: "Festif épuré, touches dorées",
    scenePrompt:
      "Décor festif épuré de nouvel an : touches dorées discrètes, lumière scintillante en arrière-plan flou léger, ambiance élégante." + NO_PEOPLE,
    dateFor: (y) => d(y, 1, 1),
  },
];

export interface MarronnierOccurrence {
  marronnier: Marronnier;
  date: Date;
  daysUntil: number;
}

function startOfDay(x: Date): Date {
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 12, 0, 0, 0);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Prochaine occurrence (aujourd'hui compris) de chaque marronnier, triées. */
export function nextMarronniers(now: Date, count = 3): MarronnierOccurrence[] {
  const today = startOfDay(now);
  return MARRONNIERS.map((m) => {
    let date = startOfDay(m.dateFor(today.getFullYear()));
    if (date.getTime() < today.getTime()) date = startOfDay(m.dateFor(today.getFullYear() + 1));
    return { marronnier: m, date, daysUntil: Math.round((date.getTime() - today.getTime()) / DAY_MS) };
  })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, count);
}

/** Le marronnier à annoncer dans le calendrier (le plus proche DANS sa fenêtre). */
export function activeMarronnier(now: Date): MarronnierOccurrence | null {
  return (
    nextMarronniers(now, MARRONNIERS.length).find(
      (o) => o.daysUntil <= o.marronnier.anticipationDays,
    ) ?? null
  );
}

/** Date du post planifié : J-offset avant le marronnier, jamais avant demain. */
export function plannedPostDate(occ: MarronnierOccurrence, now: Date): Date {
  const target = new Date(occ.date);
  target.setDate(target.getDate() - occ.marronnier.postOffsetDays);
  const tomorrow = startOfDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return target.getTime() < tomorrow.getTime() ? tomorrow : startOfDay(target);
}
