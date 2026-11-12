// « ✏️ Modifier les stories » depuis le calendrier (12/11/2026) : avant, une
// séquence mise au calendrier ne se rouvrait qu'en lecture (« Voir la séquence »).
// On reprend d'abord la fiche de Mes idées reliée à ce contenu (la sauvegarde
// continue y écrit la dernière version), sinon la copie du calendrier
// (`story_sequence_detail`, voir build-calendar-content.ts), sans rien régénérer.
import { supabase } from "@/integrations/supabase/client";
import { resumeIdea } from "@/lib/resume-idea";

const hasStories = (value: any) => Array.isArray(value?.stories) && value.stories.length > 0;

export function isCalendarStories(detail: any): boolean {
  return !!detail && typeof detail === "object" && detail.type === "stories" && !detail._crosspost && hasStories(detail);
}

export function resumeCalendarStories(detail: any): { format: "story"; raw: any } | null {
  if (!isCalendarStories(detail)) return null;
  const { type: _type, visual_urls: _urls, visual_html: _html, ...raw } = JSON.parse(JSON.stringify(detail));
  return { format: "story", raw };
}

export async function findLinkedStoriesIdea(calendarPostId: string | null | undefined) {
  if (!calendarPostId) return null;
  try {
    const { data, error } = await supabase.from("saved_ideas")
      .select("id,format,canal,content_data,content_draft,updated_at")
      .eq("calendar_post_id", calendarPostId)
      .in("format", ["story_serie", "story"])
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const idea: any = data[0];
    const resumed = resumeIdea(idea);
    if (resumed?.format !== "story" || !hasStories(resumed.raw)) return null;
    return { ideaId: idea.id as string, resumeIdea: resumed };
  } catch {
    return null;
  }
}
