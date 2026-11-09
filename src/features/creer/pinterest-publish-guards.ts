// Règles PURES de la publication d'épingles depuis /creer (aucune dépendance React).
import { PINTEREST_PUBLISH_FOR_ALL } from "@/config/feature-flags";
import { pinterestCurrentText } from "@/lib/pinterest-current-text";
import { extractInstagramCaption } from "@/features/creer/publish-guards";
import type { PinterestBoard } from "@/lib/pinterest-publish";

type RawResult = Record<string, any> | null | undefined;

export const REASON_EPINGLE_IMAGE_MANQUANTE =
  "Ajoute d'abord une image à ton épingle pour pouvoir la publier sur Pinterest.";
export const REASON_EPINGLE_TABLEAU = "Choisis le tableau Pinterest où ranger ton épingle.";
export const REASON_EPINGLE_TEXTE = "Génère ton épingle pour pouvoir la publier.";

/**
 * La publication directe est-elle proposée ? Tant que l'app Pinterest est en accès
 * d'essai (« Trial » : une épingle publiée n'est visible que par son autrice), seules
 * les admins la voient, pour la tester et filmer la vidéo de validation.
 */
export function canPublishToPinterest(args: {
  selectedFormat: string | null | undefined;
  isAdmin: boolean;
  forAll?: boolean;
}): boolean {
  const forAll = args.forAll ?? PINTEREST_PUBLISH_FOR_ALL;
  if (!args.selectedFormat?.startsWith("pinterest")) return false;
  return forAll || args.isAdmin;
}

/** Titre (100 car. max côté Pinterest) et description (500) de l'épingle. */
export function extractPinterestText(raw: RawResult): { title: string; description: string } {
  const { title, description } = pinterestCurrentText(raw as any);
  if (title.trim() || description.trim()) return { title: title.trim(), description: description.trim() };
  // Épingle texte : le générateur commun rend un texte libre, sans champs titre/description.
  return { title: "", description: extractInstagramCaption(raw).trim() };
}

/** Lien de destination de l'épingle (http/https seulement, sinon Pinterest refuse). */
export function pinterestDestinationLink(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && /^https?:\/\/\S+$/i.test(c.trim())) return c.trim();
  }
  return undefined;
}

/** Tableau pré-choisi : celui nommé à l'étape format, sinon le seul tableau du compte. */
export function defaultPinterestBoardId(boards: PinterestBoard[], wantedName?: string | null): string | null {
  const wanted = wantedName?.trim().toLowerCase();
  if (wanted) {
    const match = boards.find((b) => b.name.trim().toLowerCase() === wanted);
    if (match) return match.id;
  }
  return boards.length === 1 ? boards[0].id : null;
}

/** Raison qui bloque « Maintenant » sur Pinterest, ou null si publiable. */
export function pinterestPublishDisabledReason(args: {
  raw: RawResult;
  hasPinHtml: boolean;
  publishableImageUrl: string | null;
  boardId: string | null;
  /** Faux tant que le compte n'est pas connecté : la fenêtre propose d'abord de le connecter. */
  checkBoard?: boolean;
}): string | null {
  const { title, description } = extractPinterestText(args.raw);
  if (!title && !description && !args.hasPinHtml) return REASON_EPINGLE_TEXTE;
  if (!args.hasPinHtml && !args.publishableImageUrl) return REASON_EPINGLE_IMAGE_MANQUANTE;
  if (args.checkBoard !== false && !args.boardId) return REASON_EPINGLE_TABLEAU;
  return null;
}
