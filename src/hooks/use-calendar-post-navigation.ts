// Départs de la fenêtre d'un post du calendrier vers /creer (navigate state +
// paramètres d'URL) : atelier (`resumeIdea`), générateur par canal / format,
// « Approfondir », changement de format, et `handleSmartGenerate` qui choisit
// entre /creer et le brouillon rapide sur place. Sorti de CalendarPostDialog.tsx
// à l'identique (fiche 13 de docs/robustesse/gros-fichiers.md, lot 7).
// ⚠️ src/test/calendar-creer-contract.test.ts lit CE fichier : il découpe
// chaque fonction de `const <nom> = ` jusqu'au prochain `const handle… = ` et
// y cherche les clés du state et les paramètres d'URL. Garder l'ordre des
// fonctions et le style `const handleX = `. Fermeture : `onOpenChange(false)`
// démonte la fenêtre AVANT la navigation (100 ms plus tard) ; les fonctions
// utilisent les valeurs capturées, jamais des refs relues après coup.
// Clés envoyées mais jamais lues par /creer (notes, existingAccroche,
// launchId…) : gardées telles quelles, les supprimer est une décision à part.
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import { resumeCrosspost } from "@/lib/crosspost-content";
import { ANGLE_TO_CAROUSEL } from "@/features/calendar/post-dialog-helpers";
import type { CalendarPost } from "@/lib/calendar-constants";

export interface CalendarPostNavigationInput {
  theme: string;
  format: string | null;
  postCanal: string;
  objectif: string | null;
  angle: string | null;
  notes: string;
  selectedDate: string | null;
  contentDraft: string | null;
  accroche: string | null;
  editingPost: CalendarPost | null;
  savedPreviewContent: any;
  effectiveId: string | null;
  buildSaveData: () => any;
  onAutoSave: ((data: any, existingId: string | null) => Promise<unknown>) | undefined;
  onOpenChange: (open: boolean) => void;
  navigate: NavigateFunction;
  handleQuickGenerate: () => Promise<void>;
}

export function useCalendarPostNavigation({ theme, format, postCanal, objectif, angle, notes, selectedDate, contentDraft, accroche, editingPost, savedPreviewContent, effectiveId, buildSaveData, onAutoSave, onOpenChange, navigate, handleQuickGenerate }: CalendarPostNavigationInput) {
  const handleSmartGenerate = () => {
    if (!theme.trim()) { toast.error("Il me faut un sujet !"); return; }
    const fmt = format || "post_carrousel";
    if (fmt === "post_carrousel" || fmt === "carousel" || fmt === "reel" || fmt === "story_serie" || postCanal === "linkedin") {
      handleNavigateToGenerator("generate"); return;
    }
    handleQuickGenerate();
  };

  const handleOpenAtelier = async () => {
    if (theme.trim() && onAutoSave) await onAutoSave(buildSaveData(), effectiveId);
    onOpenChange(false);
    setTimeout(() => {
      const detail = savedPreviewContent as any;
      const resumeIdea = resumeCrosspost(detail, format) || (detail?.slides && detail?.visual_html?.length && /^carousel/.test(detail.type || "")
        ? { format: "carousel", raw: { ...detail, carousel_type: detail.type === "carousel_photo" ? "photo" : detail.type === "carousel_mix" ? "mix" : detail.carousel_type || "text" } } : undefined);
      if (resumeIdea?.raw._crosspost && contentDraft !== editingPost?.content_draft && contentDraft != null) resumeIdea.raw.edited_text = contentDraft;
      navigate("/creer?canal=" + (postCanal || "instagram"), {
        state: { resumeIdea, fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche, launchId: editingPost?.launch_id, contentType: editingPost?.content_type, contentTypeEmoji: editingPost?.content_type_emoji, category: editingPost?.category, objective: editingPost?.objective, angleSuggestion: editingPost?.angle_suggestion, chapter: (editingPost as any)?.chapter, chapterLabel: (editingPost as any)?.chapter_label, audiencePhase: (editingPost as any)?.audience_phase },
      });
    }, 100);
  };

  const handleNavigateToGenerator = async (mode: "generate" | "regenerate" | "view") => {
    if (theme.trim() && onAutoSave) await onAutoSave(buildSaveData(), effectiveId);
    onOpenChange(false);
    setTimeout(() => {
      const params = new URLSearchParams();
      if (editingPost?.id) params.set("calendar_id", editingPost.id);
      if (theme) params.set("sujet", theme);
      if (objectif) params.set("objectif", objectif);
      params.set("from", "/calendrier");
      const state = { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche, launchId: editingPost?.launch_id, contentType: editingPost?.content_type, category: editingPost?.category, objective: editingPost?.objective, ...(editingPost?.launch_id ? { launchContext: { launchId: editingPost.launch_id, contentType: editingPost.content_type, chapter: (editingPost as any)?.chapter, chapterLabel: (editingPost as any)?.chapter_label, audiencePhase: (editingPost as any)?.audience_phase } } : {}) };
      const fmt = format || "post_carrousel";
      if (postCanal === "newsletter" || fmt === "newsletter_standard") navigate(`/creer?format=newsletter&${params.toString()}`, { state });
      else if (postCanal === "linkedin") navigate(`/creer?canal=linkedin&${params.toString()}`, { state });
      else if (fmt === "post_carrousel" || fmt === "carousel") {
        if (angle && ANGLE_TO_CAROUSEL[angle]) params.set("carousel_type", ANGLE_TO_CAROUSEL[angle]);
        navigate(`/creer?format=carousel&${params.toString()}`, { state });
      } else if (fmt === "reel") navigate(`/creer?format=reel&${params.toString()}`, { state });
      else if (fmt === "story_serie") navigate(`/creer?format=story&${params.toString()}`, { state });
      else navigate(`/creer?canal=${postCanal || "instagram"}&${params.toString()}`, { state });
    }, 100);
  };

  const handleNavigateToDeepen = async () => {
    if (theme.trim() && onAutoSave) await onAutoSave(buildSaveData(), effectiveId);
    onOpenChange(false);
    setTimeout(() => {
      const params = new URLSearchParams();
      if (theme) params.set("sujet", theme);
      if (objectif) params.set("objectif", objectif);
      if (format) params.set("format", format);
      if (editingPost?.id) params.set("calendar_id", editingPost.id);
      params.set("from", "/calendrier");
      navigate("/creer?" + params.toString(), { state: { fromCalendar: true, calendarPostId: editingPost?.id, theme, objectif, angle, format, notes, postDate: selectedDate, existingContent: contentDraft, existingAccroche: accroche } });
    }, 100);
  };

  return { handleSmartGenerate, handleOpenAtelier, handleNavigateToGenerator, handleNavigateToDeepen };
}
