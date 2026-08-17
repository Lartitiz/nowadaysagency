import { useState } from "react";
import { toast } from "sonner";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { composeOverlayText } from "@/lib/user-slides-parse";
import { savePhotos } from "@/hooks/use-flow-persistence";
import type { UserSlideDraft } from "@/components/creer/UserSlidesStep";
import type { PhotoItem } from "@/components/creer/PhotoUploadZone";

interface UseUserSlidesGenerateParams {
  generating: boolean;
  visualLoading: boolean;
  workspaceId: string;
  session: { user?: { id?: string } } | null;
  setUploadedPhotos: (photos: PhotoItem[]) => void;
  setGeneratedWithPhotos: (photos: PhotoItem[]) => void;
  setSavedId: (id: string | null) => void;
  setVisualSlides: (slides: any) => void;
  setCarouselColors: (colors: any) => void;
  setStep: (step: any) => void;
  setResult: (result: any) => void;
}

/**
 * Flux "Mes slides" : l'utilisatrice écrit ses slides à la main, l'IA se
 * limite à leur assigner un gabarit (fail-open — erreur/timeout = slides
 * inchangées). Contourne entièrement doGenerate/generate() et reconstruit
 * un `result` carrousel à la main.
 *
 * Retourne `{ userSlidesDraft, userSlidesBuilding, handleUserSlidesGenerate }`.
 */
export function useUserSlidesGenerate({
  generating,
  visualLoading,
  workspaceId,
  session,
  setUploadedPhotos,
  setGeneratedWithPhotos,
  setSavedId,
  setVisualSlides,
  setCarouselColors,
  setStep,
  setResult,
}: UseUserSlidesGenerateParams) {
  const [userSlidesDraft, setUserSlidesDraft] = useState<{ slides: UserSlideDraft[]; caption: string } | null>(null);
  const [userSlidesBuilding, setUserSlidesBuilding] = useState(false);

  const handleUserSlidesGenerate = async (payload: { slides: UserSlideDraft[]; photos: PhotoItem[]; caption: string }) => {
    if (userSlidesBuilding || generating || visualLoading) return;
    const { slides: drafts, photos, caption } = payload;
    if (drafts.length < 2) {
      toast.error("Il faut au moins 2 slides avec du texte.");
      return;
    }
    setUserSlidesDraft({ slides: drafts, caption });

    // Photos : mêmes states que les flux photo/mix existants (rendu, exports,
    // sauvegardes et réhydratation au reload passent tous par là).
    setUploadedPhotos(photos);
    setGeneratedWithPhotos(photos);
    if (photos.length > 0) savePhotos(photos);

    const total = drafts.length;
    const roleFor = (i: number) => (i === 0 ? "hook" : i === total - 1 ? "cta" : "point");
    const baseSlides = drafts.map((d, i) => {
      const hasPhoto = !!d.photoIndex && d.photoIndex >= 1 && d.photoIndex <= photos.length;
      if (hasPhoto) {
        return {
          slide_number: i + 1,
          role: roleFor(i),
          slide_type: "photo_full" as const,
          // Titre optionnel PRÉFIXÉ dans l'overlay (seul champ rendu par TOUS
          // les gabarits — un kicker serait perdu sur « profonde », le défaut).
          overlay_text: composeOverlayText(d.title, d.body),
          overlay_position: "bottom_center",
          photo_index: d.photoIndex as number,
        };
      }
      return {
        slide_number: i + 1,
        role: roleFor(i),
        slide_type: "text_only" as const,
        // Pas de titre dérivé du texte : dupliquer la 1re phrase l'afficherait
        // deux fois. Titre = uniquement celui fourni ; body = texte verbatim.
        title: d.title.trim(),
        body: d.body,
      };
    });

    const photoSlideCount = baseSlides.filter((s) => s.slide_type === "photo_full").length;
    const carouselType = photoSlideCount === 0 ? "text" : photoSlideCount === total ? "photo" : "mix";

    // Reset de l'état post-génération (mêmes resets que doGenerate).
    // NB : on reste sur l'étape de saisie pendant la passe gabarits (spinner
    // sur le bouton) — passer sur "result" sans result afficherait l'écran
    // « Session expirée ».
    setSavedId(null);
    setVisualSlides([]);
    setCarouselColors(null);

    // ── Passe gabarits (fail-open) : enrichit les slides photo (template,
    // big_number, points…) SANS toucher au texte. Erreur / timeout / edge pas
    // encore redéployée → on continue avec les slides telles quelles (le rendu
    // dérive un gabarit sûr via resolvePhotoTemplate).
    let finalSlides: any[] = baseSlides;
    const photoFull = baseSlides.filter((s) => s.slide_type === "photo_full");
    if (photoFull.length >= 2) {
      setUserSlidesBuilding(true);
      try {
        const { data, error: fnError } = await invokeWithTimeout("carousel-ai", {
          body: {
            type: "assign_templates",
            slides: photoFull,
            workspace_id: workspaceId !== session?.user?.id ? workspaceId : undefined,
          },
        }, 30000);
        const enriched = (data as any)?.result?.slides;
        if (!fnError && !(data as any)?.error && Array.isArray(enriched) && enriched.length > 0) {
          const byNumber = new Map<number, any>(
            enriched.filter((s: any) => Number.isInteger(s?.slide_number)).map((s: any) => [s.slide_number, s]),
          );
          finalSlides = baseSlides.map((s) => {
            const e = byNumber.get(s.slide_number);
            if (!e || s.slide_type !== "photo_full") return s;
            // Garde verbatim CÔTÉ FRONT en plus de celle de l'edge : le texte
            // et la photo source reprennent toujours le dessus sur la passe.
            return { ...e, ...s, ...(e.template ? { template: e.template } : {}),
              ...(e.big_number ? { big_number: e.big_number } : {}),
              ...(Array.isArray(e.points) && e.points.length > 0 ? { points: e.points } : {}),
              ...(e.attribution ? { attribution: e.attribution } : {}),
              ...(e.cta_label ? { cta_label: e.cta_label } : {}),
              ...(typeof e.step_number === "number" ? { step_number: e.step_number } : {}),
              ...(e.kicker ? { kicker: e.kicker } : {}),
              ...(e.detail ? { detail: e.detail } : {}),
            };
          });
        }
      } catch (e: any) {
        console.warn("[mes-slides] passe gabarits ignorée (fail-open):", e?.message || e);
      } finally {
        setUserSlidesBuilding(false);
      }
    }

    // Résultat injecté dans le flux existant : handleGenerateVisuals lit
    // result.raw.slides et l'effet d'auto-génération des visuels s'en charge.
    setStep("result");
    setResult({
      type: "carousel",
      raw: {
        slides: finalSlides,
        carousel_type: carouselType,
        // Légende fournie gardée telle quelle (structure standard des carrousels).
        caption: { hook: "", body: (caption || "").trim(), cta: "", hashtags: [] },
        user_slides: true,
      },
    } as any);
  };

  return { userSlidesDraft, userSlidesBuilding, handleUserSlidesGenerate };
}
