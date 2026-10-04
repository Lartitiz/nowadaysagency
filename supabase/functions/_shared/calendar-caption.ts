import { reelCalendarCaption } from "./reel-caption.ts";

/**
 * Légende À PUBLIER (ou à copier comme légende) d'un post du calendrier.
 *
 * Partagé par la publication programmée (edge social-publish-scheduled) et la
 * publication directe / copie depuis le calendrier (front) : une seule règle.
 *
 * Le brouillon `content_draft` d'un carrousel contient AUSSI le texte des
 * slides, pour que l'utilisatrice le voie dans son calendrier. Ce texte ne doit
 * jamais partir en légende. Formats reconnus, de façon déterministe :
 *  - carrousel texte (/creer) : « légende ⏎⏎───── SLIDES ─────⏎⏎ slides ».
 *    La partie AVANT le séparateur est la légende (éventuellement retouchée
 *    par l'utilisatrice : elle prime). Vide → légende structurée.
 *  - carrousel recyclé : « slides ⏎⏎──────────⏎Légende⏎⏎ légende ».
 *    La partie APRÈS le marqueur est la légende. Vide → légende structurée.
 *  - dump « SLIDE n : … » (carrousel photo) ou « SLIDE n [📝]: … » (mix) :
 *    légende structurée (comportement historique, étendu au mix).
 *  - reel : règle dédiée `reelCalendarCaption` (inchangée).
 *  - tout autre texte (légende écrite ou éditée à la main) : publié tel quel.
 */

// Tolère des espaces / un nombre de traits différent si le brouillon a été retouché.
const SLIDES_SEPARATOR_RE = /^[ \t]*─{3,}[ \t]*SLIDES[ \t]*─{3,}[ \t]*$/m;
// Format du recyclage de contenu (ContentRecycling) : slides d'abord, légende ensuite.
const RECYCLE_CAPTION_MARKER_RE = /^[ \t]*─{3,}[ \t]*\r?\n[ \t]*Légende[ \t]*$/m;
// « SLIDE 2 : », « SLIDE 2 [📸]: » (carrousel mix : l'étiquette entre crochets
// n'était pas reconnue avant, et tout le dump partait en légende).
const SLIDE_DUMP_RE = /(?:^|\n)\s*(?:📌\s*)?SLIDE\s*\d+\s*(?:\[[^\]\n]*\]\s*)?[:.–-]/i;

/** Vrai si le brouillon embarque le texte des slides derrière un séparateur connu. */
export function hasSlidesSeparator(draft: string | null | undefined): boolean {
  const d = draft || "";
  return SLIDES_SEPARATOR_RE.test(d) || RECYCLE_CAPTION_MARKER_RE.test(d);
}

/**
 * Partie « légende » d'un brouillon à séparateur, ou null s'il n'y a pas de
 * séparateur. Peut renvoyer "" (légende vidée) : à l'appelant de retomber
 * sur la légende structurée.
 */
function captionPartOfDraft(draft: string | null | undefined): string | null {
  const d = draft || "";
  const sep = SLIDES_SEPARATOR_RE.exec(d);
  if (sep) return d.slice(0, sep.index).trim();
  const recycle = RECYCLE_CAPTION_MARKER_RE.exec(d);
  if (recycle) return d.slice(recycle.index + recycle[0].length).trim();
  return null;
}

function hashtagLine(cap: any): string {
  if (!cap || typeof cap !== "object" || !Array.isArray(cap.hashtags)) return "";
  return cap.hashtags
    .map((h: unknown) => String(h ?? "").trim().replace(/^#+/, ""))
    .filter(Boolean)
    .map((h: string) => `#${h}`)
    .join(" ");
}

/** Légende structurée (story_sequence_detail.caption), hashtags compris. */
function structuredCaption(detail: any): string {
  const cap = detail && typeof detail === "object" ? detail.caption : null;
  let capText = typeof cap === "string"
    ? cap.trim()
    : cap && typeof cap === "object"
      ? [cap.hook, cap.body, cap.cta].filter(Boolean).join("\n\n").trim()
      : "";
  const tags = hashtagLine(cap);
  if (capText && tags) capText += "\n\n" + tags;
  return capText;
}

const HAS_HASHTAG_RE = /(?:^|\s)#[\p{L}\p{N}_]/u;

export function calendarPublishCaption(draftIn: string | null | undefined, detail: any): string {
  const draft = (draftIn || "").trim();
  if (detail?.type === "reel") return reelCalendarCaption(draft, detail);
  const capText = structuredCaption(detail);

  const part = captionPartOfDraft(draft);
  if (part !== null) {
    if (!part) return capText;
    // Le brouillon n'a jamais affiché les hashtags de la légende structurée :
    // on les ajoute (comme pour un dump), sauf si la légende en contient déjà.
    const tags = hashtagLine(detail?.caption);
    return tags && !HAS_HASHTAG_RE.test(part) ? `${part}\n\n${tags}` : part;
  }

  // Une légende éditée à la main dans le calendrier reste prioritaire — on ne
  // bascule sur la légende structurée que si le draft est vide ou est un dump.
  if (capText && (SLIDE_DUMP_RE.test(draft) || !draft)) return capText;
  return draft;
}
