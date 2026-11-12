// Passer d'un contenu à l'autre comme sur Canva (demande de Laetitia du 12/11/2026).
// Un carrousel ou des stories se sauvegardent tout seuls dans Mes idées
// (use-carousel-autosave.ts). Quand le contenu en cours est déjà enregistré à
// l'identique, la fenêtre « Tu as déjà un contenu en cours » ne protège rien :
// on ouvre directement le contenu choisi. Au moindre doute (pas encore
// enregistré, retouche pas encore partie, lecture impossible), la fenêtre reste.
import { cleanCarouselSnapshot } from "@/lib/carousel-autosave";
import { contentKey } from "@/features/creer/draft-conflict";

type DraftLike = {
  step?: string;
  editingIdeaId?: string | null;
  result?: { raw?: any } | null;
  visualSlides?: { slide_number: number; html: string }[];
  editContent?: string;
};

/** Contenu qui a sa sauvegarde continue dans Mes idées (carrousel ou stories). */
export function draftHasCloudSave(draft: DraftLike | null | undefined): boolean {
  const raw = draft?.result?.raw;
  return !!draft && draft.step === "result" && typeof draft.editingIdeaId === "string" && !!draft.editingIdeaId
    && !!raw && typeof raw === "object" && !!raw._carousel_cloud
    && !!(raw.carousel_editor_version || raw.carousel_studio_version || raw.story_editor_version);
}

// Les grosses photos partent dans le stockage à l'enregistrement (carousel-media.ts) :
// la fiche garde un lien nommé d'après le contenu de la photo, la copie de
// l'onglet garde la photo elle-même. Les deux deviennent « media:<empreinte> ».
const DATA_URL = /data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/g;
const MEDIA_URL = /https:\/\/[^"'\s()&<>]+\/storage\/v1\/object\/public\/calendar-visuals\/[^"'\s()&<>]+\/carousel-media\/([0-9a-f]{64})\.(?:png|jpg|webp|gif)/g;
const MIN_STORED_LENGTH = 20_000;

async function sha256Base64(base64: string): Promise<string> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function normalizeMedia(text: string): Promise<string> {
  const hashes = new Map<string, string>();
  for (const match of text.matchAll(DATA_URL)) {
    if (match[0].length < MIN_STORED_LENGTH || hashes.has(match[0])) continue;
    hashes.set(match[0], `media:${await sha256Base64(match[0].slice(match[0].indexOf(",") + 1))}`);
  }
  return text
    .replace(DATA_URL, (m) => hashes.get(m) ?? m)
    .replace(MEDIA_URL, (_m, hash) => `media:${hash}`);
}

function comparable(raw: any) {
  const { visual_html: _html, ...rest } = cleanCarouselSnapshot(raw || {});
  return rest;
}

/**
 * Vrai seulement si la fiche de Mes idées contient exactement le contenu en
 * cours (texte des slides et, quand l'onglet les a, les visuels).
 */
export async function draftMatchesSavedIdea(draft: DraftLike, savedRaw: any): Promise<boolean> {
  if (!draftHasCloudSave(draft) || !savedRaw || typeof savedRaw !== "object") return false;
  if (draft.editContent && draft.editContent.trim()) return false;
  const local = draft.result!.raw;
  const [a, b] = await Promise.all([
    normalizeMedia(contentKey(comparable(local))),
    normalizeMedia(contentKey(comparable(savedRaw))),
  ]);
  if (a !== b) return false;
  // Visuels gardés dans l'onglet : ils doivent être ceux de la fiche.
  const localVisuals = draft.visualSlides?.length ? draft.visualSlides : Array.isArray(local.visual_html) ? local.visual_html : [];
  if (!localVisuals.length) return true;
  if (!Array.isArray(savedRaw.visual_html)) return false;
  const pick = (slides: any[]) => slides.map((s) => ({ n: s?.slide_number, html: s?.html }));
  const [va, vb] = await Promise.all([
    normalizeMedia(contentKey(pick(localVisuals))),
    normalizeMedia(contentKey(pick(savedRaw.visual_html))),
  ]);
  return va === vb;
}
