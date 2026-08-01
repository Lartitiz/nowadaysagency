/**
 * use-story-export — exports d'une séquence stories reconstruits depuis son
 * JSON persisté (story_sequence_detail.stories ou contenu d'une idée).
 *
 * Le renderer des stories est déterministe (story-visual.ts) : les visuels
 * PNG / PPTX / Canva se rebâtissent à l'identique hors de l'atelier
 * (calendrier, viewer « Séquence complète », idées sauvegardées). Les fonds
 * photo persistés sont résolus ici : photo_url (stock Pexels ou data:) est
 * stable, photo_id (bibliothèque) redonne une URL signée à chaque affichage.
 *
 * L'atelier (StoryResult) garde son propre circuit : il gère en plus les
 * photos fraîchement uploadées et l'édition en direct.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBrandCharter } from "@/hooks/use-branding";
import { buildStoryFrameHtml, type StoryFrameBranding } from "@/lib/story-visual";
import { exportStoryPng } from "@/lib/export-carousel-png";
import { exportStoryPptx } from "@/lib/export-story-pptx";
import { useOpenInCanva } from "@/hooks/use-open-in-canva";
import { resolveLibraryPhotoUrls, urlToDataUrl } from "@/lib/story-photos";

export interface StoryExportApi {
  /** true si au moins une story a un visuel exportable. */
  hasFrames: boolean;
  frameCount: number;
  exportPng: () => void;
  exportPptx: () => void;
  openInCanva: () => void;
  exporting: boolean;
  exportingPptx: boolean;
  openingCanva: boolean;
}

export function useStoryExport(
  stories: any[] | null | undefined,
  fileName?: string | null,
): StoryExportApi {
  const list = useMemo(() => (Array.isArray(stories) ? stories : []), [stories]);
  const { data: charter } = useBrandCharter();
  const branding: StoryFrameBranding | null = charter
    ? {
        color_primary: charter.color_primary,
        color_secondary: charter.color_secondary,
        color_background: charter.color_background,
        color_text: charter.color_text,
      }
    : null;

  // photo_id bibliothèque → URL signée, résolue à l'affichage (jamais persistée).
  const [libraryUrls, setLibraryUrls] = useState<Map<string, string>>(new Map());
  const idsSignature = useMemo(
    () =>
      list
        .map((s: any) => s?.visual?.photo_id)
        .filter(Boolean)
        .sort()
        .join(","),
    [list],
  );
  useEffect(() => {
    if (!idsSignature) {
      setLibraryUrls(new Map());
      return;
    }
    let cancelled = false;
    resolveLibraryPhotoUrls(list).then((map) => {
      if (!cancelled) setLibraryUrls(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSignature]);

  const getPhotoUrl = useCallback(
    (story: any): string | null => {
      const v = story?.visual;
      if (v?.photo_url) return v.photo_url;
      if (v?.photo_id) return libraryUrls.get(v.photo_id) ?? null;
      return null;
    },
    [libraryUrls],
  );

  const frameCount = useMemo(
    () => list.filter((s: any) => buildStoryFrameHtml(s, branding, { preview: false })).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list, charter],
  );

  // Photos converties en data URL à l'export : html2canvas et le PPTX ne
  // doivent jamais dépendre d'une URL signée expirable ni du CORS.
  const buildExportFrames = useCallback(async () => {
    const frames: { story_number: number; html: string; photoUrl?: string | null }[] = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const rawUrl = getPhotoUrl(s);
      const exportUrl = rawUrl ? await urlToDataUrl(rawUrl) : null;
      const html = buildStoryFrameHtml(s, branding, { photoUrl: exportUrl, preview: false });
      if (html) frames.push({ story_number: i + 1, html, photoUrl: exportUrl });
    }
    return frames;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, charter, getPhotoUrl]);

  const [exporting, setExporting] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const { openInCanva: openCanva, openingCanva } = useOpenInCanva();
  const name = fileName || "sequence";

  const exportPng = useCallback(async () => {
    setExporting(true);
    try {
      await exportStoryPng(await buildExportFrames(), name);
    } finally {
      setExporting(false);
    }
  }, [buildExportFrames, name]);

  const exportPptx = useCallback(async () => {
    setExportingPptx(true);
    try {
      await exportStoryPptx(await buildExportFrames(), { fileName: name });
    } finally {
      setExportingPptx(false);
    }
  }, [buildExportFrames, name]);

  const openInCanva = useCallback(() => {
    openCanva(
      async () => (await exportStoryPptx(await buildExportFrames(), { returnBlob: true })) as Blob,
      `Stories — ${name}`,
      { etapes: frameCount },
    );
  }, [openCanva, buildExportFrames, name, frameCount]);

  return {
    hasFrames: frameCount > 0,
    frameCount,
    exportPng,
    exportPptx,
    openInCanva,
    exporting,
    exportingPptx,
    openingCanva,
  };
}
