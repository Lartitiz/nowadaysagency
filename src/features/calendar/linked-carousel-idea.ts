// « ✏️ Modifier le carrousel » depuis le calendrier (chantier Y, 18/10/2026) :
// rouvrir la fiche de Mes idées déjà reliée à ce contenu, au lieu d'en créer
// une nouvelle à chaque ouverture. La fiche porte la dernière version retouchée
// (la sauvegarde continue y écrit) ; sans fiche reliée, on garde la copie du calendrier.
import { supabase } from "@/integrations/supabase/client";
import { resumeIdea } from "@/lib/resume-idea";

export async function findLinkedCarouselIdea(calendarPostId: string | null | undefined) {
  if (!calendarPostId) return null;
  try {
    const { data, error } = await supabase.from("saved_ideas")
      .select("id,format,canal,content_data,content_draft,updated_at")
      .eq("calendar_post_id", calendarPostId)
      .eq("format", "carousel")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const idea: any = data[0];
    const resumed = resumeIdea(idea);
    if (resumed?.format !== "carousel" || !Array.isArray(resumed.raw?.visual_html) || !resumed.raw.visual_html.length) return null;
    return { ideaId: idea.id as string, resumeIdea: resumed };
  } catch {
    return null;
  }
}
