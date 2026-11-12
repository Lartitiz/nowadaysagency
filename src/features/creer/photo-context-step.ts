// Étape « Que montre cette photo ? » du carrousel photo / mixte (QA du
// 12/11/2026, option A choisie par Laetitia). Sans une ligne par photo, l'IA
// devine et se trompe (la façade sur un texte qui parle de la cuisine, la photo
// « après » réutilisée). Ici : suggestions GRATUITES (nom du fichier, fiche de
// la photothèque), jamais d'appel IA, et la paire avant / après.
//
// La paire voyage DANS le contexte de la photo (« AVANT — cuisine »,
// « APRÈS — cuisine ») : il traverse déjà tous les chemins jusqu'au prompt
// (plan, récit continu, photo, mixte, association finale) et suit la photo si
// on la déplace. Le serveur reconnaît ce marqueur (carousel-ai/photo-pair.ts).

/** Limite du contexte côté serveur (carousel-ai, Zod). */
export const PHOTO_CONTEXT_MAX = 200;
export type PairRole = "before" | "after";
const MARK: Record<PairRole, string> = { before: "AVANT", after: "APRÈS" };
const MARK_RE = /^(AVANT|APRÈS)(?:\s+—\s*|\s*$)/;
/** Place laissée au texte une fois le marqueur posé (« APRÈS — » = 8 caractères). */
export const PHOTO_CONTEXT_TEXT_MAX = PHOTO_CONTEXT_MAX - 8;

export interface ContextStepPhoto {
  id?: string;
  name?: string;
  preview?: string;
  context?: string;
  libraryContext?: string;
  stockAmbient?: boolean;
}

/** Sépare le marqueur avant / après du texte saisi. */
export function splitPairMark(context: string | undefined): { role: PairRole | null; text: string } {
  const raw = (context || "").trim();
  const m = raw.match(MARK_RE);
  if (!m) return { role: null, text: raw };
  return { role: m[1] === "AVANT" ? "before" : "after", text: raw.slice(m[0].length).trim() };
}

/** Contexte envoyé au serveur : marqueur éventuel + texte, dans la limite. */
export function withPairMark(role: PairRole | null, text: string): string {
  const clean = text.trim().slice(0, role ? PHOTO_CONTEXT_TEXT_MAX : PHOTO_CONTEXT_MAX);
  if (!role) return clean;
  return clean ? `${MARK[role]} — ${clean}` : MARK[role];
}

const CAMERA_NAME = /^(img|image|dsc|dscn|dscf|pxl|mvimg|photo|pic|picture|screenshot|capture|capture d ecran|whatsapp image|wa|signal|snapchat|pexels|unsplash|file|fichier|scan)\b/i;
const BEFORE_WORD = /(?:^|\s)(avant|before)(?=\s|$)/i;
const AFTER_WORD = /(?:^|\s)(apres|après|after)(?=\s|$)/i;

/** Nom de fichier lisible (« cuisine-avant.jpg » → « cuisine avant »), ou vide. */
export function readableFileName(name: string | undefined): string {
  if (!name) return "";
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_\-.+]+/g, " ")
    .replace(/\(\d+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || CAMERA_NAME.test(base)) return "";
  // Identifiants techniques : uuid, hachages, dates et numéros seuls.
  const letters = base.replace(/[^a-zà-ÿ]/gi, "");
  if (letters.length < 3) return "";
  if (/^[0-9a-f ]{12,}$/i.test(base)) return "";
  const words = base.split(" ").filter((w) => /[a-zà-ÿ]{2,}/i.test(w) && !/\d/.test(w));
  if (!words.length) return "";
  return words.join(" ").toLowerCase();
}

function libraryLine(libraryContext: string | undefined, key: string): string {
  const line = (libraryContext || "").split("\n").find((l) => l.startsWith(`${key} : `));
  return line ? line.slice(key.length + 3).trim() : "";
}

/**
 * Suggestion gratuite pour une photo sans contexte : description de la
 * photothèque, sinon son nom (photothèque ou fichier) s'il est lisible. Rien
 * sinon : mieux vaut un champ vide qu'une supposition fausse.
 */
export function suggestPhotoContext(photo: ContextStepPhoto): { text: string; role: PairRole | null } {
  const description = libraryLine(photo.libraryContext, "Description");
  const source = description || readableFileName(libraryLine(photo.libraryContext, "Nom") || photo.name);
  if (!source) return { text: "", role: null };
  const role: PairRole | null = BEFORE_WORD.test(` ${source} `) ? "before" : AFTER_WORD.test(` ${source} `) ? "after" : null;
  // Le marqueur porte déjà l'avant / après : on le retire du texte proposé.
  const text = role && !description
    ? source.replace(role === "before" ? BEFORE_WORD : AFTER_WORD, " ").replace(/\s+/g, " ").trim()
    : source;
  const capped = text.slice(0, PHOTO_CONTEXT_TEXT_MAX);
  return { text: capped ? capped[0].toUpperCase() + capped.slice(1) : "", role };
}

/** Photos que l'utilisatrice a choisies (sans les photos d'ambiance posées par l'app). */
export function stepPhotos<T extends ContextStepPhoto>(photos: T[]): T[] {
  return (photos || []).filter((p) => !p?.stockAmbient);
}

/** Au moins une photo choisie n'a aucune ligne de contexte. */
export function needsContextStep(photos: ContextStepPhoto[]): boolean {
  return stepPhotos(photos).some((p) => !splitPairMark(p.context).text);
}

/** Même lot de photos = même signature (on ne redemande pas pour ce lot). */
export function contextStepSignature(photos: ContextStepPhoto[]): string {
  return stepPhotos(photos).map((p, i) => p.id || p.preview?.slice(-40) || p.name || String(i)).join("|");
}

export interface ContextStepRow {
  key: string;
  text: string;
  role: PairRole | null;
  /** Le texte vient d'une suggestion (à valider ou corriger). */
  suggested: boolean;
}

/** Lignes de départ : contexte déjà saisi, sinon suggestion. */
export function initialRows(photos: ContextStepPhoto[]): ContextStepRow[] {
  const rows = stepPhotos(photos).map((p, i) => {
    const own = splitPairMark(p.context);
    if (own.text || own.role) return { key: p.id || String(i), text: own.text, role: own.role, suggested: false };
    const s = suggestPhotoContext(p);
    return { key: p.id || String(i), text: s.text, role: s.role, suggested: !!s.text };
  });
  return normalizePair(rows);
}

/** Une seule paire : un seul « avant », un seul « après », sinon on n'en garde aucun. */
export function normalizePair(rows: ContextStepRow[]): ContextStepRow[] {
  const befores = rows.filter((r) => r.role === "before").length;
  const afters = rows.filter((r) => r.role === "after").length;
  if (befores <= 1 && afters <= 1) return rows;
  return rows.map((r) => ({ ...r, role: null }));
}

/** Coche « avant » ou « après » sur une ligne (re-cliquer décoche). */
export function setPairRole(rows: ContextStepRow[], index: number, role: PairRole): ContextStepRow[] {
  const turnOff = rows[index]?.role === role;
  return rows.map((r, i) => {
    if (i === index) return { ...r, role: turnOff ? null : role };
    return !turnOff && r.role === role ? { ...r, role: null } : r;
  });
}

/** La paire est complète (un avant ET un après). */
export function hasCompletePair(rows: ContextStepRow[]): boolean {
  return rows.some((r) => r.role === "before") && rows.some((r) => r.role === "after");
}

/**
 * Applique les réponses aux photos (toutes, ambiance comprise, dans l'ordre).
 * Une paire incomplète n'est pas écrite.
 */
export function applyContextRows<T extends ContextStepPhoto>(photos: T[], rows: ContextStepRow[]): T[] {
  const pair = hasCompletePair(rows);
  let k = 0;
  return photos.map((p) => {
    if (p?.stockAmbient) return p;
    const row = rows[k++];
    if (!row) return p;
    const context = withPairMark(pair ? row.role : null, row.text);
    return context === (p.context || "") ? p : { ...p, context };
  });
}
