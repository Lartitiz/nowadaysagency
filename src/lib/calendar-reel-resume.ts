// Reprise d'un reel enregistré au calendrier : `story_sequence_detail` garde le
// reel entier (script, légende, `montage_project`), voir build-calendar-content.ts.
// On le rouvre tel quel dans /creer, avec la vidéo montée de `media_urls` si elle
// existe. `_reel_resume.source` lie cette vidéo au script : use-reel-artifact.ts
// ne la rattache que si le script n'a pas changé.
import { supabase } from "@/integrations/supabase/client";
import { isDurableReelUrl, reelSourceKey } from "@/lib/reel-publication";
import { resumeIdea } from "@/lib/resume-idea";

export function resumeCalendarReel(detail: any, mediaUrls?: unknown): { format: "reel"; raw: any } | null {
  if (!detail || typeof detail !== "object" || detail.type !== "reel" || detail._crosspost) return null;
  const sections = Array.isArray(detail.sections) ? detail.sections : Array.isArray(detail.script) ? detail.script : null;
  if (!sections?.length) return null;
  const { type: _type, _reel_resume: _old, ...rest } = JSON.parse(JSON.stringify(detail));
  const raw: any = { ...rest, sections };
  const mp4 = Array.isArray(mediaUrls) ? mediaUrls.find(isDurableReelUrl) : undefined;
  if (mp4) raw._reel_resume = { mp4, source: reelSourceKey(raw) };
  return { format: "reel", raw };
}

/**
 * Reel mis au calendrier depuis Créer : sa fiche de Mes idées (enregistrée
 * toute seule depuis le 13/11/2026) est reliée au contenu du calendrier. On la
 * reprend, au lieu d'en créer une nouvelle à chaque ouverture. La vidéo montée
 * du calendrier revient si le script n'a pas changé depuis.
 */
export async function findLinkedReelIdea(calendarPostId: string | null | undefined, mediaUrls?: unknown) {
  if (!calendarPostId) return null;
  try {
    const { data, error } = await supabase.from("saved_ideas")
      .select("id,format,canal,content_data,content_draft,updated_at")
      .eq("calendar_post_id", calendarPostId)
      .eq("format", "reel")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const idea = data[0] as Parameters<typeof resumeIdea>[0] & { id: string };
    const resumed = resumeIdea(idea);
    if (resumed?.format !== "reel" || !Array.isArray(resumed.raw?.sections ?? resumed.raw?.script)) return null;
    const mp4 = Array.isArray(mediaUrls) ? mediaUrls.find(isDurableReelUrl) : undefined;
    const raw = { ...resumed.raw };
    if (mp4) raw._reel_resume = { mp4, source: reelSourceKey(raw) };
    return { ideaId: idea.id, resumeIdea: { format: "reel" as const, raw } };
  } catch {
    return null;
  }
}
