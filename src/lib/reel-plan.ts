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
export function buildRenderPlan(
  sections: Array<{ timing?: unknown; texte_parle?: unknown }>,
  clipUrlBySection: Array<string | null | undefined>,
  opts: {
    voice_mode: "recorded" | "tts";
    voiceAudioUrls?: Array<string | null | undefined>;
  } = { voice_mode: "tts" },
): RenderPlan {
  const built: RenderSectionInput[] = [];
  sections.forEach((s, i) => {
    const clip = clipUrlBySection[i];
    if (!clip) return;
    const voiceUrl = opts.voice_mode === "recorded" ? opts.voiceAudioUrls?.[i] : undefined;
    built.push({
      clip_url: clip,
      seek: 0,
      duration: sectionDuration(s),
      ...(voiceUrl ? { voice_audio_url: voiceUrl } : {}),
      ...(typeof s.texte_parle === "string" ? { voice_text: s.texte_parle } : {}),
    });
  });
  return { sections: built, voice_mode: opts.voice_mode };
}
