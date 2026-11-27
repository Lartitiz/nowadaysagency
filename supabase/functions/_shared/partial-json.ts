// ── Lecture d'un JSON encore en cours d'écriture (27/11/2026) ──
// Pour montrer un brouillon pendant que le modèle écrit (script du reel). Ne
// lit que du texte reçu, ne décide rien. Même logique que les slides du
// carrousel (carousel-draft-stream.ts), en version générique.

/**
 * Début de la valeur d'une clé de PREMIER niveau (une clé du même nom plus
 * profond n'est jamais confondue). -1 tant que la clé n'est pas écrite.
 */
export function topLevelValueStart(partial: string, key: string): number {
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

/** Objets entièrement fermés du tableau de premier niveau `key` (un objet à moitié écrit n'est jamais renvoyé). */
export function closedTopLevelObjects(partial: string, key: string): any[] {
  const at = topLevelValueStart(partial, key);
  if (at < 0 || partial[at] !== "[") return [];
  const out: any[] = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = at + 1; i < partial.length; i++) {
    const c = partial[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") { if (depth === 0) start = c === "{" ? i : -1; depth++; }
    else if (c === "}" || c === "]") {
      if (depth === 0) break; // fin du tableau
      depth--;
      if (depth === 0 && start >= 0) {
        try { const v = JSON.parse(partial.slice(start, i + 1)); if (v && typeof v === "object") out.push(v); } catch { return out; }
        start = -1;
      }
    }
  }
  return out;
}

/**
 * Texte de la chaîne de premier niveau `key`, même pas finie : ce qui est
 * écrit jusqu'ici (échappements décodés, un échappement coupé est laissé de
 * côté). null si la clé n'est pas encore là ou n'est pas une chaîne.
 */
export function partialTopLevelString(partial: string, key: string): { text: string; closed: boolean } | null {
  const at = topLevelValueStart(partial, key);
  if (at < 0 || partial[at] !== '"') return null;
  let i = at + 1, raw = "";
  for (; i < partial.length; i++) {
    const c = partial[i];
    if (c === '"') break;
    if (c === "\\") {
      const esc = partial[i + 1];
      if (esc === undefined) break;
      if (esc === "u") {
        if (i + 5 >= partial.length) break;
        raw += partial.slice(i, i + 6); i += 5;
      } else { raw += c + esc; i++; }
      continue;
    }
    raw += c;
  }
  let text = "";
  try { text = JSON.parse(`"${raw.replace(/[\u0000-\u001f]/g, " ")}"`); } catch { text = raw; }
  return { text, closed: i < partial.length && partial[i] === '"' };
}
