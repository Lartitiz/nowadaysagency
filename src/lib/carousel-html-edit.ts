/**
 * carousel-html-edit — édition en direct du texte dans les visuels carrousel.
 *
 * Le HTML des slides est généré par l'IA (carousel-visual) : on ne peut pas le
 * re-render localement comme les stories. À la place, chaque texte y est
 * ANCRÉ (data-slide-text="title|body|overlay|cta", texte verbatim — contrat du
 * prompt) et on remplace chirurgicalement le contenu de l'ancre quand
 * l'utilisatrice édite. Repli pour les visuels générés AVANT ce contrat : on
 * cherche l'élément le plus profond dont le texte correspond exactement à
 * l'ancien.
 *
 * Le bouton d'appel à l'action (CTA) de la dernière slide est en plus enveloppé
 * dans un élément data-slide-cta : on peut donc le RETIRER entièrement (pas juste
 * vider son texte), ce que réclame l'édition (« supprimer l'appel à l'action »).
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

/** Parse une slide en détachant les <style> de tête (voir piège ci-dessus). */
function parseSlide(html: string): { doc: Document; stylesPrefix: string } | null {
  if (!html) return null;
  const stylesMatch = html.match(LEADING_STYLES);
  const stylesPrefix = stylesMatch ? stylesMatch[0] : "";
  const rest = stylesPrefix ? html.slice(stylesPrefix.length) : html;
  try {
    const doc = new DOMParser().parseFromString(rest, "text/html");
    return { doc, stylesPrefix };
  } catch {
    return null;
  }
}

function serialize(doc: Document, stylesPrefix: string): string {
  return stylesPrefix + doc.body.innerHTML;
}

/**
 * Remplace le texte d'un champ (title/body/overlay/cta) dans le HTML d'une slide.
 * Retourne le nouveau HTML, ou null si l'élément n'a pas pu être localisé
 * (le visuel reste alors inchangé — comportement d'avant, jamais bloquant).
 */
export function replaceSlideText(
  html: string,
  field: "title" | "body" | "overlay" | "cta",
  oldText: string,
  newText: string,
): string | null {
  const parsed = parseSlide(html);
  if (!parsed) return null;
  const { doc, stylesPrefix } = parsed;

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
  return serialize(doc, stylesPrefix);
}

/** true si la slide porte un bouton d'appel à l'action retirable (data-slide-cta). */
export function hasSlideCta(html: string): boolean {
  const parsed = parseSlide(html);
  if (!parsed) return false;
  return parsed.doc.body.querySelector("[data-slide-cta]") != null;
}

/** Texte courant du bouton CTA (pour amorcer le champ éditable), ou null. */
export function getSlideCtaText(html: string): string | null {
  const parsed = parseSlide(html);
  if (!parsed) return null;
  const textEl =
    parsed.doc.body.querySelector<HTMLElement>('[data-slide-text="cta"]') ||
    parsed.doc.body.querySelector<HTMLElement>("[data-slide-cta]");
  if (!textEl) return null;
  return (textEl.textContent || "").trim();
}

/**
 * Retire entièrement le bouton d'appel à l'action de la slide (l'élément
 * data-slide-cta, pas juste son texte). Retourne le nouveau HTML, ou null si
 * aucun CTA retirable n'est présent (visuel inchangé — jamais bloquant).
 */
export function removeSlideCta(html: string): string | null {
  const parsed = parseSlide(html);
  if (!parsed) return null;
  const { doc, stylesPrefix } = parsed;
  const el = doc.body.querySelector("[data-slide-cta]");
  if (!el) return null;
  el.remove();
  return serialize(doc, stylesPrefix);
}
