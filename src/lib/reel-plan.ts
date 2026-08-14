/**
 * reel-plan — helpers PURS du montage de reels (durée d'une section, plan de
 * rendu). Zéro dépendance réseau : testable isolément, sans charger le client
 * Supabase. Les appels au moteur vivent dans `reel-render.ts`.
 */

const WORDS_PER_SECOND = 2.5; // même cadence que le backend (durées reels)

/** "3-15 sec" → 12. Renvoie null si non parsable. */
export function parseTimingSeconds(timing: unknown): number | null {
  if (typeof timing !== "string") return null;
  const nums = timing.match(/\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const a = parseFloat(nums[0].replace(",", "."));
  const b = parseFloat(nums[1].replace(",", "."));
  const d = b - a;
  return d > 0 ? d : null;
}

/** Durée d'une section : d'abord le timing, sinon estimée depuis le texte parlé. */
export function sectionDuration(section: {
  timing?: unknown;
  texte_parle?: unknown;
}): number {
  const fromTiming = parseTimingSeconds(section.timing);
  if (fromTiming != null) return clamp(Math.round(fromTiming), 2, 90);
  const words =
    typeof section.texte_parle === "string"
      ? section.texte_parle.trim().split(/\s+/).filter(Boolean).length
      : 0;
  return clamp(Math.max(2, Math.round(words / WORDS_PER_SECOND)), 2, 90);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface RenderSectionInput {
  clip_url: string;
  seek?: number;
  duration: number;
  voice_audio_url?: string;
  voice_text?: string;
}

export interface RenderPlan {
  width?: number;
  height?: number;
  sections: RenderSectionInput[];
  voice_mode: "recorded" | "tts";
  tts_voice?: string;
  subtitles?: boolean;
  subtitle_settings?: Record<string, unknown>;
  /** "filme" (prise face cam, son gardé) / "cache" (défaut, comportement existant). */
  mode?: "filme" | "cache";
}

/**
 * Petit silence gardé après la voix, pour ne jamais rogner la dernière syllabe
 * ni la respiration finale.
 */
export const VOICE_TAIL_SECONDS = 0.4;

/**
 * Durée de scène quand la créatrice a enregistré sa voix : c'est SA prise qui
 * commande, pas la durée estimée du script.
 *
 * Sans ça, la scène s'arrêtait à la durée déduite du script (2,5 mots/seconde) :
 * une lecture posée (≈ 2,2 mots/s) se faisait couper en fin de phrase, et une
 * lecture rapide laissait un blanc.
 */
export function voiceSectionDuration(voiceDuration: number): number {
  const withTail = voiceDuration + VOICE_TAIL_SECONDS;
  return clamp(Math.round(withTail * 10) / 10, 2, 90);
}

/**
 * Mode "je me filme" : la durée de la scène vient de la longueur RÉELLE de la
 * prise vidéo, pas du script — même logique que `voiceSectionDuration`, sans
 * le silence de fin ajouté : le dernier plan de la prise EST déjà la fin
 * (contrairement à une voix, dont la détection peut couper juste avant).
 */
export function videoSectionDuration(clipDuration: number): number {
  return clamp(Math.round(clipDuration * 10) / 10, 2, 90);
}

/**
 * Construit le plan de rendu à partir des sections du script et du clip choisi
 * pour chacune. Ignore les sections sans clip (rien à montrer).
 *
 * Voix : en mode "recorded", chaque section reçoit l'enregistrement de la
 * créatrice si disponible (`voiceAudioUrls`). Le texte parlé est TOUJOURS
 * embarqué : côté moteur, il sert de repli voix générée pour les sections
 * sans enregistrement (une phrase ratée ne rend pas le reel muet).
 */
/** Clip choisi pour une section : URL + seconde d'entrée dans le clip source. */
export type ClipChoice = string | { url: string; seek?: number } | null | undefined;

/**
 * Sections qui partiront au montage SANS la voix de la créatrice (mode
 * "recorded") : un clip est choisi mais aucune phrase enregistrée. Le moteur
 * les basculera en voix générée — c'est voulu (une phrase ratée ne rend pas le
 * reel muet), mais SANS prévenir, la cliente découvre un reel où sa voix
 * alterne avec une voix robot et croit à un bug. L'UI confirme avant.
 */
export function countSectionsWithoutVoice(
  clips: ClipChoice[],
  voiceUrls: Array<string | null | undefined>,
): number {
  return clips.reduce((n, clip, i) => (clip && !voiceUrls[i] ? n + 1 : n), 0);
}

export interface RenderPlanOptions {
  /** "filme" (prise face cam, son gardé) / "cache" (défaut, comportement existant). */
  mode?: "filme" | "cache";
  voice_mode: "recorded" | "tts";
  voiceAudioUrls?: Array<string | null | undefined>;
  /** Durée RÉELLE de chaque prise, en secondes (même index que les sections). */
  voiceDurations?: Array<number | null | undefined>;
  /** Mode "filme" seulement : durée RÉELLE du clip choisi pour chaque section. */
  clipDurations?: Array<number | null | undefined>;
}

export function buildRenderPlan(
  sections: Array<{ timing?: unknown; texte_parle?: unknown }>,
  clipBySection: ClipChoice[],
  opts: RenderPlanOptions = { voice_mode: "tts" },
): RenderPlan {
  const mode = opts.mode ?? "cache";
  const built: RenderSectionInput[] = [];
  sections.forEach((s, i) => {
    const choice = clipBySection[i];
    const url = typeof choice === "string" ? choice : choice?.url;
    if (!url) return;
    const seek = typeof choice === "object" && choice ? Math.max(0, choice.seek ?? 0) : 0;

    if (mode === "filme") {
      // La prise porte déjà sa voix : la durée vient d'elle, pas du script.
      const clipDuration = opts.clipDurations?.[i];
      const duration =
        typeof clipDuration === "number" && clipDuration > 0
          ? videoSectionDuration(clipDuration)
          : sectionDuration(s);
      built.push({ clip_url: url, seek, duration });
      return;
    }

    const voiceUrl = opts.voice_mode === "recorded" ? opts.voiceAudioUrls?.[i] : undefined;
    // Une prise enregistrée fixe elle-même la durée de sa scène.
    const voiceDuration = voiceUrl ? opts.voiceDurations?.[i] : undefined;
    const duration =
      typeof voiceDuration === "number" && voiceDuration > 0
        ? voiceSectionDuration(voiceDuration)
        : sectionDuration(s);
    built.push({
      clip_url: url,
      seek,
      duration,
      ...(voiceUrl ? { voice_audio_url: voiceUrl } : {}),
      ...(typeof s.texte_parle === "string" ? { voice_text: s.texte_parle } : {}),
    });
  });
  return { sections: built, voice_mode: opts.voice_mode, mode };
}

/**
 * L'autre moitié de la garde : les phrases DÉJÀ enregistrées qui n'ont pas de
 * clip. `buildRenderPlan` écarte toute section sans clip — la prise part avec,
 * sans un mot. Renvoie les NUMÉROS de phrase (1, 2, 3…), tels qu'affichés.
 */
export function sectionsWithVoiceButNoClip(
  clips: ClipChoice[],
  voiceUrls: Array<string | null | undefined>,
): number[] {
  const out: number[] = [];
  voiceUrls.forEach((voice, i) => {
    if (voice && !clips[i]) out.push(i + 1);
  });
  return out;
}
