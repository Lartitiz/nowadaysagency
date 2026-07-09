/**
 * carousel-html-edit — édition en direct du texte dans les visuels carrousel.
 *
 * Le HTML des slides est généré par l'IA (carousel-visual) : on ne peut pas le
 * re-render localement comme les stories. À la place, chaque texte y est
 * ANCRÉ (data-slide-text="title|body", texte verbatim — contrat du prompt) et
 * on remplace chirurgicalement le contenu de l'ancre quand l'utilisatrice
 * édite. Repli pour les visuels générés AVANT ce contrat : on cherche
 * l'élément le plus profond dont le texte correspond exactement à l'ancien.
 *
 * ⚠️ Piège de sérialisation : chaque slide commence par un <style>@import…>
 * hors de tout conteneur. DOMParser hisserait ce <style> dans <head> et la
 * re-sérialisation du body le PERDRAIT (plus de fonts). On détache donc les
 * blocs <style> de tête avant le parse et on les recolle après.
 */

const LEADING_STYLES = /^\s*(?:<style[\s\S]*?<\/style>\s*)+/i;

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Remplace le texte d'un champ (title/body) dans le HTML d'une slide.
 * Retourne le nouveau HTML, ou null si l'élément n'a pas pu être localisé
 * (le visuel reste alors inchangé — comportement d'avant, jamais bloquant).
 */
export function replaceSlideText(
  html: string,
  field: "title" | "body",
  oldText: string,
  newText: string,
): string | null {
  if (!html) return null;

  const stylesMatch = html.match(LEADING_STYLES);
  const stylesPrefix = stylesMatch ? stylesMatch[0] : "";
  const rest = stylesPrefix ? html.slice(stylesPrefix.length) : html;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rest, "text/html");
  } catch {
    return null;
  }

  let el = doc.body.querySelector<HTMLElement>(`[data-slide-text="${field}"]`);

  if (!el) {
    // Repli anciens visuels : l'élément le plus PROFOND dont le texte
    // normalisé égale l'ancien texte (le plus profond = celui qui contient
    // directement le texte, pas un conteneur parent).
    const target = normalize(oldText);
    if (!target) return null;
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode as HTMLElement;
      if (normalize(node.textContent || "") === target) el = node;
    }
  }

  if (!el) return null;

  // textContent efface les <span> d'accent internes — assumé : le texte a
  // changé, la mise en valeur mot-à-mot de l'ancien texte n'a plus de sens.
  el.textContent = newText;
  return stylesPrefix + doc.body.innerHTML;
}
