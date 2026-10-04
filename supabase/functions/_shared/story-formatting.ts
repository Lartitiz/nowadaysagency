// MISE EN FORME des stories Instagram (04/10/2026, chantier « séparer
// l'écriture du design », suite des carrousels photo).
//
// Avant : la rédaction écrivait le texte de chaque story ET son plan de mise
// en page (gabarit, pastille titre, items de liste, citation, fond). Un
// changement de rédaction pouvait donc casser le design, et le design pouvait
// porter du texte absent de la story (titres, items réécrits).
//
// Maintenant : la rédaction n'écrit que du TEXTE (+ la photo à prendre, qui
// est une consigne de tournage écrite). Cette étape, APRÈS la correction du
// texte, lit le texte FINAL et construit le plan visuel par CODE :
//   - sticker interactif → « interaction » (le sticker a besoin de sa zone) ;
//   - énumération réelle couvrant TOUT le texte → « liste » (le gabarit liste
//     n'affiche que le titre et les items : on n'y passe que si aucun mot du
//     texte ne peut disparaître) ;
//   - verbatim entre guillemets retrouvé mot pour mot → « citation » (le
//     rendu garde le contexte avant et après) ;
//   - sinon « photo_pills », le texte complet sur la photo.
// Pourquoi des règles et pas un appel IA : les stories ne sont pas streamées
// et tournent déjà génération (90 s max) + correction (45 s max) sous la
// limite de 150 s d'une requête ; un troisième appel risquait le 504 pour un
// choix que le code sait faire (25 gabarits sur 50 en photo_pills, 14 en
// interaction, dictés par le sticker). Coût nul, résultat identique à chaque
// passage, aucun échec possible côté réseau.
// En cas de doute, l'élément de design cède, jamais le texte : repli
// photo_pills avec le texte complet ; jamais de story sans plan visuel.

import { enforceStoriesPhotoFirst } from "./story-photo-gate.ts";

export const STORY_FORMAT_VERSION = "story-formatting-v1";

/** Bornes (mêmes que le rendu et l'ancienne passe de correction). */
export const STORY_TITLE_MAX_WORDS = 8;
export const STORY_ITEM_MAX_WORDS = 12;
export const STORY_LIST_MIN_ITEMS = 2;
/** Le rendu n'affiche que 4 items : au-delà, des mots disparaîtraient. */
export const STORY_LIST_MAX_ITEMS = 4;
export const STORY_QUOTE_MIN_WORDS = 3;
export const STORY_QUOTE_MAX_CHARS = 220;

/** Champs de MISE EN PAGE que la rédaction n'écrit plus (décidés ici). */
export const STORY_WRITER_LAYOUT_FIELDS = [
  "gabarit", "background", "body_pill", "list_pills", "quote",
  "text_position", "text_position_x", "text_position_y",
] as const;

/** Ce que la rédaction garde dans "visual" : le petit titre de la story (du
 * TEXTE, décision de Laetitia du 04/10/2026, comme les kicker du carrousel
 * photo) et la photo à prendre ou choisir (consigne de tournage écrite). */
export const STORY_WRITER_PHOTO_FIELDS = ["photo_directive", "photo_query_en", "photo_index"] as const;
export const STORY_WRITER_TEXT_FIELDS = ["title_pill"] as const;
const STORY_WRITER_KEPT_FIELDS = [...STORY_WRITER_TEXT_FIELDS, ...STORY_WRITER_PHOTO_FIELDS];

type Story = Record<string, any>;

export interface StoryVisual {
  gabarit: "photo_pills" | "interaction" | "liste" | "citation";
  background: "photo";
  title_pill: string | null;
  body_pill: string | null;
  list_pills: string[] | null;
  quote: string | null;
  photo_directive?: string | null;
  photo_query_en?: string | null;
  photo_index?: number | null;
  [k: string]: unknown;
}

/** Texte de la story ; ne lève jamais (le repli doit toujours aboutir). */
function storyText(s: Story): string {
  try {
    return String(s?.text ?? s?.texte ?? s?.content ?? "").trim();
  } catch {
    return "";
  }
}
const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Mots du texte (lettres et chiffres), pour vérifier qu'aucun ne se perd. */
export function storyWords(s: string): string[] {
  return (s || "").toLocaleLowerCase("fr").normalize("NFC").match(/[\p{L}\p{N}]+/gu) || [];
}

function hasSticker(s: Story): boolean {
  try {
    return !!s?.sticker && typeof s.sticker === "object" && typeof s.sticker.type === "string" && !!s.sticker.type.trim();
  } catch {
    return false;
  }
}

/**
 * Retire de la sortie d'écriture tout choix de mise en page (mutation en place,
 * avant la correction du texte). Le texte et le sticker (texte du sondage, de
 * la question) ne sont jamais touchés ; sticker.placement (jamais lu) part.
 */
export function stripStoriesWriterLayout(parsed: { stories?: unknown } | null | undefined): void {
  if (!parsed || !Array.isArray(parsed.stories)) return;
  for (const s of parsed.stories as Story[]) {
    if (!s || typeof s !== "object") continue;
    const v = s.visual;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const kept: Record<string, unknown> = {};
      for (const k of STORY_WRITER_KEPT_FIELDS) if (k in v) kept[k] = v[k];
      s.visual = kept;
    } else if (v !== undefined && v !== null) {
      s.visual = null;
    }
    if (s.sticker && typeof s.sticker === "object") delete s.sticker.placement;
  }
}

const BULLET = /^\s*[-•–—*·]\s*/u;
const NUMBERED = /^\s*\d{1,2}[.)]\s+/u;
const isItemLine = (l: string) => BULLET.test(l) || NUMBERED.test(l);
const trimPunct = (s: string) => s.trim().replace(/[\s.;,]+$/u, "").trim();

/**
 * Détecte une vraie énumération qui couvre TOUT le texte : un titre facultatif
 * (≤ 8 mots, avant « : » ou en première ligne) puis 2 à 4 items. Chaque
 * élément est un extrait exact du texte ; si un seul mot du texte ne se
 * retrouve pas dans le titre ou les items, ce n'est pas une liste.
 */
export function detectStoryList(text: string): { title: string | null; items: string[] } | null {
  const t = (text || "").trim();
  if (!t) return null;
  let title: string | null = null;
  let items: string[] = [];

  const lines = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    // Format en lignes : seulement une VRAIE liste (titre qui finit par « : »,
    // ou items à puces / numérotés). Un récit coupé en lignes n'en est pas une.
    const headed = !isItemLine(lines[0]);
    const rest = headed ? lines.slice(1) : lines;
    if (headed && !/:\s*$/u.test(lines[0]) && !rest.every(isItemLine)) return null;
    if (!headed && !rest.every(isItemLine)) return null;
    if (headed) title = trimPunct(lines[0].replace(/:\s*$/u, ""));
    items = rest.map((l) => trimPunct(l.replace(BULLET, "")));
    if (items.some((it) => /[.!?…]\s+\S/u.test(it.replace(NUMBERED, "")))) return null;
  } else {
    const colon = t.indexOf(":");
    if (colon < 0) return null;
    title = trimPunct(t.slice(0, colon));
    const tail = t.slice(colon + 1).trim();
    // Une phrase après la liste (« … Et c'est tout. ») = pas une liste.
    if (/[.!?…]\s+\S/u.test(tail)) return null;
    const sep = tail.includes(";") ? ";" : ",";
    items = tail.split(sep).map(trimPunct);
    // Des virgules dans une phrase ne font pas une énumération : il en faut 3
    // items au moins (« lin, coton, chanvre »). Et « a, b et c » : couper le
    // « et » perdrait un mot, le garder ferait un item bancal. Dans le doute,
    // pas de liste.
    if (sep === "," && items.length < 3) return null;
    if (sep === "," && /\s(et|ou)\s/iu.test(items[items.length - 1] || "")) return null;
  }

  if (title !== null && (!title || wordCount(title) > STORY_TITLE_MAX_WORDS)) return null;
  if (items.length < STORY_LIST_MIN_ITEMS || items.length > STORY_LIST_MAX_ITEMS) return null;
  if (items.some((it) => !it || wordCount(it) > STORY_ITEM_MAX_WORDS)) return null;
  // Extraits exacts.
  if (title && !t.includes(title)) return null;
  if (items.some((it) => !t.includes(it))) return null;
  // Couverture : aucun mot du texte ne disparaît au rendu.
  const covered = storyWords([title || "", ...items].join(" ")).join(" ");
  if (covered !== storyWords(t).join(" ")) return null;
  return { title, items };
}

const QUOTE_SPANS = [/«\s*([^«»]+?)\s*»/gu, /“([^“”]+?)”/gu, /"([^"]+?)"/gu];

/** Verbatim entre guillemets, extrait exact du texte (le plus long), ou null. */
export function detectStoryQuote(text: string): string | null {
  const t = (text || "").trim();
  let best: string | null = null;
  for (const re of QUOTE_SPANS) {
    for (const m of t.matchAll(re)) {
      const q = m[1].trim();
      if (wordCount(q) < STORY_QUOTE_MIN_WORDS || q.length > STORY_QUOTE_MAX_CHARS) continue;
      // Le verbatim seul ne fait pas une story citation : il faut qu'il reste
      // retrouvable mot pour mot (le rendu découpe le texte autour).
      if (!t.toLocaleLowerCase("fr").includes(q.toLocaleLowerCase("fr"))) continue;
      if (!best || q.length > best.length) best = q;
    }
  }
  return best;
}

/** Plan visuel sûr par défaut : photo + texte complet. */
function fallbackVisual(s: Story, photo: Record<string, unknown>): StoryVisual {
  const text = storyText(s);
  return {
    ...photo,
    gabarit: hasSticker(s) ? "interaction" : "photo_pills",
    background: "photo",
    title_pill: null,
    body_pill: text || null,
    list_pills: null,
    quote: null,
  };
}

/** Petit titre écrit par la rédaction : repris tel quel, jamais réécrit. */
function writerTitle(v: Record<string, unknown>): string | null {
  return typeof v.title_pill === "string" && v.title_pill.trim() ? v.title_pill.trim() : null;
}

/** Construit le plan visuel d'UNE story à partir de son texte final. */
export function planStoryVisual(s: Story, previous: StoryVisual | null = null): StoryVisual | null {
  if (!s || typeof s !== "object") return null;
  let faceCam = false;
  try { faceCam = s.face_cam === true; } catch { /* repli ci-dessous */ }
  if (faceCam) return null;
  let base = fallbackVisual(s, {});
  try {
    const v = s.visual && typeof s.visual === "object" && !Array.isArray(s.visual) ? s.visual : {};
    const photo: Record<string, unknown> = {};
    for (const k of STORY_WRITER_PHOTO_FIELDS) if (k in v) photo[k] = v[k];
    const title = writerTitle(v);
    base = { ...fallbackVisual(s, photo), title_pill: title };
    if (base.gabarit === "interaction") return base;
    const text = storyText(s);
    const list = detectStoryList(text);
    // Le gabarit liste n'affiche qu'UN titre : avec un petit titre écrit ET une
    // amorce dans le texte, l'un des deux disparaîtrait → pas de liste.
    if (list && previous?.gabarit !== "liste" && !(title && list.title)) {
      return { ...base, gabarit: "liste", title_pill: title ?? list.title, body_pill: null, list_pills: list.items };
    }
    // Le gabarit citation n'affiche pas de titre : une story avec un petit
    // titre reste en photo_pills (titre + texte complet).
    const quote = title ? null : detectStoryQuote(text);
    if (quote && previous?.gabarit !== "citation") {
      return { ...base, gabarit: "citation", body_pill: null, quote };
    }
    return base;
  } catch {
    return base;
  }
}

/**
 * Pose le plan visuel de chaque story (mutation en place), APRÈS la correction
 * du texte. Les stories face cam restent sans plan (vidéo à filmer) ; toutes
 * les autres en ont un, quoi qu'il arrive.
 */
export function formatStoriesVisuals(parsed: { stories?: unknown } | null | undefined): { version: string; gabarits: string[] } {
  const gabarits: string[] = [];
  if (!parsed || !Array.isArray(parsed.stories)) return { version: STORY_FORMAT_VERSION, gabarits };
  let previous: StoryVisual | null = null;
  for (const s of parsed.stories as Story[]) {
    if (!s || typeof s !== "object") { gabarits.push("∅"); previous = null; continue; }
    let visual: StoryVisual | null;
    try {
      visual = planStoryVisual(s, previous);
    } catch {
      visual = fallbackVisual(s, {});
    }
    s.visual = visual;
    gabarits.push(visual ? visual.gabarit : "face_cam");
    previous = visual;
  }
  return { version: STORY_FORMAT_VERSION, gabarits };
}

/**
 * Séquence stories venue d'un chemin SECONDAIRE (mode photo / vision,
 * recyclage), avant la chaîne retrait → correction → mise en forme.
 * Accepte { stories: [...] }, le tableau seul, ou l'un des deux sérialisé en
 * JSON (un tool forcé garantit le transport, pas les types internes). Garde
 * les stories qui portent un texte ou un sticker ; null si aucune n'a de
 * texte : l'appelant décide alors (nouvel essai, ou ancien rendu).
 * Ne lève jamais.
 */
export function coerceStoriesSequence(value: unknown): ({ stories: Story[] } & Record<string, unknown>) | null {
  try {
    let v: unknown = value;
    if (typeof v === "string") {
      const t = v.trim();
      if (!/^[[{]/.test(t)) return null;
      v = JSON.parse(t);
    }
    let seq: Record<string, unknown>;
    if (Array.isArray(v)) seq = { stories: v };
    else if (v && typeof v === "object") seq = { ...(v as Record<string, unknown>) };
    else return null;
    let stories: unknown = seq.stories;
    if (typeof stories === "string") stories = JSON.parse(stories);
    if (!Array.isArray(stories)) return null;
    const kept = (stories as unknown[]).filter((s): s is Story =>
      !!s && typeof s === "object" && !Array.isArray(s) && (!!storyText(s as Story) || hasSticker(s as Story))
    );
    if (!kept.some((s) => !!storyText(s))) return null;
    seq.stories = kept.map((s, i) => ({ ...s, number: typeof s.number === "number" ? s.number : i + 1 }));
    return seq as { stories: Story[] } & Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Mode photo (vision) : la réponse porte la séquence dans "stories". On la
 * normalise en place (mutation) pour qu'elle suive la MÊME chaîne que le flux
 * principal ; un éventuel "content" en prose (ancienne forme, indications
 * visuelles comprises) est retiré pour ne jamais être affiché ni copié.
 * Renvoie false si aucune story exploitable : la réponse reste telle quelle.
 */
export function adoptStructuredStories(parsed: Record<string, unknown> | null | undefined): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const seq = coerceStoriesSequence(parsed.stories);
  if (!seq) return false;
  parsed.stories = seq.stories;
  delete parsed.content;
  return true;
}

export type StoriesPhotoCatalog = { index: number; id: string; description: string; preferred?: boolean }[];

/**
 * Garde photo d'abord + résolution des photos de la bibliothèque. photo_index
 * (petit entier écrit par la rédaction) → photo_id (UUID user_photos) :
 * correspondance stricte, jamais deux stories sur la même photo, et
 * uniquement quand la story attend un fond photo. (Déplacé depuis
 * creative-flow le 04/10/2026, inchangé.)
 */
export function applyStoriesPhotoGuardAndResolution(parsed: any, params: { storiesPhotoCatalog: StoriesPhotoCatalog }): void {
  const { storiesPhotoCatalog } = params;
  enforceStoriesPhotoFirst(parsed);

  if (storiesPhotoCatalog.length > 0 && Array.isArray(parsed?.stories)) {
    const byIndex = new Map(storiesPhotoCatalog.map((c) => [c.index, c]));
    const usedPhotoIds = new Set<string>();
    for (const s of parsed.stories) {
      const v = s?.visual;
      if (!v || typeof v !== "object") continue;
      const idx = typeof v.photo_index === "number" ? v.photo_index : null;
      delete v.photo_index;
      if (idx === null) continue;
      const cat = byIndex.get(idx);
      if (!cat || v.background !== "photo" || usedPhotoIds.has(cat.id)) continue;
      v.photo_id = cat.id;
      v.photo_library_description = cat.description;
      usedPhotoIds.add(cat.id);
    }
    // Garantie lot D : toute photo CHOISIE par l'utilisatrice que la rédaction
    // n'a pas placée est distribuée aux stories à fond photo restées sans
    // photo, dans l'ordre de la séquence.
    const leftoverPreferred = storiesPhotoCatalog.filter(
      (c) => c.preferred && !usedPhotoIds.has(c.id),
    );
    if (leftoverPreferred.length > 0) {
      for (const s of parsed.stories) {
        if (leftoverPreferred.length === 0) break;
        const v = s?.visual;
        if (!v || typeof v !== "object") continue;
        if (v.background !== "photo" || v.photo_id) continue;
        const next = leftoverPreferred.shift()!;
        v.photo_id = next.id;
        v.photo_library_description = next.description;
        usedPhotoIds.add(next.id);
      }
    }
  } else if (Array.isArray(parsed?.stories)) {
    for (const s of parsed.stories) if (s?.visual && typeof s.visual === "object") delete s.visual.photo_index;
  }
}

/**
 * Étape complète APRÈS la correction du texte, dans l'ordre de production :
 * plan visuel par le code, garde photo d'abord, photos de la bibliothèque.
 * Ne lève jamais : au pire, chaque story non face cam reçoit photo_pills.
 */
export function finalizeStoriesLayout(parsed: any, params: { storiesPhotoCatalog: StoriesPhotoCatalog; logger?: (m: string) => void }): void {
  const log = params.logger || (() => {});
  try {
    const { gabarits } = formatStoriesVisuals(parsed);
    log(`[story-formatting] ${gabarits.join(", ")}`);
  } catch (e) {
    log(`[story-formatting] repli photo_pills : ${e instanceof Error ? e.message.slice(0, 200) : "erreur"}`);
    for (const s of Array.isArray(parsed?.stories) ? parsed.stories : []) {
      try {
        if (s && typeof s === "object" && s.face_cam !== true && !(s.visual && typeof s.visual === "object" && s.visual.gabarit)) {
          s.visual = fallbackVisual(s, {});
        }
      } catch { /* story illisible : laissée telle quelle, le rendu pose son propre repli */ }
    }
  }
  try {
    applyStoriesPhotoGuardAndResolution(parsed, { storiesPhotoCatalog: params.storiesPhotoCatalog });
  } catch (e) {
    log(`[story-formatting] photos bibliothèque ignorées : ${e instanceof Error ? e.message.slice(0, 200) : "erreur"}`);
  }
}
