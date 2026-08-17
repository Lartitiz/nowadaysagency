import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { handleQuotaError } from "@/lib/quota-error-handler";

interface UseLinkedInCarouselCaptionParams {
  result: any;
  setResult: (updater: (prev: any) => any) => void;
  generating: boolean;
  isLinkedInCarousel: boolean;
  carouselSubMode: string | null;
  ideaText: string;
  editorialAngle: string | null;
  objective: string | null;
  workspaceId: string;
  session: { user?: { id?: string } } | null;
}

/**
 * Légende LinkedIn dédiée pour les carrousels mix/photo/pure_photo.
 *
 * Le prompt carousel-ai (mix/photo) laisse volontairement la légende vide pour
 * qu'elle soit générée par ce prompt LinkedIn dédié (anti-broetry, hashtags pro).
 * Se déclenche automatiquement après une génération de carrousel dont la légende
 * semble vide/bâclée, ou manuellement via `regenerateCaption`.
 *
 * Retourne `{ captionLoading, generateLinkedInCarouselCaption, regenerateCaption }`.
 */
export function useLinkedInCarouselCaption({
  result,
  setResult,
  generating,
  isLinkedInCarousel,
  carouselSubMode,
  ideaText,
  editorialAngle,
  objective,
  workspaceId,
  session,
}: UseLinkedInCarouselCaptionParams) {
  const [captionLoading, setCaptionLoading] = useState(false);
  const captionAutoTriggeredRef = useRef<any>(null);

  const generateLinkedInCarouselCaption = useCallback(async () => {
    const r: any = (result as any)?.raw;
    if (!r) return;
    if (!isLinkedInCarousel) return;
    if (carouselSubMode !== "mix" && carouselSubMode !== "photo" && carouselSubMode !== "pure_photo") return;

    // Construire un résumé compact des slides (overlay_text + title + body), max ~1500 char
    const slidesArr: any[] = Array.isArray(r.slides) ? r.slides : [];
    const slidesSummary = slidesArr
      .map((s: any, i: number) => {
        const parts = [s.overlay_text, s.title, s.body].filter((x: any) => typeof x === "string" && x.trim());
        return `Slide ${s.slide_number ?? i + 1}: ${parts.join(" ; ")}`;
      })
      .join("\n")
      .slice(0, 1500);

    setCaptionLoading(true);
    try {
      const { data, error: fnError } = await invokeWithTimeout("linkedin-ai", {
        body: {
          action: "caption-for-carousel",
          subject: ideaText,
          chosen_angle: typeof r.chosen_angle === "string"
            ? r.chosen_angle
            : (r.chosen_angle?.title || r.chosen_angle?.angle || (r.chosen_angle ? JSON.stringify(r.chosen_angle) : null)),
          slides_summary: slidesSummary,
          editorial_angle: editorialAngle || null,
          objective: objective || null,
          workspace_id: workspaceId !== session?.user?.id ? workspaceId : undefined,
        },
      // 110s : génération 60s + passe de correction 30s côté edge, + marge.
      }, 110000);
      if (fnError) throw new Error(fnError.message || "Erreur génération légende");
      if (data?.error) {
        if (handleQuotaError(data)) return;
        throw new Error(data.message || data.error);
      }
      const rawContent = data?.content ?? data;
      let parsed: any = rawContent;
      if (typeof rawContent === "string") {
        try {
          let cleaned = rawContent.trim();
          if (cleaned.startsWith("```")) {
            cleaned = cleaned.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?\s*```\s*$/, "");
          }
          parsed = JSON.parse(cleaned);
        } catch {
          const m = rawContent.match(/\{[\s\S]*\}/);
          if (m) {
            try { parsed = JSON.parse(m[0]); } catch { parsed = null; }
          }
        }
      }
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Légende illisible");
      }

      // Merge dans result.raw.caption
      setResult((prev: any) => {
        if (!prev) return prev;
        const nextRaw = { ...(prev.raw || {}) };
        nextRaw.caption = {
          ...(nextRaw.caption || {}),
          hook: parsed.hook || nextRaw.caption?.hook || "",
          body: parsed.body || "",
          cta: parsed.cta || "",
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        };
        return { ...prev, raw: nextRaw };
      });
    } catch (e: any) {
      console.error("[linkedin-caption-for-carousel] failed:", e);
      toast.error(e?.message || "Impossible de générer la légende LinkedIn");
    } finally {
      setCaptionLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, isLinkedInCarousel, carouselSubMode, ideaText, editorialAngle, objective, workspaceId, session?.user?.id]);

  // Auto-trigger après une génération de carrousel LinkedIn mix/photo si la légende est vide
  useEffect(() => {
    if (!isLinkedInCarousel) return;
    if (carouselSubMode !== "mix" && carouselSubMode !== "photo" && carouselSubMode !== "pure_photo") return;
    if (generating || captionLoading) return;
    const r: any = (result as any)?.raw;
    if (!r?.slides || !Array.isArray(r.slides) || r.slides.length === 0) return;
    if (captionAutoTriggeredRef.current === r) return;
    const c = r.caption || {};
    const bodyLen = typeof c.body === "string" ? c.body.trim().length : 0;
    const isEmpty = bodyLen < 200; // seuil — body doit faire 800-1500 ; <200 = bâclée/vide
    if (!isEmpty) return;
    captionAutoTriggeredRef.current = r;
    generateLinkedInCarouselCaption();
  }, [result, isLinkedInCarousel, carouselSubMode, generating, captionLoading, generateLinkedInCarouselCaption]);

  const regenerateCaption = useCallback(() => {
    captionAutoTriggeredRef.current = null;
    generateLinkedInCarouselCaption();
  }, [generateLinkedInCarouselCaption]);

  return { captionLoading, generateLinkedInCarouselCaption, regenerateCaption };
}
