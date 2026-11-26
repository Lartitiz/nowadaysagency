// Ponctuation française (26/11/2026, vu dans la vidéo de Laetitia sur le compte démo) :
// « Nouvelle acquisition : je ne vous annonce aucune marge » coupait la ligne avant
// les deux-points, la ligne suivante commençait par « : ». En français, l'espace
// avant « : ; ! ? » et à l'intérieur des guillemets « » doit être insécable pour
// que la ponctuation ne parte jamais seule en début de ligne.
//
// On ne fait que REMPLACER une espace ordinaire par une espace insécable (même
// longueur de texte) : le curseur d'une case de texte ne bouge pas, et rien n'est
// inséré là où la personne n'a pas mis d'espace.

const NBSP = " ";
// Espace(s) ordinaire(s) juste avant : ; ! ? » (une seule espace gardée).
const BEFORE = /[ \t]+(?=[:;!?»])/g;
// Espace ordinaire juste après «.
const AFTER = /«[ \t]+/g;

/** Texte avec ses espaces insécables françaises (même longueur si une seule espace). */
export function frenchSpacingText(text: string): string {
  if (!text || !/[:;!?«»]/.test(text)) return text;
  return text.replace(BEFORE, NBSP).replace(AFTER, `«${NBSP}`);
}

/** Même remplacement dans tous les textes d'un document HTML (styles et scripts exclus). */
export function frenchSpacingDoc(doc: Document): void {
  const root = doc.body;
  if (!root) return;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    const parent = node.parentElement?.tagName;
    if (parent === "STYLE" || parent === "SCRIPT") return;
    const value = node.nodeValue || "";
    const next = frenchSpacingText(value);
    if (next !== value) node.nodeValue = next;
  });
  // Une espace en fin de nœud suivie d'une ponctuation au début du nœud suivant
  // (« acquisition <em>:</em> ») : on la remplace aussi.
  nodes.forEach((node, i) => {
    const following = nodes[i + 1];
    const value = node.nodeValue || "";
    if (following && /[ \t]$/.test(value) && /^[:;!?»]/.test(following.nodeValue || ""))
      node.nodeValue = value.replace(/[ \t]+$/, NBSP);
  });
}

/** Slide dont les textes ont leurs espaces insécables (même slide si rien ne change). */
export function frenchSpacingSlide<T extends { html: string }>(slide: T): T {
  if (!/[:;!?«»]/.test(slide.html)) return slide;
  const doc = new DOMParser().parseFromString(slide.html, "text/html");
  const before = doc.body.innerHTML;
  frenchSpacingDoc(doc);
  // Même écriture que l'éditeur (serialize de carousel-editor.ts) : imports de polices puis slide.
  return doc.body.innerHTML === before ? slide : { ...slide, html: doc.head.innerHTML + doc.body.innerHTML };
}
