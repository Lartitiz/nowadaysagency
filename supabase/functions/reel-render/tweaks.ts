/**
 * Retouches du reel « sans voix » (aperçu immédiat, chantier du 14/11/2026).
 *
 * Fichier PUR (aucun I/O), partagé tel quel entre l'edge `reel-render` (Deno)
 * et l'écran de montage du site : un seul code source, testé dans
 * `tweaks_test.ts`.
 *
 * Règle : personne (ni bouton, ni IA) ne réécrit la page de montage. On ne
 * change que des RÉGLAGES BORNÉS, validés ici :
 *   - durée de chaque passage (jamais assez courte pour qu'un texte ne se lise
 *     plus, jamais plus longue que le clip disponible, reel ≤ 60 s) ;
 *   - ordre des passages (une permutation, rien d'ajouté ni de retiré) ;
 *   - taille du texte (le texte n'est jamais raccourci : un texte plus grand
 *     est découpé en plus d'écrans) ;
 *   - ambiance calme ou dynamique, sons oui/non, volume.
 */

/** Réglages de rendu lus par `buildReelComposition` (même page pour l'aperçu et le MP4). */
export interface ReelLook {
  /** Multiplicateur de la taille du texte (1 = taille de départ). */
  textScale: number;
  /** Mouvements doux : pas de flou, poussée de caméra légère, pas de coup sourd final. */
  calm: boolean;
  /** Sons de design et nappe. */
  sounds: boolean;
  /** Volume des sons (1 = volume de départ). */
  volume: number;
}

/** Toutes les retouches : le rendu + le découpage (durées, ordre) appliqué aux passages. */
export interface ReelTweaks extends ReelLook {
  /** Multiplicateur de toutes les durées (« Plus court »). */
  durationScale: number;
  /** Durée choisie pour un passage (en secondes), par numéro de passage du plan ; null = durée de départ. */
  durations: (number | null)[];
  /** Ordre des passages (index du plan) ; null = ordre du script. */
  order: number[] | null;
}

export const TEXT_SCALE = { min: 0.8, max: 1.4 } as const;
export const DURATION_SCALE = { min: 0.5, max: 1.3 } as const;
export const VOLUME = { min: 0, max: 1.5 } as const;
/** Durée plancher d'un passage, en secondes. */
export const MIN_SECTION_S = 1.5;
/** Temps de lecture minimal par mot affiché, en secondes. */
export const MIN_READ_S_PER_WORD = 0.25;
export const MAX_SECTION_S = 20;
/** Durée maximale d'un reel monté (cf. MAX_REEL_SECONDS côté site). */
export const MAX_TOTAL_S = 60;

export const DEFAULT_LOOK: ReelLook = { textScale: 1, calm: false, sounds: true, volume: 1 };
export const DEFAULT_TWEAKS: ReelTweaks = { ...DEFAULT_LOOK, durationScale: 1, durations: [], order: null };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function sanitizeLook(raw: unknown): ReelLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    textScale: round2(clamp(num(r.textScale, 1), TEXT_SCALE.min, TEXT_SCALE.max)),
    calm: r.calm === true,
    sounds: r.sounds !== false,
    volume: round2(clamp(num(r.volume, 1), VOLUME.min, VOLUME.max)),
  };
}

/** Une permutation complète de 0..n-1, sinon null (ordre du script). */
export function sanitizeOrder(raw: unknown, n: number): number[] | null {
  if (!Array.isArray(raw) || raw.length !== n) return null;
  const seen = new Set<number>();
  for (const v of raw) {
    if (!Number.isInteger(v) || v < 0 || v >= n || seen.has(v)) return null;
    seen.add(v);
  }
  return raw.every((v, i) => v === i) ? null : [...raw];
}

/**
 * Valide des retouches venues de n'importe où (bouton, IA, projet sauvegardé).
 * `n` = nombre de passages du plan : un réglage d'un autre plan est oublié.
 */
export function sanitizeTweaks(raw: unknown, n: number): ReelTweaks {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const durations = Array.from({ length: n }, (_, i) => {
    const v = Array.isArray(r.durations) ? r.durations[i] : null;
    return typeof v === "number" && Number.isFinite(v) ? round2(clamp(v, MIN_SECTION_S, MAX_SECTION_S)) : null;
  });
  return {
    ...sanitizeLook(r),
    durationScale: round2(clamp(num(r.durationScale, 1), DURATION_SCALE.min, DURATION_SCALE.max)),
    durations,
    order: sanitizeOrder(r.order, n),
  };
}

export function lookOf(t: ReelTweaks): ReelLook {
  return { textScale: t.textScale, calm: t.calm, sounds: t.sounds, volume: t.volume };
}

export function isDefaultTweaks(t: ReelTweaks): boolean {
  return t.textScale === 1 && !t.calm && t.sounds && t.volume === 1 && t.durationScale === 1 &&
    t.durations.every((d) => d == null) && t.order == null;
}

/** Passage du plan de rendu (forme commune à l'edge et au site). */
export interface CutSection {
  duration: number;
  overlay_text?: string;
  clip_type?: "video" | "image";
  broll_url?: string;
  broll_start?: number;
  broll_duration?: number;
  broll_seek?: number;
}

/** Durée sous laquelle le texte d'un passage ne se lit plus. */
export function readableFloor(text: string | undefined): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_SECTION_S, round2(words * MIN_READ_S_PER_WORD));
}

/**
 * Applique durées et ordre aux passages d'un plan. `maxDurations[i]` = temps
 * disponible dans le clip du passage i (null = pas de limite, ex. une photo) :
 * on n'allonge jamais un clip au-delà de sa fin (l'image se figerait).
 */
export function applyCut<S extends CutSection>(sections: S[], tweaks: ReelTweaks, maxDurations: (number | null)[] = []): S[] {
  const t = sanitizeTweaks(tweaks, sections.length);
  const timed = sections.map((s, i) => {
    const wanted = (t.durations[i] ?? s.duration) * t.durationScale;
    const floor = readableFloor(s.overlay_text);
    const ceiling = Math.max(s.duration, Math.min(MAX_SECTION_S, maxDurations[i] ?? MAX_SECTION_S));
    // Jamais plus court que le temps de lecture… sauf si le passage l'était déjà au départ.
    const d = clamp(wanted, Math.min(floor, s.duration, ceiling), ceiling);
    return Math.abs(d - s.duration) < 1e-9 ? s.duration : round2(d);
  });
  // Reel ≤ 60 s : on ne dépasse jamais la limite à cause d'une retouche.
  const total = timed.reduce((a, b) => a + b, 0);
  const startTotal = sections.reduce((a, s) => a + s.duration, 0);
  const limit = Math.max(MAX_TOTAL_S, startTotal);
  const fitted = total > limit
    ? timed.map((d, i) => round2(Math.max(Math.min(sections[i].duration, readableFloor(sections[i].overlay_text)), d * limit / total)))
    : timed;
  const cut = sections.map((s, i) => (fitted[i] === s.duration ? s : withDuration(s, fitted[i])));
  return t.order ? t.order.map((i) => cut[i]) : cut;
}

function withDuration<S extends CutSection>(s: S, duration: number): S {
  const next = { ...s, duration };
  if (!s.broll_url || s.broll_duration == null) return next;
  const start = Math.min(s.broll_start ?? 0, Math.max(0, duration - 0.5));
  const length = round2(Math.min(s.broll_duration, duration - start));
  if (length < 0.5) {
    // Plan de coupe trop court une fois le passage raccourci : on le retire.
    const { broll_url: _u, broll_start: _s, broll_duration: _d, broll_seek: _k, ...rest } = next;
    return rest as S;
  }
  return { ...next, broll_start: round2(start), broll_duration: length };
}

// ── Boutons de retouche (aucun appel IA) ──

export function shorter(t: ReelTweaks): ReelTweaks {
  return { ...t, durationScale: round2(Math.max(DURATION_SCALE.min, t.durationScale * 0.85)) };
}
export function biggerText(t: ReelTweaks): ReelTweaks {
  return { ...t, textScale: round2(Math.min(TEXT_SCALE.max, t.textScale + 0.15)) };
}
export function toggleCalm(t: ReelTweaks): ReelTweaks {
  return { ...t, calm: !t.calm };
}
export function toggleSounds(t: ReelTweaks): ReelTweaks {
  return { ...t, sounds: !t.sounds };
}

/**
 * Demandes simples comprises sans IA (donc sans crédit). Renvoie null si la
 * phrase demande autre chose (un passage précis, l'ordre…) : l'IA prend alors le relais.
 */
export function quickTweakFromText(text: string, t: ReelTweaks): ReelTweaks | null {
  const s = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/\d|passage|ordre|inverse|echange|debut|fin|premier|dernier|deuxieme|second/.test(s)) return null;
  let next = t;
  let matched = false;
  const rule = (re: RegExp, fn: (x: ReelTweaks) => ReelTweaks) => {
    if (re.test(s)) { next = fn(next); matched = true; }
  };
  rule(/(plus|trop) (court|long)|raccourc|plus vite|plus rapide|trop lent/, (x) => (/trop long|raccourc|plus court|plus vite|plus rapide|trop lent/.test(s) ? shorter(x) : x));
  rule(/(texte|ecrit|lettre|police|mots?).{0,20}(plus )?(grand|gros)|plus (grand|gros)|agrandi|lisible/, biggerText);
  rule(/(texte|ecrit|lettre|police|mots?).{0,20}(plus )?petit|plus petit|trop (grand|gros)/, (x) => ({ ...x, textScale: round2(Math.max(TEXT_SCALE.min, x.textScale - 0.15)) }));
  rule(/calme|doux|douce|sobre|zen|moins d.?effets?|trop agite/, (x) => ({ ...x, calm: true }));
  rule(/dynamique|energi|peps|plus vivant|plus d.?effets?/, (x) => ({ ...x, calm: false }));
  rule(/sans (son|bruit|musique)|pas de (son|bruit|musique)|(coupe|enleve|retire|supprime).{0,12}(son|bruit|musique)|muet/, (x) => ({ ...x, sounds: false }));
  rule(/(moins fort|plus bas|baisse|trop fort)/, (x) => ({ ...x, sounds: true, volume: round2(Math.max(VOLUME.min, x.volume - 0.35)) }));
  rule(/(plus fort|monte|augmente).{0,12}(son|volume|musique)|remets? (le|les) sons?|avec (le|les) sons?/, (x) => ({ ...x, sounds: true, volume: /plus fort|monte|augmente/.test(s) ? round2(Math.min(VOLUME.max, x.volume + 0.35)) : x.volume }));
  return matched && next !== t ? next : null;
}
