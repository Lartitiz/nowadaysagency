// Visuels 9:16 d'une série de stories, reconstruits du JSON persisté avec la
// charte et les photos de la bibliothèque, comme dans l'atelier. Sorti de
// CalendarPostPreview (13/11/2026) pour que la fiche du calendrier montre les
// mêmes vignettes que l'aperçu.
import { useEffect, useMemo, useState } from "react";
import { useBrandCharter } from "@/hooks/use-branding";
import { buildStoryFrameHtml, type StoryFrameBranding } from "@/lib/story-visual";
import { resolveLibraryPhotoUrls } from "@/lib/story-photos";

export function useStoryFrames(storiesData: any[] | null | undefined, enabled: boolean): (string | null)[] {
  const { data: charterData } = useBrandCharter();
  const active = enabled && Array.isArray(storiesData) && storiesData.length > 0;
  const storyBranding: StoryFrameBranding | null = charterData
    ? {
        color_primary: (charterData as any).color_primary,
        color_secondary: (charterData as any).color_secondary,
        color_background: (charterData as any).color_background,
        color_text: (charterData as any).color_text,
        story_assemblage: (charterData as any).story_assemblage ?? null,
        story_pill_color: (charterData as any).story_pill_color ?? null,
        story_corners: (charterData as any).story_corners ?? null,
        story_align: (charterData as any).story_align ?? null,
      }
    : null;
  const photoIdsSignature = useMemo(
    () => (active ? storiesData : []).map((s: any) => s?.visual?.photo_id).filter(Boolean).sort().join(","),
    [active, storiesData],
  );
  const [libraryUrls, setLibraryUrls] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!photoIdsSignature) {
      setLibraryUrls(new Map());
      return;
    }
    let cancelled = false;
    resolveLibraryPhotoUrls(storiesData || [])
      .then((map) => { if (!cancelled) setLibraryUrls(map); })
      .catch(() => { if (!cancelled) setLibraryUrls(new Map()); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoIdsSignature]);
  return useMemo(
    () =>
      active
        ? storiesData.map((s: any) => {
            const v = s?.visual;
            const photoUrl = v?.photo_url || (v?.photo_id ? libraryUrls.get(v.photo_id) ?? null : null);
            return buildStoryFrameHtml(s, storyBranding, { photoUrl, preview: true });
          })
        : [],
    // storyBranding est recalculé à chaque rendu : on suit la charte elle-même.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, storiesData, charterData, libraryUrls],
  );
}
