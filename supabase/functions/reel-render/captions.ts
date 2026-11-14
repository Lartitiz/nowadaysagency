/**
 * Sous-titres mot à mot des reels parlés montés par HyperFrames (14/11/2026).
 *
 * Modes concernés : « Je me filme » (la voix est le son du clip) et « voix
 * enregistrée » (mode caché, voix posée sur les plans). Le moment de chaque mot
 * vient de l'écoute Whisper sur notre Google Cloud (services/reel-transcribe,
 * via le relais `/transcribe`). Ce fichier est pur (aucun I/O) :
 *  - `voiceTracks` dit quelle piste son écouter pour chaque section ;
 *  - `captionLines` range les mots en lignes courtes (3 mots au plus) ;
 *  - `captionsHtml` / `CAPTIONS_CSS` / `CAPTIONS_SCRIPT` les posent dans la page.
 *
 * Ce qui ne change pas par rapport à JSON2Video : sous-titres à 72 % de la
 * hauteur (au-dessus du bandeau Instagram, vérifié le 18/08), 3 mots par ligne,
 * blanc cerné de noir, et ils reprennent ce qui est VRAIMENT dit.
 */

import type { ReelRenderInput } from "./recipe.ts";

export interface CaptionWord {
  text: string;
  /** Secondes depuis le début de la piste écoutée (après la coupe `seek`). */
  start: number;
  end: number;
}

export interface VoiceTrack {
  /** Index de la section du plan. */
  section: number;
  url: string;
  /** Seconde d'entrée dans la source (coupe du clip ; 0 pour une voix enregistrée). */
  seek: number;
  duration: number;
}

export interface CaptionLine {
  id: string;
  start: number;
  duration: number;
  words: { text: string; at: number }[];
}

const HEIGHT = 1920;
/** Même hauteur que les sous-titres JSON2Video (SUBTITLE_Y_RATIO de recipe.ts). */
export const CAPTION_Y_RATIO = 0.72;
const MAX_WORDS_PER_LINE = 3;
const MAX_CHARS_PER_LINE = 22;
/** Un silence plus long que ça ouvre une nouvelle ligne. */
const PAUSE_S = 0.45;
/** Une ligne reste à l'écran au plus ce temps après son dernier mot. */
const HOLD_S = 0.5;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Le reel a-t-il une voix à sous-titrer, et laquelle ? (une piste par section qui parle) */
export function voiceTracks(input: Pick<ReelRenderInput, "sections" | "voice_mode" | "mode">): VoiceTrack[] {
  const mode = input.mode ?? "cache";
  const tracks: VoiceTrack[] = [];
  input.sections.forEach((s, i) => {
    if (mode === "filme") {
      if (s.clip_type !== "image" && s.clip_url) tracks.push({ section: i, url: s.clip_url, seek: round(s.seek ?? 0), duration: round(s.duration) });
    } else if (input.voice_mode === "recorded" && s.voice_audio_url) {
      tracks.push({ section: i, url: s.voice_audio_url, seek: 0, duration: round(s.duration) });
    }
  });
  return tracks;
}

/**
 * Range les mots d'une section en lignes de 3 mots au plus. Une ligne se coupe
 * aussi après une fin de phrase ou un silence. Temps rendus absolus (début de
 * la section dans le reel = `offset`) ; rien ne déborde sur la section suivante.
 */
export function captionLines(words: CaptionWord[], offset: number, sectionDuration: number, idPrefix: string): CaptionLine[] {
  const end = offset + sectionDuration;
  const usable = words
    .filter((w) => w && typeof w.text === "string" && w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ text: w.text.trim(), start: offset + Math.max(0, w.start), end: offset + Math.max(w.start, w.end) }))
    .filter((w) => w.start < end - 0.05)
    .sort((a, b) => a.start - b.start);

  const groups: (typeof usable)[] = [];
  let current: typeof usable = [];
  usable.forEach((w, i) => {
    const prev = current[current.length - 1];
    const chars = current.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    const breakBefore = prev && (current.length >= MAX_WORDS_PER_LINE || chars > MAX_CHARS_PER_LINE || w.start - prev.end > PAUSE_S || /[.!?…]["»”]?$/.test(prev.text));
    if (breakBefore) {
      groups.push(current);
      current = [];
    }
    current.push(w);
    if (i === usable.length - 1) groups.push(current);
  });

  return groups.map((g, k) => {
    const start = round(g[0].start);
    const next = groups[k + 1]?.[0].start ?? Infinity;
    const stop = Math.min(next, g[g.length - 1].end + HOLD_S, end);
    return {
      id: `${idPrefix}_${k}`,
      start,
      duration: round(Math.min(Math.max(0.3, stop - start), end - start)),
      words: g.map((w) => ({ text: w.text, at: round(w.start) })),
    };
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function captionsHtml(lines: CaptionLine[]): string {
  return lines
    .map((l) =>
      `<div class="cap clip" id="${l.id}" data-start="${l.start}" data-duration="${l.duration}" data-track-index="5"><p>${
        l.words.map((w, j) => `<span class="cw" id="${l.id}_${j}">${escapeHtml(w.text)}</span>`).join(" ")
      }</p></div>`
    )
    .join("\n");
}

const CAPTION_CENTER_PX = Math.round(HEIGHT * CAPTION_Y_RATIO);

export const CAPTIONS_CSS = `.cap { position: absolute; left: 70px; right: 70px; top: ${CAPTION_CENTER_PX - 130}px; height: 260px;
  display: flex; align-items: center; justify-content: center; }
.cap p { text-align: center; color: #ffffff; font-family: "Montserrat", sans-serif; font-weight: 700; font-size: 84px;
  line-height: 1.12; letter-spacing: -0.01em; -webkit-text-stroke: 10px #000; paint-order: stroke fill;
  text-shadow: 0 4px 18px rgba(0,0,0,0.55); }
.cw { display: inline-block; white-space: pre; }`;

/** Couleur du mot dit quand la cliente n'a pas de charte (jaune lumière Nowadays). */
export const DEFAULT_ACTIVE_COLOR = "#ffe561";

/** Script à placer après la création de `tl` : chaque ligne apparaît, le mot dit passe à la couleur active. */
export function captionsScript(lines: CaptionLine[], activeColor = DEFAULT_ACTIVE_COLOR): string {
  const data = JSON.stringify(lines.map((l) => ({ id: l.id, s: l.start, w: l.words.map((w) => w.at) })));
  return `const CAP = ${data};
CAP.forEach((l) => {
  tl.fromTo("#" + l.id + " p", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.12, ease: "power2.out" }, l.s);
  l.w.forEach((at, j) => {
    const el = "#" + l.id + "_" + j;
    tl.fromTo(el, { color: "#ffffff", scale: 1 }, { color: ${JSON.stringify(activeColor)}, scale: 1.08, duration: 0.08, ease: "power1.out" }, at);
    if (j < l.w.length - 1) tl.to(el, { color: "#ffffff", scale: 1, duration: 0.08 }, l.w[j + 1]);
  });
});`;
}
