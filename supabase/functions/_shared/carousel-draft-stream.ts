// ── Slides en brouillon pendant l'écriture (07/10/2026) ──
// Le texte d'un carrousel de 13-14 slides s'affichait d'un bloc après ~3 min
// (écriture ~85 s puis relecture, contrôles, juge du fil). Le rédacteur écrit
// désormais en flux : chaque slide terminée part à l'écran en BROUILLON grisé,
// non modifiable, pendant que la suite s'écrit. Le texte final (relu) la
// remplace à la fin. Ce module ne lit que du texte reçu : il ne décide rien.

export interface DraftSlide {
  n: number;
  title: string;
  text: string;
  /** Photo prévue (1 = première), seulement quand elle est déjà décidée. */
  photo?: number;
}

const TITLE_KEYS = ["title", "hook", "accroche", "overlay_text"];
const TEXT_KEYS = ["kicker", "body", "text", "content", "detail", "big_number", "attribution"];

/**
 * Objets entièrement fermés du tableau `"slides"` d'un JSON encore en cours
 * d'écriture. Les chaînes (et leurs guillemets échappés) sont respectées ; une
 * slide à moitié écrite n'est jamais renvoyée.
 */
export function completedSlides(partial: string): any[] {
  const key = partial.search(/"slides"\s*:\s*\[/);
  if (key < 0) return [];
  return closedItems(partial, partial.indexOf("[", key) + 1).filter((v) => v && typeof v === "object");
}

/** Éléments (objets ou chaînes) entièrement fermés d'un tableau ouvert à `from`. */
function closedItems(partial: string, from: number): any[] {
  const out: any[] = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = from; i < partial.length; i++) {
    const c = partial[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') {
        inString = false;
        if (depth === 0 && start >= 0) {
          try { out.push(JSON.parse(partial.slice(start, i + 1))); } catch { return out; }
          start = -1;
        }
      }
      continue;
    }
    if (c === '"') { inString = true; if (depth === 0) start = i; }
    else if (c === "{" || c === "[") { if (depth === 0 && c === "{") start = i; depth++; }
    else if (c === "}" || c === "]") {
      if (depth === 0) break; // fin du tableau
      depth--;
      if (depth === 0 && c === "}" && start >= 0) {
        try { out.push(JSON.parse(partial.slice(start, i + 1))); } catch { return out; }
        start = -1;
      }
    }
  }
  return out;
}

/**
 * Début de la valeur d'une clé de PREMIER niveau d'un objet JSON en cours
 * d'écriture (la `hook` de la légende, imbriquée, n'est jamais confondue avec
 * celle du texte). -1 tant que la clé n'est pas écrite.
 */
function topLevelValueStart(partial: string, key: string): number {
  let depth = 0, inString = false, escaped = false, start = -1, last = "";
  for (let i = 0; i < partial.length; i++) {
    const c = partial[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') { inString = false; if (depth === 1) last = partial.slice(start, i + 1); }
      continue;
    }
    if (c === '"') { inString = true; start = i; }
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === ":" && depth === 1) {
      let name = "";
      try { name = JSON.parse(last); } catch { /* clé illisible */ }
      if (name === key) {
        let j = i + 1;
        while (j < partial.length && /\s/.test(partial[j])) j++;
        return j;
      }
    } else if (!/\s/.test(c)) last = "";
  }
  return -1;
}

/**
 * Récit continu (carrousels photo et mixte) : l'accroche puis chaque
 * paragraphe terminé, dans l'ordre où ils deviendront des slides.
 */
export function completedNarrative(partial: string): { hook: string; paragraphs: string[] } {
  const h = topLevelValueStart(partial, "hook");
  const hook = h >= 0 && partial[h] === '"' ? closedItems(partial.slice(h), 0)[0] : undefined;
  const p = topLevelValueStart(partial, "paragraphs");
  const paragraphs = p >= 0 && partial[p] === "[" ? closedItems(partial, p + 1).filter((v) => typeof v === "string") : [];
  return { hook: typeof hook === "string" ? hook : "", paragraphs };
}

const clean = (v: unknown) => typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim() : "";

/** Ce que l'écran d'attente affiche d'une slide : un titre et un texte courts. */
export function draftSlideView(slide: any, index: number): DraftSlide {
  const title = TITLE_KEYS.map((k) => clean(slide?.[k])).find(Boolean) || "";
  const parts = TEXT_KEYS.map((k) => clean(slide?.[k])).filter((t) => t && t !== title);
  if (Array.isArray(slide?.points)) for (const p of slide.points) if (clean(p)) parts.push(`• ${clean(p)}`);
  const photo = Number.isInteger(slide?.photo_index) && slide.photo_index > 0 ? slide.photo_index : undefined;
  return { n: index + 1, title: title.slice(0, 160), text: shorten(parts.join(" ")), ...(photo ? { photo } : {}) };
}

const shorten = (text: string) => text.length > 320 ? text.slice(0, 319) + "…" : text;

/**
 * Suit le texte qui arrive et appelle `emit` à chaque nouvelle slide terminée,
 * avec la liste complète (l'écran remplace sa liste, jamais d'état partiel).
 */
export function draftSlidesTracker(emit: (slides: DraftSlide[]) => void): (text: string) => void {
  let sent = 0;
  return (text: string) => {
    const slides = completedSlides(text);
    if (slides.length <= sent) return;
    sent = slides.length;
    emit(slides.map(draftSlideView));
  };
}

/**
 * Même suivi pour le récit continu : la couverture (accroche) puis un
 * paragraphe par slide. Rien n'est envoyé avant que l'accroche soit écrite,
 * pour que la 1re carte reste la couverture.
 */
export function draftNarrativeTracker(emit: (slides: DraftSlide[]) => void): (text: string) => void {
  let sent = 0;
  return (text: string) => {
    const { hook, paragraphs } = completedNarrative(text);
    const title = clean(hook);
    if (!title || 1 + paragraphs.length <= sent) return;
    sent = 1 + paragraphs.length;
    emit([
      { n: 1, title: title.slice(0, 160), text: "" },
      ...paragraphs.map((p, i) => ({ n: i + 2, title: "", text: shorten(clean(p)) })),
    ]);
  };
}
