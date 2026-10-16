// Sorti de src/hooks/use-content-generator.ts à l'identique (fiche 17 de
// docs/robustesse/gros-fichiers.md, lot 1). Ne pas fusionner avec
// src/lib/parse-ai-json.ts (parseAiJson) : autre comportement (lève AiParseError,
// pas de sauvetage du champ `content`).

// ── JSON parser (handles markdown-wrapped JSON) ──

/**
 * Échappe les caractères de contrôle (vrais \n, \r, \t, …) qui apparaissent
 * NON échappés à l'intérieur d'une chaîne JSON. Sonnet (thinking off) enveloppe
 * sa sortie en ```json { "content": "…" } mais insère parfois de vrais sauts de
 * ligne dans la valeur → JSON invalide ("Bad control character in string
 * literal") → parseAIJson renvoyait null → le blob brut fuyait au rendu du post.
 * On ne touche qu'à l'intérieur des chaînes ; hors chaîne, un \n est de la
 * mise en forme structurelle qu'il faut laisser telle quelle.
 */
function escapeUnescapedControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (esc) {
      out += ch;
      esc = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (inStr && code < 0x20) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Dernier recours quand AUCUN parse JSON n'aboutit : le modèle (Sonnet, thinking
 * off) enveloppe le post en ```json {"content":"…"} mais casse son JSON de
 * plusieurs façons (sauts de ligne ET guillemets droits non échappés à
 * l'intérieur de la valeur). Plutôt que de continuer à réparer un JSON arbitraire
 * (sans fin), on EXTRAIT le seul champ qui compte — `content` — en s'ancrant sur
 * la STRUCTURE (début de la valeur → frontière du champ suivant), pas sur un JSON
 * valide. Robuste aux " et \n internes. Renvoie null si pas de champ `content`
 * (ex. carrousel), pour ne rien casser des autres formats.
 */
function salvageContentField(txt: string): { content: string } | null {
  const key = '"content"';
  const k = txt.indexOf(key);
  if (k < 0) return null;
  const open = txt.indexOf('"', k + key.length + 1); // guillemet ouvrant de la valeur (après les ':')
  if (open < 0) return null;
  const start = open + 1;
  // Frontière : un guillemet suivi soit du champ suivant ( , "cle": ), soit de la
  // fin de l'objet ( } ). Insensible aux " / \n internes non échappés.
  const boundary = txt.slice(start).match(/"\s*(?:,\s*"[a-zA-Z_]+"\s*:|}\s*$)/);
  const end = boundary ? start + boundary.index! : txt.length;
  let val = txt.slice(start, end);
  // Dé-échappe les séquences JSON standard éventuellement présentes.
  val = val
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
  return val ? { content: val } : null;
}

export function parseAIJson(raw: string | object): any {
  if (typeof raw === "object" && raw !== null) return raw;
  if (typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Remove markdown code fences (with or without language tag)
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
  }

  cleaned = cleaned.trim();

  // Direct parse attempt
  try {
    return JSON.parse(cleaned);
  } catch {
    // ignore
  }

  // Try to find a JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // ignore
    }
  }

  // Try to find a JSON array. Pas quand ce tableau est une liste rangée DANS
  // un objet qui porte un champ `content` (ex. "hashtags": [...]) : le post
  // affiché serait la liste. On laisse alors le sauvetage de `content` agir.
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  const arrInsideContentObject =
    !!arrMatch && !!objMatch && arrMatch.index! > objMatch.index! && salvageContentField(cleaned) !== null;
  if (arrMatch && !arrInsideContentObject) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // ignore
    }
  }

  // Réparation des caractères de contrôle non échappés (vrais \n / \r / \t
  // dans une chaîne). Cause n°1 de fuite du JSON brut au rendu du post — voir
  // escapeUnescapedControlChars. On reparse la version réparée.
  const repaired = escapeUnescapedControlChars(cleaned);
  if (repaired !== cleaned) {
    try {
      return JSON.parse(repaired);
    } catch {
      // ignore
    }
    const repObj = repaired.match(/\{[\s\S]*\}/);
    if (repObj) {
      try {
        return JSON.parse(repObj[0]);
      } catch {
        // ignore
      }
    }
  }

  // Last resort: fix common issues (trailing commas, single quotes)
  try {
    const fixed = cleaned
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/'/g, '"');
    const obj2 = fixed.match(/\{[\s\S]*\}/);
    if (obj2) return JSON.parse(obj2[0]);
    const arr2 = fixed.match(/\[[\s\S]*\]/);
    if (arr2) return JSON.parse(arr2[0]);
  } catch {
    // ignore
  }

  // Ultime filet : extraction structurelle du champ `content` d'un JSON
  // irrécupérable, pour ne JAMAIS afficher le blob ```json brut au rendu du post.
  const salvaged = salvageContentField(cleaned);
  if (salvaged) return salvaged;

  return null;
}
