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
  let i = partial.indexOf("[", key) + 1;
  const out: any[] = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (; i < partial.length; i++) {
    const c = partial[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") { if (depth === 0 && c === "{") start = i; depth++; }
    else if (c === "}" || c === "]") {
      if (depth === 0) break; // fin du tableau des slides
      depth--;
      if (depth === 0 && c === "}" && start >= 0) {
        try { out.push(JSON.parse(partial.slice(start, i + 1))); } catch { return out; }
        start = -1;
      }
    }
  }
  return out;
}

const clean = (v: unknown) => typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim() : "";

/** Ce que l'écran d'attente affiche d'une slide : un titre et un texte courts. */
export function draftSlideView(slide: any, index: number): DraftSlide {
  const title = TITLE_KEYS.map((k) => clean(slide?.[k])).find(Boolean) || "";
  const parts = TEXT_KEYS.map((k) => clean(slide?.[k])).filter((t) => t && t !== title);
  if (Array.isArray(slide?.points)) for (const p of slide.points) if (clean(p)) parts.push(`• ${clean(p)}`);
  const text = parts.join(" ");
  return { n: index + 1, title: title.slice(0, 160), text: text.length > 320 ? text.slice(0, 319) + "…" : text };
}

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
