/**
 * Montage HyperFrames du reel « sans voix » (texte à l'écran).
 *
 * Fonction pure (aucun I/O) : à partir du MÊME plan que JSON2Video (une section
 * = un clip + son texte), fabrique la page HTML que le moteur HyperFrames rend
 * en MP4 sur notre Google Cloud (relais `reel-render-gateway`, voir
 * services/reel-render-gateway/). Décidé le 13/11/2026 après l'essai côte à
 * côte du reel copro : plus de filigrane, fondus entre les plans, légère
 * poussée de caméra, mots qui arrivent un par un, dernier mot de chaque écran
 * en italique couleur, dégradé sombre au lieu du bandeau noir, sons de design
 * (whoosh aux coupes, clic à chaque écran, montée + coup sourd sur la fin).
 *
 * Ce qui ne change pas par rapport à recipe.ts : le texte n'est JAMAIS
 * raccourci (chaque mot passe à l'écran, dans l'ordre), un texte trop long est
 * découpé en écrans courts successifs (`splitScreens`), la casse d'origine est
 * gardée.
 *
 * Les sons (`assets/…`) ne sont pas dans cette page : le relais les ajoute à
 * côté de index.html avant le rendu (sons Pixabay, licence libre). Pour
 * l'aperçu immédiat dans l'app (14/11/2026), la MÊME page est jouée par le
 * lecteur HyperFrames du navigateur : les sons y sont lus depuis
 * `public/reel-assets/` du site (option `assetBase`, copie vérifiée par
 * src/test/reel-assets-sync.test.ts).
 *
 * Retouches (`look`, voir tweaks.ts) : taille du texte, ambiance calme, sons,
 * volume. Sans retouche, la page est exactement celle d'avant.
 */

import { estimateOverlayLines, type ReelRenderInput } from "./recipe.ts";
import { REEL_OVERLAY_MIN_FONT_PX } from "../_shared/socle.ts";
import { DEFAULT_LOOK, sanitizeLook, type ReelLook } from "./tweaks.ts";
import { brandFontLinks, readableAccent, sanitizeBrandLook, type BrandLook } from "./brand-look.ts";
import {
  CAPTIONS_CSS, DEFAULT_ACTIVE_COLOR, captionLines, captionsHtml, captionsScript, voiceTracks, type CaptionLine, type CaptionWord,
} from "./captions.ts";

const WIDTH = 1080;
const HEIGHT = 1920;
/** Fondu enchaîné : chaque plan déborde sur le suivant de cette durée. */
const CROSSFADE_S = 0.4;
const TEXT_BOX_WIDTH = 900;
const TEXT_BOX_HEIGHT = 520;
const FINAL_BOX_HEIGHT = 800;
const LINE_HEIGHT = 1.16;
/** Paliers de taille du texte (px), du plus grand au plancher lisible. */
const TEXT_SIZES_PX = [96, 76, 64, REEL_OVERLAY_MIN_FONT_PX] as const;
const FINAL_SIZES_PX = [124, 104, 88, 72, REEL_OVERLAY_MIN_FONT_PX] as const;

export interface ReelComposition {
  html: string;
  /** Durée totale du reel, en secondes. */
  duration: number;
}

/** Le moteur HyperFrames ne prend en charge que le reel sans voix, monté sur clips (mode « cache »). */
export function isHyperframesEligible(input: Pick<ReelRenderInput, "voice_mode" | "mode">): boolean {
  return input.voice_mode === "silent" && (input.mode ?? "cache") === "cache";
}

/**
 * Reel parlé montable par HyperFrames (14/11/2026), avec sous-titres calés sur
 * la voix (écoute Whisper) : « Je me filme » (son du clip), ou voix enregistrée
 * sur TOUS les passages. Un passage sans enregistrement reste sur JSON2Video,
 * qui le complète par une voix générée (HyperFrames n'en fabrique pas).
 */
export function isSpokenHyperframesEligible(input: Pick<ReelRenderInput, "sections" | "voice_mode" | "mode">): boolean {
  const mode = input.mode ?? "cache";
  if (!input.sections?.length) return false;
  if (mode === "filme") return voiceTracks(input).length > 0;
  return input.voice_mode === "recorded" && input.sections.every((s) => !!s.voice_audio_url);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Mots d'un écran, avec le « mot clé » mis en valeur : le dernier mot, plus le
 * précédent quand l'un des deux est très court (« au m² », « en stock. »).
 * Pas de mot clé sur un écran de moins de 3 mots (tout est déjà en avant).
 */
export function screenWords(text: string): { word: string; key: boolean }[] {
  // Une ponctuation isolée (« ? », « ! », « : ») reste collée au mot d'avant
  // par une espace insécable, comme en typographie française.
  const words: string[] = [];
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    if (words.length && !/[\p{L}\p{N}]/u.test(token)) words[words.length - 1] += `\u00a0${token}`;
    else words.push(token);
  }
  const keyFrom = (() => {
    if (words.length < 3) return words.length;
    const last = words[words.length - 1].replace(/[^\p{L}\p{N}]/gu, "");
    const before = words[words.length - 2].replace(/[^\p{L}\p{N}]/gu, "");
    return last.length <= 3 || before.length <= 3 ? words.length - 2 : words.length - 1;
  })();
  return words.map((word, i) => ({ word, key: i >= keyFrom }));
}

/** Plus grande taille du palier qui tient dans la boîte, sans jamais passer sous le plancher. */
export function screenFontSize(text: string, final: boolean, textScale = 1): number {
  const sizes = (final ? FINAL_SIZES_PX : TEXT_SIZES_PX).map((px) => Math.max(REEL_OVERLAY_MIN_FONT_PX, Math.round(px * textScale)));
  const boxHeight = final ? FINAL_BOX_HEIGHT : TEXT_BOX_HEIGHT;
  for (const size of sizes) {
    const lines = estimateOverlayLines(text, size, TEXT_BOX_WIDTH);
    if (lines * size * LINE_HEIGHT <= boxHeight) return size;
  }
  return REEL_OVERLAY_MIN_FONT_PX;
}

/** Taille en dessous de laquelle un écran est découpé (lisible sur téléphone d'un coup d'œil). */
const SCREEN_SPLIT_PX = 64;

function fitsOnScreen(text: string, textScale = 1): boolean {
  const px = Math.round(SCREEN_SPLIT_PX * textScale);
  return estimateOverlayLines(text, px, TEXT_BOX_WIDTH) * px * LINE_HEIGHT <= TEXT_BOX_HEIGHT;
}

/**
 * Découpe le texte d'un passage en écrans courts : phrases entières regroupées
 * tant qu'elles tiennent à 64 px, une phrase trop longue répartie entre deux
 * mots. Tous les mots, dans l'ordre : `screens.join(" ")` redonne le texte.
 */
export function splitScreens(raw: string, textScale = 1): string[] {
  const fits = (t: string) => fitsOnScreen(t, textScale);
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return [];
  if (fits(text)) return [text];
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)/gu)?.map((p) => p.trim()).filter(Boolean) || [text];
  const screens: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const joined = current ? `${current} ${sentence}` : sentence;
    if (fits(joined)) { current = joined; continue; }
    if (current) screens.push(current);
    current = "";
    if (fits(sentence)) { current = sentence; continue; }
    for (const word of sentence.split(" ")) {
      const next = current ? `${current} ${word}` : word;
      if (!current || fits(next)) current = next;
      else { screens.push(current); current = word; }
    }
  }
  if (current) screens.push(current);
  return screens;
}

interface TextScreen {
  id: string;
  start: number;
  duration: number;
  words: { word: string; key: boolean }[];
  fontSize: number;
  final: boolean;
}

interface Shot {
  id: string;
  start: number;
  duration: number;
  sectionDuration: number;
}

export interface CompositionOptions {
  /** Retouches de rendu (bornées par sanitizeLook). Défaut : montage de départ. */
  look?: Partial<ReelLook>;
  /** Où trouver les sons : "assets/" pour le relais, URL absolue du site pour l'aperçu. */
  assetBase?: string;
  /** Charte de la cliente (brand-look.ts). Absente = couleur et polices par défaut. */
  brand?: Partial<BrandLook> | null;
  /**
   * Reel parlé : mots entendus pour chaque piste de `voiceTracks(input)` (même
   * ordre). Présent = la voix est posée et sous-titrée mot à mot ; le texte à
   * l'écran du mode sans voix n'est pas affiché.
   */
  captions?: CaptionWord[][] | null;
}

export function buildReelComposition(input: ReelRenderInput, options: CompositionOptions = {}): ReelComposition {
  const look = sanitizeLook({ ...DEFAULT_LOOK, ...options.look });
  const assetBase = options.assetBase ?? "assets/";
  const brand = sanitizeBrandLook(options.brand);
  const textFamily = brand.textFont ? `"${brand.textFont}", "Montserrat", sans-serif` : `"Montserrat", sans-serif`;
  const keyStyle = brand.keyFont
    ? `font-family: "${brand.keyFont}", "Playfair Display", serif; font-style: normal;`
    : `font-family: "Playfair Display", serif; font-style: italic;`;
  const fontLinks = brandFontLinks(brand);
  const sfx = (id: string, name: string, start: number, duration: number, volume: number, track: number, mediaStart?: number) =>
    sfxTag(assetBase, id, name, start, duration, Math.round(volume * look.volume * (look.calm ? 0.7 : 1) * 100) / 100, track, mediaStart);
  const sections = input.sections;
  const last = sections.length - 1;
  let cursor = 0;
  const shots: Shot[] = [];
  const screens: TextScreen[] = [];
  const media: string[] = [];
  const sounds: string[] = [];
  const brolls: { id: string; start: number; duration: number }[] = [];
  // Reel parlé : une piste son par passage qui parle (son du clip en mode filmé, voix enregistrée sinon).
  const tracks = options.captions ? voiceTracks(input) : [];
  const spoken = tracks.length > 0;
  const voices: string[] = [];
  const capLines: CaptionLine[] = [];
  const sectionStarts: number[] = [];

  sections.forEach((s, i) => {
    const start = round(cursor);
    const visible = round(s.duration + (i < last ? CROSSFADE_S : 0));
    sectionStarts.push(start);
    const shotId = `shot${i}`;
    shots.push({ id: shotId, start, duration: visible, sectionDuration: s.duration });
    const track = i % 2;
    const src = escapeHtml(s.clip_url);
    const timing = `data-start="${start}" data-duration="${visible}" data-track-index="${track}"`;
    media.push(
      `<div class="shot" id="${shotId}"><div class="cam" id="cam${i}" data-layout-allow-overflow>` +
        (s.clip_type === "image"
          ? `<img id="m${i}" class="clip" src="${src}" alt="" ${timing} />`
          : `<video id="m${i}" class="clip" src="${src}" ${timing}${s.seek ? ` data-media-start="${round(s.seek)}"` : ""} muted playsinline></video>`) +
        `</div></div>`,
    );

    if (s.broll_url && s.broll_duration) {
      const id = `b${i}`;
      const bStart = round(start + (s.broll_start ?? 0));
      const bDur = round(s.broll_duration);
      brolls.push({ id, start: bStart, duration: bDur });
      media.push(
        `<div class="shot broll" id="${id}"><video id="bv${i}" class="clip" src="${escapeHtml(s.broll_url)}" data-start="${bStart}" data-duration="${bDur}"${s.broll_seek ? ` data-media-start="${round(s.broll_seek)}"` : ""} data-track-index="3" muted playsinline></video></div>`,
      );
    }

    // Whoosh calé juste avant chaque coupe (plus discret sous une voix).
    if (i > 0) {
      sounds.push(sfx(`w${i}`, i === last ? "whoosh-short" : "whoosh", Math.max(0, start - 0.25), 0.57, spoken ? 0.2 : 0.45, 11));
    }
    if (spoken) {
      cursor += s.duration;
      return;
    }

    const isFinal = i === last && sections.length > 1;
    const chunks = s.overlay_text ? splitScreens(s.overlay_text, look.textScale) : [];
    const textStart = start + 0.3;
    const textSpan = Math.max(0.6, s.duration - 0.45);
    const share = textSpan / Math.max(1, chunks.length);
    chunks.forEach((chunk, k) => {
      const at = round(textStart + k * share);
      screens.push({
        id: `t${i}_${k}`,
        start: at,
        duration: round(Math.max(0.5, share - 0.05)),
        words: screenWords(chunk),
        fontSize: screenFontSize(chunk, isFinal && chunks.length === 1, look.textScale),
        final: isFinal && chunks.length === 1,
      });
      if (!(isFinal && chunks.length === 1) && !look.calm) sounds.push(sfx(`c${i}_${k}`, "click-soft", at, 0.36, 0.5, 12));
    });

    if (isFinal && start >= 3 && !look.calm) {
      // Montée qui culmine sur la dernière coupe, puis coup sourd.
      sounds.push(sfx("riser", "riser", round(Math.max(0, start - 2.4)), 2.5, 0.7, 13, 1.1));
      sounds.push(sfx("impact", "impact-bass-1", round(start + 0.05), 2.1, 0.9, 14));
    }
    cursor += s.duration;
  });

  const duration = round(cursor);
  tracks.forEach((t, k) => {
    const start = sectionStarts[t.section];
    const dur = round(sections[t.section].duration);
    voices.push(
      `<audio id="voice${k}" src="${escapeHtml(t.url)}" data-start="${start}" data-duration="${dur}"${t.seek ? ` data-media-start="${round(t.seek)}"` : ""} data-track-index="6" data-volume="1"></audio>`,
    );
    capLines.push(...captionLines(options.captions?.[k] ?? [], start, dur, `cap${t.section}`));
  });
  const activeColor = (() => {
    const raw = input.subtitle_settings?.["word-color"];
    return typeof raw === "string" ? readableAccent(raw) : DEFAULT_ACTIVE_COLOR;
  })();
  const textHtml = screens.map((sc) => {
    // Le mot clé est groupé (jamais coupé en fin de ligne, et grossi d'un bloc à la fin).
    const plain = sc.words.filter((w) => !w.key).map((w) => `<span class="w">${escapeHtml(w.word)}</span>`).join("");
    const keys = sc.words.filter((w) => w.key).map((w) => `<span class="w k">${escapeHtml(w.word)}</span>`).join("");
    const words = plain + (keys ? `<span class="kg">${keys}</span>` : "");
    return `<div class="line clip${sc.final ? " final" : ""}" id="${sc.id}" data-start="${sc.start}" data-duration="${sc.duration}" data-track-index="2"><p style="font-size:${sc.fontSize}px">${words}</p></div>`;
  }).join("\n");

  const bedDuration = round(Math.min(duration, 60));
  // Sous une voix, la nappe reste un fond à peine audible.
  const bedVolume = Math.round((spoken ? 0.15 : 0.8) * look.volume * 100) / 100;
  const bed = `<audio id="bed" src="${escapeHtml(assetBase)}pad.mp3" data-start="0" data-duration="${bedDuration}" data-track-index="10" data-volume="${bedVolume}"></audio>`;
  const audio = [look.sounds && look.volume > 0 ? `${bed}\n${sounds.join("\n")}` : "", ...voices].filter(Boolean).join("\n");

  const script = buildTimelineScript(shots, screens, brolls, duration, look.calm) +
    (capLines.length ? `\n${captionsScript(capLines, activeColor)}` : "");

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Playfair+Display:ital,wght@1,700&display=block" />
${fontLinks ? `${fontLinks}\n` : ""}<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #0d0b09; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0d0b09; font-family: ${textFamily}; }
.shot { position: absolute; inset: 0; overflow: hidden; }
.shot .cam { position: absolute; inset: 0; }
.shot video, .shot img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
#shade { position: absolute; left: 0; right: 0; bottom: 0; height: 1100px;
  background: linear-gradient(to bottom, rgba(10,8,6,0) 0%, rgba(10,8,6,0.5) 30%, rgba(10,8,6,0.82) 100%); }
.line { position: absolute; left: 90px; right: 90px; top: 1130px; height: ${TEXT_BOX_HEIGHT}px;
  display: flex; align-items: flex-start; justify-content: center; }
.line p { width: ${TEXT_BOX_WIDTH}px; text-align: center; color: #ffffff; font-weight: 700;
  line-height: ${LINE_HEIGHT}; letter-spacing: -0.01em;
  text-shadow: 0 2px 6px rgba(0,0,0,0.55), 0 0 34px rgba(0,0,0,0.75); }
.line.final { top: 560px; height: ${FINAL_BOX_HEIGHT}px; align-items: center; }
.line.final p { line-height: 1.04; letter-spacing: -0.03em; }
.w { display: inline-block; white-space: pre; margin-right: 0.27em; }
.w:last-child { margin-right: 0; }
.kg { display: inline-block; white-space: nowrap; }
.k { padding-right: 0.04em; }
.k { ${keyStyle} font-weight: 700; color: ${brand.accent}; }
#fadeout { position: absolute; inset: 0; background: #000; opacity: 0; }${capLines.length ? `\n${CAPTIONS_CSS}` : ""}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${WIDTH}" data-height="${HEIGHT}">
${media.join("\n")}
<div id="shade"></div>
${textHtml}${capLines.length ? `\n${captionsHtml(capLines)}` : ""}
<div id="fadeout"></div>
${audio}
</div>
<script>
${script}
</script>
</body>
</html>
`;
  return { html, duration };
}

function sfxTag(assetBase: string, id: string, name: string, start: number, duration: number, volume: number, track: number, mediaStart?: number): string {
  return `<audio id="sfx-${id}" src="${escapeHtml(assetBase)}sfx/${name}.mp3" data-start="${round(start)}" data-duration="${duration}"${mediaStart ? ` data-media-start="${mediaStart}"` : ""} data-track-index="${track}" data-volume="${volume}"></audio>`;
}

function buildTimelineScript(
  shots: Shot[],
  screens: TextScreen[],
  brolls: { id: string; start: number; duration: number }[],
  duration: number,
  calm = false,
): string {
  const data = JSON.stringify({ shots, screens: screens.map(({ id, start, duration, final, words }) => ({ id, start, duration, final, n: words.length })), brolls, duration });
  if (calm) return calmTimelineScript(data);
  return `const D = ${data};
const tl = gsap.timeline({ paused: true });
D.shots.forEach((s, i) => {
  const a = { scale: 1.0, yPercent: 0 }, b = { scale: 1.09, yPercent: -1.5 };
  const from = i % 2 === 0 ? a : b, to = i % 2 === 0 ? b : a;
  tl.fromTo("#cam" + i, from, { ...to, duration: Math.max(0.1, s.duration - 0.05), ease: "none" }, s.start);
  if (i > 0) tl.fromTo("#" + s.id, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.inOut" }, s.start);
});
D.brolls.forEach((b) => {
  tl.fromTo("#" + b.id, { opacity: 0 }, { opacity: 1, duration: 0.25 }, b.start);
  tl.to("#" + b.id, { opacity: 0, duration: 0.25 }, Math.max(b.start + 0.3, b.start + b.duration - 0.3));
});
D.screens.forEach((sc) => {
  const ws = "#" + sc.id + " .w";
  if (sc.final) {
    tl.fromTo(ws, { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: 0.32, ease: "power4.out", stagger: Math.min(0.18, 2.4 / Math.max(1, sc.n)) }, sc.start);
    tl.fromTo("#" + sc.id + " .kg", { scale: 1 }, { scale: 1.1, duration: 0.5, ease: "back.out(3)", transformOrigin: "50% 60%" }, sc.start + Math.min(2.6, sc.duration * 0.4));
    return;
  }
  tl.fromTo(ws, { opacity: 0, y: 34, filter: "blur(8px)" },
    { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.45, ease: "power3.out", stagger: Math.min(0.09, 1.2 / Math.max(1, sc.n)) }, sc.start);
  tl.to("#" + sc.id + " p", { opacity: 0, y: -18, duration: 0.28, ease: "power2.in" }, Math.max(sc.start + 0.6, sc.start + sc.duration - 0.32));
});
tl.to("#fadeout", { opacity: 1, duration: 0.8, ease: "power1.in" }, Math.max(0, D.duration - 0.85));
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;`;
}

/** Ambiance « Plus calme » : poussée de caméra légère, mots en fondu simple, pas de pop final. */
function calmTimelineScript(data: string): string {
  return `const D = ${data};
const tl = gsap.timeline({ paused: true });
D.shots.forEach((s, i) => {
  tl.fromTo("#cam" + i, { scale: 1.0 }, { scale: 1.03, duration: Math.max(0.1, s.duration - 0.05), ease: "none" }, s.start);
  if (i > 0) tl.fromTo("#" + s.id, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "sine.inOut" }, s.start);
});
D.brolls.forEach((b) => {
  tl.fromTo("#" + b.id, { opacity: 0 }, { opacity: 1, duration: 0.4 }, b.start);
  tl.to("#" + b.id, { opacity: 0, duration: 0.4 }, Math.max(b.start + 0.45, b.start + b.duration - 0.45));
});
D.screens.forEach((sc) => {
  const ws = "#" + sc.id + " .w";
  tl.fromTo(ws, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "sine.out", stagger: Math.min(0.06, 0.9 / Math.max(1, sc.n)) }, sc.start);
  if (!sc.final) tl.to("#" + sc.id + " p", { opacity: 0, duration: 0.4, ease: "sine.in" }, Math.max(sc.start + 0.7, sc.start + sc.duration - 0.42));
});
tl.to("#fadeout", { opacity: 1, duration: 1, ease: "sine.in" }, Math.max(0, D.duration - 1.05));
window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;`;
}
