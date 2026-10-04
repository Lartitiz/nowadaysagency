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
 *  - la voix est posée par SCÈNE (voix enregistrée ; TTS historique uniquement) ;
 *  - les sous-titres sont un élément AU NIVEAU FILM (JSON2Video ne les accepte
 *    pas par scène) et se génèrent depuis la piste voix → ils reprennent
 *    exactement les mots dits.
 *
 * Fourche à deux modes ÉGAUX, décidée le 01/08 (aucun n'est le défaut côté UI —
 * beaucoup de clientes ne se montreront jamais) :
 *  - "cache" : clip muet + voix off de la créatrice, ou texte à l'écran sans voix.
 *  - "filme" : la créatrice parle à la caméra. Le clip GARDE son son original
 *    (`muted: false`) et aucune voix séparée n'est posée dessus — les
 *    sous-titres, qui se génèrent depuis la piste audio finale du film,
 *    reprennent alors ce qu'elle a VRAIMENT dit sans code supplémentaire.
 */

export interface ReelSectionInput {
  /** URL publique du clip (banque libre ou vidéo de la créatrice). */
  clip_url: string;
  /** Seconde d'entrée dans le clip source (coupe). Défaut 0. */
  seek?: number;
  /** Durée de la section, en secondes. */
  duration: number;
  /** Voix enregistrée de la créatrice pour cette section (mp3/wav public). Ignoré en mode "filme". */
  voice_audio_url?: string;
  /** Texte parlé — utilisé pour la voix de synthèse (mode "tts"). Ignoré en mode "filme". */
  voice_text?: string;
  /** Texte affiché à l'écran dans le mode silencieux. */
  overlay_text?: string;
  /** Silent cutaway covering the base video for part of this scene. */
  broll_url?: string;
  broll_start?: number;
  broll_duration?: number;
  broll_seek?: number;
}

export interface ReelRenderInput {
  width?: number;
  height?: number;
  sections: ReelSectionInput[];
  /** "recorded" = voix de la créatrice ; "silent" = texte à l'écran, sans voix. */
  voice_mode: "recorded" | "tts" | "silent";
  /** Voix TTS (mode "tts"). Défaut : voix française Denise. */
  tts_voice?: string;
  /** Incruster les sous-titres (défaut true). */
  subtitles?: boolean;
  /** Réglages de style des sous-titres (fusionnés au défaut). */
  subtitle_settings?: Record<string, unknown>;
  /**
   * "cache" (défaut) = clip muet + voix posée par-dessus, comportement existant.
   * "filme" = prise face cam, on garde le son du clip, pas de voix séparée.
   */
  mode?: "filme" | "cache";
}

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_TTS_VOICE = "fr-FR-DeniseNeural";

// Style de sous-titres validé au test : mot à mot, lisible.
//
// Position : vérifié sur un rendu réel le 18/08, le préréglage "bottom-center"
// de JSON2Video colle les sous-titres au ras du bord bas — le bandeau
// Instagram (légende, icônes) les recouvre complètement. On passe donc à des
// coordonnées sur mesure (position "custom") pour les remonter vers le bas du
// centre, sous le sujet du clip mais au-dessus du bandeau Instagram.
const SUBTITLE_Y_RATIO = 0.72;

const DEFAULT_SUBTITLE_SETTINGS = {
  style: "boxed-word",
  "font-family": "Montserrat",
  "font-size": 90,
  "word-color": "#FFFFFF",
  "line-color": "#FFFFFF",
  "outline-color": "#000000",
  "outline-width": 6,
  "max-words-per-line": 3,
} as const;

// ── Texte à l'écran du mode silencieux ─────────────────────────────────────
// Rendu validé : Montserrat gras 58 px, blanc sur bandeau sombre, centré, dans
// une boîte fixe (marges 70 px, haut à 64 % de la hauteur, 22 % de haut).
// Le code GARANTIT deux choses que l'écriture ne peut pas garantir :
//  - les MAJUSCULES (choix de style) : appliquées ici, l'IA ou l'utilisatrice
//    peuvent écrire en minuscules sans changer le rendu ;
//  - la boîte TIENT le texte : si le texte est trop long (ex. repli sur tout le
//    texte parlé quand texte_overlay manque), la police descend par paliers,
//    puis la boîte s'agrandit vers le haut. Le texte n'est JAMAIS raccourci.
// Un texte court (cas normal : 3-8 mots) garde exactement le rendu validé.
export const OVERLAY_FONT_STEPS_PX = [58, 50, 44, 38, 32, 28, 24] as const;
const OVERLAY_MARGIN_X = 70;
const OVERLAY_TOP_RATIO = 0.64;
const OVERLAY_HEIGHT_RATIO = 0.22;
/** Plus haut que ça, le bandeau couvrirait le haut de l'image (zone du profil Instagram). */
const OVERLAY_MAX_TOP_RATIO = 0.12;
/**
 * Largeur moyenne d'un caractère en MAJUSCULES Montserrat 700, en fraction de
 * la taille de police. Volontairement pessimiste (les capitales grasses
 * mesurent ~0,70 em en moyenne) : mieux vaut un palier trop tôt qu'un débord.
 */
const OVERLAY_CHAR_EM = 0.78;
const OVERLAY_LINE_HEIGHT = 1.3;
/** Marge intérieure verticale prise en compte (haut + bas). */
const OVERLAY_PADDING_Y = 24;

/** Nombre de lignes du texte une fois replié mot à mot dans `boxWidth`. */
export function estimateOverlayLines(text: string, fontSizePx: number, boxWidth: number): number {
  const charsPerLine = Math.max(1, Math.floor(boxWidth / (fontSizePx * OVERLAY_CHAR_EM)));
  let lines = 0;
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let current = 0;
    lines += 1;
    for (const word of words) {
      const len = [...word].length;
      if (len > charsPerLine) {
        // Mot plus long qu'une ligne : il occupe plusieurs lignes à lui seul.
        if (current > 0) lines += 1;
        lines += Math.ceil(len / charsPerLine) - 1;
        current = len % charsPerLine || charsPerLine;
        continue;
      }
      const needed = current === 0 ? len : current + 1 + len;
      if (needed > charsPerLine) {
        lines += 1;
        current = len;
      } else {
        current = needed;
      }
    }
  }
  return Math.max(1, lines);
}

export function overlayTextHeight(lines: number, fontSizePx: number): number {
  return Math.ceil(lines * fontSizePx * OVERLAY_LINE_HEIGHT + OVERLAY_PADDING_Y);
}

export interface OverlayLayout {
  /** Texte rendu : tous les mots d'origine, en MAJUSCULES. */
  text: string;
  fontSizePx: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Lignes estimées à cette taille (sert aux tests de « ça tient »). */
  lines: number;
}

/**
 * Mise en page du texte à l'écran : majuscules + taille/boîte qui tiennent le
 * texte. Fonction pure. Ne retire, ne coupe ni ne remplace aucun mot.
 */
export function layoutOverlayText(raw: string, width: number, height: number): OverlayLayout {
  const text = raw.trim().toLocaleUpperCase("fr-FR");
  const x = OVERLAY_MARGIN_X;
  const boxWidth = width - 2 * OVERLAY_MARGIN_X;
  const baseTop = Math.round(height * OVERLAY_TOP_RATIO);
  const baseHeight = Math.round(height * OVERLAY_HEIGHT_RATIO);
  for (const size of OVERLAY_FONT_STEPS_PX) {
    const lines = estimateOverlayLines(text, size, boxWidth);
    if (overlayTextHeight(lines, size) <= baseHeight) {
      return { text, fontSizePx: size, x, y: baseTop, width: boxWidth, height: baseHeight, lines };
    }
  }
  // Même au plus petit palier la boîte d'origine ne suffit pas : on garde le
  // bas de la boîte (au-dessus du bandeau Instagram) et on l'agrandit vers le
  // haut. Si l'image entière ne suffit pas, la police continue de descendre.
  const bottom = baseTop + baseHeight;
  const maxHeight = bottom - Math.round(height * OVERLAY_MAX_TOP_RATIO);
  let size: number = OVERLAY_FONT_STEPS_PX[OVERLAY_FONT_STEPS_PX.length - 1];
  let lines = estimateOverlayLines(text, size, boxWidth);
  while (overlayTextHeight(lines, size) > maxHeight && size > 12) {
    size -= 2;
    lines = estimateOverlayLines(text, size, boxWidth);
  }
  const boxHeight = Math.min(maxHeight, overlayTextHeight(lines, size));
  return { text, fontSizePx: size, x, y: bottom - boxHeight, width: boxWidth, height: boxHeight, lines };
}

export function buildReelRecipe(input: ReelRenderInput): Record<string, unknown> {
  const width = input.width ?? DEFAULT_WIDTH;
  const height = input.height ?? DEFAULT_HEIGHT;
  const ttsVoice = input.tts_voice ?? DEFAULT_TTS_VOICE;
  const mode = input.mode ?? "cache";

  const scenes = input.sections.map((s) => {
    const elements: Record<string, unknown>[] = [
      {
        type: "video",
        src: s.clip_url,
        seek: s.seek ?? 0,
        duration: s.duration,
        muted: mode === "cache",
        resize: "cover",
      },
    ];

    // Keep the first video and its sound/voice for the entire scene. The
    // cutaway is only a visual layer, and ends before the scene does when short.
    if (s.broll_url && s.broll_duration) {
      elements.push({
        type: "video", src: s.broll_url, start: s.broll_start ?? 0,
        duration: s.broll_duration, seek: s.broll_seek ?? 0,
        muted: true, resize: "cover",
      });
    }

    // Mode "filme" : la voix est déjà dans le clip, aucun élément voix.
    if (mode === "cache") {
      if (input.voice_mode === "recorded" && s.voice_audio_url) {
        // Voix de la créatrice : posée telle quelle sur la scène.
        elements.push({ type: "audio", src: s.voice_audio_url });
      } else if (input.voice_mode === "tts" && s.voice_text) {
        // Compatibilité avec les anciens plans TTS ; l'interface ne le propose plus.
        elements.push({ type: "voice", voice: ttsVoice, text: s.voice_text });
      } else if (input.voice_mode === "silent" && s.overlay_text) {
        // Le récit reste lisible, mais aucune piste audio n'est fabriquée.
        const layout = layoutOverlayText(s.overlay_text, width, height);
        elements.push({
          type: "text",
          text: layout.text,
          style: "001",
          duration: -2,
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
          settings: {
            "font-family": "Montserrat",
            "font-size": `${layout.fontSizePx}px`,
            "font-weight": "700",
            color: "#FFFFFF",
            "background-color": "#00000099",
            "text-align": "center",
          },
        });
      }
    }


    return { duration: s.duration, elements };
  });

  const recipe: Record<string, unknown> = {
    width,
    height,
    quality: "high",
    scenes,
  };

  // Les sous-titres automatiques se synchronisent sur une piste audio. En
  // mode silencieux, le texte de chaque scène est déjà incrusté ci-dessus.
  if (input.subtitles !== false && input.voice_mode !== "silent") {
    const defaultPosition = {
      position: "custom",
      x: Math.round(width / 2),
      y: Math.round(height * SUBTITLE_Y_RATIO),
    };
    recipe.elements = [
      {
        type: "subtitles",
        language: "fr",
        settings: {
          ...DEFAULT_SUBTITLE_SETTINGS,
          ...defaultPosition,
          ...(input.subtitle_settings ?? {}),
        },
      },
    ];
  }

  return recipe;
}
