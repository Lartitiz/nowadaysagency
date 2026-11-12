// Reprise d'un reel enregistré au calendrier : `story_sequence_detail` garde le
// reel entier (script, légende, `montage_project`), voir build-calendar-content.ts.
// On le rouvre tel quel dans /creer, avec la vidéo montée de `media_urls` si elle
// existe. `_reel_resume.source` lie cette vidéo au script : use-reel-artifact.ts
// ne la rattache que si le script n'a pas changé.
import { isDurableReelUrl, reelSourceKey } from "@/lib/reel-publication";

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
