// Une fiche de Mes idées n'est jamais réécrite par un contenu d'un autre format
// (13/11/2026). Un reel s'était enregistré dans la fiche d'un carrousel après
// « Passer à un autre format → Le remplacer » : les slides avaient disparu.
// La sauvegarde continue suit cette règle depuis #1933 (use-carousel-autosave.ts).
// Ce module la donne aux deux enregistrements à la main : « Garder dans mes
// idées » (SaveToIdeasDialog) et la fenêtre « Tu as déjà un contenu en cours »
// (DraftConflictDialog). Autre format : nouvelle fiche, l'ancienne reste intacte.
import { supabase } from "@/integrations/supabase/client";
import { ideaAcceptsDraft } from "@/features/creer/creer-draft-idea";

const FAMILIES: Record<string, string> = {
  carousel: "carousel", carrousel: "carousel", post_carrousel: "carousel", carousel_linkedin: "carousel", linkedin_carousel: "carousel",
  reel: "reel", reels: "reel",
  story: "story", stories: "story", story_serie: "story",
  post: "post", post_instagram: "post", instagram_post: "post", caption_photo: "post",
  linkedin: "linkedin", post_linkedin: "linkedin", linkedin_post: "linkedin",
  newsletter: "newsletter", newsletter_standard: "newsletter",
  pinterest: "pinterest", pinterest_visual: "pinterest", pinterest_photo: "pinterest", pinterest_inspiration: "pinterest",
};

/** Famille d'un format de fiche (« story » et « story_serie » sont le même format). */
export function ideaFormatFamily(format: string | null | undefined): string {
  const f = String(format || "").trim().toLowerCase();
  return FAMILIES[f] || f;
}

/**
 * La fiche peut-elle recevoir ce contenu ? Oui si elle a le même format, si
 * son format est inconnu, ou si elle ne porte encore aucun contenu écrit (idée
 * notée, brouillon de /creer, actu : un point de départ).
 */
export function ideaTakesFormat(stored: { format?: string | null; content_data?: unknown } | null | undefined, nextFormat: string | null | undefined): boolean {
  if (!stored) return true;
  const before = ideaFormatFamily(stored.format);
  const after = ideaFormatFamily(nextFormat);
  if (!before || !after || before === after) return true;
  return ideaAcceptsDraft(stored.content_data ?? null, stored.format);
}

/** Lit la fiche et dit si elle peut recevoir ce contenu. Lecture impossible : on ne bloque pas. */
export async function storedIdeaTakesFormat(ideaId: string, nextFormat: string | null | undefined): Promise<boolean> {
  const { data, error } = await supabase.from("saved_ideas").select("format, content_data").eq("id", ideaId).maybeSingle();
  if (error || !data) return true;
  return ideaTakesFormat(data as { format?: string | null; content_data?: unknown }, nextFormat);
}
