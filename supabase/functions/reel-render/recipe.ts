/**
 * Construction de la "recette" de montage attendue par JSON2Video, à partir du
 * plan de reel produit par l'écran de montage (une section = un clip + la voix).
 *
 * Fonction pure (aucun I/O) → testable isolément. C'est le SEUL endroit qui
 * connaît le format JSON2Video : si un jour on remplace le moteur de rendu par
 * notre propre serveur FFmpeg, on ne réécrit que ce fichier (bloc échangeable).
 *
 * Choix validés au test du 22/07 :
 *  - clips en `muted` + `resize: cover` (le son du clip stock est coupé, le clip
 *    remplit le 9:16) ;
 *  - la voix est posée par SCÈNE (voix enregistrée = élément audio ; sinon TTS) ;
 *  - les sous-titres sont un élément AU NIVEAU FILM (JSON2Video ne les accepte
 *    pas par scène) et se génèrent depuis la piste voix → ils reprennent
 *    exactement les mots dits.
 */

export interface ReelSectionInput {
  /** URL publique du clip (banque libre ou vidéo de la créatrice). */
  clip_url: string;
  /** Seconde d'entrée dans le clip source (coupe). Défaut 0. */
  seek?: number;
  /** Durée de la section, en secondes. */
  duration: number;
  /** Voix enregistrée de la créatrice pour cette section (mp3/wav public). */
  voice_audio_url?: string;
  /** Texte parlé — utilisé pour la voix de synthèse (mode "tts"). */
  voice_text?: string;
}

export interface ReelRenderInput {
  width?: number;
  height?: number;
  sections: ReelSectionInput[];
  /** "recorded" = voix de la créatrice ; "tts" = voix de synthèse (test). */
  voice_mode: "recorded" | "tts";
  /** Voix TTS (mode "tts"). Défaut : voix française Denise. */
  tts_voice?: string;
  /** Incruster les sous-titres (défaut true). */
  subtitles?: boolean;
  /** Réglages de style des sous-titres (fusionnés au défaut). */
  subtitle_settings?: Record<string, unknown>;
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_TTS_VOICE = "fr-FR-DeniseNeural";

// Style de sous-titres validé au test : mot à mot, lisible, centré.
const DEFAULT_SUBTITLE_SETTINGS = {
  style: "boxed-word",
  "font-family": "Montserrat",
  "font-size": 90,
  position: "center-center",
  "word-color": "#FFFFFF",
  "line-color": "#FFFFFF",
  "outline-color": "#000000",
  "outline-width": 6,
  "max-words-per-line": 3,
} as const;

export function buildReelRecipe(input: ReelRenderInput): Record<string, unknown> {
  const width = input.width ?? DEFAULT_WIDTH;
  const height = input.height ?? DEFAULT_HEIGHT;
  const ttsVoice = input.tts_voice ?? DEFAULT_TTS_VOICE;

  const scenes = input.sections.map((s) => {
    const elements: Record<string, unknown>[] = [
      {
        type: "video",
        src: s.clip_url,
        seek: s.seek ?? 0,
        duration: s.duration,
        muted: true,
        resize: "cover",
      },
    ];

    if (input.voice_mode === "recorded" && s.voice_audio_url) {
      // Voix de la créatrice : posée telle quelle sur la scène.
      elements.push({ type: "audio", src: s.voice_audio_url });
    } else if (s.voice_text) {
      // Voix de synthèse (test / secours).
      elements.push({ type: "voice", voice: ttsVoice, text: s.voice_text });
    }

    return { duration: s.duration, elements };
  });

  const recipe: Record<string, unknown> = {
    width,
    height,
    quality: "high",
    scenes,
  };

  if (input.subtitles !== false) {
    recipe.elements = [
      {
        type: "subtitles",
        language: "fr",
        settings: { ...DEFAULT_SUBTITLE_SETTINGS, ...(input.subtitle_settings ?? {}) },
      },
    ];
  }

  return recipe;
}
