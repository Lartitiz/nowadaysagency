// Brouillon de /creer rangé dans Mes idées dès la 2e étape, comme sur Canva
// (demande de Laetitia du 13/11/2026). Avant la génération, le contenu commencé
// (sujet, format, réponses aux questions, photos) ne vivait que dans l'onglet :
// passer à un autre contenu affichait « Tu as déjà un contenu en cours ».
// Désormais la fiche de Mes idées (editingIdeaId) porte une copie de ce
// brouillon sous la clé `_creer_draft` ; « Reprendre » le rouvre à la même étape.
// Le carrousel ou les stories générés remplacent ensuite cette clé dans la même
// fiche (use-carousel-autosave.ts) : une seule fiche, du début à la fin.
import { contentKey } from "@/features/creer/draft-conflict";

export const CREER_DRAFT_KEY = "_creer_draft";

/** Photo du brouillon : lien public (photo déposée) ou photo de la photothèque. */
export interface CreerDraftPhoto {
  id: string;
  url?: string;
  userPhotoId?: string;
  name?: string;
  mimeType?: string;
  context?: string;
  libraryContext?: string;
  edited?: boolean;
  stockSource?: string;
  stockPhotographer?: string;
  stockSourceUrl?: string;
  stockAmbient?: boolean;
}

export interface CreerDraftSnapshot {
  version: 1;
  flow: Record<string, unknown>;
  photos: CreerDraftPhoto[];
}

// Ce qui n'a rien à faire dans la fiche : identité de l'onglet, résultat généré,
// marques de génération en cours, aperçus lourds.
const SKIPPED_KEYS = new Set([
  "schemaVersion", "ownerId", "workspaceId", "creationId", "ts", "editingIdeaId", "savedId",
  "result", "visualSlides", "visualsInCloud", "editContent", "editBaseline", "pendingStream",
  "generationInFlight", "demoScenario", "publishedCalendarId", "reelMp4Url", "reelSourceKey",
  "calendarPostUpdatedAt", "inspirationImagePreview", "autoFlow",
]);

/** Copie du brouillon de l'onglet, sans ce qui appartient à l'onglet. */
export function draftFlowOf(flow: Record<string, any> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!flow) return out;
  for (const [key, value] of Object.entries(flow)) {
    if (SKIPPED_KEYS.has(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

const NOT_DRAFT_STEPS = new Set(["idea", "result", "edit"]);

/**
 * Contenu commencé « à partir de la 2e étape » (choix de Laetitia du 13/11) :
 * format choisi, questions, structure… ou photos posées. Un sujet seulement
 * tapé n'est pas rangé ; un contenu généré a sa propre sauvegarde.
 */
export function isCreerDraftStage(o: {
  step: string | null | undefined;
  hasResult: boolean;
  hasEditContent: boolean;
  photoCount: number;
  subject: string;
  generating?: boolean;
}): boolean {
  if (o.hasResult || o.hasEditContent || o.generating) return false;
  if (o.step === "result" || o.step === "edit") return false;
  const started = !!o.step && !NOT_DRAFT_STEPS.has(o.step);
  if (!started && o.photoCount === 0) return false;
  return !!o.subject.trim() || o.photoCount > 0;
}

/** Signature comparable : même brouillon = même signature, quel que soit l'ordre des clés. */
export function draftSignature(snapshot: { flow: Record<string, unknown>; photos: { userPhotoId?: string; name?: string; edited?: boolean }[] }): string {
  // Photos : la copie de l'onglet n'a pas leur lien en ligne, seulement leur nom et leur origine.
  return contentKey({ flow: snapshot.flow, photos: snapshot.photos.map((p) => [p.userPhotoId || "", p.name || "", !!p.edited]) });
}

/** Le brouillon rangé dans une fiche, s'il y en a un. */
export function creerDraftOf(contentData: unknown): CreerDraftSnapshot | null {
  let data: any = contentData;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return null; }
  }
  const draft = data && typeof data === "object" && !Array.isArray(data) ? data[CREER_DRAFT_KEY] : null;
  if (!draft || typeof draft !== "object" || draft.version !== 1 || !draft.flow || typeof draft.flow !== "object") return null;
  return { version: 1, flow: draft.flow, photos: Array.isArray(draft.photos) ? draft.photos : [] };
}

const STEP_TEXT: Record<string, string> = {
  idea: "photos choisies",
  format: "choix du format",
  questions: "questions de cadrage",
  structure_review: "structure",
  hook_selection: "choix de l'accroche",
  user_slides: "tes slides",
  inspiration_proposals: "propositions",
};

/** Texte montré sur la carte de Mes idées (colonne preview, champ `resume`). */
export function draftPreviewText(flow: Record<string, any>): string {
  const step = STEP_TEXT[String(flow.step || "")] || "en préparation";
  return `Brouillon commencé (${step}) : reprends-le là où tu t'étais arrêtée.`;
}

/**
 * Une fiche peut recevoir le brouillon si elle est vide, si c'est déjà un
 * brouillon de /creer, ou une actu à commenter (point de départ). Jamais une
 * fiche qui porte un contenu écrit : on ne l'écrase pas.
 */
export function ideaAcceptsDraft(contentData: unknown, format?: string | null): boolean {
  let data: any = contentData;
  if (typeof data === "string") {
    if (!data.trim()) return true;
    try { data = JSON.parse(data); } catch { return false; }
  }
  if (data == null) return true;
  if (typeof data !== "object" || Array.isArray(data)) return false;
  if (format === "actu") return true;
  return Object.keys(data).every((key) => key === CREER_DRAFT_KEY || key === "resume");
}
