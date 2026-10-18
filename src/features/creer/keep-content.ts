// Chantier J (18/10/2026) : on ne perd plus un contenu créé sans l'avoir choisi.
// Avant qu'un changement de format, de sujet ou « Créer le carrousel » d'un
// post LinkedIn n'efface le résultat, la page demande : le garder dans Mes
// idées, le remplacer, ou revenir au contenu (KeepContentDialog.tsx).
import { supabase } from "@/integrations/supabase/client";
import { cleanCarouselSnapshot } from "@/lib/carousel-autosave";
import { externalizeCarouselMedia } from "@/lib/carousel-media";
import { deriveCanalFromState, mapFormatToContentType } from "@/features/creer/format-mappers";

export type KeepContentReason = "format" | "subject" | "linkedin_carousel";

/** Le contenu affiché est-il déjà rangé tel quel dans Mes idées ? */
export function contentAlreadyKept(o: {
  raw: any;
  editingIdeaId: string | null;
  savedSignature?: string | null;
  currentSignature: string;
}): boolean {
  if (!o.raw) return true;
  // Carrousel de l'éditeur : enregistré tout seul dans sa fiche.
  if (o.editingIdeaId && o.raw._carousel_cloud) return true;
  return !!o.savedSignature && o.savedSignature === o.currentSignature;
}

export interface ContentCopySource {
  userId?: string;
  workspaceId: string;
  subject: string;
  format: string | null;
  isLinkedInCarousel: boolean;
  objective?: string | null;
  raw: any;
  visualSlides?: { slide_number: number; html: string }[];
  /** Texte en cours dans « Modifier », pas encore validé. */
  draftText?: string;
}

const EMOJI: Record<string, string> = { newsletter: "📧", story: "📱", reel: "🎬", pinterest: "📌" };

/** Range une copie du contenu affiché dans une nouvelle fiche de Mes idées. */
export async function saveContentCopyToIdeas(s: ContentCopySource): Promise<string> {
  if (!s.userId || !s.raw) throw new Error("copie impossible");
  const isCarousel = s.format === "carousel";
  const base = isCarousel ? cleanCarouselSnapshot(s.raw) : { ...s.raw };
  if (s.visualSlides?.length) base.visual_html = s.visualSlides;
  if (!isCarousel && s.draftText?.trim() && s.draftText !== s.raw.edited_text) base.edited_text = s.draftText;
  // Nouveau document : l'autosave du carrousel en cours ne doit jamais écrire dans la copie.
  if (isCarousel) base._carousel_document_id = crypto.randomUUID();
  const content = await externalizeCarouselMedia({ ...base, _ai_generated: true }, s.userId);
  const contentType = mapFormatToContentType(s.format);
  const title = s.subject.trim() || (isCarousel ? "Mon carrousel" : "Mon contenu");
  const { data, error } = await supabase.from("saved_ideas").insert({
    user_id: s.userId,
    workspace_id: s.workspaceId !== s.userId ? s.workspaceId : null,
    titre: isCarousel ? title : `${EMOJI[contentType] ?? "📸"} ${title}`,
    angle: isCarousel ? "Carrousel" : contentType,
    format: isCarousel ? "carousel" : contentType === "story" ? "story_serie" : s.format || "post",
    canal: deriveCanalFromState({ selectedFormat: s.format, isLinkedInCarousel: s.isLinkedInCarousel }) || "instagram",
    objectif: s.objective || null,
    type: "draft",
    status: "to_explore",
    source_module: "creer",
    content_data: content,
    ...(isCarousel ? {} : { content_draft: JSON.stringify(content) }),
  } as any).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}
