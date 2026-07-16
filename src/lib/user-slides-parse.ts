// Mode carrousel « Mes slides » : l'utilisatrice colle son texte déjà écrit,
// on le découpe en slides SANS y toucher (aucune réécriture, aucune troncature).
//
// Règles de découpage :
// - séparateur principal = une ou plusieurs lignes vides (espaces tolérés) ;
// - une ligne qui commence par « Slide N » (avec ou sans ponctuation) démarre
//   TOUJOURS une nouvelle slide, même sans ligne vide avant ;
// - en début de bloc, un marqueur « Slide 3 : », « 3. », « 3/ », « 3) » est
//   retiré du texte (c'est un numéro d'ordre, pas du contenu). Les nombres à
//   3-4 chiffres (« 2026. ») ne sont JAMAIS traités comme des marqueurs.
//
// Tout le reste du texte est gardé VERBATIM (chiffres, ponctuation, émojis,
// retours à la ligne internes au bloc).

export interface ParsedSlideBlock {
  /** Titre optionnel — le découpage n'en devine jamais, il reste vide. */
  title: string;
  /** Texte de la slide, verbatim (marqueur d'ordre retiré). */
  body: string;
}

/** Ligne « Slide N … » (insensible à la casse) — démarre une nouvelle slide. */
const SLIDE_LINE_RE = /^\s*slide\s*\d{1,2}\s*(?:[:./)\-–—]|\b)/i;

/** Marqueur « Slide N : » en tête de bloc, à retirer du texte. */
const SLIDE_MARKER_RE = /^\s*slide\s*\d{1,2}\s*[:./)\-–—]?\s*/i;

/** Marqueur numérique court « 3. », « 3/ », « 3) », « 3 : » en tête de bloc.
 * Limité à 1-2 chiffres pour ne pas manger une année (« 2026. C'était… »). */
const NUM_MARKER_RE = /^\s*\d{1,2}\s*[:./)]\s*/;

/**
 * Découpe un texte collé en blocs-slides. Fonction PURE (testable).
 * Ne renvoie que des blocs au body non vide ; ne borne pas le nombre de
 * slides (2-20 = responsabilité de l'écran de saisie).
 */
export function parseSlidesFromText(text: string): ParsedSlideBlock[] {
  const normalized = (text || "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) return [];

  // 1) Regrouper les lignes en blocs : ligne vide OU ligne « Slide N » = frontière.
  const blocks: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.some((l) => l.trim() !== "")) blocks.push(current);
    current = [];
  };
  for (const line of normalized.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (SLIDE_LINE_RE.test(line) && current.some((l) => l.trim() !== "")) {
      flush();
    }
    current.push(line);
  }
  flush();

  // 2) Retirer le marqueur d'ordre en tête de bloc (jamais ailleurs).
  return blocks
    .map((lines) => {
      const rest = [...lines];
      const first = rest[0] ?? "";
      let stripped = first;
      if (SLIDE_MARKER_RE.test(first)) {
        stripped = first.replace(SLIDE_MARKER_RE, "");
      } else if (NUM_MARKER_RE.test(first)) {
        stripped = first.replace(NUM_MARKER_RE, "");
      }
      if (stripped.trim() === "") rest.shift();
      else rest[0] = stripped;
      return { title: "", body: rest.join("\n").trim() };
    })
    .filter((b) => b.body.length > 0);
}

/**
 * Compose l'overlay d'une slide photo à partir d'un titre optionnel + du texte.
 * Le titre est PRÉFIXÉ au texte (jamais mis dans un champ que certains gabarits
 * ignorent, comme `kicker` : seul `overlay_text` est rendu par TOUS les
 * gabarits — le préfixe garantit que rien ne disparaît). Séparateur « — »
 * seulement si le titre ne porte pas déjà sa ponctuation.
 */
export function composeOverlayText(title: string, body: string): string {
  const t = (title || "").trim();
  const b = (body || "").trim();
  if (!t) return b;
  if (!b) return t;
  const endsWithPunct = /[.!?…:—–]$/.test(t);
  return `${t}${endsWithPunct ? " " : " — "}${b}`;
}
