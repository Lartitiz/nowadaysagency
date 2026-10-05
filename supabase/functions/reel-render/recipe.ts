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

import { REEL_OVERLAY_MIN_FONT_PX } from "../_shared/socle.ts";

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
// Socle « lisible d'abord » (05/10/2026, décisions de Laetitia) :
//  - la CASSE D'ORIGINE est gardée (plus de majuscules forcées) ;
//  - la police descend par paliers jusqu'à un PLANCHER lisible
//    (REEL_OVERLAY_MIN_FONT_PX), jamais en dessous : un texte qui ne tient pas
//    à ce plancher est DÉCOUPÉ en écrans successifs dans la même scène (à la
//    fin d'une phrase quand c'est possible, sinon entre deux mots). Le texte
//    n'est JAMAIS raccourci : chaque mot passe à l'écran, dans l'ordre.
// Un texte court (cas normal : 3-8 mots) garde exactement la boîte validée.

export const OVERLAY_MIN_FONT_PX = REEL_OVERLAY_MIN_FONT_PX;
export const OVERLAY_FONT_STEPS_PX = [58, 50, OVERLAY_MIN_FONT_PX] as const;
const OVERLAY_MARGIN_X = 70;
const OVERLAY_TOP_RATIO = 0.64;
const OVERLAY_HEIGHT_RATIO = 0.22;
/** Plus haut que ça, le bandeau couvrirait le haut de l'image (zone du profil Instagram). */
const OVERLAY_MAX_TOP_RATIO = 0.12;
/**
 * Largeur moyenne d'un caractère Montserrat 700 en casse mixte, en fraction de
 * la taille de police. Volontairement pessimiste (les minuscules grasses
 * mesurent ~0,6 em, les capitales ~0,70 em) : mieux vaut découper un écran trop
 * tôt qu'un débord, y compris si le texte a été écrit en capitales.
 */
const OVERLAY_CHAR_EM = 0.72;
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
  /** Texte rendu : les mots d'origine, dans leur casse d'origine. */
  text: string;
  fontSizePx: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Lignes estimées à cette taille (sert aux tests de « ça tient »). */
  lines: number;
}

function overlayBox(width: number, height: number) {
  return {
    x: OVERLAY_MARGIN_X,
    boxWidth: width - 2 * OVERLAY_MARGIN_X,
    baseTop: Math.round(height * OVERLAY_TOP_RATIO),
    baseHeight: Math.round(height * OVERLAY_HEIGHT_RATIO),
  };
}

/** Le texte tient-il dans la boîte validée, au plancher lisible au moins ? */
export function overlayFitsAtFloor(text: string, width: number, height: number): boolean {
  const { boxWidth, baseHeight } = overlayBox(width, height);
  return overlayTextHeight(estimateOverlayLines(text, OVERLAY_MIN_FONT_PX, boxWidth), OVERLAY_MIN_FONT_PX) <= baseHeight;
}

/**
 * Mise en page d'UN écran de texte : casse d'origine + plus grande taille du
 * palier qui tient dans la boîte validée. Fonction pure. Ne retire, ne coupe ni
 * ne remplace aucun mot. Un écran qui ne tient pas au plancher (cas d'un mot
 * isolé démesuré : splitOverlayText découpe tout le reste) garde le plancher et
 * la boîte s'agrandit vers le haut, jamais au-dessus de la zone du profil.
 */
export function layoutOverlayText(raw: string, width: number, height: number): OverlayLayout {
  const text = raw.trim();
  const { x, boxWidth, baseTop, baseHeight } = overlayBox(width, height);
  for (const size of OVERLAY_FONT_STEPS_PX) {
    const lines = estimateOverlayLines(text, size, boxWidth);
    if (overlayTextHeight(lines, size) <= baseHeight) {
      return { text, fontSizePx: size, x, y: baseTop, width: boxWidth, height: baseHeight, lines };
    }
  }
  const bottom = baseTop + baseHeight;
  const maxHeight = bottom - Math.round(height * OVERLAY_MAX_TOP_RATIO);
  const size = OVERLAY_MIN_FONT_PX;
  const lines = estimateOverlayLines(text, size, boxWidth);
  const boxHeight = Math.min(maxHeight, overlayTextHeight(lines, size));
  return { text, fontSizePx: size, x, y: bottom - boxHeight, width: boxWidth, height: boxHeight, lines };
}

/**
 * Découpe le texte à l'écran en écrans successifs qui tiennent chacun au
 * plancher lisible. Phrases entières regroupées tant qu'elles tiennent ; une
 * phrase trop longue est répartie entre deux mots. Tous les mots, dans l'ordre :
 * `chunks.join(" ")` redonne le texte (espaces normalisés).
 */
export function splitOverlayText(raw: string, width: number, height: number): string[] {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return [];
  if (overlayFitsAtFloor(text, width, height)) return [text];
  const fits = (t: string) => overlayFitsAtFloor(t, width, height);
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)/gu)?.map((p) => p.trim()).filter(Boolean) || [text];
  const chunks: string[] = [];
  let current = "";
  const pushWords = (sentence: string) => {
    for (const word of sentence.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (!current || fits(next)) current = next;
      else {
        chunks.push(current);
        current = word;
      }
    }
  };
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (fits(next)) {
      current = next;
    } else if (fits(sentence)) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      if (current) chunks.push(current);
      current = "";
      pushWords(sentence);
    }
  }
  if (current) chunks.push(current);
  return chunks;
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
        // Un texte trop long pour le plancher lisible passe en plusieurs
        // écrans, à parts égales de la durée de la scène (jamais rétréci).
        const chunks = splitOverlayText(s.overlay_text, width, height);
        const share = chunks.length > 1 ? Math.round((s.duration / chunks.length) * 100) / 100 : 0;
        chunks.forEach((chunk, k) => {
          const layout = layoutOverlayText(chunk, width, height);
          const timing = chunks.length > 1
            ? { start: Math.round(k * share * 100) / 100, duration: k === chunks.length - 1 ? -2 : share }
            : { duration: -2 };
          elements.push({
            type: "text",
            text: layout.text,
            style: "001",
            ...timing,
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
